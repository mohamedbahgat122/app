import { getTranslations, setRequestLocale } from "next-intl/server";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { EmptyState } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";
import {
 loadCurrentOrderPeriodAssignment,
 loadDriverOrderShiftOperationalContext,
 loadOrderShiftChangeRequestWindow,
 loadRecentOrderShiftChangeRequests,
 loadAssignedShiftSummary,
 loadShiftSummary,
 loadDriverSession,
  loadAvailableShiftTemplates,
 loadDriverShiftChangeWindow,
 loadPendingShiftChangeRequest,
 loadRecentShiftChangeRequests,
} from "@/lib/app/driver-app-data";
import { ShiftChangeRequestForm } from "@/components/shifts/shift-change-request-form";
import { OrderShiftChangeRequestForm } from "@/components/shifts/order-shift-change-request-form";
import { OrderShiftOperationalStatus } from "@/components/shifts/order-shift-operational-status";
import { CalendarIcon, ClockIcon, ShiftIcon } from "@/components/app-shell/icons";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function ShiftsPage({ params }: RouteProps) {
 const { locale } = await params;
 if (!isLocale(locale)) return null;
 setRequestLocale(locale);
 const app = await loadDriverSession(locale);
 if (app.status === "application_error") return null;
 const driverId = app.session.driver.id;
 const t = await getTranslations({ locale, namespace: "Shifts" });

 if (app.session.driver.settlementType === "per_order") {
  const [orderPeriod, operationalContext, orderRequestWindow, orderRequests, shiftSummary] = await Promise.all([
   loadCurrentOrderPeriodAssignment(app.supabase),
   loadDriverOrderShiftOperationalContext(app.supabase),
   loadOrderShiftChangeRequestWindow(app.supabase),
   loadRecentOrderShiftChangeRequests(driverId, app.supabase),
   loadShiftSummary(driverId, app.supabase),
  ]);

  return (
    <div className="min-w-0 max-w-full space-y-4">
    <RealtimeRefresh
     subscriptions={[
      {
       channelName: `driver-order-period-assignment-${driverId}`,
       table: "organization_order_period_assignments",
       filter: `driver_id=eq.${driverId}`,
      },
      {
       channelName: `driver-order-shift-change-request-${driverId}`,
       table: "driver_order_shift_change_requests",
       filter: `driver_id=eq.${driverId}`,
      },
      {
       channelName: `driver-order-period-template-${driverId}`,
       table: "organization_order_period_templates",
       filter: `organization_id=eq.${app.session.organization?.id ?? ""}`,
      },
     ]}
     toast={t("updated")}
    />
    <h1 className="text-[1.45rem] font-bold text-navy">{t("title")}</h1>
    <OrderWorkShiftCard orderPeriod={orderPeriod} operationalContext={operationalContext} openShift={shiftSummary.openShift} locale={locale} />
    <OrderShiftChangeRequestForm
     driverId={driverId}
     currentAssignment={orderPeriod.status === "assigned" ? orderPeriod.assignment : null}
     requestWindow={orderRequestWindow}
     requests={orderRequests}
    />
   </div>
  );
 }

 const [assignedShift, shiftChangeWindow, pendingRequest, recentRequests] = await Promise.all([
  loadAssignedShiftSummary(driverId, app.supabase),
  loadDriverShiftChangeWindow(app.supabase),
  loadPendingShiftChangeRequest(driverId),
  loadRecentShiftChangeRequests(driverId),
 ]);
 const organizationId = app.session.organization?.id;
 const availableShifts =
  organizationId && assignedShift
   ? await loadAvailableShiftTemplates(organizationId, assignedShift.id)
   : [];

 if (!assignedShift) {
  return (
    <div className="min-w-0 max-w-full space-y-4">
    <RealtimeRefresh
     channelName={`driver-shift-assignment-${driverId}`}
     table="organization_shift_assignments"
     filter={`driver_id=eq.${driverId}`}
     toast={t("updated")}
    />
    <h1 className="text-[1.45rem] font-bold text-navy">{t("title")}</h1>
    <EmptyState title={t("emptyTitle")} description={t("empty")} />
   </div>
  );
 }

 return (
   <div className="min-w-0 max-w-full space-y-4">
   <RealtimeRefresh
    channelName={`driver-shift-assignment-${driverId}`}
    table="organization_shift_assignments"
    filter={`driver_id=eq.${driverId}`}
    toast={t("updated")}
   />
   <RealtimeRefresh
    channelName={`driver-shift-change-requests-${driverId}`}
    table="driver_shift_change_requests"
    filter={`driver_id=eq.${driverId}`}
    toast={t("requestStatusUpdated")}
   />
   <h1 className="text-[1.45rem] font-bold text-navy">{t("title")}</h1>
   <article className="min-w-0 max-w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
     <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="break-words text-xl font-bold text-navy">
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
   driverId={driverId}
   currentShiftId={assignedShift.id}
   availableShifts={availableShifts}
   pendingRequest={pendingRequest}
   recentRequests={recentRequests}
   shiftChangeWindow={shiftChangeWindow}
   />
  </div>
 );
}

