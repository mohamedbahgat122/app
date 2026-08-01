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
  isRead: boolean;
  createdAt: string;
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

  return (data ?? []).map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    message: notification.message,
    entityType: notification.entity_type,
    entityId: notification.entity_id,
    isRead: notification.is_read,
    createdAt: notification.created_at,
  })) satisfies DriverNotification[];
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
