export type OilMaintenanceStatus =
  | "ok"
  | "due_soon"
  | "due"
  | "incomplete"
  | "no_vehicle";

export type LatestOilChangeRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export type LatestOilChangeRequest = {
  id: string;
  status: LatestOilChangeRequestStatus;
  submittedAt: string;
  currentOdometerReading: number | null;
};

export type DriverOilMaintenanceStatus = {
  vehicleId: string | null;
  vehiclePlate: string | null;
  lastOilChangeOdometer: number | null;
  intervalKm: number | null;
  nextOilChangeAt: number | null;
  latestOdometer: number | null;
  drivenSinceOilChange: number | null;
  remainingKm: number | null;
  oilStatus: OilMaintenanceStatus;
  latestRequest: LatestOilChangeRequest | null;
};

export function deriveOilMaintenanceMetrics({
  vehicleId,
  oilChangeOdometer,
  intervalKm,
  latestOdometer,
}: {
  vehicleId: string | null;
  oilChangeOdometer: number | null;
  intervalKm: number | null;
  latestOdometer: number | null;
}): Pick<
  DriverOilMaintenanceStatus,
  | "nextOilChangeAt"
  | "drivenSinceOilChange"
  | "remainingKm"
  | "oilStatus"
> {
  if (!vehicleId) {
    return {
      nextOilChangeAt: null,
      drivenSinceOilChange: null,
      remainingKm: null,
      oilStatus: "no_vehicle" as const,
    };
  }

  if (oilChangeOdometer === null || intervalKm === null) {
    return {
      nextOilChangeAt: null,
      drivenSinceOilChange: null,
      remainingKm: null,
      oilStatus: "incomplete" as const,
    };
  }

  const nextOilChangeAt = oilChangeOdometer + intervalKm;

  if (latestOdometer === null) {
    return {
      nextOilChangeAt,
      drivenSinceOilChange: null,
      remainingKm: null,
      oilStatus: "incomplete" as const,
    };
  }

  const drivenSinceOilChange = Math.max(latestOdometer - oilChangeOdometer, 0);
  const remainingKm = nextOilChangeAt - latestOdometer;
  const oilStatus: OilMaintenanceStatus =
    remainingKm <= 0 ? "due" : remainingKm <= 500 ? "due_soon" : "ok";

  return {
    nextOilChangeAt,
    drivenSinceOilChange,
    remainingKm,
    oilStatus,
  };
}

export function parseOilPreviewOdometer(value: string) {
  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const reading = Number(trimmed);

  return Number.isSafeInteger(reading) && reading >= 0 ? reading : null;
}
