import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { logoutDriverAction } from "@/app/[locale]/actions";
import { DriverAvatar } from "@/components/app-shell/driver-avatar";
import {
  CarIcon,
  FileTextIcon,
  OrganizationIcon,
  ShieldCheckIcon,
  UserIcon,
} from "@/components/app-shell/icons";
import { PageCard } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { createDriverAvatarUrl, loadDriverSession } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverSession(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Account" });
  const { driver, organization, vehicle } = app.session;
  const avatarUrl = await createDriverAvatarUrl(driver.profilePhotoPath);
  const jobTitle = app.session.jobTitle?.trim() || t("jobTitleFallback");
  const vehicleCategory = vehicle
    ? getVehicleCategoryLabel(vehicle.vehicle_category, t)
    : null;

  return (
    <div className="space-y-3.5">
      <PageCard>
        <div className="flex items-center gap-3">
          <DriverAvatar imageUrl={avatarUrl} name={driver.fullName} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="min-w-0 max-w-full truncate text-lg font-extrabold text-navy">{driver.fullName}</h1>
              <StatusBadge status={app.session.accountStatus} label={t(`accountStatus.${app.session.accountStatus}`)} />
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-muted">{jobTitle}</p>
            <p className="mt-1 truncate text-xs font-bold text-navy" dir="ltr">{driver.driverId || t("notAvailable")}</p>
          </div>
        </div>
      </PageCard>

      <SectionCard icon={<OrganizationIcon />} title={t("organizationDetails")}>
        <InfoRow label={t("organization")} value={organization?.name ?? t("notAvailable")} />
        {organization?.code ? <InfoRow label={t("organizationCode")} value={organization.code} ltr /> : null}
      </SectionCard>

      <SectionCard icon={<UserIcon />} title={t("driverDetails")} subtitle={t("driverDetailsSubtitle")}>
        <InfoRow icon={<FileTextIcon />} label={t("iqamaNumber")} value={driver.iqamaNumber ?? t("notAvailable")} ltr />
        <InfoRow icon={<FileTextIcon />} label={t("iqamaExpiryDate")} value={formatDateValue(driver.iqamaExpiryDate, t("notAvailable"))} ltr />
        <InfoRow icon={<FileTextIcon />} label={t("drivingLicenseNumber")} value={driver.drivingLicenseNumber ?? t("notAvailable")} ltr />
        <InfoRow icon={<FileTextIcon />} label={t("drivingLicenseExpiryDate")} value={formatDateValue(driver.drivingLicenseExpiryDate, t("notAvailable"))} ltr />
        <InfoRow icon={<FileTextIcon />} label={t("driverCardNumber")} value={driver.driverCardNumber ?? t("notAvailable")} ltr />
        <InfoRow icon={<FileTextIcon />} label={t("driverCardExpiryDate")} value={formatDateValue(driver.driverCardExpiryDate, t("notAvailable"))} ltr />
      </SectionCard>

      <SectionCard icon={<CarIcon />} title={t("vehicleDetails")} subtitle={t("vehicleDetailsSubtitle")}>
        {vehicle ? (
          <>
            <InfoRow icon={<CarIcon />} label={t("actualPlate")} value={vehicle.plate_number} ltr />
            <InfoRow label={t("vehicleType")} value={vehicleCategory ?? vehicle.vehicle_type} />
            {driver.keetaVehiclePlateNumber ? <InfoRow label={t("keetaVehiclePlate")} value={driver.keetaVehiclePlateNumber} ltr /> : null}
            <InfoRow icon={<ShieldCheckIcon />} label={t("operatingCardNumber")} value={vehicle.operating_card_number ?? t("notAvailable")} ltr />
            <InfoRow icon={<ShieldCheckIcon />} label={t("operatingCardExpiry")} value={formatDateValue(vehicle.operating_card_expiry_date, t("notAvailable"))} ltr />
            <InfoRow icon={<ShieldCheckIcon />} label={t("authorizationExpiry")} value={formatDateValue(vehicle.authorization_expiry_date, t("notAvailable"))} ltr />
          </>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-surface px-3 py-3 text-sm font-semibold text-muted">
            <CarIcon className="size-5 shrink-0 text-primary" />
            <p>{t("noVehicle")}</p>
          </div>
        )}
      </SectionCard>

      <div className="space-y-2">
        <Link href="/salary" className="flex min-h-12 items-center justify-center rounded-[0.85rem] bg-primary-soft px-4 text-sm font-bold text-primary [touch-action:manipulation]">
          {t("salary")}
        </Link>
        <Link href="/change-password" className="flex min-h-12 items-center justify-center rounded-[0.85rem] border border-border bg-white px-4 text-sm font-bold text-navy [touch-action:manipulation]">
          {t("changePassword")}
        </Link>
        <form action={logoutDriverAction}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="min-h-12 w-full rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white [touch-action:manipulation]">
            {t("logout")}
          </button>
        </form>
      </div>
    </div>
  );
}

function SectionCard({ children, icon, subtitle, title }: { children: ReactNode; icon: ReactNode; subtitle?: string; title: string }) {
  return (
    <PageCard>
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-navy">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs font-medium text-muted">{subtitle}</p> : null}
        </div>
      </div>
      <dl className="mt-3 divide-y divide-border">{children}</dl>
    </PageCard>
  );
}

function InfoRow({ icon, label, ltr, value }: { icon?: ReactNode; label: string; ltr?: boolean; value: string }) {
  return (
    <div className="flex min-h-12 items-center gap-2.5 py-2 first:pt-0 last:pb-0">
      {icon ? <span className="shrink-0 text-muted">{icon}</span> : null}
      <dt className="min-w-0 flex-1 text-xs font-semibold text-muted">{label}</dt>
      <dd className="max-w-[58%] break-words text-end text-sm font-bold text-navy" dir={ltr ? "ltr" : undefined}>{value}</dd>
    </div>
  );
}

function StatusBadge({ label, status }: { label: string; status: "active" | "suspended" }) {
  const className = status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800";
  return <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[0.68rem] font-bold ${className}`}><span aria-hidden="true" className={`size-1.5 rounded-full ${status === "active" ? "bg-emerald-500" : "bg-amber-500"}`} />{label}</span>;
}

function formatDateValue(value: string | null | undefined, fallback: string) {
  return value || fallback;
}

function getVehicleCategoryLabel(vehicleCategory: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  if (vehicleCategory === "car" || vehicleCategory === "motorcycle") {
    return t(`vehicleCategories.${vehicleCategory}`);
  }
  return vehicleCategory;
}
