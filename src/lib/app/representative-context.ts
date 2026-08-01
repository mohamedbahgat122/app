import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isRepresentativeProfileRole } from "@/lib/auth/representative-role";
import type { Database } from "@/types/database";

type ServerSupabaseClient = SupabaseClient<Database>;
type ProfileRow = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "id"
  | "full_name"
  | "role"
  | "status"
  | "deleted_at"
  | "home_organization_id"
  | "must_change_password"
>;
type DriverRow = Pick<
  Database["public"]["Tables"]["drivers"]["Row"],
  | "id"
  | "auth_user_id"
  | "organization_id"
  | "full_name"
  | "profile_photo_path"
  | "keeta_driver_id"
  | "keeta_vehicle_plate_number"
  | "vehicle_number"
  | "status"
  | "deleted_at"
>;
type OrganizationRow = Pick<
  Database["public"]["Tables"]["organizations"]["Row"],
  "id" | "name" | "code" | "is_active"
>;
export type RepresentativeVehicle = Pick<
  Database["public"]["Tables"]["fleet_vehicles"]["Row"],
  | "id"
  | "organization_id"
  | "vehicle_category"
  | "vehicle_type"
  | "plate_number"
  | "assigned_driver_id"
  | "authorized_driver_id"
  | "operating_card_expiry_date"
  | "authorization_expiry_date"
  | "operational_status"
  | "technical_status"
  | "archived_at"
>;

export type RepresentativeContextCode =
  | "driver_lookup_failed"
  | "driver_account_not_linked"
  | "duplicate_driver_link"
  | "driver_profile_missing"
  | "invalid_driver_role"
  | "password_change_required"
  | "driver_inactive"
  | "driver_archived"
  | "organization_lookup_failed"
  | "organization_not_resolved"
  | "organization_inactive"
  | "organization_profile_mismatch"
  | "vehicle_not_assigned"
  | "vehicle_organization_mismatch";

export type RepresentativeContextResult =
  | {
      status: "ready";
      profile: ProfileRow;
      driver: DriverRow;
      organization: OrganizationRow;
      vehicle: RepresentativeVehicle | null;
      plate: string | null;
      profileOrganizationMismatch: boolean;
    }
  | {
      status: RepresentativeContextCode;
      stage: string;
    };

