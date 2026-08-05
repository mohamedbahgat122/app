import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import type { Locale } from "@/config/locales";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";
import { getVerifiedDriverSession } from "@/lib/auth/driver-session";
import { loadDriverUnreadNotificationCount } from "@/lib/app/driver-notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type DriverShiftRow = Database["public"]["Tables"]["driver_shifts"]["Row"];
type OrganizationShiftTemplateRow =
  Database["public"]["Tables"]["organization_shift_templates"]["Row"];

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

export type AssignedShiftSummary = {
  name: string;
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
  hasBreak: boolean;
  breakStartTime: string | null;
  breakEndTime: string | null;
  totalMinutes: number;
  breakMinutes: number;
  effectiveMinutes: number;
  driverNote: string | null;
} | null;

export const loadDriverAppContext = cache(async function loadDriverAppContext(
  locale: Locale,
) {
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
});

export async function loadShiftSummary(
  driverId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<ShiftSummary> {
  const client = supabase ?? (await createSupabaseServerClient());
  const { data: recentShifts, error } = await client
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

export async function loadAssignedShiftSummary(
  driverId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<AssignedShiftSummary> {
  const client = supabase ?? (await createSupabaseServerClient());
  const { data, error } = await client
    .from("organization_shift_assignments")
    .select(
      `
      id,
      shift_template:organization_shift_templates!organization_shift_assignments_shift_template_id_fkey (
        id,
        name,
        start_time,
        end_time,
        crosses_midnight,
        has_break,
        break_start_time,
        break_end_time,
        driver_note,
        is_active,
        archived_at
      )
    `,
    )
    .eq("driver_id", driverId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[driver-app:assigned-shift]", {
      stage: "load-assigned-shift",
      code: error.code,
      message: error.message,
    });
    return null;
  }

  const shift = data?.shift_template as OrganizationShiftTemplateRow | null;

  if (!shift || !shift.is_active || shift.archived_at) {
    return null;
  }

  const summary = calculateDurations({
    startTime: shift.start_time,
    endTime: shift.end_time,
    hasBreak: shift.has_break,
    breakStartTime: shift.break_start_time,
    breakEndTime: shift.break_end_time,
  });

  return {
    name: shift.name,
    startTime: normalizeDisplayTime(shift.start_time),
    endTime: normalizeDisplayTime(shift.end_time),
    crossesMidnight: shift.crosses_midnight,
    hasBreak: shift.has_break,
    breakStartTime: normalizeNullableDisplayTime(shift.break_start_time),
    breakEndTime: normalizeNullableDisplayTime(shift.break_end_time),
    driverNote: normalizeOptionalString(shift.driver_note),
    totalMinutes: summary.totalMinutes,
    breakMinutes: summary.breakMinutes,
    effectiveMinutes: summary.effectiveMinutes,
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

function calculateDurations({
  startTime,
  endTime,
  hasBreak,
  breakStartTime,
  breakEndTime,
}: {
  startTime: string;
  endTime: string;
  hasBreak: boolean;
  breakStartTime: string | null;
  breakEndTime: string | null;
}) {
  const start = parseTimeToMinutes(startTime) ?? 0;
  const end = parseTimeToMinutes(endTime) ?? start;
  const totalMinutes = end > start ? end - start : end + 24 * 60 - start;
  let breakMinutes = 0;

  if (hasBreak && breakStartTime && breakEndTime) {
    const breakStart = parseTimeToMinutes(breakStartTime);
    const breakEnd = parseTimeToMinutes(breakEndTime);

    if (breakStart !== null && breakEnd !== null && breakStart !== breakEnd) {
      breakMinutes =
        breakEnd > breakStart
          ? breakEnd - breakStart
          : breakEnd + 24 * 60 - breakStart;
    }
  }

  return {
    totalMinutes,
    breakMinutes,
    effectiveMinutes: Math.max(totalMinutes - breakMinutes, 0),
  };
}

function parseTimeToMinutes(value: string | null | undefined) {
  if (!value) return null;

  const [hoursValue, minutesValue] = value.split(":");
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
}

function normalizeDisplayTime(value: string) {
  return value.slice(0, 5);
}

function normalizeNullableDisplayTime(value: string | null) {
  return value ? normalizeDisplayTime(value) : null;
}

function normalizeOptionalString(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
