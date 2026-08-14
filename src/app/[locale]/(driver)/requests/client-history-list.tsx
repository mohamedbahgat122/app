"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import type { DriverRequestCursor, LoadDriverRequestHistoryResult } from "@/lib/app/driver-requests";

export function ClientHistoryList({
  initialResult,
  loadMoreAction,
}: {
  initialResult: LoadDriverRequestHistoryResult;
  loadMoreAction: (cursor: DriverRequestCursor) => Promise<LoadDriverRequestHistoryResult>;
}) {
  const locale = useLocale();
  const t = useTranslations("Requests");
  const [items, setItems] = useState(initialResult.items);
  const [cursor, setCursor] = useState(initialResult.nextCursor);
  const [hasMore, setHasMore] = useState(initialResult.hasMore);
  const [loading, setLoading] = useState(false);

  async function handleLoadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const result = await loadMoreAction(cursor);
      setItems((prev) => [...prev, ...result.items]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="px-1 text-base font-bold text-navy">{t("history")}</h2>
      {items.length === 0 ? (
        <p className="rounded-[0.85rem] border border-border bg-white p-4 text-sm font-semibold text-muted">
          {t("empty")}
        </p>
      ) : (
        <>
          {items.map((request) => (
            <article
              key={`${request.requestType}-${request.id}`}
              className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-navy">
                    {t(`types.${request.requestType}`)}
                  </h3>
                  <p className="mt-1 text-sm text-muted">{request.summary}</p>
                </div>
                <RequestStatusBadge
                  label={t(`statuses.${request.status}`)}
                  status={request.status}
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-muted">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(request.submittedAt))}
              </p>
              {request.scheduledAt ? (
                <p className="mt-2 text-sm font-semibold text-primary">
                  {t("scheduled")}:{" "}
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(request.scheduledAt))}
                </p>
              ) : null}
              {request.requestType === "meeting" ? (
                <p className="mt-2 text-sm font-semibold text-navy">
                  {t("meetingWith")}:{" "}
                  {request.requestedManagerName
                    ? request.requestedManagerJobTitle
                      ? `${request.requestedManagerName} - ${request.requestedManagerJobTitle}`
                      : request.requestedManagerName
                    : t("managerNotSpecified")}
                </p>
              ) : null}
              {request.reviewNote ? (
                <p className="mt-2 text-sm font-semibold text-navy">
                  {t("reviewNote")}: {request.reviewNote}
                </p>
              ) : null}
            </article>
          ))}
          
          {hasMore && cursor && (
            <button
              onClick={handleLoadMore}
              disabled={loading}
              className="mt-4 w-full flex min-h-12 items-center justify-center rounded-[0.85rem] bg-primary-soft/60 px-4 text-sm font-bold text-navy transition-colors hover:bg-primary-soft disabled:opacity-50"
            >
              {loading ? "جاري التحميل..." : "عرض الطلبات السابقة"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
