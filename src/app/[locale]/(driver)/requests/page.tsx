import { getTranslations, setRequestLocale } from "next-intl/server";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { RequestStatusBadge } from "@/components/requests/request-status-badge";
import { isLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";
import { loadDriverRequestHistory } from "@/lib/app/driver-requests";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function RequestsPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Requests" });
  const history = await loadDriverRequestHistory({
    supabase: app.supabase,
    driverId: app.context.session.driver.id,
  });
  const requestTypes = ["leave", "maintenance", "meeting", "oil-change"] as const;

  return (
    <>
      <RealtimeRefresh
        channelName={`driver-requests-${app.context.session.driver.id}`}
        table="driver_app_requests"
        filter={`driver_id=eq.${app.context.session.driver.id}`}
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
        <section className="space-y-3">
          <h2 className="px-1 text-base font-bold text-navy">{t("history")}</h2>
          {history.length === 0 ? (
            <p className="rounded-[0.85rem] border border-border bg-white p-4 text-sm font-semibold text-muted">
              {t("empty")}
            </p>
          ) : (
            history.map((request) => (
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
            ))
          )}
        </section>
      </main>
    </>
  );
}
