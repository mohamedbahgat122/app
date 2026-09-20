import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Locale } from "@/config/locales";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";
import { getVerifiedDriverSession } from "@/lib/auth/driver-session";
import { loadDriverUnreadNotificationCount } from "@/lib/app/driver-notifications";
import { getRiyadhDateString } from "@/lib/app/shift-change-window";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type DriverShiftRow = Database["public"]["Tables"]["driver_shifts"]["Row"] & {
  order_period_template_id: string | null;
  shift_template_id: string | null;
  scheduled_business_date: string | null;
  applied_minimum_work_minutes: number | null;
};
type OrganizationShiftTemplateRow =
  Database["public"]["Tables"]["organization_shift_templates"]["Row"];

export type DriverShiftChangeWindow =
  | {
      success: true;
      today_riyadh: string;
      weekday_riyadh: number;
      allowed_weekdays: number[];
      can_submit_today: boolean;
      target_week_start: string;
    }
  | {
      success: false;
      error:
        | "DRIVER_SHIFT_CHANGE_WINDOW_AUTH_REQUIRED"
        | "DRIVER_SHIFT_CHANGE_WINDOW_DRIVER_NOT_FOUND";
    };

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
  id: string;
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

export type CurrentOrderPeriodAssignment = {
  assignment_id: string;
  template_id: string;
  template_name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
  assignment_start_date: string;
  assignment_end_date: string | null;
};

export type CurrentOrderPeriodResult =
  | { status: "assigned"; assignment: CurrentOrderPeriodAssignment }
  | { status: "none" }
  | { status: "error" };

export type DriverOrderShiftOperationalState =
  | "no_assignment"
  | "disabled"
  | "unpublished"
  | "policy_unconfigured"
  | "closed"
  | "before_open_window"
  | "open"
  | "manually_opened"
  | "started_waiting_for_end"
  | "end_available"
  | "end_unconfigured";

export type DriverOrderShiftOperationalContext = {
  success: boolean;
  state: DriverOrderShiftOperationalState;
  reason_code: string | null;
  template_id?: string;
  template_name?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  opens_at?: string;
  closes_at?: string;
  earliest_start_at?: string;
  auto_close_at?: string;
  next_scheduled_business_date?: string | null;
  next_scheduled_start_at?: string | null;
  next_scheduled_end_at?: string | null;
  next_opens_at?: string | null;
  server_now?: string;
  is_open_now?: boolean;
  manual_override_active?: boolean;
  actual_started_at?: string;
  applied_end_before_minutes?: number | null;
  minimum_work_minutes?: number | null;
  end_available_at?: string;
  can_end_now?: boolean;
};

export type OrderShiftChangeTemplate = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  crosses_midnight: boolean;
};

export type OrderShiftChangeWindow =
  | {
      success: true;
      today_riyadh: string;
      weekday_riyadh: number;
      allowed_weekdays: number[];
      can_submit_today: boolean;
      target_week_start: string;
      has_pending_request: boolean;
      reason_code: string | null;
      templates: OrderShiftChangeTemplate[];
    }
  | {
      success: false;
      reason_code: string;
    };

