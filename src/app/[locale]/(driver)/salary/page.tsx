import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { MoneyIcon } from "@/components/app-shell/icons";
import { PageCard } from "@/components/app-shell/page-card";
import { isLocale, type Locale } from "@/config/locales";
import { loadDriverSession } from "@/lib/app/driver-app-data";
import { loadPublishedSalaries, type PublishedSalary } from "@/lib/server/finance/salary";
import { MonthSelector } from "./month-selector";

type SalaryPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
};

export default async function SalaryPage({ params, searchParams }: SalaryPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Salary" });
  const app = await loadDriverSession(locale);
  if (app.status === "application_error") return <Message text={t("error")} />;
  if (!app.session.driver.driverId) return <Message text={t("missingDriverId")} />;

  let salaries: PublishedSalary[];
  try {
    salaries = await loadPublishedSalaries(app.session.driver.driverId);
  } catch {
    return <Message text={t("error")} />;
  }

  if (salaries.length === 0) return <Message text={t("emptyPublished")} />;

  const { month } = await searchParams;
  const selected = salaries.find((salary) => salary.month === month) ?? salaries[0];
  const currency = t("currency");

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <MoneyIcon className="size-6" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-navy">{t("title")}</h1>
          <p className="mt-0.5 text-sm font-medium text-muted">{t("subtitle")}</p>
        </div>
      </header>

      <MonthSelector
        label={t("selectMonth")}
        selectedMonth={selected.month}
        options={salaries.map((salary) => ({
          value: salary.month,
          label: formatMonth(salary.month, locale),
        }))}
      />

      <section className="rounded-xl bg-primary p-5 text-white shadow-md">
        <p className="text-sm font-semibold opacity-85">{t("net")}</p>
        <p className="mt-2 text-[clamp(2rem,9vw,2.7rem)] font-extrabold leading-none tracking-tight" dir="ltr">
          <MoneyValue value={selected.net} currency={currency} />
        </p>
        <div className="mt-5 grid grid-cols-3 divide-x divide-white/20 border-t border-white/20 pt-4 rtl:divide-x-reverse">
          <PublishedMetric label={t("gross")} value={selected.gross} currency={currency} />
          <PublishedMetric label={t("totalDeductions")} value={selected.totalDeductions} currency={currency} />
          <PublishedMetric label={t("remaining")} value={selected.remaining} currency={currency} />
        </div>
      </section>

      <SalarySection title={t("workSummary")}>
        <OptionalNumber label={t("ordersActual")} value={selected.ordersActual} locale={locale} />
        <OptionalNumber label={t("target")} value={selected.target} locale={locale} />
        <OptionalNumber label={t("target2")} value={selected.target2} locale={locale} />
        <OptionalText label={t("appName")} value={selected.appName} />
        <OptionalText label={t("salaryType")} value={selected.salaryType} />
      </SalarySection>

      <SalaryLines title={t("earnings")} lines={selected.earnings} tone="positive" currency={currency} />
      <SalaryLines title={t("deductions")} lines={selected.deductions} tone="negative" currency={currency} />

      {selected.bankTransfer !== null || selected.cashPaid !== null ? (
        <SalarySection title={t("payments")}>
          <OptionalMoneyRow label={t("bankTransfer")} value={selected.bankTransfer} currency={currency} />
          <OptionalMoneyRow label={t("cashPaid")} value={selected.cashPaid} currency={currency} />
          <OptionalMoneyRow label={t("remaining")} value={selected.remaining} currency={currency} emphasize />
        </SalarySection>
      ) : null}

      {selected.publishedAt ? (
        <p className="text-center text-xs font-medium text-muted">
          {t("publishedAt")}: {formatDate(selected.publishedAt, locale)}
        </p>
      ) : null}
    </div>
  );
}

function Message({ text }: { text: string }) {
  return <div className="rounded-xl border border-border bg-white p-6 text-center text-sm font-semibold text-muted shadow-sm">{text}</div>;
}

function SalarySection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <PageCard>
      <h2 className="text-base font-extrabold text-navy">{title}</h2>
      <dl className="mt-3 divide-y divide-border">{children}</dl>
    </PageCard>
  );
}

function PublishedMetric({ label, value, currency }: Omit<MetricProps, "locale">) {
  return (
    <div className="min-w-0 px-2 text-center first:ps-0 last:pe-0">
      <p className="truncate text-[0.66rem] font-semibold leading-4 opacity-80">{label}</p>
      <p className="mt-1 truncate text-[0.78rem] font-extrabold leading-4 tabular-nums" dir="ltr">
        <MoneyValue value={value} currency={currency} />
      </p>
    </div>
  );
}

function OptionalNumber({ label, value, locale }: { label: string; value: number | null; locale: Locale }) {
  return value === null ? null : (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="shrink-0 text-sm font-bold tabular-nums text-navy" dir="ltr">{formatNumber(value, locale)}</dd>
    </div>
  );
}

function OptionalMoneyRow({ label, value, currency, emphasize = false }: Omit<MetricProps, "locale"> & { emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className={`text-sm font-semibold ${emphasize ? "text-navy" : "text-muted"}`}>{label}</dt>
      <dd className={`shrink-0 text-end font-bold tabular-nums ${emphasize ? "text-base text-primary" : "text-sm text-navy"}`} dir="ltr">
        <MoneyValue value={value} currency={currency} />
      </dd>
    </div>
  );
}

function OptionalText({ label, value }: { label: string; value: string | null }) {
  return value === null ? null : (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-sm font-semibold text-muted">{label}</dt>
      <dd className="max-w-[58%] text-end text-sm font-bold text-navy">{value}</dd>
    </div>
  );
}

function SalaryLines({ title, lines, tone, currency }: { title: string; lines: { name: string; amount: number }[]; tone: "positive" | "negative"; currency: string }) {
  if (lines.length === 0) return null;
  const color = tone === "positive" ? "text-emerald-700" : "text-rose-700";
  return (
    <PageCard>
      <h2 className={`text-base font-extrabold ${color}`}>{title}</h2>
      <dl className="mt-3 divide-y divide-border">
        {lines.map((line, index) => (
          <div key={`${line.name}-${index}`} className="flex items-center justify-between gap-3 py-2">
            <dt className="min-w-0 text-sm font-semibold text-muted">{line.name}</dt>
            <dd className={`shrink-0 font-bold tabular-nums ${color}`} dir="ltr">
              <MoneyValue value={line.amount} currency={currency} />
            </dd>
          </div>
        ))}
      </dl>
    </PageCard>
  );
}

type MetricProps = {
  label: string;
  value: number | null;
  locale: Locale;
  currency: string;
};

function MoneyValue({ value, currency }: Pick<MetricProps, "value" | "currency">) {
  if (value === null) return <span>—</span>;
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  return (
    <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
      {formatted} {currency}
    </span>
  );
}

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function formatMonth(value: string, locale: Locale) {
  const match = value.match(/^(\d{4})[-/]?(\d{1,2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function formatDate(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
