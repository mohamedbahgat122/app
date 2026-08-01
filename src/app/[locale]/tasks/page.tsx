import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppError } from "@/components/app-shell/app-error";
import { DriverAppShell } from "@/components/app-shell/driver-app-shell";
import { EmptyState } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function TasksPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return <AppError locale={locale} />;
  const t = await getTranslations({ locale, namespace: "Tasks" });

  return (
    <DriverAppShell context={app.context}>
      <EmptyState title={t("title")} description={t("empty")} />
    </DriverAppShell>
  );
}
