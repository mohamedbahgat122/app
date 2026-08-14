import { getTranslations, setRequestLocale } from "next-intl/server";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { isLocale } from "@/config/locales";
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

  const historyResult = await loadDriverRequestHistory({
    supabase: app.supabase,
    driverId,
  });
  const requestTypes = ["leave", "maintenance", "meeting", "oil-change"] as const;

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
      <main className="space-y-4">
        <section className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold text-navy">{t("title")}</h1>
          <div className="mt-4 grid gap-3">
            {requestTypes.map((type) => (
              <Link
                key={type}
                href={`/requests/new/${type}`}
                className="flex min-h-14 items-center justify-between rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 text-sm font-bold text-navy"
              >
                <span>{t(`choices.${type}`)}</span>
                <span aria-hidden="true">›</span>
              </Link>
            ))}
          </div>
        </section>
        <ClientHistoryList initialResult={historyResult} loadMoreAction={loadMoreAction} />
      </main>
    </>
  );
}
