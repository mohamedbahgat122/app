import { getTranslations, setRequestLocale } from "next-intl/server";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { EmptyState } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import {
 loadAssignedShiftSummary,
 loadDriverSession,
 loadAvailableShiftTemplates,
 loadPendingShiftChangeRequest,
 loadRecentShiftChangeRequests,
} from "@/lib/app/driver-app-data";
import { ShiftChangeRequestForm } from "@/components/shifts/shift-change-request-form";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function ShiftsPage({ params }: RouteProps) {
 const { locale } = await params;
 if (!isLocale(locale)) return null;
 setRequestLocale(locale);
 const app = await loadDriverSession(locale);
 if (app.status === "application_error") return null;
 const t = await getTranslations({ locale, namespace: "Shifts" });
 const assignedShift = await loadAssignedShiftSummary(
  app.session.driver.id,
  app.supabase,
 );
 const organizationId = app.session.organization?.id;
 const [availableShifts, pendingRequest, recentRequests] = await Promise.all([
  organizationId ? loadAvailableShiftTemplates(organizationId, assignedShift?.id) : Promise.resolve([]),
  loadPendingShiftChangeRequest(app.session.driver.id),
  loadRecentShiftChangeRequests(app.session.driver.id),
 ]);

 if (!assignedShift) {
  return (
   <div className="space-y-4">
    <RealtimeRefresh
     channelName={`driver-shift-assignment-${app.session.driver.id}`}
     table="organization_shift_assignments"
     filter={`driver_id=eq.${app.session.driver.id}`}
     toast={t("updated")}
    />
    <h1 className="text-[1.45rem] font-bold text-navy">{t("title")}</h1>
    <EmptyState title={t("emptyTitle")} description={t("empty")} />
   </div>
  );
 }

 return (
  <div className="space-y-4">
   <RealtimeRefresh
    channelName={`driver-shift-assignment-${app.session.driver.id}`}
    table="organization_shift_assignments"
    filter={`driver_id=eq.${app.session.driver.id}`}
    toast={t("updated")}
   />
   <RealtimeRefresh
    channelName={`driver-shift-change-requests-${app.session.driver.id}`}
    table="driver_shift_change_requests"
    filter={`driver_id=eq.${app.session.driver.id}`}
    toast={t("requestStatusUpdated")}
   />
   <h1 className="text-[1.45rem] font-bold text-navy">{t("title")}</h1>
   <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
    <div className="flex flex-wrap items-start justify-between gap-3">
     <div>
      <h2 className="text-xl font-bold text-navy">
       {assignedShift.name}
      </h2>
      <p className="mt-1 text-sm font-bold text-slate-500">
       {assignedShift.startTime} -&gt; {assignedShift.endTime}
      </p>
     </div>
     <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
      {assignedShift.crossesMidnight ? t("overnight") : t("sameDay")}
     </span>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-3">
     <ShiftMetric
      label={t("totalDuration")}
      value={formatMinutes(assignedShift.totalMinutes, locale)}
     />
     <ShiftMetric
      label={t("breakDuration")}
      value={formatMinutes(assignedShift.breakMinutes, locale)}
     />
     <ShiftMetric
      label={t("effectiveDuration")}
      value={formatMinutes(assignedShift.effectiveMinutes, locale)}
     />
    </div>

    <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">
     {assignedShift.hasBreak &&
     assignedShift.breakStartTime &&
     assignedShift.breakEndTime
      ? `${t("break")}: ${assignedShift.breakStartTime} -> ${assignedShift.breakEndTime}`
      : t("noBreak")}
    </div>
   </article>

   {assignedShift.driverNote ? (
    <article className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
     <h2 className="text-base font-bold text-amber-900">
      {t("shiftInstructions")}
     </h2>
     <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-amber-950">
      {assignedShift.driverNote}
     </p>
    </article>
   ) : null}

   <ShiftChangeRequestForm
   currentShiftId={assignedShift.id}
   availableShifts={availableShifts}
   pendingRequest={pendingRequest}
   recentRequests={recentRequests}
   />
  </div>
 );
}

function ShiftMetric({ label, value }: { label: string; value: string }) {
 return (
  <div className="rounded-2xl bg-slate-50 p-4">
   <p className="text-xs font-bold text-slate-500">{label}</p>
   <p className="mt-1 text-sm font-bold text-navy">{value}</p>
  </div>
 );
}

function formatMinutes(minutes: number, locale: string) {
 const hours = Math.floor(minutes / 60);
 const remainingMinutes = minutes % 60;

 if (locale === "en") {
  return remainingMinutes === 0
   ? `${hours}h`
   : `${hours}h ${remainingMinutes}m`;
 }

 return remainingMinutes === 0
  ? `${hours} ساعة`
  : `${hours} ساعة ${remainingMinutes} دقيقة`;
}
