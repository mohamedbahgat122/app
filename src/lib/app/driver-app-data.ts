import "server-only";

import { redirect } from "next/navigation";
import type { Locale } from "@/config/locales";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";
import { getVerifiedDriverSession } from "@/lib/auth/driver-session";
import { loadDriverUnreadNotificationCount } from "@/lib/app/driver-notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type DriverShiftRow = Database["public"]["Tables"]["driver_shifts"]["Row"];

export type DriverAppContext = {
  session: VerifiedDriverSession;
  avatarUrl: string | null;
  vehicle: VerifiedDriverSession["vehicle"];
  unreadNotificationCount: number;
  taskCount: number;
};

export type ShiftSummary = {
  openShift: DriverShiftRow | null;
  latestShift: DriverShiftRow | null;
  recentShifts: DriverShiftRow[];
};

export async function loadDriverAppContext(locale: Locale) {
  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (
    sessionResult.status === "unauthenticated" ||
    sessionResult.status === "unauthorized"
  ) {
    redirect(`/${locale}`);
  }

  if (sessionResult.status === "application_error") {
    return {
      status: "application_error" as const,
      supabase,
    };
  }

  if (sessionResult.status !== "verified") {
    redirect(`/${locale}`);
  }

  if (sessionResult.session.mustChangePassword) {
    redirect(`/${locale}/change-password`);
  }

  const [avatarUrl, unreadNotificationCount] = await Promise.all([
    createDriverAvatarUrl(sessionResult.session.driver.profilePhotoPath),
    loadDriverUnreadNotificationCount(supabase),
  ]);

  return {
    status: "ready" as const,
    context: {
      session: sessionResult.session,
      avatarUrl,
      vehicle: sessionResult.session.vehicle,
      unreadNotificationCount,
      taskCount: 0,
    },
    supabase,
  };
}

export async function loadShiftSummary(driverId: string): Promise<ShiftSummary> {
  const supabase = await createSupabaseServerClient();
  const { data: recentShifts, error } = await supabase
    .from("driver_shifts")
    .select(
      "id, driver_id, organization_id, vehicle_id, vehicle_plate_snapshot, status, started_at, start_odometer_reading, start_ocr_reading, start_ocr_confidence, start_ocr_status, start_ocr_provider, start_verified_at, start_photo_path, start_photo_captured_at, start_review_status, start_reviewed_by, start_reviewed_at, start_review_note, ended_at, end_odometer_reading, end_ocr_reading, end_ocr_confidence, end_ocr_status, end_ocr_provider, end_verified_at, end_photo_path, end_photo_captured_at, end_review_status, end_reviewed_by, end_reviewed_at, end_review_note, created_at, updated_at",
    )
    .eq("driver_id", driverId)
    .order("started_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[driver-app:shifts]", {
      stage: "load-shifts",
      code: error.code,
      message: error.message,
    });
  }

  const shifts = recentShifts ?? [];

  return {
    openShift: shifts.find((shift) => shift.status === "open") ?? null,
    latestShift: shifts[0] ?? null,
    recentShifts: shifts,
  };
}

async function createDriverAvatarUrl(path: string | null) {
  if (!path) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("driver-documents")
    .createSignedUrl(path, 60 * 10);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[driver-avatar]", {
        stage: "create-signed-url",
        code: error.name,
        message: error.message,
      });
    }
  }

  return data?.signedUrl ?? null;
}
