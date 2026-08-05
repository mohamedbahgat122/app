import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale, type Locale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";
import {
  loadDriverWarning,
  markDriverWarningSeen,
  type DriverWarning,
} from "@/lib/app/driver-warnings";

type RouteProps = {
  params: Promise<{
    locale: string;
    warningId: string;
  }>;
};

export default async function WarningDetailPage({ params }: RouteProps) {
  const { locale, warningId } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Warnings" });
  const warning = await loadDriverWarning({
    supabase: app.supabase,
    warningId,
  });

  if (!warning) {
    notFound();
  }

  await markDriverWarningSeen({
    supabase: app.supabase,
    warningId,
  });

  return (
    <main className="space-y-4">
      <Link
        href="/warnings"
        className="inline-flex min-h-10 items-center rounded-[0.85rem] border border-border bg-white px-3 text-sm font-bold text-navy"
      >
        {t("back")}
      </Link>
      <article className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-primary">
              {t(`categories.${warning.category}`)}
            </p>
            <h1 className="mt-1 text-xl font-bold text-navy">
              {warning.title}
            </h1>
          </div>
          <span className={badgeClassName(warning.severity)}>
            {t(`severities.${warning.severity}`)}
          </span>
        </div>
        <dl className="mt-5 grid gap-3 text-sm">
          <DetailItem label={t("fields.status")}>
            <span className={statusClassName(warning.status)}>
              {t(`statuses.${warning.status}`)}
            </span>
          </DetailItem>
          <DetailItem label={t("fields.issuedAt")}>
            {formatDate(warning.issuedAt, locale, t("notAvailable"))}
          </DetailItem>
          <DetailItem label={t("fields.incidentAt")}>
            {formatDate(warning.incidentAt, locale, t("notAvailable"))}
          </DetailItem>
          <DetailItem label={t("fields.seenAt")}>
            {formatDate(warning.driverSeenAt, locale, t("notAvailable"))}
          </DetailItem>
          {warning.status === "revoked" ? (
            <>
              <DetailItem label={t("fields.revokedAt")}>
                {formatDate(warning.revokedAt, locale, t("notAvailable"))}
              </DetailItem>
              <DetailItem label={t("fields.revokeReason")}>
                {warning.revokeReason ?? t("notAvailable")}
              </DetailItem>
            </>
          ) : null}
        </dl>
        <section className="mt-5 rounded-[0.85rem] bg-primary-soft/60 p-4">
          <h2 className="text-sm font-bold text-navy">{t("fields.description")}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-7 text-muted">
            {warning.description}
          </p>
        </section>
      </article>
    </main>
  );
}

function DetailItem({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[0.85rem] border border-border px-3 py-2">
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="mt-1 font-bold text-navy">{children}</dd>
    </div>
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

function badgeClassName(severity: DriverWarning["severity"]) {
  if (severity === "high") {
    return "rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  }

  if (severity === "medium") {
    return "rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700";
  }

  return "rounded-full bg-primary-soft px-2 py-1 text-xs font-bold text-primary";
}

function statusClassName(status: DriverWarning["status"]) {
  return status === "revoked"
    ? "rounded-full bg-muted/10 px-2 py-1 text-muted"
    : "rounded-full bg-primary-soft px-2 py-1 text-primary";
}
