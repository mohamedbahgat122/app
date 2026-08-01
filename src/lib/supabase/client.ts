"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";
import type { Database } from "@/types/database";

export function createSupabaseBrowserClient() {
  const { publishableKey, url } = getSupabaseConfig();

  return createBrowserClient<Database>(url, publishableKey);
}
