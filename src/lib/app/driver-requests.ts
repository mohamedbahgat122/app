import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ServerSupabaseClient = SupabaseClient<Database>;

export type DriverRequestHistoryItem = {
  id: string;
  requestType: "fuel" | "leave" | "maintenance" | "meeting" | "oil_change";
  status: "pending" | "approved" | "rejected" | "completed" | "cancelled";
  submittedAt: string;
  summary: string;
  reviewNote: string | null;
  scheduledAt: string | null;
};

export async function loadDriverRequestHistory({
  supabase,
  driverId,
}: {
  supabase: ServerSupabaseClient;
  driverId: string;
}) {
  const [fuelResult, appResult] = await Promise.all([
    supabase
      .from("fuel_increase_requests")
      .select("id, requested_amount_sar, reason, status, created_at, review_note")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("driver_app_requests")
      .select("id, request_type, status, submitted_note, submitted_at, review_note")
      .eq("driver_id", driverId)
      .order("submitted_at", { ascending: false })
      .limit(50),
  ]);

  const items: DriverRequestHistoryItem[] = [];

  for (const request of fuelResult.data ?? []) {
    items.push({
      id: request.id,
      requestType: "fuel",
      status: request.status as DriverRequestHistoryItem["status"],
      submittedAt: request.created_at,
      summary: `${request.requested_amount_sar} SAR - ${request.reason}`,
      reviewNote: request.review_note,
      scheduledAt: null,
    });
  }

  const appRequests = appResult.data ?? [];
  const detailIds = appRequests.map((request) => request.id);
  const [meetingDetails, oilDetails] = await Promise.all([
    detailIds.length
      ? supabase
          .from("driver_app_meeting_request_details")
          .select("request_id, subject, scheduled_at")
          .in("request_id", detailIds)
      : { data: [] },
    detailIds.length
      ? supabase
          .from("driver_app_oil_change_request_details")
          .select("request_id, current_odometer_reading, scheduled_at")
          .in("request_id", detailIds)
      : { data: [] },
  ]);
  const meetingById = new Map(
    (meetingDetails.data ?? []).map((detail) => [detail.request_id, detail]),
  );
  const oilById = new Map(
    (oilDetails.data ?? []).map((detail) => [detail.request_id, detail]),
  );

  for (const request of appRequests) {
    const meeting = meetingById.get(request.id);
    const oil = oilById.get(request.id);
    const requestType = asDriverRequestType(request.request_type);
    const status = asDriverRequestStatus(request.status);

    if (!requestType || !status) continue;

    items.push({
      id: request.id,
      requestType,
      status,
      submittedAt: request.submitted_at,
      summary:
        meeting?.subject ??
        (oil ? String(oil.current_odometer_reading) : request.submitted_note) ??
        "",
      reviewNote: request.review_note,
      scheduledAt: meeting?.scheduled_at ?? oil?.scheduled_at ?? null,
    });
  }

  return items.sort(
    (first, second) =>
      new Date(second.submittedAt).getTime() -
      new Date(first.submittedAt).getTime(),
  );
}

function asDriverRequestType(
  value: string,
): DriverRequestHistoryItem["requestType"] | null {
  return value === "leave" ||
    value === "maintenance" ||
    value === "meeting" ||
    value === "oil_change"
    ? value
    : null;
}

function asDriverRequestStatus(
  value: string,
): DriverRequestHistoryItem["status"] | null {
  return value === "pending" ||
    value === "approved" ||
    value === "rejected" ||
    value === "completed" ||
    value === "cancelled"
    ? value
    : null;
}
