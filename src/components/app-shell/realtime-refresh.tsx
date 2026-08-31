"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RealtimeRefreshProps = {
  channelName: string;
  table:
    | "driver_app_requests"
    | "app_notifications"
    | "driver_warnings"
    | "driver_shift_change_requests"
    | "organization_shift_assignments";
  filter: string;
  toast: string;
};

type RealtimeRefreshSubscriber = {
  refresh: () => void;
  showToast: () => void;
};

const refreshDebounceMs = 350;
const realtimeRefreshSubscribers = new Map<string, RealtimeRefreshSubscriber>();
const pendingSubscriberIds = new Set<string>();
let pendingRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRealtimeRefresh(subscriberId: string) {
  pendingSubscriberIds.add(subscriberId);

  if (pendingRefreshTimer) return;

  pendingRefreshTimer = setTimeout(() => {
    pendingRefreshTimer = null;
    flushRealtimeRefresh();
  }, refreshDebounceMs);
}

function flushRealtimeRefresh() {
  const subscribers = Array.from(pendingSubscriberIds)
    .map((subscriberId) => realtimeRefreshSubscribers.get(subscriberId))
    .filter((subscriber): subscriber is RealtimeRefreshSubscriber => Boolean(subscriber));

  pendingSubscriberIds.clear();
  if (subscribers.length === 0) return;

  subscribers[0].refresh();

  for (const subscriber of subscribers) {
    subscriber.showToast();
  }
}

function removeRealtimeRefreshSubscriber(subscriberId: string) {
  realtimeRefreshSubscribers.delete(subscriberId);
  pendingSubscriberIds.delete(subscriberId);

  if (realtimeRefreshSubscribers.size === 0 && pendingRefreshTimer) {
    clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = null;
    pendingSubscriberIds.clear();
  }
}

export function RealtimeRefresh({
  channelName,
  table,
  filter,
  toast,
}: RealtimeRefreshProps) {
  const router = useRouter();
  const subscriberId = useId();
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    realtimeRefreshSubscribers.set(subscriberId, {
      refresh: () => router.refresh(),
      showToast: () => {
        setVisible(true);

        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setVisible(false), 2800);
      },
    });

    return () => {
      removeRealtimeRefreshSubscriber(subscriberId);
    };
  }, [router, subscriberId]);

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
        scheduleRealtimeRefresh(subscriberId);
      },
    );

    channel.subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [channelName, filter, subscriberId, table]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-[0.85rem] border border-primary/20 bg-white px-4 py-3 text-center text-sm font-bold text-navy shadow-xl">
      {toast}
    </div>
  );
}
