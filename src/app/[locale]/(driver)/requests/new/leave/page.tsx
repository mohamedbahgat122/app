import { getTranslations, setRequestLocale } from "next-intl/server";
import { RequestForm } from "@/components/requests/request-form";
import { isLocale } from "@/config/locales";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function NewLeaveRequestPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Requests" });

  return (
      <main className="space-y-4">
        <h1 className="text-xl font-bold text-navy">{t("choices.leave")}</h1>
        <RequestForm type="leave" vehiclePlate={app.context.session.driver.vehiclePlate} />
      </main>
  );
}
