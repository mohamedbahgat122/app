import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState, PageCard } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function VehiclePage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Vehicle" });
  const vehicle = app.context.vehicle;

  return (
    <>
      {vehicle ? (
        <PageCard>
          <h1 className="text-lg font-bold text-navy">{t("title")}</h1>
          <dl className="mt-4 space-y-3">
            <Info label={t("plate")} value={vehicle.plate_number} ltr />
            <Info label={t("type")} value={vehicle.vehicle_type} />
            <Info label={t("category")} value={t(`categories.${vehicle.vehicle_category}`)} />
            <Info label={t("operationalStatus")} value={t(`operational.${vehicle.operational_status}`)} />
            <Info label={t("technicalStatus")} value={t(`technical.${vehicle.technical_status}`)} />
            {vehicle.operating_card_expiry_date ? <Info label={t("operatingCardExpiry")} value={vehicle.operating_card_expiry_date} ltr /> : null}
            {vehicle.authorization_expiry_date ? <Info label={t("authorizationExpiry")} value={vehicle.authorization_expiry_date} ltr /> : null}
          </dl>
        </PageCard>
      ) : (
        <EmptyState title={t("title")} description={t("empty")} />
      )}
    </>
  );
}

function Info({ label, ltr, value }: { label: string; ltr?: boolean; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-navy" dir={ltr ? "ltr" : undefined}>{value}</dd>
    </div>
  );
}
