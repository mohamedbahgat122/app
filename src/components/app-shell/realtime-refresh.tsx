"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RealtimeRefreshProps = {
  channelName: string;
  table: "driver_app_requests" | "app_notifications";
  filter: string;
  toast: string;
};

export function RealtimeRefresh({
  channelName,
  table,
  filter,
  toast,
}: RealtimeRefreshProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(channelName);

    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter,
      },
      () => {
        router.refresh();
        setVisible(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setVisible(false), 2800);
      },
    );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") router.refresh();
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [channelName, filter, router, table]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-[0.85rem] border border-primary/20 bg-white px-4 py-3 text-center text-sm font-bold text-navy shadow-xl">
      {toast}
    </div>
  );
}
