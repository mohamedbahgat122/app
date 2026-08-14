import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PageCard, EmptyState } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { loadDriverSession, loadDriverStatements } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function SalaryPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Salary" });

  const app = await loadDriverSession(locale);
  if (app.status === "application_error") return null;

  const statements = await loadDriverStatements(app.session.driver.id, app.supabase);

  if (statements.length === 0) {
    return <EmptyState title={t("title")} description={t("empty")} />;
  }

  const formatPeriod = (start: string) => {
    const startDate = new Date(start);
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(startDate);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[1.45rem] font-bold leading-tight text-navy">
          {t("title")}
        </h1>
      </div>

      {statements.map((statement, idx) => {
        const netAmount = Number(statement.net_amount);
        const isPositive = netAmount > 0;
        const isNegative = netAmount < 0;

        return (
          <Link key={statement.id} href={`/salary/${statement.id}`} className="block hover:ring-1 hover:ring-primary/20 transition-all rounded-[0.85rem]">
            <PageCard>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-muted">{t("period")}</p>
                  <p className="mt-1 text-lg font-bold text-navy">
                    {formatPeriod(statement.period_start)}
                  </p>
                </div>
                {idx === 0 ? (
                  <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
                    {t("latest")}
                  </span>
                ) : (
                  <span className="rounded-full bg-surface-raised px-3 py-1 text-xs font-bold text-muted border border-border">
                    {t("published")}
                  </span>
                )}
              </div>
              
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-muted">{t("netAmount")}</p>
                  <p dir="ltr" className={`mt-1 text-xl font-bold ${isNegative ? 'text-destructive' : 'text-navy'}`}>
                    {netAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {t("currency")}
                  </p>
                </div>
                <div className="text-end">
                  {isPositive && <p className="text-sm font-bold text-emerald-600">{t("dueToDriver")}</p>}
                  {isNegative && <p className="text-sm font-bold text-destructive">{t("dueFromDriver")}</p>}
                  {!isPositive && !isNegative && <p className="text-sm font-bold text-muted">{t("noDues")}</p>}
                  <p className="text-xs font-semibold text-primary mt-1">{t("viewDetails")} &rarr;</p>
                </div>
              </div>
            </PageCard>
          </Link>
        );
      })}
    </div>
  );
}