export async function resolveRepresentativeContext(
  supabase: ServerSupabaseClient,
  authUserId: string,
  options?: {
    enforcePasswordChange?: boolean;
    requireVehicle?: boolean;
    organizationSupabase?: ServerSupabaseClient;
    onStage?: (stage: string) => void;
    onWarning?: (
      code: "organization_profile_mismatch",
      details: {
        hasProfileOrganizationId: boolean;
        driverOrganizationCode: string;
        profileOrganizationCode: string | null;
      },
    ) => void;
    onFailure?: (
      code: RepresentativeContextCode,
      details: {
        stage: string;
        authUserIdSuffix?: string;
        profileRole?: string;
        profileStatus?: string;
        matchingDriverCount?: number;
        driverLookupErrored?: boolean;
        hasDriverOrganizationId?: boolean;
        organizationJoined?: boolean;
        organizationLookupFound?: boolean;
        organizationLookupErrored?: boolean;
        organizationActive?: boolean;
      },
    ) => void;
  },
): Promise<RepresentativeContextResult> {
  const emit = options?.onStage;

  emit?.("profile_lookup_started");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, role, status, deleted_at, home_organization_id, must_change_password",
    )
    .eq("id", authUserId)
    .maybeSingle();

  if (profileError || !profile || profile.id !== authUserId) {
    return deniedContext("profile_lookup", "driver_profile_missing");
  }
  emit?.("profile_resolved");

  emit?.("canonical_role_validation_started");
  if (!isRepresentativeProfileRole(profile.role)) {
    options?.onFailure?.("invalid_driver_role", {
      stage: "canonical_role_validation",
      authUserIdSuffix: authUserId.slice(-8),
      profileRole: profile.role,
      profileStatus: profile.status,
    });
    return deniedContext("canonical_role_validation", "invalid_driver_role");
  }
  emit?.("canonical_role_validated");

  emit?.("must_change_password_validation_started");
  if (options?.enforcePasswordChange && profile.must_change_password) {
    return deniedContext("must_change_password_validation", "password_change_required");
  }
  emit?.("must_change_password_validated");

  emit?.("driver_profile_status_validation_started");
  if (profile.status !== "active") {
    return deniedContext("driver_profile_status_validation", "driver_inactive");
  }
  if (profile.deleted_at) {
    return deniedContext("driver_profile_status_validation", "driver_archived");
  }
  emit?.("authorization_validated");

  emit?.("driver_lookup_started");
  const { data: drivers, error: driverError } = await supabase
    .from("drivers")
    .select(
      "id, auth_user_id, organization_id, full_name, profile_photo_path, keeta_driver_id, keeta_vehicle_plate_number, vehicle_number, status, deleted_at",
    )
    .eq("auth_user_id", authUserId)
    .limit(2);

  if (driverError) {
    logSupabaseQueryError("driver_lookup", driverError);
    options?.onFailure?.("driver_lookup_failed", {
      stage: "driver_lookup",
      authUserIdSuffix: authUserId.slice(-8),
      profileRole: profile.role,
      profileStatus: profile.status,
      matchingDriverCount: 0,
      driverLookupErrored: true,
    });
    return deniedContext("driver_lookup", "driver_lookup_failed");
  }

  if (!drivers || drivers.length === 0 || drivers[0].auth_user_id !== authUserId) {
    options?.onFailure?.("driver_account_not_linked", {
      stage: "driver_lookup",
      authUserIdSuffix: authUserId.slice(-8),
      profileRole: profile.role,
      profileStatus: profile.status,
      matchingDriverCount: drivers?.length ?? 0,
      driverLookupErrored: false,
    });
    return deniedContext("driver_lookup", "driver_account_not_linked");
  }
  if (drivers.length > 1) {
    options?.onFailure?.("duplicate_driver_link", {
      stage: "driver_lookup",
      authUserIdSuffix: authUserId.slice(-8),
      profileRole: profile.role,
      profileStatus: profile.status,
      matchingDriverCount: drivers.length,
      driverLookupErrored: false,
    });
    return deniedContext("driver_lookup", "duplicate_driver_link");
  }

  const driver = drivers[0];
  emit?.("driver_resolved");

  emit?.("driver_active_validation_started");
  if (driver.status !== "active") {
    return deniedContext("driver_active_validation", "driver_inactive");
  }
  if (driver.deleted_at) {
    return deniedContext("driver_active_validation", "driver_archived");
  }
  emit?.("driver_active_validated");

  emit?.("organization_resolution_started");
  const organizationSupabase = options?.organizationSupabase ?? supabase;
  const organizationLookup = {
    driverOrganizationField: "organization_id",
    identifierType: normalizeOrganizationIdentifierType(driver.organization_id),
    identifierPreview: previewIdentifier(driver.organization_id),
    table: "organizations",
    column: "id",
  } as const;
  const { data: organizations, error: organizationError } = await organizationSupabase
    .from("organizations")
    .select("id, name, code, is_active")
    .eq("id", driver.organization_id)
    .limit(2);

  if (organizationError) {
    logOrganizationLookupDiagnostic({
      ...organizationLookup,
      error: organizationError,
      rowCount: 0,
    });
    options?.onFailure?.("organization_lookup_failed", {
      stage: "organization_resolution",
      profileRole: profile.role,
      profileStatus: profile.status,
      hasDriverOrganizationId: Boolean(driver.organization_id),
      organizationLookupFound: false,
      organizationLookupErrored: true,
    });
    return deniedContext("organization_resolution", "organization_lookup_failed");
  }

  logOrganizationLookupDiagnostic({
    ...organizationLookup,
    rowCount: organizations?.length ?? 0,
  });

  const organization = organizations?.[0] ?? null;

  if (!organization) {
    options?.onFailure?.("organization_not_resolved", {
      stage: "organization_resolution",
      profileRole: profile.role,
      profileStatus: profile.status,
      hasDriverOrganizationId: Boolean(driver.organization_id),
      organizationLookupFound: false,
      organizationLookupErrored: false,
    });
    return deniedContext("organization_resolution", "organization_not_resolved");
  }

  if (!organization.is_active) {
    options?.onFailure?.("organization_inactive", {
      stage: "organization_resolution",
      profileRole: profile.role,
      profileStatus: profile.status,
      hasDriverOrganizationId: true,
      organizationLookupFound: true,
      organizationLookupErrored: false,
      organizationActive: organization.is_active,
    });
    return deniedContext("organization_resolution", "organization_inactive");
  }
  emit?.("organization_resolved");

  const profileOrganizationMismatch =
    profile.home_organization_id !== driver.organization_id;

  if (profileOrganizationMismatch) {
    const profileOrganizationCode = await loadOrganizationCode(
      organizationSupabase,
      profile.home_organization_id,
    );

    options?.onWarning?.("organization_profile_mismatch", {
      hasProfileOrganizationId: true,
      driverOrganizationCode: organization.code,
      profileOrganizationCode,
    });

    return deniedContext(
      "organization_profile_validation",
      "organization_profile_mismatch",
    );
  }

  emit?.("vehicle_resolution_started");
  const { data: vehicles, error: vehicleError } = await supabase
    .from("fleet_vehicles")
    .select(
      "id, organization_id, vehicle_category, vehicle_type, plate_number, assigned_driver_id, authorized_driver_id, operating_card_expiry_date, authorization_expiry_date, operational_status, technical_status, archived_at",
    )
    .eq("organization_id", driver.organization_id)
    .is("archived_at", null)
    .or(`assigned_driver_id.eq.${driver.id},authorized_driver_id.eq.${driver.id}`)
    .limit(10);

  if (vehicleError) {
    return deniedContext("vehicle_resolution", "vehicle_not_assigned");
  }

  const vehicle =
    vehicles
      ?.sort((a, b) =>
        a.assigned_driver_id === driver.id && b.assigned_driver_id !== driver.id
          ? -1
          : a.assigned_driver_id !== driver.id && b.assigned_driver_id === driver.id
            ? 1
            : 0,
      )[0] ?? null;

  if (vehicle && vehicle.organization_id !== driver.organization_id) {
    return deniedContext(
      "vehicle_resolution",
      "vehicle_organization_mismatch",
    );
  }

  const plate =
    vehicle?.plate_number ?? driver.keeta_vehicle_plate_number ?? driver.vehicle_number;
  if (options?.requireVehicle && !plate) {
    return deniedContext("vehicle_resolution", "vehicle_not_assigned");
  }
  emit?.("vehicle_resolved");

  return {
    status: "ready",
    profile,
    driver,
    organization,
    vehicle,
    plate,
    profileOrganizationMismatch,
  };
}

