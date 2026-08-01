import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageCard } from "@/components/app-shell/page-card";
import { ShiftActionCard } from "@/components/odometer/shift-action-card";
import { isLocale } from "@/config/locales";
import { loadDriverAppContext, loadShiftSummary } from "@/lib/app/driver-app-data";

type HomeRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function HomeRoute({ params }: HomeRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  setRequestLocale(locale);

  const app = await loadDriverAppContext(locale);

  const t = await getTranslations({ locale, namespace: "Home" });

  if (app.status === "application_error") return null;

  const { openShift, latestShift, recentShifts } = await loadShiftSummary(
    app.context.session.driver.id,
    app.supabase,
  );
  const completedToday = isToday(latestShift?.ended_at);
  const shiftStatus = openShift
    ? "open"
    : completedToday
      ? "completedToday"
      : "notStarted";
  const displayedShift = openShift ?? latestShift;

  return (
      <div className="space-y-4">
        <div>
          <p className="text-sm font-bold text-primary">
            {formatSaudiDate(locale)}
          </p>
          <h1 className="mt-1 text-[1.45rem] font-bold leading-tight text-navy">
            {t("odometerTitle")}
          </h1>
        </div>

        <PageCard>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-muted">{t("vehiclePlate")}</p>
              <p className="mt-1 text-lg font-bold text-navy" dir="ltr">
                {app.context.session.driver.vehiclePlate ?? t("notAvailable")}
              </p>
            </div>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
              {t(`shiftStates.${shiftStatus}`)}
            </span>
          </div>
        </PageCard>

        {displayedShift ? (
          <PageCard>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info label={t("startTime")} value={formatSaudiTime(locale, displayedShift.started_at)} />
              <Info label={t("startReading")} value={formatNumber(displayedShift.start_odometer_reading)} />
              <Info label={t("reviewStatus")} value={t(`reviewStatuses.${displayedShift.start_review_status}`)} />
              {displayedShift.ended_at ? (
                <>
                  <Info label={t("endTime")} value={formatSaudiTime(locale, displayedShift.ended_at)} />
                  <Info label={t("endReading")} value={formatNumber(displayedShift.end_odometer_reading)} />
                  {displayedShift.end_review_status ? (
                    <Info label={t("endReviewStatus")} value={t(`reviewStatuses.${displayedShift.end_review_status}`)} />
                  ) : null}
                  <Info label={t("distance")} value={formatNumber((displayedShift.end_odometer_reading ?? 0) - displayedShift.start_odometer_reading)} />
                </>
              ) : null}
            </dl>
          </PageCard>
        ) : null}

        {openShift ? (
          <ShiftActionCard mode="end" startReading={openShift.start_odometer_reading} />
        ) : completedToday ? null : (
          <ShiftActionCard mode="start" />
        )}

        <PageCard>
          <h2 className="text-base font-bold text-navy">{t("ratingTitle")}</h2>
          <p className="mt-2 text-sm font-semibold text-muted">{t("noRating")}</p>
        </PageCard>

        {recentShifts.length > 0 ? (
          <PageCard>
            <h2 className="text-base font-bold text-navy">{t("recentShift")}</h2>
            <p className="mt-2 text-sm font-semibold text-muted">
              {formatSaudiDate(locale, latestShift?.started_at)}
            </p>
          </PageCard>
        ) : null}
      </div>
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

function isToday(value: string | null | undefined) {
  if (!value) return false;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value)) === new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatSaudiDate(locale: string, value?: string | null) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Riyadh",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value ? new Date(value) : new Date());
}

function formatSaudiTime(locale: string, value: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Riyadh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number | null) {
  return value === null ? "-" : value.toLocaleString("en-US");
}
