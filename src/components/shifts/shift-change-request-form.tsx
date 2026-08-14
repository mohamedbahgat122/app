"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { submitShiftChangeRequestAction } from "@/app/[locale]/actions";

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
}: {
 currentShiftId: string;
 availableShifts: ShiftTemplate[];
 pendingRequest: PendingRequest;
}) {
 const t = useTranslations("Shifts");
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
  return nextSunday.toISOString().split("T")[0];
 }, []);

 useEffect(() => {
  if (state.status === "success") {
   router.refresh();
  }
 }, [router, state.status]);

 if (pendingRequest) {
  return (
   <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm mt-4">
    <h3 className="text-base font-bold text-amber-900">
     {t("pendingRequestTitle")}
    </h3>
    <p className="mt-2 text-sm font-semibold text-amber-800">
     {t("pendingRequestDesc", {
      shift: pendingRequest.requested_shift?.name || "",
      date: pendingRequest.requested_week_start_date,
     })}
    </p>
   </div>
  );
 }

 return (
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
 );
}
