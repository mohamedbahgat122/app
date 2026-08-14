import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { logoutDriverAction } from "@/app/[locale]/actions";
import { DriverAvatar } from "@/components/app-shell/driver-avatar";
import { PageCard } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { loadDriverSession, createDriverAvatarUrl } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverSession(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Account" });
  const driver = app.session.driver;
  const vehicle = app.session.vehicle;
  
  const avatarUrl = await createDriverAvatarUrl(driver.profilePhotoPath);

  return (
    <div className="space-y-4">
        <PageCard>
          <div className="flex items-center gap-3">
            <DriverAvatar
              imageUrl={avatarUrl}
              name={driver.fullName}
            />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-navy">
                {driver.fullName}
              </h1>
              <p className="text-sm font-semibold text-muted" dir="ltr">
                {driver.driverId}
              </p>
            </div>
          </div>
        </PageCard>
        <PageCard>
          <dl className="space-y-3">
            <Info label={t("organization")} value={app.session.organization?.name ?? t("notAvailable")} />
            <Info label={t("vehiclePlate")} value={driver.vehiclePlate ?? t("notAvailable")} ltr />
            <Info label={t("language")} value={t(`languages.${locale}`)} />
          </dl>
        </PageCard>
        <DetailsCard title={t("driverDetails")}>
          <Info label={t("iqamaNumber")} value={driver.iqamaNumber ?? t("notAvailable")} ltr />
          <Info label={t("iqamaExpiryDate")} value={formatDateValue(driver.iqamaExpiryDate, t("notAvailable"))} ltr />
          <Info label={t("driverCardNumber")} value={driver.driverCardNumber ?? t("notAvailable")} ltr />
          <Info label={t("driverCardExpiryDate")} value={formatDateValue(driver.driverCardExpiryDate, t("notAvailable"))} ltr />
          <Info label={t("keetaVehiclePlate")} value={driver.keetaVehiclePlateNumber ?? t("notAvailable")} ltr />
          <Info label={t("actualVehiclePlate")} value={driver.actualVehiclePlateNumber ?? t("notAvailable")} ltr />
        </DetailsCard>
        <DetailsCard title={t("vehicleDetails")}>
          <Info label={t("actualPlate")} value={vehicle?.plate_number ?? t("notAvailable")} ltr />
          <Info label={t("vehicleType")} value={vehicle?.vehicle_type ?? t("notAvailable")} />
          <Info label={t("operatingCardNumber")} value={vehicle?.operating_card_number ?? t("notAvailable")} ltr />
          <Info label={t("operatingCardExpiry")} value={formatDateValue(vehicle?.operating_card_expiry_date, t("notAvailable"))} ltr />
          <Info label={t("authorizationExpiry")} value={formatDateValue(vehicle?.authorization_expiry_date, t("notAvailable"))} ltr />
          <Info
            label={t("operationalStatus")}
            value={vehicle?.operational_status ? t(`operational.${vehicle.operational_status}`) : t("notAvailable")}
          />
        </DetailsCard>
        <Link
          href="/change-password"
          className="flex min-h-12 items-center justify-center rounded-[0.85rem] border border-border bg-white px-4 text-sm font-bold text-navy [touch-action:manipulation]"
        >
          {t("changePassword")}
        </Link>
        <form action={logoutDriverAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="min-h-14 w-full rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white [touch-action:manipulation]">
            {t("logout")}
          </button>
        </form>
    </div>
  );
}

function DetailsCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <PageCard>
      <h2 className="text-base font-bold text-navy">{title}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{children}</dl>
    </PageCard>
  );
}

function Info({ label, ltr, value }: { label: string; ltr?: boolean; value: string }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-navy" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}

function formatDateValue(value: string | null | undefined, fallback: string) {
  return value || fallback;
}
