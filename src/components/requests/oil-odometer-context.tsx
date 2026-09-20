"use client";

import { createContext, useContext } from "react";

const OilOdometerContext = createContext("");

export function OilOdometerProvider({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  return <OilOdometerContext.Provider value={value}>{children}</OilOdometerContext.Provider>;
}

export function useOilOdometerReading() {
  return useContext(OilOdometerContext);
}
