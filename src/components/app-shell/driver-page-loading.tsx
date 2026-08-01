"use client";

import { useLocale } from "next-intl";
import { PageCard } from "@/components/app-shell/page-card";

export function DriverPageLoading() {
  const locale = useLocale();
  const message =
    locale === "ar" ? "جاري تحميل البيانات..." : "Loading data...";

  return (
    <main
      className="space-y-4"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className="flex min-h-[9rem] flex-col items-center justify-center rounded-[0.85rem] border border-border bg-white px-5 py-8 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
          <span className="size-6 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
        </span>
        <p className="mt-3 text-sm font-bold text-navy">{message}</p>
      </div>
      <PageCard>
        <div className="space-y-3">
          <div className="h-4 w-28 animate-pulse rounded-full bg-primary-soft" />
          <div className="h-6 w-36 animate-pulse rounded-full bg-border/70" />
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="h-14 animate-pulse rounded-[0.75rem] bg-primary-soft/70" />
            <div className="h-14 animate-pulse rounded-[0.75rem] bg-primary-soft/70" />
          </div>
        </div>
      </PageCard>
    </main>
  );
}
