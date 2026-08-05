import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ServerSupabaseClient = SupabaseClient<Database>;

export type DriverNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  requestType: string | null;
  requestStatus: string | null;
  isRead: boolean;
  createdAt: string;
};

type DriverRequestNotificationRow = {
  id: string;
  request_type: string;
  status: string;
};

export async function loadDriverNotifications({
  supabase,
  limit = 50,
}: {
  supabase: ServerSupabaseClient;
  limit?: number;
}) {
  const { data } = await supabase
    .from("app_notifications")
    .select("id, type, title, message, entity_type, entity_id, is_read, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  const requestIds = (data ?? [])
    .filter(
      (notification) =>
        notification.entity_type === "driver_app_request" &&
        notification.entity_id,
    )
    .map((notification) => notification.entity_id as string);
  const requestsById = new Map<string, DriverRequestNotificationRow>();

  if (requestIds.length > 0) {
    const { data: requests } = await supabase
      .from("driver_app_requests")
      .select("id, request_type, status")
      .in("id", Array.from(new Set(requestIds)));

    for (const request of (requests ?? []) as DriverRequestNotificationRow[]) {
      requestsById.set(request.id, request);
    }
  }

  return (data ?? []).map((notification) => {
    const request = notification.entity_id
      ? requestsById.get(notification.entity_id)
      : null;

    return {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entity_type,
      entityId: notification.entity_id,
      requestType: request?.request_type ?? null,
      requestStatus: request?.status ?? null,
      isRead: notification.is_read,
      createdAt: notification.created_at,
    };
  }) satisfies DriverNotification[];
}

export async function loadDriverUnreadNotificationCount(
  supabase: ServerSupabaseClient,
) {
  const { count } = await supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("is_read", false);

  return count ?? 0;
}