async function OrderWorkShiftCard({
 orderPeriod,
 operationalContext,
 openShift,
 locale,
}: {
 orderPeriod: Awaited<ReturnType<typeof loadCurrentOrderPeriodAssignment>>;
 operationalContext: Awaited<ReturnType<typeof loadDriverOrderShiftOperationalContext>>;
 openShift: Awaited<ReturnType<typeof loadShiftSummary>>["openShift"];
 locale: string;
}) {
 const t = await getTranslations({ locale, namespace: "Shifts" });

 if (orderPeriod.status === "error") {
  return (
   <EmptyState
    title={t("orderAssignmentError")}
    description={t("orderAssignmentErrorDescription")}
   />
  );
 }

 if (orderPeriod.status === "none") {
  return (
   <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
    <p className="text-sm font-bold text-slate-500">{t("paymentModeLabel")}</p>
    <h2 className="mt-1 text-xl font-bold text-navy">{t("perOrder")}</h2>
    <p className="mt-5 text-base font-bold text-navy">{t("noOrderShiftTitle")}</p>
    <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
     {t("noOrderShiftDescription")}
    </p>
   </article>
  );
 }

 const assignment = orderPeriod.assignment;
 if (openShift) {
  return (
    <article className="min-w-0 max-w-full rounded-3xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
     <div className="flex min-w-0 items-start gap-3">
     <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/80 text-emerald-700">
      <ShiftIcon className="size-5" />
     </span>
     <div className="min-w-0 flex-1">
      <p className="text-sm font-bold text-emerald-800">{t("status.open")}</p>
    <p className="mt-2 text-sm font-semibold text-emerald-900">
     {t("startTime")}: <span dir="ltr">{formatStartedAt(openShift.started_at, locale)}</span>
    </p>
     </div>
    </div>
   </article>
  );
 }

 const showCurrentShiftCard = operationalContext !== null && operationalContext.state !== "no_assignment" && operationalContext.state !== "unpublished" && operationalContext.state !== "disabled";
 const operationalLabels = {
  status: t("operationalStatus"),
  open: t("operational.open"),
  manuallyOpened: t("operational.manuallyOpened"),
  beforeOpen: t("operational.beforeOpen"),
  closed: t("operational.closed"),
  unpublished: t("operational.unpublished"),
  disabled: t("operational.disabled"),
  unconfigured: t("operational.unconfigured"),
  unavailable: t("operational.unavailable"),
  opensAt: t("operational.opensAt"),
  closesAt: t("operational.closesAt"),
  refreshing: t("operational.refreshing"),
 };

 return (
   <div className="min-w-0 max-w-full space-y-3">
  {showCurrentShiftCard ? <article className="min-w-0 max-w-full rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex min-w-0 items-start gap-3">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
     <CalendarIcon className="size-5" />
    </span>
    <div className="min-w-0">
     <p className="text-xs font-bold text-slate-500">{t("paymentModeLabel")}</p>
     <h2 className="mt-1 text-xl font-bold text-navy">{t("perOrder")}</h2>
    </div>
   </div>
   <div className="mt-5">
    <p className="text-xs font-bold text-slate-500">{t("orderShiftTitle")}</p>
    <p className="mt-1 break-words text-lg font-bold text-navy">{assignment.template_name}</p>
   </div>
   <div className="mt-4 rounded-2xl bg-slate-50 p-4">
    <div className="flex items-center gap-2 text-slate-500">
     <ClockIcon className="size-4" />
     <p className="text-xs font-bold">{t("orderShiftTime")}</p>
    </div>
    <p className="mt-2 text-base font-bold text-navy" dir="ltr">
     {formatDisplayTime(assignment.start_time)} -&gt; {formatDisplayTime(assignment.end_time)}
    </p>
    {assignment.crosses_midnight ? (
     <p className="mt-1 text-xs font-semibold text-slate-500">{t("overnight")}</p>
    ) : null}
   </div>
  </article> : null}
  <OrderShiftOperationalStatus context={operationalContext} labels={operationalLabels} locale={locale} />
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

function formatDisplayTime(value: string) {
 return value.slice(0, 5);
}

function formatStartedAt(value: string, locale: string) {
 return new Intl.DateTimeFormat(
  locale === "ar" ? "ar-SA" : locale === "ur" ? "ur-PK" : "en-US",
  { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" },
 ).format(new Date(value));
}
