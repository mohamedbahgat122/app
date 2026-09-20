import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { OilChangeRequestPanel } from "@/components/requests/oil-change-request-panel";
import { OilStatusCard } from "@/components/requests/oil-status-card";
import { RequestPageHeader } from "@/components/requests/request-form";
import { isLocale } from "@/config/locales";
import { loadDriverSession } from "@/lib/app/driver-app-data";
import { loadDriverOilMaintenanceStatus } from "@/lib/app/oil-maintenance-status";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function NewOilChangeRequestPage({ params }: RouteProps) {
 const { locale } = await params;
 if (!isLocale(locale)) return null;
 setRequestLocale(locale);
 const app = await loadDriverSession(locale);
 if (app.status === "application_error") return null;
 const t = await getTranslations({ locale, namespace: "Requests" });

 return (
   <main className="space-y-4">
    <div className="flex items-center gap-3">
     <Link href="/requests" className="p-1.5 rounded-full bg-surface border border-border text-navy hover:bg-surface-raised transition-colors focus:outline-none shrink-0" aria-label="Back">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rtl:rotate-180">
       <path d="m15 18-6-6 6-6"/>
      </svg>
     </Link>
     <RequestPageHeader icon="oil-change" title={t("choices.oil-change")} subtitle={t("subtitles.oilChange")} />
    </div>
    <OilChangeRequestPanel
     driverId={app.session.driver.id}
     vehiclePlate={app.session.driver.vehiclePlate}
    >
     <Suspense fallback={<OilStatusSkeleton />}>
      <OilStatusSection session={app.session} />
     </Suspense>
    </OilChangeRequestPanel>
   </main>
 );
}

async function OilStatusSection({ session }: { session: VerifiedDriverSession }) {
 const oilStatus = await loadDriverOilMaintenanceStatus(session);
 return <OilStatusCard status={oilStatus} />;
}

function OilStatusSkeleton() {
 return (
  <section className="space-y-4 rounded-[0.85rem] border border-border bg-white p-4 shadow-sm" aria-hidden="true">
   <div className="flex items-center justify-between gap-3">
    <div className="space-y-2">
     <span className="block h-4 w-32 animate-pulse rounded bg-primary-soft" />
     <span className="block h-3 w-20 animate-pulse rounded bg-primary-soft/70" />
    </div>
    <span className="h-6 w-16 animate-pulse rounded-full bg-primary-soft" />
   </div>
   <div className="h-24 animate-pulse rounded-[0.85rem] bg-surface" />
   <div className="grid grid-cols-2 gap-3">
    {Array.from({ length: 6 }, (_, index) => (
     <div key={index} className="h-16 animate-pulse rounded-[0.75rem] border border-border bg-surface/70" />
    ))}
   </div>
  </section>
 );
}
