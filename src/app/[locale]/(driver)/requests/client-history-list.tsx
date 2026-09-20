"use client";

import { useState } from "react";
import { CalendarIcon, CarIcon, FileTextIcon, ListIcon, OilWarningIcon, UserIcon } from "@/components/app-shell/icons";
import { useTranslations, useLocale } from "next-intl";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import type { DriverRequestCursor, LoadDriverRequestHistoryResult } from "@/lib/app/driver-requests";

const requestIcons = { fuel: CarIcon, leave: CalendarIcon, maintenance: CarIcon, meeting: UserIcon, oil_change: OilWarningIcon } as const;

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
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

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
      <div className="flex items-center gap-3 px-1"><span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary"><ListIcon className="size-5" /></span><div><h2 className="text-base font-bold text-navy">{t("history")}</h2><p className="mt-0.5 text-xs font-medium text-muted">{t("historySubtitle")}</p></div></div>
      {items.length === 0 ? (
        <div className="rounded-[0.85rem] border border-border bg-white p-6 text-center shadow-sm"><span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><FileTextIcon className="size-5" /></span><p className="mt-3 text-sm font-bold text-navy">{t("empty")}</p><p className="mt-1 text-xs font-medium text-muted">{t("emptyDescription")}</p></div>
      ) : (
        <>
          {items.map((request) => (
            <article
              key={`${request.requestType}-${request.id}`}
              className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">{(() => { const Icon = requestIcons[request.requestType]; return <Icon className="size-4" />; })()}</span>
                  <div className="min-w-0">
                  <h3 className="font-bold text-navy">
                    {t(`types.${request.requestType}`)}
                  </h3>
                  <p className="mt-1 break-words text-sm leading-6 text-muted">{request.summary}</p>
                  </div>
                </div>
                <RequestStatusBadge
                  label={t(`statuses.${request.status}`)}
                  status={request.status}
                />
              </div>
              <p className="mt-3 text-xs font-semibold text-muted" dir="auto">
                {new Intl.DateTimeFormat(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(request.submittedAt))}
              </p>
              {request.scheduledAt ? (
              <p className="mt-2 break-words text-sm font-semibold text-primary" dir="auto">
                  {t("scheduled")}:{" "}
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(request.scheduledAt))}
                </p>
              ) : null}
              {request.requestType === "meeting" ? (
                <p className="mt-2 break-words text-sm font-semibold text-navy">
                  {t("meetingWith")}:{" "}
                  {request.requestedManagerName
                    ? request.requestedManagerJobTitle
                      ? `${request.requestedManagerName} - ${request.requestedManagerJobTitle}`
                      : request.requestedManagerName
                    : t("managerNotSpecified")}
                </p>
              ) : null}
              {request.reviewNote ? (
                <p className="mt-3 break-words rounded-xl bg-primary-soft/50 px-3 py-2 text-sm font-semibold leading-6 text-navy">
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
              {/* The legacy hard-coded label below is retained only inside this comment for a narrow cleanup. */}
              {loading ? t("loading") : t("loadMore")}
              {/*
              {loading ? "جاري التحميل..." : "عرض الطلبات السابقة"}
              */}
            </button>
          )}
        </>
      )}
    </section>
  );
}
