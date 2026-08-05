"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

const DRIVER_PREFETCH_ROUTES = [
  "/home",
  "/requests",
  "/shifts",
  "/vehicle",
  "/warnings",
  "/salary",
  "/notifications",
  "/tasks",
] as const;

export function DriverRoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    for (const href of DRIVER_PREFETCH_ROUTES) {
      router.prefetch(href);
    }
  }, [router]);

  return null;
}
