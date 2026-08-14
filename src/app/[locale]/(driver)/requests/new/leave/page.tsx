import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { RequestForm } from "@/components/requests/request-form";
import { isLocale } from "@/config/locales";
import { loadDriverSession } from "@/lib/app/driver-app-data";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function NewLeaveRequestPage({ params }: RouteProps) {
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
     <h1 className="text-xl font-bold text-navy">{t("choices.leave")}</h1>
    </div>
    <RequestForm type="leave" vehiclePlate={app.session.driver.vehiclePlate} />
   </main>
 );
}
