import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RepresentativeVehicle } from "@/lib/app/representative-context";
import { resolveRepresentativeContext } from "@/lib/app/representative-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

type ServerSupabaseClient = SupabaseClient<Database>;

export type VerifiedDriverSession = {
  userId: string;
  driver: {
    id: string;
    driverId: string;
    fullName: string;
    iqamaNumber: string | null;
    iqamaExpiryDate: string | null;
    driverCardNumber: string | null;
    driverCardExpiryDate: string | null;
    keetaVehiclePlateNumber: string | null;
    actualVehiclePlateNumber: string | null;
    profilePhotoPath: string | null;
    status: "active" | "suspended";
    vehiclePlate: string | null;
  };
  organization: {
    id: string;
    name: string;
  } | null;
  vehicle: RepresentativeVehicle | null;
  mustChangePassword: boolean;
};

export type DriverSessionResult =
  | { status: "verified"; session: VerifiedDriverSession }
  | { status: "unauthenticated" | "unauthorized" | "application_error" };

export async function getVerifiedDriverSession(
  supabase: ServerSupabaseClient,
): Promise<DriverSessionResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const context = await resolveRepresentativeContext(supabase, user.id, {
    vehicleSupabase: createSupabaseAdminClient(),
    onWarning: (code, details) => {
      logDriverSessionDiagnostic("organization", null, {
        code,
        hasDriverOrganizationId: true,
        hasProfileOrganizationId: details.hasProfileOrganizationId,
        driverOrganizationCode: details.driverOrganizationCode,
        profileOrganizationCode: details.profileOrganizationCode,
      });
    },
  });

  if (context.status !== "ready") {
    if (
      context.status === "driver_lookup_failed" ||
      context.status === "organization_lookup_failed" ||
      context.status === "organization_not_resolved" ||
      context.status === "organization_inactive" ||
      context.status === "organization_profile_mismatch"
    ) {
      logDriverSessionDiagnostic("organization", null, {
        code: context.status,
        hasDriverOrganizationId: false,
      });
      return { status: "application_error" };
    }

    if (
      context.status === "vehicle_not_assigned" ||
      context.status === "vehicle_organization_mismatch"
    ) {
      logDriverSessionDiagnostic("vehicle", null, {
        code: context.status,
      });
      return { status: "application_error" };
    }

    return { status: "unauthorized" };
  }

  return {
    status: "verified",
    session: {
      userId: user.id,
      driver: {
        id: context.driver.id,
        driverId: context.driver.keeta_driver_id ?? "",
        fullName: context.driver.full_name,
        iqamaNumber: context.driver.iqama_number,
        iqamaExpiryDate: context.driver.iqama_expiry_date,
        driverCardNumber: context.driver.driver_card_number,
        driverCardExpiryDate: context.driver.driver_card_expiry_date,
        keetaVehiclePlateNumber: context.driver.keeta_vehicle_plate_number,
        actualVehiclePlateNumber: context.driver.vehicle_number,
        profilePhotoPath: context.driver.profile_photo_path,
        status: context.driver.status,
        vehiclePlate: context.plate,
      },
      organization:
        context.organization
          ? {
              id: context.organization.id,
              name: context.organization.name,
            }
          : null,
      vehicle: context.vehicle,
      mustChangePassword: Boolean(context.profile.must_change_password),
    },
  };
}

function logDriverSessionDiagnostic(
  stage: "profile" | "driver" | "organization" | "vehicle",
  error: { code?: string; message?: string } | null,
  context?: {
    code?: string;
    hasDriverOrganizationId?: boolean;
    hasProfileOrganizationId?: boolean;
    driverOrganizationCode?: string;
    profileOrganizationCode?: string | null;
  },
) {
  console.error("[driver-auth:session]", {
    stage,
    code: error?.code ?? context?.code,
    message: error?.message,
    hasDriverOrganizationId: context?.hasDriverOrganizationId,
    hasProfileOrganizationId: context?.hasProfileOrganizationId,
    driverOrganizationCode: context?.driverOrganizationCode,
    profileOrganizationCode: context?.profileOrganizationCode,
  });
}