export type OrderShiftChangeRequest = {
  id: string;
  requested_order_period_template_id: string;
  requested_week_start_date: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type ShiftChangeRequestDisplayStatus =
  | "pending"
  | "rejected"
  | "scheduled"
  | "completed"
  | "review_needed";

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

export const loadDriverSession = cache(async function loadDriverSession(
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

  return {
    status: "ready" as const,
    session: sessionResult.session,
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
      "id, status, started_at, ended_at, start_odometer_reading, end_odometer_reading, start_review_status, end_review_status, order_period_template_id, shift_template_id, scheduled_business_date, applied_minimum_work_minutes",
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

  const shifts = (recentShifts as unknown as DriverShiftRow[]) ?? [];

  return {
    openShift: shifts.find((shift) => shift.status === "open") ?? null,
    latestShift: shifts[0] ?? null,
    recentShifts: shifts,
  };
}

export type DriverAttendanceContext = {
  success: boolean;
  server_now: string;
  state: string;
  reason_code: string | null;
  policy_configured: boolean;
  shift_template_id?: string;
  shift_name?: string;
  scheduled_business_date?: string;
  scheduled_start_at?: string;
  scheduled_end_at?: string;
  start_available_at?: string | null;
  can_start_now?: boolean;
  actual_started_at?: string | null;
  minimum_work_minutes?: number | null;
  end_available_at?: string | null;
  can_end_now?: boolean;
};

export async function loadDriverAttendanceContext(
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<DriverAttendanceContext | null> {
  const client = supabase ?? (await createSupabaseServerClient());
  const rpc = (client.rpc as unknown as (name: string) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>).bind(client);
  const { data, error } = await rpc("get_driver_shift_attendance_context");
  if (error || !data || typeof data !== "object") {
    console.error("[driver-app:attendance-context]", { code: error?.code, message: error?.message });
    return null;
  }
  return data as DriverAttendanceContext;
}

export async function loadCurrentOrderPeriodAssignment(
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<CurrentOrderPeriodResult> {
  const client = supabase ?? (await createSupabaseServerClient());
  const rpc = (client.rpc as unknown as (
    functionName: string,
  ) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>).bind(client);
  const { data, error } = await rpc("get_my_current_order_period_assignment");

  if (error) {
    console.error("[driver-app:order-period-assignment]", {
      code: error.code,
      message: error.message,
    });
    return { status: "error" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return { status: "none" };

  const assignment = row as Partial<CurrentOrderPeriodAssignment>;
  if (
    typeof assignment.assignment_id !== "string" ||
    typeof assignment.template_id !== "string" ||
    typeof assignment.template_name !== "string" ||
    typeof assignment.start_time !== "string" ||
    typeof assignment.end_time !== "string" ||
    typeof assignment.crosses_midnight !== "boolean" ||
    typeof assignment.assignment_start_date !== "string"
  ) {
    console.error("[driver-app:order-period-assignment] invalid response");
    return { status: "error" };
  }

  return {
    status: "assigned",
    assignment: {
      assignment_id: assignment.assignment_id,
      template_id: assignment.template_id,
      template_name: assignment.template_name,
      start_time: assignment.start_time,
      end_time: assignment.end_time,
      crosses_midnight: assignment.crosses_midnight,
      assignment_start_date: assignment.assignment_start_date,
      assignment_end_date: assignment.assignment_end_date ?? null,
    },
  };
}

export async function loadDriverOrderShiftOperationalContext(
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<DriverOrderShiftOperationalContext | null> {
  const client = supabase ?? (await createSupabaseServerClient());
  const rpc = (client.rpc as unknown as (
    functionName: string,
  ) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>).bind(client);
  const { data, error } = await rpc("get_my_current_order_shift_operational_context");

  if (error || !isDriverOrderShiftOperationalContext(data)) {
    console.error("[driver-app:order-period-operational-context]", {
      code: error?.code,
      message: error?.message,
    });
    return null;
  }

  return data;
}

function isDriverOrderShiftOperationalContext(
  value: unknown,
): value is DriverOrderShiftOperationalContext {
  if (!value || typeof value !== "object") return false;
  const context = value as Record<string, unknown>;
  const optionalStringFields = [
    "next_scheduled_business_date",
    "next_scheduled_start_at",
    "next_scheduled_end_at",
    "next_opens_at",
  ];
  return (
    typeof context.success === "boolean" &&
    [
      "no_assignment",
      "disabled",
      "unpublished",
      "policy_unconfigured",
      "closed",
      "before_open_window",
      "open",
      "manually_opened",
      "started_waiting_for_end",
      "end_available",
      "end_unconfigured",
    ].includes(String(context.state)) &&
    (context.reason_code === null || typeof context.reason_code === "string") &&
    optionalStringFields.every(
      (field) => context[field] === undefined || context[field] === null || typeof context[field] === "string",
    )
  );
}

export async function loadOrderShiftChangeRequestWindow(
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<OrderShiftChangeWindow> {
  const client = supabase ?? (await createSupabaseServerClient());
  const rpc = (client.rpc as unknown as (
    functionName: string,
  ) => Promise<{
    data: unknown;
    error: { code?: string; message: string; details?: string; hint?: string } | null;
  }>).bind(client);
  try {
    const { data, error } = await rpc("get_my_order_shift_change_request_window");

    if (error) {
      console.error("[driver-app:order-shift-change-window]", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return { success: false, reason_code: "ORDER_SHIFT_CHANGE_WINDOW_UNAVAILABLE" };
    }

    if (!isOrderShiftChangeWindow(data)) {
      const shape = describeOrderShiftChangeWindow(data);
      console.error("[driver-app:order-shift-change-window] invalid response", {
        ...shape,
        validationFailures: shape.validationFailures,
      });
      return { success: false, reason_code: "ORDER_SHIFT_CHANGE_WINDOW_UNAVAILABLE" };
    }

    return data;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    console.error("[driver-app:order-shift-change-window]", {
      code: (error as { code?: string } | null)?.code,
      message: failure.message,
      details: (error as { details?: string } | null)?.details,
      hint: (error as { hint?: string } | null)?.hint,
    });
    return { success: false, reason_code: "ORDER_SHIFT_CHANGE_WINDOW_UNAVAILABLE" };
  }
}

function isOrderShiftChangeWindow(value: unknown): value is OrderShiftChangeWindow {
  if (!value || typeof value !== "object") return false;
  const window = value as Record<string, unknown>;

  if (window.success === false) {
    return typeof window.reason_code === "string";
  }

  if (
    window.success !== true ||
    typeof window.today_riyadh !== "string" ||
    typeof window.weekday_riyadh !== "number" ||
    !Array.isArray(window.allowed_weekdays) ||
    !window.allowed_weekdays.every((day) => typeof day === "number") ||
    typeof window.can_submit_today !== "boolean" ||
    typeof window.target_week_start !== "string" ||
    typeof window.has_pending_request !== "boolean" ||
    (window.reason_code !== null && typeof window.reason_code !== "string") ||
    !Array.isArray(window.templates)
  ) {
    return false;
  }

  return window.templates.every((template) => {
    if (!template || typeof template !== "object") return false;
    const row = template as Record<string, unknown>;
    return (
      typeof row.id === "string" &&
      typeof row.name === "string" &&
      typeof row.start_time === "string" &&
      typeof row.end_time === "string" &&
      typeof row.crosses_midnight === "boolean"
    );
  });
}

function describeOrderShiftChangeWindow(value: unknown) {
  const responseType = Array.isArray(value) ? "array" : typeof value;
  if (!value || typeof value !== "object") {
    return {
      responseType,
      isArray: Array.isArray(value),
      keys: [],
      successType: typeof value,
      templatesType: typeof value,
      templatesIsArray: false,
      templatesLength: 0,
      validationFailures: [{ field: "response", expected: "object", actualType: responseType }],
    };
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const failures: Array<Record<string, unknown>> = [];
  const addFailure = (field: string, expected: string, actual: unknown) => {
    const actualType = Array.isArray(actual) ? "array" : typeof actual;
    const failure: Record<string, unknown> = { field, expected, actualType };
    if (actual === null || ["string", "number", "boolean"].includes(actualType)) {
      failure.safeValue = actual;
    }
    failures.push(failure);
  };

  if (record.success === false) {
    if (typeof record.reason_code !== "string") {
      addFailure("reason_code", "string", record.reason_code);
    }
  } else {
    if (typeof record.success !== "boolean") addFailure("success", "boolean", record.success);
    if (typeof record.today_riyadh !== "string") addFailure("today_riyadh", "string", record.today_riyadh);
    if (typeof record.weekday_riyadh !== "number") addFailure("weekday_riyadh", "number", record.weekday_riyadh);
    if (!Array.isArray(record.allowed_weekdays)) {
      addFailure("allowed_weekdays", "array", record.allowed_weekdays);
    } else {
      record.allowed_weekdays.forEach((day, index) => {
        if (typeof day !== "number") addFailure(`allowed_weekdays[${index}]`, "number", day);
      });
    }
    if (typeof record.can_submit_today !== "boolean") addFailure("can_submit_today", "boolean", record.can_submit_today);
    if (typeof record.target_week_start !== "string") addFailure("target_week_start", "string", record.target_week_start);
    if (typeof record.has_pending_request !== "boolean") addFailure("has_pending_request", "boolean", record.has_pending_request);
    if (record.reason_code !== null && typeof record.reason_code !== "string") addFailure("reason_code", "string|null", record.reason_code);
    if (!Array.isArray(record.templates)) {
      addFailure("templates", "array", record.templates);
    } else {
      record.templates.forEach((template, index) => {
        if (!template || typeof template !== "object") {
          addFailure(`templates[${index}]`, "object", template);
          return;
        }
        const row = template as Record<string, unknown>;
        if (typeof row.id !== "string") addFailure(`templates[${index}].id`, "string", row.id);
        if (typeof row.name !== "string") addFailure(`templates[${index}].name`, "string", row.name);
        if (typeof row.start_time !== "string") addFailure(`templates[${index}].start_time`, "string", row.start_time);
        if (typeof row.end_time !== "string") addFailure(`templates[${index}].end_time`, "string", row.end_time);
        if (typeof row.crosses_midnight !== "boolean") addFailure(`templates[${index}].crosses_midnight`, "boolean", row.crosses_midnight);
      });
    }
  }

  const templates = record.templates;
  return {
    responseType,
    isArray: Array.isArray(value),
    keys,
    successType: typeof record.success,
    templatesType: Array.isArray(templates) ? "array" : typeof templates,
    templatesIsArray: Array.isArray(templates),
    templatesLength: Array.isArray(templates) ? templates.length : 0,
    validationFailures: failures,
  };
}

export async function loadRecentOrderShiftChangeRequests(
  driverId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<OrderShiftChangeRequest[]> {
  const client = supabase ?? (await createSupabaseServerClient());
  const from = (client.from as unknown as (table: string) => any).bind(client);
  const { data, error } = await from("driver_order_shift_change_requests")
    .select(
      "id, requested_order_period_template_id, requested_week_start_date, status, reason, review_note, reviewed_at, created_at",
    )
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[driver-app:order-shift-change-requests]", {
      code: error.code,
      message: error.message,
    });
    return [];
  }

  return (data ?? []).filter(isOrderShiftChangeRequest) as OrderShiftChangeRequest[];
}

function isOrderShiftChangeRequest(value: unknown): value is OrderShiftChangeRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return (
    typeof request.id === "string" &&
    typeof request.requested_order_period_template_id === "string" &&
    typeof request.requested_week_start_date === "string" &&
    ["pending", "approved", "rejected"].includes(String(request.status)) &&
    (request.reason === null || typeof request.reason === "string") &&
    (request.review_note === null || typeof request.review_note === "string") &&
    (request.reviewed_at === null || typeof request.reviewed_at === "string") &&
    typeof request.created_at === "string"
  );
}

export async function loadDriverShiftHistory(
  driverId: string,
  page: number,
  pageSize: number,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ data: DriverShiftRow[]; count: number }> {
  const client = supabase ?? (await createSupabaseServerClient());
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await client
    .from("driver_shifts")
    .select(
      "*",
      { count: "exact" }
    )
    .eq("driver_id", driverId)
    .order("started_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[driver-app:shifts]", {
      stage: "load-shift-history",
      code: error.code,
      message: error.message,
    });
  }

  const shifts = (data ?? []) as unknown as DriverShiftRow[];

  // Convert raw photo paths to signed URLs in parallel
  await Promise.all(
    shifts.map(async (shift) => {
      const [startUrl, endUrl] = await Promise.all([
        createOdometerPhotoUrl(shift.start_photo_path),
        createOdometerPhotoUrl(shift.end_photo_path),
      ]);
      shift.start_photo_path = startUrl ?? shift.start_photo_path;
      shift.end_photo_path = endUrl ?? shift.end_photo_path;
    })
  );

  return { data: shifts, count: count ?? 0 };
}

function extractKafaratplusRecords(response: unknown): Record<string, unknown>[] {
  if (!response || typeof response !== "object") {
    return [];
  }

  const resp = response as Record<string, unknown>;
  const data = resp.data as Record<string, unknown> | undefined;
  const result = resp.result as Record<string, unknown> | undefined;

  const candidates = [
    resp.data,
    data?.items,
    data?.records,
    data?.rows,
    resp.items,
    resp.records,
    resp.rows,
    resp.result,
    result?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Record<string, unknown>[];
    }
  }

  return [];
}

const getCachedDriverFuel = unstable_cache(
  async (normalizedPlate: string, year: number, month: number): Promise<number> => {
    const clientId = process.env.KAFARATPLUS_CLIENT_ID?.trim();
    const secretKey = process.env.KAFARATPLUS_SECRET_KEY?.trim();
    const baseUrl = "https://kafaratplus.com";

    if (!clientId || !secretKey || !normalizedPlate) {
      return 0;
    }

    const monthStr = String(month).padStart(2, "0");
    const fromDate = `${year}-${monthStr}-01T00:00:00`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const toDate = `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}T23:59:59`;

    let totalCost = 0;
    let skip = 0;
    const count = 1000;
    let hasMore = true;

    try {
      while (hasMore) {
        const url = new URL("/api/customer/setup/integration/vehicle/operations", baseUrl);
        url.searchParams.set("fromDate", fromDate);
        url.searchParams.set("toDate", toDate);
        url.searchParams.set("skip", String(skip));
        url.searchParams.set("count", String(count));

        const response = await fetch(url.toString(), {
          headers: {
            clientId,
            secretKey,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000), // 8 seconds timeout
        });

        if (!response.ok) {
          console.error("[kafaratplus:driver-app:failed-status]", response.status);
          break;
        }

        const body = await response.json();
        if (!body.success) {
          console.error("[kafaratplus:driver-app:failed]", body);
          break;
        }

        const records = extractKafaratplusRecords(body);
        if (records.length === 0) {
          break;
        }

        // Sum matching operations
        for (const record of records) {
          const anyRecord = record as any;
          const plate = String(
            anyRecord.customerVehicle?.licencePlateNumber?.en ||
            anyRecord.customerVehicle?.number ||
            anyRecord.licencePlate ||
            anyRecord.vehicle ||
            ""
          ).toUpperCase();
          const norm = plate.normalize("NFKC").trim().replace(/[\s-]+/g, "");

          if (norm === normalizedPlate) {
            totalCost += Number(record.total || record.totalMoney || record.amount || 0);
          }
        }

        if (records.length < count) {
          hasMore = false;
        } else {
          skip += count;
        }
      }
    } catch (err) {
      console.error("[kafaratplus:driver-app:error]", err);
    }

    return totalCost;
  },
  ["kafaratplus-driver-fuel"],
  {
    revalidate: 3600, // 60 minutes
  }
);

async function fetchDriverFuelFromKafaratplus(normalizedPlate: string): Promise<number> {
  if (!normalizedPlate) return 0;
  const now = new Date();
  return getCachedDriverFuel(normalizedPlate, now.getFullYear(), now.getMonth() + 1);
}

export async function loadDriverDashboardMetrics(
  {
    driverId,
    organizationId,
    settlementType,
  }: {
    driverId: string;
    organizationId: string;
    settlementType: "tiers" | "per_order";
  },
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const client = supabase ?? (await createSupabaseServerClient());
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const currentRiyadhDate = getRiyadhDateString();

  const reportQuery = settlementType === "tiers"
    ? client
        .from("driver_daily_report_rows")
        .select("level, delivered_tasks, ranking_percentage, report_date, evaluation_total_orders")
        .eq("driver_id", driverId)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle()
    : (client as any)
        .from("driver_order_daily_report_rows")
        .select("delivered_tasks")
        .eq("driver_id", driverId)
        .eq("organization_id", organizationId)
        .gte("report_date", `${currentRiyadhDate.slice(0, 7)}-01`)
        .lte("report_date", currentRiyadhDate);

  const [
    { data: driverInfo },
    { data: reportData, error: reportError },
    { data: shiftData },
  ] = await Promise.all([
    client
      .from("drivers")
      .select("vehicle_number")
      .eq("id", driverId)
      .maybeSingle(),
    reportQuery,
    client
      .from("driver_shifts")
      .select("started_at, start_odometer_reading, end_odometer_reading")
      .eq("driver_id", driverId)
      .gte("started_at", sevenDaysAgo.toISOString())
      .order("started_at", { ascending: true }),
  ]);

  const rawPlate = driverInfo?.vehicle_number ?? "";
  const normalizedPlate = rawPlate.normalize("NFKC").trim().toUpperCase().replace(/[\s-]+/g, "");
  const totalFuel = await fetchDriverFuelFromKafaratplus(normalizedPlate);

  const rawReportData: any = reportData;
  const tierReport = settlementType === "tiers" ? rawReportData : null;
  const orderReportRows: Array<{ delivered_tasks: number | null }> =
    settlementType === "per_order" && Array.isArray(rawReportData)
      ? rawReportData
      : [];
  if (reportError) {
    console.error("[driver-app:order-reports]", {
      stage: "load-monthly-orders",
      code: reportError.code,
      message: reportError.message,
      details: reportError.details,
      hint: reportError.hint,
    });
  }
  const monthlyOrders = settlementType === "per_order"
    ? reportError
      ? null
      : orderReportRows.reduce(
          (total, row) => total + Number(row.delivered_tasks ?? 0),
          0,
        )
    : tierReport?.evaluation_total_orders ?? 0;

  return {
    totalFuel,
    recentShifts: shiftData ?? [],
    report: tierReport,
    monthlyOrders,
  };
}

export async function loadAssignedShiftSummary(
  driverId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<AssignedShiftSummary> {
  const client = supabase ?? (await createSupabaseServerClient());
  const today = getRiyadhDateString();
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
    .or(`assignment_start_date.is.null,assignment_start_date.lte.${today}`)
    .or(`assignment_end_date.is.null,assignment_end_date.gte.${today}`)
    .order("assignment_start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
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
    id: shift.id,
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

export async function loadAvailableShiftTemplates(organizationId: string, currentShiftId?: string) {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("organization_shift_templates")
    .select("id, name, start_time, end_time")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .is("archived_at", null)
    .not("published_at", "is", null);

  if (currentShiftId) {
    query = query.neq("id", currentShiftId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("loadAvailableShiftTemplates error", error);
    return [];
  }
  return data || [];
}

export async function loadDriverShiftChangeWindow(
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<DriverShiftChangeWindow> {
  const client = supabase ?? (await createSupabaseServerClient());
  const rpc = (client.rpc as unknown as (
    this: typeof client,
    functionName: string,
  ) => Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>).bind(client);
  const { data, error } = await rpc("get_my_shift_change_request_window");

  if (error) {
    console.error("[driver-app:shift-change-window]", {
      code: error.code,
      message: error.message,
    });
    return {
      success: false,
      error: "DRIVER_SHIFT_CHANGE_WINDOW_AUTH_REQUIRED",
    };
  }

  if (!isDriverShiftChangeWindow(data)) {
    console.error("[driver-app:shift-change-window] invalid response");
    return {
      success: false,
      error: "DRIVER_SHIFT_CHANGE_WINDOW_DRIVER_NOT_FOUND",
    };
  }

  return data;
}

function isDriverShiftChangeWindow(value: unknown): value is DriverShiftChangeWindow {
  if (!value || typeof value !== "object") return false;
  const window = value as Record<string, unknown>;

  if (window.success === false) {
    return (
      window.error === "DRIVER_SHIFT_CHANGE_WINDOW_AUTH_REQUIRED" ||
      window.error === "DRIVER_SHIFT_CHANGE_WINDOW_DRIVER_NOT_FOUND"
    );
  }

  return (
    window.success === true &&
    typeof window.today_riyadh === "string" &&
    typeof window.weekday_riyadh === "number" &&
    Array.isArray(window.allowed_weekdays) &&
    window.allowed_weekdays.every((day) => typeof day === "number") &&
    typeof window.can_submit_today === "boolean" &&
    typeof window.target_week_start === "string"
  );
}

export async function loadPendingShiftChangeRequest(driverId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("driver_shift_change_requests")
    .select(`
      id,
      requested_week_start_date,
      requested_shift_id,
      status,
      requested_shift:organization_shift_templates!driver_shift_change_requests_requested_shift_id_fkey(name)
    `)
    .eq("driver_id", driverId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("loadPendingShiftChangeRequest error", error);
    return null;
  }
  return data as {
    id: string;
    requested_week_start_date: string;
    requested_shift_id: string;
    status: string;
    requested_shift: { name: string } | null;
  } | null;
}

export type RecentShiftChangeRequest = {
  id: string;
  requested_week_start_date: string;
  requested_shift_id: string;
  status: "pending" | "approved" | "rejected";
  driver_note: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  display_status: ShiftChangeRequestDisplayStatus;
  requested_shift: { name: string } | null;
};

export async function loadRecentShiftChangeRequests(driverId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("driver_shift_change_requests")
    .select(`
      id,
      requested_week_start_date,
      requested_shift_id,
      status,
      driver_note,
      review_note,
      reviewed_at,
      created_at,
      requested_shift:organization_shift_templates!driver_shift_change_requests_requested_shift_id_fkey(name)
    `)
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("loadRecentShiftChangeRequests error", error);
    return [];
  }

  const today = getRiyadhDateString();
  const assignedShift = await loadAssignedShiftSummary(driverId, supabase);

  return (data ?? []).map((request) => ({
    ...request,
    display_status: deriveShiftRequestDisplayStatus({
      status: request.status as "pending" | "approved" | "rejected",
      requestedWeekStartDate: request.requested_week_start_date,
      requestedShiftId: request.requested_shift_id,
      currentShiftId: assignedShift?.id ?? null,
      today,
    }),
  })) as RecentShiftChangeRequest[];
}

const avatarUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function createDriverAvatarUrl(path: string | null) {
  if (!path) {
    return null;
  }

  const now = Date.now();
  const cached = avatarUrlCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.url;
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
    return null;
  }

  if (data?.signedUrl) {
    // Cache for 8 minutes (480000 ms)
    avatarUrlCache.set(path, { url: data.signedUrl, expiresAt: now + 480000 });
  }

  return data?.signedUrl ?? null;
}

const odometerPhotoUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function createOdometerPhotoUrl(path: string | null) {
  if (!path) {
    return null;
  }

  const now = Date.now();
  const cached = odometerPhotoUrlCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.url;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from("driver-odometer")
    .createSignedUrl(path, 60 * 10);

  if (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[odometer-photo]", {
        stage: "create-signed-url",
        code: error.name,
        message: error.message,
      });
    }
    return null;
  }

  if (data?.signedUrl) {
    // Cache for 8 minutes (480000 ms)
    odometerPhotoUrlCache.set(path, { url: data.signedUrl, expiresAt: now + 480000 });
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

function deriveShiftRequestDisplayStatus({
  status,
  requestedWeekStartDate,
  requestedShiftId,
  currentShiftId,
  today,
}: {
  status: "pending" | "approved" | "rejected";
  requestedWeekStartDate: string;
  requestedShiftId: string;
  currentShiftId: string | null;
  today: string;
}): ShiftChangeRequestDisplayStatus {
  if (status === "pending") return "pending";
  if (status === "rejected") return "rejected";
  if (today < requestedWeekStartDate) return "scheduled";
  if (currentShiftId === requestedShiftId) return "completed";
  return "review_needed";
}
