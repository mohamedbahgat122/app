"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { RealtimePostgresChangesPayload } from "@supabase/realtime-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RealtimeRefreshRow = Record<string, unknown>;
type RealtimeRefreshPayload =
  RealtimePostgresChangesPayload<RealtimeRefreshRow>;

type RealtimeRefreshTable =
  | "driver_app_requests"
  | "app_notifications"
  | "driver_warnings"
  | "driver_shift_change_requests"
  | "organization_shift_assignments"
  | "organization_order_period_assignments"
  | "organization_order_period_templates"
  | "driver_order_shift_change_requests";

type RealtimeRefreshSubscription = {
  channelName: string;
  table: RealtimeRefreshTable;
  filter: string;
};

type RealtimeRefreshProps = {
  toast: string;
  channelName?: string;
  table?: RealtimeRefreshTable;
  filter?: string;
  subscriptions?: RealtimeRefreshSubscription[];
};

type RealtimeRefreshSubscriber = {
  refresh: () => void;
  showToast: () => void;
};

type RealtimeSuppressionScope = {
  table: RealtimeRefreshTable;
  filter: string;
  eventType: RealtimeRefreshPayload["eventType"];
};

const refreshDebounceMs = 350;
const resumeRefreshDebounceMs = 900;
const localEchoSuppressionMs = 1500;
const realtimeRefreshSubscribers = new Map<string, RealtimeRefreshSubscriber>();
const pendingSubscriberIds = new Map<string, boolean>();
const suppressedRealtimeScopes = new Map<string, number>();
let pendingRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResumeRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let resumeListenerUsers = 0;

function createRealtimeScopeKey({ table, filter, eventType }: RealtimeSuppressionScope) {
  return `${table}:${filter}:${eventType}`;
}

export function suppressNextRealtimeRefresh(scope: RealtimeSuppressionScope) {
  suppressedRealtimeScopes.set(
    createRealtimeScopeKey(scope),
    Date.now() + localEchoSuppressionMs,
  );
}

function shouldSuppressNextRealtimeRefresh(scope: RealtimeSuppressionScope) {
  const scopeKey = createRealtimeScopeKey(scope);
  const expiresAt = suppressedRealtimeScopes.get(scopeKey);

  if (!expiresAt) return false;

  suppressedRealtimeScopes.delete(scopeKey);
  return expiresAt >= Date.now();
}

function scheduleRealtimeRefresh(subscriberId: string, showToast = true) {
  pendingSubscriberIds.set(
    subscriberId,
    (pendingSubscriberIds.get(subscriberId) ?? false) || showToast,
  );

  if (pendingRefreshTimer) return;

  pendingRefreshTimer = setTimeout(() => {
    pendingRefreshTimer = null;
    flushRealtimeRefresh();
  }, refreshDebounceMs);
}

function flushRealtimeRefresh() {
  const subscribers = Array.from(pendingSubscriberIds)
    .map(([subscriberId, showToast]) => ({
      subscriber: realtimeRefreshSubscribers.get(subscriberId),
      showToast,
    }))
    .filter(
      (entry): entry is { subscriber: RealtimeRefreshSubscriber; showToast: boolean } =>
        Boolean(entry.subscriber),
    );

  pendingSubscriberIds.clear();
  if (subscribers.length === 0) return;

  subscribers[0].subscriber.refresh();

  for (const { subscriber, showToast } of subscribers) {
    if (showToast) {
      subscriber.showToast();
    }
  }
}

function scheduleResumeRefresh() {
  if (pendingResumeRefreshTimer) return;

  pendingResumeRefreshTimer = setTimeout(() => {
    pendingResumeRefreshTimer = null;
    const subscriberId = realtimeRefreshSubscribers.keys().next().value;
    if (typeof subscriberId === "string") {
      scheduleRealtimeRefresh(subscriberId, false);
    }
  }, resumeRefreshDebounceMs);
}

function removeRealtimeRefreshSubscriber(subscriberId: string) {
  realtimeRefreshSubscribers.delete(subscriberId);
  pendingSubscriberIds.delete(subscriberId);

  if (realtimeRefreshSubscribers.size === 0 && pendingRefreshTimer) {
    clearTimeout(pendingRefreshTimer);
    pendingRefreshTimer = null;
    pendingSubscriberIds.clear();
  }

  if (realtimeRefreshSubscribers.size === 0 && pendingResumeRefreshTimer) {
    clearTimeout(pendingResumeRefreshTimer);
    pendingResumeRefreshTimer = null;
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    scheduleResumeRefresh();
  }
}

function handleResume() {
  scheduleResumeRefresh();
}

function addResumeListeners() {
  if (resumeListenerUsers === 0) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleResume);
    window.addEventListener("online", handleResume);
  }
  resumeListenerUsers += 1;
}

function removeResumeListeners() {
  resumeListenerUsers = Math.max(0, resumeListenerUsers - 1);
  if (resumeListenerUsers > 0) return;

  document.removeEventListener("visibilitychange", handleVisibilityChange);
  window.removeEventListener("focus", handleResume);
  window.removeEventListener("online", handleResume);
}

export function RealtimeRefresh({
  channelName,
  table,
  filter,
  toast,
  subscriptions,
}: RealtimeRefreshProps) {
  const router = useRouter();
  const subscriberId = useId();
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscriptionList = useMemo(
    () => subscriptions ?? (channelName && table && filter ? [{ channelName, table, filter }] : []),
    [channelName, filter, subscriptions, table],
  );

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
    const channels = subscriptionList.map((subscription) => {
      const channel = supabase.channel(subscription.channelName);
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: subscription.table,
          filter: subscription.filter,
        },
        (payload) => {
          if (shouldSuppressNextRealtimeRefresh({
            table: subscription.table,
            filter: subscription.filter,
            eventType: payload.eventType,
          })) {
            return;
          }

          scheduleRealtimeRefresh(subscriberId);
        },
      );
      channel.subscribe();
      return channel;
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      for (const channel of channels) supabase.removeChannel(channel);
    };
  }, [subscriberId, subscriptionList]);

  useEffect(() => {
    addResumeListeners();

    return () => {
      removeResumeListeners();
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 rounded-[0.85rem] border border-primary/20 bg-white px-4 py-3 text-center text-sm font-bold text-navy shadow-xl">
      {toast}
    </div>
  );
}
