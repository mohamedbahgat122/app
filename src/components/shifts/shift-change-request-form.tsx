"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { submitShiftChangeRequestAction } from "@/app/[locale]/actions";
import type { RecentShiftChangeRequest } from "@/lib/app/driver-app-data";

type ShiftTemplate = {
 id: string;
 name: string;
 start_time: string;
 end_time: string;
};

type PendingRequest = {
 id: string;
 requested_week_start_date: string;
 status: string;
 requested_shift: {
  name: string;
 } | null;
} | null;

export function ShiftChangeRequestForm({
 currentShiftId,
 availableShifts,
 pendingRequest,
 recentRequests,
}: {
 currentShiftId: string;
 availableShifts: ShiftTemplate[];
 pendingRequest: PendingRequest;
 recentRequests: RecentShiftChangeRequest[];
}) {
 const t = useTranslations("Shifts");
 const locale = useLocale();
 const router = useRouter();
 const [state, formAction, isPending] = useActionState(
  submitShiftChangeRequestAction,
  { status: "idle" }
 );

 // Calculate next Sunday
 const nextSundayStr = useMemo(() => {
  const today = new Date();
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + (7 - today.getDay()));
  return formatDateInputValue(nextSunday);
 }, []);

 useEffect(() => {
  if (state.status === "success") {
   router.refresh();
  }
 }, [router, state.status]);

 const latestRequest = recentRequests[0] ?? null;
 const historyRequests = latestRequest ? recentRequests.slice(1) : recentRequests;

 return (
  <div className="mt-4 space-y-4">
   {latestRequest ? (
    <ShiftRequestCard
     request={latestRequest}
     title={t("latestRequestTitle")}
     locale={locale}
     t={t}
     prominent
    />
   ) : null}

   {historyRequests.length > 0 ? (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
     <h3 className="text-base font-bold text-navy">
      {t("requestHistoryTitle")}
     </h3>
     <div className="mt-3 space-y-3">
      {historyRequests.map((request) => (
       <ShiftRequestCard
        key={request.id}
        request={request}
        locale={locale}
        t={t}
       />
      ))}
     </div>
    </section>
   ) : null}

   {pendingRequest ? (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
     <h3 className="text-base font-bold text-amber-900">
      {t("pendingRequestTitle")}
     </h3>
     <p className="mt-2 text-sm font-semibold text-amber-800">
      {t("pendingRequestDesc", {
       shift: pendingRequest.requested_shift?.name || "",
       date: formatBusinessDate(pendingRequest.requested_week_start_date, locale),
      })}
     </p>
    </div>
   ) : (
  <form action={formAction} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm mt-4 space-y-4">
   <h3 className="text-base font-bold text-navy">
    {t("requestTitle")}
   </h3>
   <p className="text-xs font-semibold text-slate-500">
    {t("requestDesc")}
   </p>

   <input type="hidden" name="currentShiftId" value={currentShiftId} />
   <input type="hidden" name="requestedWeekStartDate" value={nextSundayStr} />

   <div>
    <label htmlFor="requestedShiftId" className="block text-xs font-bold text-slate-500 mb-1.5">
     {t("newShiftLabel")}
    </label>
    <select
     id="requestedShiftId"
     name="requestedShiftId"
     required
     className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
     <option value="">{t("selectShift")}</option>
     {availableShifts
      .filter((s) => s.id !== currentShiftId)
      .map((shift) => (
       <option key={shift.id} value={shift.id}>
        {shift.name} ({shift.start_time} - {shift.end_time})
       </option>
      ))}
    </select>
   </div>

   <div>
    <label htmlFor="driverNote" className="block text-xs font-bold text-slate-500 mb-1.5">
     {t("noteLabel")}
    </label>
    <textarea
     id="driverNote"
     name="driverNote"
     rows={3}
     className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-navy focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
     placeholder={t("notePlaceholder")}
    />
   </div>

   {state.status === "success" && (
    <p className="text-sm font-bold text-emerald-600">
     {t("successMessage")}
    </p>
   )}

   {state.status === "validation_error" && (
    <p className="text-sm font-bold text-red-600">
     {t("errors.validationError")}
    </p>
   )}

   {state.status === "submit_failed" && (
    <p className="text-sm font-bold text-red-600">
     {t("errors.submitFailed")}
    </p>
   )}

   <button
    type="submit"
    disabled={isPending}
    className="w-full py-3 px-4 rounded-xl bg-primary text-white text-sm font-bold shadow-md hover:bg-primary/95 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
   >
    {isPending ? t("sending") : t("submitBtn")}
   </button>
  </form>
   )}
  </div>
 );
}

function ShiftRequestCard({
 request,
 title,
 locale,
 t,
 prominent = false,
}: {
 request: RecentShiftChangeRequest;
 title?: string;
 locale: string;
 t: ReturnType<typeof useTranslations<"Shifts">>;
 prominent?: boolean;
}) {
 const statusTone = getStatusTone(request.status);
 const reviewNote = request.review_note?.trim();

 return (
  <article
   className={
    prominent
     ? "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
     : "rounded-2xl border border-slate-200 bg-slate-50 p-4"
   }
  >
   <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
     {title ? (
      <h3 className="text-base font-bold text-navy">{title}</h3>
     ) : null}
     <p className={title ? "mt-2 text-sm font-bold text-navy" : "text-sm font-bold text-navy"}>
      {request.requested_shift?.name ?? t("unknownShift")}
     </p>
    </div>
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${statusTone}`}>
     {t(`requestStatuses.${request.status}`)}
    </span>
   </div>

   <dl className="mt-3 grid gap-2 text-xs font-semibold text-slate-600 sm:grid-cols-2">
    <ShiftRequestDetail
     label={t("requestedWeekLabel")}
     value={formatBusinessDate(request.requested_week_start_date, locale)}
    />
    <ShiftRequestDetail
     label={t("submittedAtLabel")}
     value={formatDateTime(request.created_at, locale)}
    />
    {request.reviewed_at ? (
     <ShiftRequestDetail
      label={t("reviewedAtLabel")}
      value={formatDateTime(request.reviewed_at, locale)}
     />
    ) : null}
   </dl>

   {reviewNote ? (
    <div className="mt-3 rounded-2xl bg-white p-3 text-xs font-semibold leading-6 text-slate-700">
     <p className="font-bold text-navy">{t("reviewNoteLabel")}</p>
     <p className="mt-1 whitespace-pre-wrap">{reviewNote}</p>
    </div>
   ) : null}
  </article>
 );
}

function ShiftRequestDetail({ label, value }: { label: string; value: string }) {
 return (
  <div>
   <dt className="text-slate-400">{label}</dt>
   <dd className="mt-0.5 text-slate-700">{value}</dd>
  </div>
 );
}

function getStatusTone(status: RecentShiftChangeRequest["status"]) {
 if (status === "approved") return "bg-emerald-100 text-emerald-800";
 if (status === "rejected") return "bg-rose-100 text-rose-800";
 return "bg-amber-100 text-amber-800";
}

function formatBusinessDate(value: string, locale: string) {
 const [year, month, day] = value.split("-").map(Number);

 if (!year || !month || !day) {
  return value;
 }

 return new Intl.DateTimeFormat(locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
 }).format(new Date(year, month - 1, day));
}

function formatDateInputValue(value: Date) {
 const year = value.getFullYear();
 const month = String(value.getMonth() + 1).padStart(2, "0");
 const day = String(value.getDate()).padStart(2, "0");

 return `${year}-${month}-${day}`;
}

function formatDateTime(value: string, locale: string) {
 return new Intl.DateTimeFormat(locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
 }).format(new Date(value));
}
