import { getTranslations, setRequestLocale } from "next-intl/server";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { isLocale, type Locale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";
import { loadDriverWarnings, type DriverWarning } from "@/lib/app/driver-warnings";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function WarningsPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Warnings" });
  const warnings = await loadDriverWarnings({
    supabase: app.supabase,
    driverId: app.context.session.driver.id,
  });

  return (
    <>
      <RealtimeRefresh
        channelName={`driver-warnings-${app.context.session.driver.id}`}
        table="driver_warnings"
        filter={`driver_id=eq.${app.context.session.driver.id}`}
        toast={t("realtime.updated")}
      />
      <main className="space-y-4">
        <section className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold text-navy">{t("title")}</h1>
          <p className="mt-2 text-sm font-semibold text-muted">
            {t("description")}
          </p>
        </section>
        {warnings.length === 0 ? (
          <p className="rounded-[0.85rem] border border-border bg-white p-4 text-sm font-semibold text-muted">
            {t("empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {warnings.map((warning) => (
              <WarningCard
                key={warning.id}
                locale={locale}
                warning={warning}
                t={(key) => t(key)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function WarningCard({
  locale,
  warning,
  t,
}: {
  locale: Locale;
  warning: DriverWarning;
  t: (key: string) => string;
}) {
  return (
    <Link
      href={`/warnings/${warning.id}`}
      className="block rounded-[0.85rem] border border-border bg-white p-4 shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-navy">{warning.title}</h2>
          <p className="mt-1 text-sm font-semibold text-muted">
            {t(`categories.${warning.category}`)} ·{" "}
            {formatDate(warning.issuedAt, locale, t("notAvailable"))}
          </p>
        </div>
        <span className={badgeClassName(warning.severity)}>
          {t(`severities.${warning.severity}`)}
        </span>
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-muted">
        {warning.description}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
        <span className={statusClassName(warning.status)}>
          {t(`statuses.${warning.status}`)}
        </span>
        <span className="rounded-full bg-primary-soft px-2 py-1 text-primary">
          {warning.driverSeenAt ? t("seen") : t("notSeen")}
        </span>
      </div>
    </Link>
  );
}

function formatDate(value: string | null | undefined, locale: Locale, fallback: string) {
  if (!value) return fallback;

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function badgeClassName(severity: string) {
  if (severity === "high") {
    return "rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  }

  if (severity === "medium") {
    return "rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700";
  }

  return "rounded-full bg-primary-soft px-2 py-1 text-xs font-bold text-primary";
}

function statusClassName(status: string) {
  return status === "revoked"
    ? "rounded-full bg-muted/10 px-2 py-1 text-muted"
    : "rounded-full bg-primary-soft px-2 py-1 text-primary";
}
