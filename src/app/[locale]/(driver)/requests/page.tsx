import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { CalendarIcon, CarIcon, OilWarningIcon, UserIcon } from "@/components/app-shell/icons";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { isLocale, type Locale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { loadDriverSession } from "@/lib/app/driver-app-data";
import { loadDriverRequestHistory, type DriverRequestCursor } from "@/lib/app/driver-requests";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ClientHistoryList } from "./client-history-list";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function RequestsPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverSession(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Requests" });
  const driverId = app.session.driver.id;

  const requestTypes = ["leave", "maintenance", "meeting", "oil-change"] as const;
  const requestCards = {
    leave: { icon: CalendarIcon, description: t("descriptions.leave") },
    maintenance: { icon: CarIcon, description: t("descriptions.maintenance") },
    meeting: { icon: UserIcon, description: t("descriptions.meeting") },
    "oil-change": { icon: OilWarningIcon, description: t("descriptions.oilChange") },
  } as const;

  async function loadMoreAction(cursor: DriverRequestCursor) {
    "use server";
    const supabase = await createSupabaseServerClient();
    return loadDriverRequestHistory({
      supabase,
      driverId,
      cursor,
    });
  }

  return (
    <>
      <RealtimeRefresh
        channelName={`driver-requests-${app.session.driver.id}`}
        table="driver_app_requests"
        filter={`driver_id=eq.${app.session.driver.id}`}
        toast={t("realtime.updated")}
      />
      <main className="space-y-5">
        <section className="space-y-3">
          <h1 className="text-xl font-bold text-navy">{t("title")}</h1>
          <p className="text-sm font-medium text-muted">{t("subtitle")}</p>
          <div className="grid grid-cols-2 gap-3">
            {requestTypes.map((type) => (
              <Link
                key={type}
                href={`/requests/new/${type}`}
                className="group flex min-h-32 flex-col justify-between rounded-[0.85rem] border border-border bg-white p-3.5 text-navy shadow-sm transition-colors hover:border-primary/40 hover:bg-primary-soft/30 active:bg-primary-soft/50"
              >
                <span className="flex size-9 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  {(() => { const Icon = requestCards[type].icon; return <Icon className="size-5" />; })()}
                </span>
                <span>
                  <span className="block text-sm font-bold">{t(`choices.${type}`)}</span>
                  <span className="mt-1 block text-xs font-medium leading-5 text-muted">{requestCards[type].description}</span>
                </span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
        <Suspense fallback={<RequestHistorySkeleton />}>
          <RequestHistorySection locale={locale} loadMoreAction={loadMoreAction} />
        </Suspense>
      </main>
    </>
  );
}

async function RequestHistorySection({
  locale,
  loadMoreAction,
}: {
  locale: Locale;
  loadMoreAction: (cursor: DriverRequestCursor) => Promise<Awaited<ReturnType<typeof loadDriverRequestHistory>>>;
}) {
  const app = await loadDriverSession(locale);

  if (app.status === "application_error") return null;

  const initialResult = await loadDriverRequestHistory({
    supabase: app.supabase,
    driverId: app.session.driver.id,
  });

  return <ClientHistoryList initialResult={initialResult} loadMoreAction={loadMoreAction} />;
}

function RequestHistorySkeleton() {
  return (
    <section className="space-y-3" aria-hidden="true">
      <div className="flex items-center gap-3 px-1">
        <span className="size-9 animate-pulse rounded-xl bg-primary-soft" />
        <div className="space-y-2">
          <span className="block h-4 w-28 animate-pulse rounded bg-primary-soft" />
          <span className="block h-3 w-44 animate-pulse rounded bg-primary-soft/70" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-28 animate-pulse rounded-[0.85rem] border border-border bg-white shadow-sm" />
        <div className="h-28 animate-pulse rounded-[0.85rem] border border-border bg-white shadow-sm" />
      </div>
    </section>
  );
}
