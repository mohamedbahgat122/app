"use client";

import { useState, type ReactNode } from "react";
import { RequestForm } from "@/components/requests/request-form";
import { OilOdometerProvider } from "@/components/requests/oil-odometer-context";

export function OilChangeRequestPanel({
  driverId,
  vehiclePlate,
  children,
}: {
  driverId: string;
  vehiclePlate: string | null;
  children?: ReactNode;
}) {
  const [odometerReading, setOdometerReading] = useState("");

  return (
    <OilOdometerProvider value={odometerReading}>
      <div className="space-y-4">
        <RequestForm
          type="oil-change"
          driverId={driverId}
          vehiclePlate={vehiclePlate}
          onOdometerReadingChange={setOdometerReading}
        />
        {children}
      </div>
    </OilOdometerProvider>
  );
}
