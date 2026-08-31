"use client";

import { useState } from "react";
import { RequestForm } from "@/components/requests/request-form";
import { OilStatusCard } from "@/components/requests/oil-status-card";
import type { DriverOilMaintenanceStatus } from "@/lib/app/oil-maintenance-types";

export function OilChangeRequestPanel({
  oilStatus,
  vehiclePlate,
}: {
  oilStatus: DriverOilMaintenanceStatus;
  vehiclePlate: string | null;
}) {
  const [odometerReading, setOdometerReading] = useState("");

  return (
    <div className="space-y-4">
      <RequestForm
        type="oil-change"
        vehiclePlate={vehiclePlate}
        onOdometerReadingChange={setOdometerReading}
      />
      <OilStatusCard
        status={oilStatus}
        previewOdometerReading={odometerReading}
      />
    </div>
  );
}
