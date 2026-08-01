import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ServerSupabaseClient = SupabaseClient<Database>;
type VehicleStatusRow =
  Database["public"]["Functions"]["get_authenticated_driver_vehicle_status"]["Returns"][number];

export type MaintenanceVehicleErrorCode =
  | "vehicle_not_linked"
  | "vehicle_not_found"
  | "vehicle_ambiguous"
  | "vehicle_inactive"
  | "vehicle_organization_mismatch";

export type MaintenanceVehicleStatus =
  | {
      status: "linked";
      vehicleId: string;
      plateNumber: string;
    }
  | {
      status: "unavailable";
      errorCode: MaintenanceVehicleErrorCode;
    };

export async function resolveMaintenanceVehicleStatus(
  supabase: ServerSupabaseClient,
): Promise<MaintenanceVehicleStatus> {
  const { data, error } = await supabase
    .rpc("get_authenticated_driver_vehicle_status")
    .limit(1);

  if (error) {
    console.error("[driver-app:maintenance-vehicle]", {
      stage: "resolve",
      code: error.code,
      message: error.message,
    });

    return { status: "unavailable", errorCode: "vehicle_not_linked" };
  }

  const vehicle = data?.[0] as VehicleStatusRow | undefined;

  if (
    vehicle?.resolution_code === "ok" &&
    vehicle.vehicle_id &&
    vehicle.plate_number
  ) {
    return {
      status: "linked",
      vehicleId: vehicle.vehicle_id,
      plateNumber: vehicle.plate_number,
    };
  }

  return {
    status: "unavailable",
    errorCode: toMaintenanceVehicleErrorCode(vehicle?.resolution_code),
  };
}

function toMaintenanceVehicleErrorCode(
  code: string | null | undefined,
): MaintenanceVehicleErrorCode {
  return code === "vehicle_not_found" ||
    code === "vehicle_ambiguous" ||
    code === "vehicle_inactive" ||
    code === "vehicle_organization_mismatch"
    ? code
    : "vehicle_not_linked";
}
