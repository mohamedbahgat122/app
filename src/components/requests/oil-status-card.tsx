"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  deriveOilMaintenanceMetrics,
  parseOilPreviewOdometer,
  type DriverOilMaintenanceStatus,
  type LatestOilChangeRequestStatus,
  type OilMaintenanceStatus,
} from "@/lib/app/oil-maintenance-types";

export function OilStatusCard({
  status,
  previewOdometerReading,
}: {
  status: DriverOilMaintenanceStatus;
  previewOdometerReading: string;
}) {
  const t = useTranslations("Requests.oilStatus");
  const requestT = useTranslations("Requests");
  const locale = useLocale();
  const previewOdometer = parseOilPreviewOdometer(previewOdometerReading);
  const effectiveOdometer = previewOdometer ?? status.latestOdometer;
  const previewMetrics = deriveOilMaintenanceMetrics({
    vehicleId: status.vehicleId,
    oilChangeOdometer: status.lastOilChangeOdometer,
    intervalKm: status.intervalKm,
    latestOdometer: effectiveOdometer,
  });
  const displayStatus = previewMetrics.oilStatus;
  const requestMessageKey = getRequestMessageKey(status.latestRequest?.status);

  return (
    <section className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-navy">{t("title")}</h2>
          <p className="mt-1 text-xs font-semibold text-muted">
            {status.vehiclePlate ?? requestT("notAvailable")}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClassName(displayStatus)}`}
        >
          {t(`statuses.${displayStatus}`)}
        </span>
      </div>

      <div className="mt-4 rounded-[0.85rem] bg-surface p-4 text-center">
        <p className="text-xs font-bold text-muted">{t("remaining")}</p>
        <p className={`mt-1 text-2xl font-extrabold ${getRemainingClassName(displayStatus)}`}>
          {formatRemaining(previewMetrics.remainingKm, displayStatus, t)}
        </p>
        {previewOdometer !== null ? (
          <p className="mt-1 text-xs font-semibold text-muted">{t("preview")}</p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Metric
          label={t("lastOilChange")}
          value={formatKm(status.lastOilChangeOdometer, locale, t("unit"), requestT("notAvailable"))}
        />
        <Metric
          label={t("interval")}
          value={formatKm(status.intervalKm, locale, t("unit"), requestT("notAvailable"))}
        />
        <Metric
          label={t("nextOilChange")}
          value={formatKm(previewMetrics.nextOilChangeAt, locale, t("unit"), requestT("notAvailable"))}
        />
        <Metric
          label={t("currentOdometer")}
          value={formatKm(effectiveOdometer, locale, t("unit"), requestT("notAvailable"))}
        />
        <Metric
          label={t("drivenSinceOilChange")}
          value={formatKm(previewMetrics.drivenSinceOilChange, locale, t("unit"), requestT("notAvailable"))}
        />
        <Metric
          label={t("remainingShort")}
          value={formatSignedRemaining(
            previewMetrics.remainingKm,
            displayStatus,
            t,
            requestT("notAvailable"),
          )}
        />
      </div>

      {requestMessageKey ? (
        <p className="mt-4 rounded-[0.85rem] bg-primary-soft/70 p-3 text-xs font-bold text-navy">
          {t(requestMessageKey)}
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-16 rounded-[0.75rem] border border-border bg-surface/70 p-3">
      <p className="text-[0.68rem] font-bold text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-extrabold text-navy">{value}</p>
    </div>
  );
}

function formatKm(
  value: number | null,
  locale: string,
  unit: string,
  fallback: string,
) {
  return value === null
    ? fallback
    : `${value.toLocaleString(localeForNumber(locale))} ${unit}`;
}

function formatRemaining(
  remainingKm: number | null,
  status: OilMaintenanceStatus,
  t: ReturnType<typeof useTranslations<"Requests.oilStatus">>,
) {
  if (remainingKm === null) {
    return t("notAvailable");
  }

  if (status === "due") {
    return t("overdue", { value: Math.abs(remainingKm).toLocaleString("en-US") });
  }

  return t("remainingValue", { value: remainingKm.toLocaleString("en-US") });
}

function formatSignedRemaining(
  remainingKm: number | null,
  status: OilMaintenanceStatus,
  t: ReturnType<typeof useTranslations<"Requests.oilStatus">>,
  fallback: string,
) {
  if (remainingKm === null) {
    return fallback;
  }

  if (status === "due") {
    return t("overdueShort", { value: Math.abs(remainingKm).toLocaleString("en-US") });
  }

  return t("remainingValue", { value: remainingKm.toLocaleString("en-US") });
}

function localeForNumber(locale: string) {
  return locale === "en" ? "en-US" : "en-US";
}

function getStatusClassName(status: OilMaintenanceStatus) {
  if (status === "due") {
    return "bg-red-100 text-red-700";
  }

  if (status === "due_soon") {
    return "bg-amber-100 text-amber-800";
  }

  if (status === "ok") {
    return "bg-emerald-100 text-emerald-700";
  }

  return "bg-surface text-muted";
}

function getRemainingClassName(status: OilMaintenanceStatus) {
  if (status === "due") {
    return "text-red-700";
  }

  if (status === "due_soon") {
    return "text-amber-700";
  }

  if (status === "ok") {
    return "text-emerald-700";
  }

  return "text-navy";
}

function getRequestMessageKey(status: LatestOilChangeRequestStatus | undefined) {
  if (status === "pending") {
    return "request.pending";
  }

  if (status === "approved") {
    return "request.approved";
  }

  return null;
}
