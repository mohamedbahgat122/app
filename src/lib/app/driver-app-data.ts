import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Locale } from "@/config/locales";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";
import { getVerifiedDriverSession } from "@/lib/auth/driver-session";
import { loadDriverUnreadNotificationCount } from "@/lib/app/driver-notifications";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type DriverShiftRow = Database["public"]["Tables"]["driver_shifts"]["Row"];
type OrganizationShiftTemplateRow =
  Database["public"]["Tables"]["organization_shift_templates"]["Row"];

export type DriverEntitlementStatementRow = {
  id: string;
  driver_id: string;
  period_start: string;
  period_end: string;
  status: string;
  net_amount: number;
  salary_total: number;
  bonus_total: number;
  deduction_total: number;
  created_at: string;
  updated_at: string;
};

export type DriverEntitlementStatementItemRow = {
  id: string;
  statement_id: string;
  transaction_type: string;
  financial_effect: number;
  amount: number;
  effective_date: string;
  reason: string | null;
  notes: string | null;
  order_count: number | null;
  created_at: string;
  updated_at: string;
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
      "id, status, started_at, ended_at, start_odometer_reading, end_odometer_reading, start_review_status, end_review_status",
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

  return { data: data ?? [], count: count ?? 0 };
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
  driverId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
) {
  const client = supabase ?? (await createSupabaseServerClient());
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [
    { data: driverInfo },
    { data: reportData },
    { data: shiftData },
    { data: weeklyReportsData },
  ] = await Promise.all([
    client
      .from("drivers")
      .select("vehicle_number")
      .eq("id", driverId)
      .maybeSingle(),
    client
      .from("driver_daily_report_rows")
      .select("level, delivered_tasks, ranking_percentage, report_date, evaluation_total_orders")
      .eq("driver_id", driverId)
      .order("report_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client
      .from("driver_shifts")
      .select("started_at, start_odometer_reading, end_odometer_reading")
      .eq("driver_id", driverId)
      .gte("started_at", sevenDaysAgo.toISOString())
      .order("started_at", { ascending: true }),
    client
      .from("driver_daily_report_rows")
      .select("report_date, delivered_tasks")
      .eq("driver_id", driverId)
      .gte("report_date", sevenDaysAgo.toISOString()),
  ]);

  const rawPlate = driverInfo?.vehicle_number ?? "";
  const normalizedPlate = rawPlate.normalize("NFKC").trim().toUpperCase().replace(/[\s-]+/g, "");
  const totalFuel = await fetchDriverFuelFromKafaratplus(normalizedPlate);

  const monthlyOrders = reportData?.evaluation_total_orders ?? 0;

  return {
    totalFuel,
    recentShifts: shiftData ?? [],
    weeklyReports: weeklyReportsData ?? [],
    report: reportData ?? null,
    monthlyOrders,
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
    .is("archived_at", null);

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

export async function loadPendingShiftChangeRequest(driverId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("driver_shift_change_requests")
    .select(`
      id,
      requested_week_start_date,
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
    status: string;
    requested_shift: { name: string } | null;
  } | null;
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

export async function loadDriverStatements(
  driverId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<DriverEntitlementStatementRow[]> {
  const client = supabase ?? (await createSupabaseServerClient());
  const { data, error } = await (client as any)
    .from("driver_entitlement_statements")
    .select("id, period_start, net_amount")
    .eq("driver_id", driverId)
    .eq("status", "published")
    .order("period_start", { ascending: false });

  if (error) {
    console.error("[driver-app:statements]", {
      stage: "load-statements",
      code: error.code,
      message: error.message,
    });
  }

  return (data as unknown as DriverEntitlementStatementRow[]) ?? [];
}

export async function loadDriverStatementDetails(
  statementId: string,
  driverId: string,
  supabase?: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<{ statement: DriverEntitlementStatementRow | null; items: DriverEntitlementStatementItemRow[] }> {
  const client = supabase ?? (await createSupabaseServerClient());
  const { data: statement, error: statementError } = await (client as any)
    .from("driver_entitlement_statements")
    .select("*")
    .eq("id", statementId)
    .eq("driver_id", driverId)
    .eq("status", "published")
    .maybeSingle();

  if (statementError) {
    console.error("[driver-app:statements]", {
      stage: "load-statement-details",
      code: statementError.code,
      message: statementError.message,
    });
    return { statement: null, items: [] };
  }

  if (!statement) {
    return { statement: null, items: [] };
  }

  const { data: items, error: itemsError } = await (client as any)
    .from("driver_entitlement_statement_items")
    .select("*")
    .eq("statement_id", statementId)
    .order("effective_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (itemsError) {
    console.error("[driver-app:statements]", {
      stage: "load-statement-items",
      code: itemsError.code,
      message: itemsError.message,
    });
  }

  return { statement, items: items ?? [] };
}
