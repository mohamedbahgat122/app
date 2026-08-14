import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageCard } from "@/components/app-shell/page-card";
import { ShiftActionCard } from "@/components/odometer/shift-action-card";
import { isLocale } from "@/config/locales";
import { loadDriverSession, loadShiftSummary, loadDriverShiftHistory } from "@/lib/app/driver-app-data";
import { Link } from "@/i18n/navigation";

type HomeRouteProps = {
  params: Promise<{
    locale: string;
  }>;
  searchParams: Promise<{
    page?: string;
  }>;
};

export default async function HomeRoute({ params, searchParams }: HomeRouteProps) {
  const { locale } = await params;
  const resolvedSearchParams = await searchParams;
  const page = Math.max(1, parseInt(resolvedSearchParams.page || "1", 10));
  const pageSize = 10;

  if (!isLocale(locale)) {
    return null;
  }

  setRequestLocale(locale);

  const app = await loadDriverSession(locale);

  const t = await getTranslations({ locale, namespace: "Home" });

  if (app.status === "application_error") return null;

  const { openShift, latestShift } = await loadShiftSummary(
    app.session.driver.id,
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
                {app.session.driver.vehiclePlate ?? t("notAvailable")}
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

        <ShiftHistorySection driverId={app.session.driver.id} page={page} pageSize={pageSize} locale={locale} />
      </div>
  );
}

async function ShiftHistorySection({ driverId, page, pageSize, locale }: { driverId: string, page: number, pageSize: number, locale: string }) {
  const t = await getTranslations({ locale, namespace: "Home" });
  const { data: history, count } = await loadDriverShiftHistory(driverId, page, pageSize);
  const totalPages = Math.ceil(count / pageSize);

  if (history.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <h2 className="text-[1.3rem] font-bold text-navy">{t("shiftHistoryTitle")}</h2>
      
      {history.map((shift) => {
        const startReading = shift.start_odometer_reading;
        const endReading = shift.end_odometer_reading;
        const distance = (endReading !== null && startReading !== null) ? endReading - startReading : null;

        return (
          <PageCard key={shift.id}>
            <div className="space-y-4">
              <div className="flex justify-between items-center border-b border-border pb-3">
              <span className="text-sm font-bold text-primary">{formatSaudiDate(locale, shift.started_at)}</span>
              <span className="text-xs font-bold bg-surface-raised px-2 py-1 rounded text-muted">
                {t(`shiftStates.${shift.status}`)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Start Info */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-bold text-muted">{t("startTime")}</p>
                  <p className="text-sm font-bold text-navy mt-1">{formatSaudiTime(locale, shift.started_at)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted">{t("startReading")}</p>
                  <p className="text-sm font-bold text-navy mt-1" dir="ltr">{formatNumber(startReading)}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted">{t("startPhoto")}</p>
                  {shift.start_photo_path ? (
                    <img src={shift.start_photo_path} alt="Start Odometer" className="mt-1 h-16 w-16 object-cover rounded border border-border" />
                  ) : (
                    <p className="text-xs font-medium text-destructive mt-1">{t("noPhoto")}</p>
                  )}
                </div>
                {shift.start_review_status && (
                  <div>
                    <p className="text-xs font-bold text-muted">{t("reviewStatus")}</p>
                    <p className="text-xs font-bold text-navy mt-1">{t(`reviewStatuses.${shift.start_review_status}`)}</p>
                  </div>
                )}
              </div>

              {/* End Info */}
              <div className="space-y-2">
                {shift.ended_at ? (
                  <>
                    <div>
                      <p className="text-xs font-bold text-muted">{t("endTime")}</p>
                      <p className="text-sm font-bold text-navy mt-1">{formatSaudiTime(locale, shift.ended_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted">{t("endReading")}</p>
                      <p className="text-sm font-bold text-navy mt-1" dir="ltr">{formatNumber(endReading)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-muted">{t("endPhoto")}</p>
                      {shift.end_photo_path ? (
                        <img src={shift.end_photo_path} alt="End Odometer" className="mt-1 h-16 w-16 object-cover rounded border border-border" />
                      ) : (
                        <p className="text-xs font-medium text-destructive mt-1">{t("noPhoto")}</p>
                      )}
                    </div>
                    {shift.end_review_status && (
                      <div>
                        <p className="text-xs font-bold text-muted">{t("endReviewStatus")}</p>
                        <p className="text-xs font-bold text-navy mt-1">{t(`reviewStatuses.${shift.end_review_status}`)}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center border-2 border-dashed border-border rounded-lg bg-surface-raised">
                    <p className="text-xs font-bold text-muted">{t("notEndedYet")}</p>
                  </div>
                )}
              </div>
            </div>

            {distance !== null && (
              <div className="mt-2 pt-3 border-t border-border flex justify-between items-center">
                <p className="text-xs font-bold text-muted">{t("distance")}</p>
                <p className="text-sm font-bold text-navy" dir="ltr">{formatNumber(distance)} km</p>
              </div>
            )}
            </div>
          </PageCard>
        );
      })}

      {totalPages > 1 && (
        <div className="flex justify-between items-center pt-4">
          {page > 1 ? (
            <Link href={`/?page=${page - 1}`} className="px-4 py-2 bg-surface-raised text-primary font-bold text-sm rounded-lg border border-border">
              {t("prevPage")}
            </Link>
          ) : <div />}
          
          <span className="text-xs font-bold text-muted">
            {page} / {totalPages}
          </span>
          
          {page < totalPages ? (
            <Link href={`/?page=${page + 1}`} className="px-4 py-2 bg-surface-raised text-primary font-bold text-sm rounded-lg border border-border">
              {t("nextPage")}
            </Link>
          ) : <div />}
        </div>
      )}
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
