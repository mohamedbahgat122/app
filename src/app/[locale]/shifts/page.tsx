import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppError } from "@/components/app-shell/app-error";
import { DriverAppShell } from "@/components/app-shell/driver-app-shell";
import { EmptyState, PageCard } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { loadDriverAppContext, loadShiftSummary } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function ShiftsPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return <AppError locale={locale} />;
  const t = await getTranslations({ locale, namespace: "Shifts" });
  const { recentShifts } = await loadShiftSummary(app.context.session.driver.id);

  return (
    <DriverAppShell context={app.context}>
      <div className="space-y-4">
        <h1 className="text-[1.45rem] font-bold text-navy">{t("title")}</h1>
        {recentShifts.length === 0 ? (
          <EmptyState title={t("emptyTitle")} description={t("empty")} />
        ) : (
          recentShifts.map((shift) => (
            <PageCard key={shift.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-navy">
                    {formatDate(locale, shift.started_at)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-muted" dir="ltr">
                    {shift.vehicle_plate_snapshot}
                  </p>
                </div>
                <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                  {t(`status.${shift.status}`)}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <Info label={t("startTime")} value={formatTime(locale, shift.started_at)} />
                <Info label={t("endTime")} value={shift.ended_at ? formatTime(locale, shift.ended_at) : "-"} />
                <Info label={t("startReading")} value={formatNumber(shift.start_odometer_reading)} />
                <Info label={t("endReading")} value={formatNumber(shift.end_odometer_reading)} />
                <Info label={t("distance")} value={formatNumber(shift.end_odometer_reading === null ? null : shift.end_odometer_reading - shift.start_odometer_reading)} />
              </dl>
            </PageCard>
          ))
        )}
      </div>
    </DriverAppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="mt-1 font-bold text-navy" dir="ltr">{value}</dd>
    </div>
  );
}

function formatDate(locale: string, value: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Riyadh", day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function formatTime(locale: string, value: string) {
  return new Intl.DateTimeFormat(locale, { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatNumber(value: number | null) {
  return value === null ? "-" : value.toLocaleString("en-US");
}
