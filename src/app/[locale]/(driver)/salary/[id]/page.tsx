import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PageCard } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { loadDriverSession, loadDriverStatementDetails } from "@/lib/app/driver-app-data";

type RouteProps = {
  params: Promise<{
    locale: string;
    id: string;
  }>;
};

export default async function SalaryDetailsPage({ params }: RouteProps) {
  const { locale, id } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Salary" });

  const app = await loadDriverSession(locale);
  if (app.status === "application_error") return null;

  const { statement, items } = await loadDriverStatementDetails(id, app.session.driver.id, app.supabase);

  if (!statement) {
    notFound();
  }

  const formatSaudiDate = (dateString: string) => {
    return new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Riyadh",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(new Date(dateString));
  };

  const netAmount = Number(statement.net_amount);
  const salary = Number(statement.salary_total);
  const bonus = Number(statement.bonus_total);
  const deductions = Number(statement.deduction_total);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center gap-3">
        <Link href="/salary" className="text-primary p-1 bg-primary-soft rounded-full">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </Link>
        <h1 className="text-xl font-bold leading-tight text-navy">
          {t("details")}
        </h1>
      </div>

      <PageCard>
        <p className="text-sm font-bold text-muted text-center mb-1">{t("period")}</p>
        <p className="text-center font-bold text-navy mb-6">
          {formatSaudiDate(statement.period_start)} - {formatSaudiDate(statement.period_end)}
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-raised p-3 rounded-xl border border-border">
            <p className="text-xs font-bold text-muted">{t("baseSalary")}</p>
            <p dir="ltr" className="mt-1 text-base font-bold text-navy">
              {salary.toLocaleString("en-US", { minimumFractionDigits: 2 })} {t("currency")}
            </p>
          </div>
          <div className="bg-surface-raised p-3 rounded-xl border border-border">
            <p className="text-xs font-bold text-muted">{t("bonus")}</p>
            <p dir="ltr" className="mt-1 text-base font-bold text-emerald-600">
              {bonus.toLocaleString("en-US", { minimumFractionDigits: 2 })} {t("currency")}
            </p>
          </div>
          <div className="bg-surface-raised p-3 rounded-xl border border-border">
            <p className="text-xs font-bold text-muted">{t("deductions")}</p>
            <p dir="ltr" className="mt-1 text-base font-bold text-destructive">
              {deductions.toLocaleString("en-US", { minimumFractionDigits: 2 })} {t("currency")}
            </p>
          </div>
          <div className="bg-primary-soft p-3 rounded-xl border border-primary/20">
            <p className="text-xs font-bold text-primary">{t("netAmount")}</p>
            <p dir="ltr" className={`mt-1 text-base font-bold ${netAmount < 0 ? 'text-destructive' : 'text-primary'}`}>
              {netAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} {t("currency")}
            </p>
          </div>
        </div>
      </PageCard>

      <div>
        <h2 className="text-lg font-bold text-navy mb-3">{t("transactions")}</h2>
        <div className="space-y-3">
          {items.map((item) => {
            const effect = Number(item.financial_effect);
            const amount = Number(item.amount);
            const isDeduction = effect < 0;
            const isAddition = effect > 0;

            return (
              <PageCard key={item.id}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${isDeduction ? 'bg-destructive' : isAddition ? 'bg-emerald-500' : 'bg-muted'}`} />
                    <p className="text-sm font-bold text-navy">{t(`txTypes.${item.transaction_type}`)}</p>
                  </div>
                  <p dir="ltr" className={`font-bold ${isDeduction ? 'text-destructive' : 'text-navy'}`}>
                    {isDeduction ? '-' : (isAddition ? '+' : '')}
                    {amount.toLocaleString("en-US", { minimumFractionDigits: 2 })} {t("currency")}
                  </p>
                </div>
                
                <div className="space-y-1 text-xs">
                  <p className="text-muted font-medium">{formatSaudiDate(item.effective_date)}</p>
                  
                  {item.reason && (
                    <p className="text-navy font-medium"><span className="text-muted">{t("reason")}:</span> {item.reason}</p>
                  )}
                  {item.notes && (
                    <p className="text-navy font-medium"><span className="text-muted">{t("notes")}:</span> {item.notes}</p>
                  )}
                  {item.order_count !== null && (
                    <p className="text-navy font-medium"><span className="text-muted">{t("orderCount")}:</span> {item.order_count}</p>
                  )}
                </div>
              </PageCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}