function deniedContext(stage: string, status: RepresentativeContextCode) {
  return { status, stage };
}

async function loadOrganizationCode(
  organizationSupabase: ServerSupabaseClient,
  organizationId: string | null,
) {
  if (!organizationId) return null;

  const { data } = await organizationSupabase
    .from("organizations")
    .select("code")
    .eq("id", organizationId)
    .maybeSingle();

  return data?.code ?? null;
}

function logSupabaseQueryError(
  stage: "driver_lookup",
  error: { code?: string; message?: string; details?: string; hint?: string },
) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[representative-context] driver_lookup_error", {
      stage,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
}

function normalizeOrganizationIdentifierType(
  value: DriverRow["organization_id"] | object | null,
) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return "nested object";
  return isUuid(String(value)) ? "uuid" : "string code";
}

function previewIdentifier(value: DriverRow["organization_id"] | null) {
  if (!value) return null;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function logOrganizationLookupDiagnostic({
  driverOrganizationField,
  identifierType,
  identifierPreview,
  table,
  column,
  error,
  rowCount,
}: {
  driverOrganizationField: "organization_id";
  identifierType: string;
  identifierPreview: string | null;
  table: "organizations";
  column: "id";
  error?: { code?: string; message?: string; details?: string; hint?: string };
  rowCount: number;
}) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[representative-context] organization_lookup", {
      driverOrganizationField,
      identifierType,
      identifierPreview,
      table,
      column,
      error: error
        ? {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint,
          }
        : null,
      rowCount,
    });
  }
}
