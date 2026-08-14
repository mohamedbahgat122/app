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
  requestedManagerName: string | null;
  requestedManagerJobTitle: string | null;
};

export type DriverRequestCursor = {
  submittedAt: string;
  id: string;
};

export type LoadDriverRequestHistoryResult = {
  items: DriverRequestHistoryItem[];
  nextCursor: DriverRequestCursor | null;
  hasMore: boolean;
};

export async function loadDriverRequestHistory({
  supabase,
  driverId,
  pageSize = 15,
  cursor,
}: {
  supabase: ServerSupabaseClient;
  driverId: string;
  pageSize?: number;
  cursor?: DriverRequestCursor | null;
}): Promise<LoadDriverRequestHistoryResult> {
  let fuelQuery = supabase
    .from("fuel_increase_requests")
    .select("id, requested_amount_sar, reason, status, created_at, review_note")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    fuelQuery = fuelQuery.or(
      `created_at.lt."${cursor.submittedAt}",and(created_at.eq."${cursor.submittedAt}",id.lt."${cursor.id}")`
    );
  }

  let appQuery = supabase
    .from("driver_app_requests")
    .select("id, request_type, status, submitted_note, submitted_at, review_note")
    .eq("driver_id", driverId)
    .order("submitted_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(pageSize + 1);

  if (cursor) {
    appQuery = appQuery.or(
      `submitted_at.lt."${cursor.submittedAt}",and(submitted_at.eq."${cursor.submittedAt}",id.lt."${cursor.id}")`
    );
  }

  const [fuelResult, appResult] = await Promise.all([fuelQuery, appQuery]);

  type RawRequest = {
    id: string;
    requestType: string;
    status: string;
    submittedAt: string;
    summary: string;
    reviewNote: string | null;
    originalAppRequest?: any;
  };

  const rawItems: RawRequest[] = [];

  for (const request of fuelResult.data ?? []) {
    rawItems.push({
      id: request.id,
      requestType: "fuel",
      status: request.status,
      submittedAt: request.created_at,
      summary: `${request.requested_amount_sar} SAR - ${request.reason}`,
      reviewNote: request.review_note,
    });
  }

  for (const request of appResult.data ?? []) {
    rawItems.push({
      id: request.id,
      requestType: request.request_type,
      status: request.status,
      submittedAt: request.submitted_at,
      summary: request.submitted_note ?? "",
      reviewNote: request.review_note,
      originalAppRequest: request,
    });
  }

  rawItems.sort((first, second) => {
    const timeDiff = new Date(second.submittedAt).getTime() - new Date(first.submittedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    return second.id.localeCompare(first.id);
  });

  const hasMore = rawItems.length > pageSize;
  const pageItems = rawItems.slice(0, pageSize);

  const nextCursor: DriverRequestCursor | null =
    hasMore && pageItems.length > 0
      ? {
          submittedAt: pageItems[pageItems.length - 1].submittedAt,
          id: pageItems[pageItems.length - 1].id,
        }
      : null;

  const items: DriverRequestHistoryItem[] = [];

  const appRequests = pageItems
    .filter((req) => req.originalAppRequest)
    .map((req) => req.originalAppRequest);

  const meetingRequestIds = appRequests
    .filter((request) => request.request_type === "meeting")
    .map((request) => request.id);
  const oilChangeRequestIds = appRequests
    .filter((request) => request.request_type === "oil_change")
    .map((request) => request.id);

  const [meetingDetails, oilDetails] = await Promise.all([
    meetingRequestIds.length
      ? supabase
          .from("driver_app_meeting_request_details")
          .select("request_id, subject, scheduled_at, requested_manager_user_id")
          .in("request_id", meetingRequestIds)
      : { data: [] },
    oilChangeRequestIds.length
      ? supabase
          .from("driver_app_oil_change_request_details")
          .select("request_id, current_odometer_reading, scheduled_at")
          .in("request_id", oilChangeRequestIds)
      : { data: [] },
  ]);

  const meetingById = new Map(
    (meetingDetails.data ?? []).map((detail) => [detail.request_id, detail]),
  );
  const managerIds = Array.from(
    new Set(
      (meetingDetails.data ?? [])
        .map((detail) => detail.requested_manager_user_id)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const managerProfiles = managerIds.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, job_title")
        .in("id", managerIds)
    : { data: [] };
  const managerById = new Map(
    (managerProfiles.data ?? []).map((profile) => [profile.id, profile]),
  );
  const oilById = new Map(
    (oilDetails.data ?? []).map((detail) => [detail.request_id, detail]),
  );

  for (const raw of pageItems) {
    if (raw.requestType === "fuel") {
      const status = asDriverRequestStatus(raw.status);
      if (status) {
        items.push({
          id: raw.id,
          requestType: "fuel",
          status,
          submittedAt: raw.submittedAt,
          summary: raw.summary,
          reviewNote: raw.reviewNote,
          scheduledAt: null,
          requestedManagerName: null,
          requestedManagerJobTitle: null,
        });
      }
      continue;
    }

    const meeting = meetingById.get(raw.id);
    const oil = oilById.get(raw.id);
    const requestType = asDriverRequestType(raw.requestType);
    const status = asDriverRequestStatus(raw.status);

    if (!requestType || !status) continue;

    items.push({
      id: raw.id,
      requestType,
      status,
      submittedAt: raw.submittedAt,
      summary:
        meeting?.subject ??
        (oil ? String(oil.current_odometer_reading) : raw.summary) ??
        "",
      reviewNote: raw.reviewNote,
      scheduledAt: meeting?.scheduled_at ?? oil?.scheduled_at ?? null,
      requestedManagerName: meeting?.requested_manager_user_id
        ? managerById.get(meeting.requested_manager_user_id)?.full_name ?? null
        : null,
      requestedManagerJobTitle: meeting?.requested_manager_user_id
        ? managerById.get(meeting.requested_manager_user_id)?.job_title ?? null
        : null,
    });
  }

  return {
    items,
    nextCursor,
    hasMore,
  };
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
