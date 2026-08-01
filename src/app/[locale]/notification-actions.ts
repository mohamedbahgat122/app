"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function markDriverNotificationReadAction(formData: FormData) {
  const locale = formData.get("locale")?.toString() ?? "ar";
  const notificationId = formData.get("notificationId")?.toString();
  if (!notificationId) return;

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("id", notificationId);

  revalidatePath(`/${locale}/notifications`);
}

export async function markAllDriverNotificationsReadAction(formData: FormData) {
  const locale = formData.get("locale")?.toString() ?? "ar";
  const supabase = await createSupabaseServerClient();

  await supabase
    .from("app_notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("is_read", false);

  revalidatePath(`/${locale}/notifications`);
}
