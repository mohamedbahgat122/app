import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";
import type { Database } from "@/types/database";
import {
  deriveOilMaintenanceMetrics,
  type DriverOilMaintenanceStatus,
  type LatestOilChangeRequest,
  type LatestOilChangeRequestStatus,
} from "@/lib/app/oil-maintenance-types";

type OilChangeEventRecord = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  driver_id: string | null;
  request_id: string | null;
  odometer_reading: number;
  interval_km: number;
  completed_at: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type OilStatusDatabase = Database & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      fleet_vehicle_oil_change_events: {
        Row: OilChangeEventRecord;
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
  };
};

type OilStatusSupabaseClient = SupabaseClient<OilStatusDatabase>;

type OdometerShiftRecord = Pick<
  Database["public"]["Tables"]["driver_shifts"]["Row"],
  | "status"
  | "vehicle_id"
  | "start_odometer_reading"
  | "end_odometer_reading"
  | "start_review_status"
  | "end_review_status"
>;

type DriverAppRequestRow = Pick<
  Database["public"]["Tables"]["driver_app_requests"]["Row"],
  "id" | "status" | "submitted_at"
>;

type OilRequestDetailRow = Pick<
  Database["public"]["Tables"]["driver_app_oil_change_request_details"]["Row"],
  "current_odometer_reading"
>;

export const loadDriverOilMaintenanceStatus = cache(async function loadDriverOilMaintenanceStatus(
  session: VerifiedDriverSession,
): Promise<DriverOilMaintenanceStatus> {
  const vehicleId = session.vehicle?.id ?? null;
  const vehiclePlate = session.driver.vehiclePlate;

  if (!vehicleId || !session.organization?.id) {
    return buildOilMaintenanceStatus({
      vehicleId,
      vehiclePlate,
      event: null,
      latestOdometer: null,
      latestRequest: null,
    });
  }

  const admin = createSupabaseAdminClient() as OilStatusSupabaseClient;
  const [event, latestOdometer, request] = await Promise.all([
    loadLatestOilEvent(admin, session.organization.id, vehicleId),
    loadLatestValidVehicleOdometer(admin, session.organization.id, vehicleId),
    loadLatestOilChangeRequest(admin, session),
  ]);
  const latestRequest = request ? await loadOilRequestDetail(admin, request) : null;

  return buildOilMaintenanceStatus({
    vehicleId,
    vehiclePlate,
    event,
    latestOdometer,
    latestRequest,
  });
});

async function loadLatestOilEvent(
  supabase: OilStatusSupabaseClient,
  organizationId: string,
  vehicleId: string,
) {
  const { data, error } = await supabase
    .from("fleet_vehicle_oil_change_events")
    .select(
      "id, organization_id, vehicle_id, driver_id, request_id, odometer_reading, interval_km, completed_at, note, created_by, created_at",
    )
    .eq("organization_id", organizationId)
    .eq("vehicle_id", vehicleId)
    .order("completed_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[driver-oil-maintenance]", {
      stage: "latest_oil_event",
      code: error.code,
      message: error.message,
    });
  }

  return data ?? null;
}

async function loadLatestValidVehicleOdometer(
  supabase: OilStatusSupabaseClient,
  organizationId: string,
  vehicleId: string,
) {
  const { data, error } = await supabase
    .from("driver_shifts")
    .select(
      "status, vehicle_id, start_odometer_reading, end_odometer_reading, start_review_status, end_review_status",
    )
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .eq("vehicle_id", vehicleId)
    .not("start_odometer_reading", "is", null)
    .not("end_odometer_reading", "is", null)
    .order("ended_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[driver-oil-maintenance]", {
      stage: "latest_vehicle_odometer",
      code: error.code,
      message: error.message,
    });
    return null;
  }

  const latestValidShift = (data ?? []).find(isValidOdometerDistanceShift);

  return latestValidShift?.end_odometer_reading ?? null;
}

async function loadLatestOilChangeRequest(
  supabase: OilStatusSupabaseClient,
  session: VerifiedDriverSession,
) {
  const { data, error } = await supabase
    .from("driver_app_requests")
    .select("id, status, submitted_at")
    .eq("organization_id", session.organization?.id ?? "")
    .eq("driver_id", session.driver.id)
    .eq("request_type", "oil_change")
    .order("submitted_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[driver-oil-maintenance]", {
      stage: "latest_oil_request",
      code: error.code,
      message: error.message,
    });
  }

  return data ?? null;
}

async function loadOilRequestDetail(
  supabase: OilStatusSupabaseClient,
  request: DriverAppRequestRow,
): Promise<LatestOilChangeRequest | null> {
  const status = asOilChangeRequestStatus(request.status);

  if (!status) {
    return null;
  }

  const { data, error } = await supabase
    .from("driver_app_oil_change_request_details")
    .select("current_odometer_reading")
    .eq("request_id", request.id)
    .maybeSingle();

  if (error) {
    console.error("[driver-oil-maintenance]", {
      stage: "latest_oil_request_detail",
      code: error.code,
      message: error.message,
    });
  }

  const detail = data as OilRequestDetailRow | null;

  return {
    id: request.id,
    status,
    submittedAt: request.submitted_at,
    currentOdometerReading: detail?.current_odometer_reading ?? null,
  };
}

function buildOilMaintenanceStatus({
  vehicleId,
  vehiclePlate,
  event,
  latestOdometer,
  latestRequest,
}: {
  vehicleId: string | null;
  vehiclePlate: string | null;
  event: OilChangeEventRecord | null;
  latestOdometer: number | null;
  latestRequest: LatestOilChangeRequest | null;
}): DriverOilMaintenanceStatus {
  const metrics = deriveOilMaintenanceMetrics({
    vehicleId,
    oilChangeOdometer: event?.odometer_reading ?? null,
    intervalKm: event?.interval_km ?? null,
    latestOdometer,
  });

  return {
    vehicleId,
    vehiclePlate,
    lastOilChangeOdometer: event?.odometer_reading ?? null,
    intervalKm: event?.interval_km ?? null,
    latestOdometer,
    latestRequest,
    ...metrics,
  };
}

function isValidOdometerDistanceShift(
  shift: OdometerShiftRecord,
): shift is OdometerShiftRecord & {
  end_odometer_reading: number;
  start_odometer_reading: number;
} {
  return (
    shift.status === "completed" &&
    shift.start_odometer_reading !== null &&
    shift.end_odometer_reading !== null &&
    shift.end_odometer_reading >= shift.start_odometer_reading &&
    shift.start_review_status !== "rejected" &&
    shift.end_review_status !== "rejected"
  );
}

function asOilChangeRequestStatus(
  status: string,
): LatestOilChangeRequestStatus | null {
  return status === "pending" ||
    status === "approved" ||
    status === "rejected" ||
    status === "completed" ||
    status === "cancelled"
    ? status
    : null;
}
