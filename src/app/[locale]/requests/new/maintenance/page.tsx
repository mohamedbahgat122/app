import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppError } from "@/components/app-shell/app-error";
import { DriverAppShell } from "@/components/app-shell/driver-app-shell";
import { RequestForm } from "@/components/requests/request-form";
import { isLocale } from "@/config/locales";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";
import { resolveMaintenanceVehicleStatus } from "@/lib/app/maintenance-vehicle";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function NewMaintenanceRequestPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return <AppError locale={locale} />;
  const t = await getTranslations({ locale, namespace: "Requests" });
  const maintenanceVehicle = await resolveMaintenanceVehicleStatus(app.supabase);

  return (
    <DriverAppShell context={app.context}>
      <main className="space-y-4">
        <h1 className="text-xl font-bold text-navy">{t("choices.maintenance")}</h1>
        <RequestForm
          type="maintenance"
          vehiclePlate={
            maintenanceVehicle.status === "linked"
              ? maintenanceVehicle.plateNumber
              : null
          }
          vehicleErrorCode={
            maintenanceVehicle.status === "unavailable"
              ? maintenanceVehicle.errorCode
              : null
          }
        />
      </main>
    </DriverAppShell>
  );
}
