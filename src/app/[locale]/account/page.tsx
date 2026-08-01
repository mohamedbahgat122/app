import { getTranslations, setRequestLocale } from "next-intl/server";
import { logoutDriverAction } from "@/app/[locale]/actions";
import { AppError } from "@/components/app-shell/app-error";
import { DriverAppShell } from "@/components/app-shell/driver-app-shell";
import { DriverAvatar } from "@/components/app-shell/driver-avatar";
import { PageCard } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { Link } from "@/i18n/navigation";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function AccountPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return <AppError locale={locale} />;
  const t = await getTranslations({ locale, namespace: "Account" });

  return (
    <DriverAppShell context={app.context}>
      <div className="space-y-4">
        <PageCard>
          <div className="flex items-center gap-3">
            <DriverAvatar
              imageUrl={app.context.avatarUrl}
              name={app.context.session.driver.fullName}
            />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold text-navy">
                {app.context.session.driver.fullName}
              </h1>
              <p className="text-sm font-semibold text-muted" dir="ltr">
                {app.context.session.driver.driverId}
              </p>
            </div>
          </div>
        </PageCard>
        <PageCard>
          <dl className="space-y-3">
            <Info label={t("organization")} value={app.context.session.organization?.name ?? t("notAvailable")} />
            <Info label={t("vehiclePlate")} value={app.context.session.driver.vehiclePlate ?? t("notAvailable")} ltr />
            <Info label={t("language")} value={t(`languages.${locale}`)} />
          </dl>
        </PageCard>
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
    </DriverAppShell>
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
