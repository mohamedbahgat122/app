"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  CalendarIcon,
  ClockIcon,
  FileTextIcon,
  ListIcon,
  SendIcon,
  ShieldCheckIcon,
  ShiftIcon,
} from "@/components/app-shell/icons";
import {
  submitOrderShiftChangeRequestAction,
  type OrderShiftChangeActionState,
} from "@/app/[locale]/actions";
import { suppressNextRealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import type {
  CurrentOrderPeriodAssignment,
  OrderShiftChangeRequest,
  OrderShiftChangeWindow,
} from "@/lib/app/driver-app-data";

const weekdayKeys = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

const initialState: OrderShiftChangeActionState = { status: "idle" };

export function OrderShiftChangeRequestForm({
  driverId,
  currentAssignment,
  requestWindow,
  requests,
}: {
  driverId: string;
  currentAssignment: CurrentOrderPeriodAssignment | null;
  requestWindow: OrderShiftChangeWindow;
  requests: OrderShiftChangeRequest[];
}) {
  const t = useTranslations("Shifts");
  const locale = useLocale();
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    submitOrderShiftChangeRequestAction,
    initialState,
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (state.status === "success") {
      suppressNextRealtimeRefresh({
        table: "driver_order_shift_change_requests",
        filter: `driver_id=eq.${driverId}`,
        eventType: "INSERT",
      });
      router.refresh();
    }
  }, [driverId, router, state.status]);

  if (!currentAssignment || !requestWindow.success) {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-amber-700">
            <ClockIcon className="size-4" />
          </span>
          <h2 className="text-base font-bold text-amber-900">
            {t("orderRequest.unavailableTitle")}
          </h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
          {t("orderRequest.unavailableDescription")}
        </p>
      </section>
    );
  }

  const targetRequest = requests.find(
    (request) =>
      request.requested_week_start_date === requestWindow.target_week_start &&
      (request.status === "pending" || request.status === "approved"),
  );
  const templateNames = new Map(
    requestWindow.templates.map((template) => [template.id, template.name]),
  );
  templateNames.set(currentAssignment.template_id, currentAssignment.template_name);
  const requestedName = targetRequest
    ? templateNames.get(targetRequest.requested_order_period_template_id) ??
      t("orderRequest.unknownTemplate")
    : null;
  const allowedDays = requestWindow.allowed_weekdays
    .map((day) => weekdayKeys[day])
    .filter(Boolean)
    .map((day) => t(`weekdays.${day}`))
    .join(", ");
  const canSubmit =
    requestWindow.can_submit_today &&
    requestWindow.templates.length > 0 &&
    !targetRequest;
  const errorKey =
    state.status !== "idle" && state.status !== "success"
      ? state.messageKey ?? "submitFailed"
      : null;

  return (
    <section className="space-y-3" dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"}>
      <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SendIcon className="size-4" />
          </span>
          <h2 className="text-base font-bold text-navy">
            {t("orderRequest.title")}
          </h2>
        </div>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
          {t("orderRequest.description")}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Info icon={<ShiftIcon className="size-4" />} label={t("orderRequest.currentShift")} value={currentAssignment.template_name} />
          <Info
            icon={<CalendarIcon className="size-4" />}
            label={t("orderRequest.targetWeek")}
            value={formatDate(requestWindow.target_week_start, locale)}
          />
        </div>
        <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
          {t("orderRequest.currentShiftUnchanged")}
        </p>
      </article>

      {targetRequest ? (
          <article
          className={`rounded-2xl border p-4 shadow-sm ${
            targetRequest.status === "pending"
              ? "border-amber-200 bg-amber-50"
              : "border-emerald-200 bg-emerald-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 text-amber-700">
              <ListIcon className="size-4" />
            </span>
            <h3 className="text-base font-bold text-navy">
              {t(`orderRequest.statuses.${targetRequest.status}`)}
            </h3>
          </div>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
            {targetRequest.status === "pending"
              ? t("orderRequest.pendingDescription", { shift: requestedName ?? "" })
              : t("orderRequest.approvedDescription", {
                  shift: requestedName ?? "",
                  date: formatDate(requestWindow.target_week_start, locale),
                })}
          </p>
        </article>
      ) : !requestWindow.can_submit_today || requestWindow.templates.length === 0 ? (
        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="text-base font-bold text-amber-900">
            {requestWindow.allowed_weekdays.length > 0
              ? t("orderRequest.windowClosedTitle")
              : t("orderRequest.noDaysTitle")}
          </h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
            {requestWindow.templates.length === 0
              ? t("orderRequest.noTemplatesDescription")
              : requestWindow.allowed_weekdays.length > 0
              ? t("orderRequest.windowClosedDescription", { days: allowedDays })
              : t("orderRequest.noDaysDescription")}
          </p>
        </article>
      ) : (
        <form action={formAction} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-base font-bold text-navy">
            {t("orderRequest.formTitle")}
          </h3>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            {t("orderRequest.allowedDays", { days: allowedDays })}
          </p>
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2 text-slate-500">
              <CalendarIcon className="size-4" />
              <p className="text-xs font-bold">{t("orderRequest.requestedShift")}</p>
            </div>
            <input type="hidden" name="requestedOrderPeriodTemplateId" value={selectedTemplateId} />
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t("orderRequest.requestedShift")}>
              {requestWindow.templates.map((template) => {
                const selected = selectedTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`min-h-20 rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                      selected
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-slate-200 bg-slate-50 text-navy hover:border-primary/40 hover:bg-white"
                    }`}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-start gap-2">
                        <ClockIcon className="mt-0.5 size-4 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold">{template.name}</span>
                          <span className="mt-1 block text-xs font-semibold" dir="ltr">
                            {template.start_time.slice(0, 5)} - {template.end_time.slice(0, 5)}
                          </span>
                        </span>
                      </span>
                      {selected ? <ShieldCheckIcon className="size-4 shrink-0" /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4">
            <label htmlFor="orderShiftChangeReason" className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-500">
              <FileTextIcon className="size-4" />
              {t("orderRequest.reasonLabel")}
            </label>
            <textarea
              id="orderShiftChangeReason"
              name="reason"
              rows={3}
              maxLength={2000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t("orderRequest.reasonPlaceholder")}
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-navy outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
            <p className="mt-1 text-end text-[11px] font-semibold text-slate-400">{reason.length}/2000</p>
          </div>
          {errorKey ? (
            <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
              {t(`orderRequest.errors.${errorKey}`)}
            </p>
          ) : null}
          {state.status === "success" ? (
            <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
              {t("orderRequest.success")}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isPending || !canSubmit || !selectedTemplateId}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" /> : <SendIcon className="size-4" />}
            {isPending ? t("orderRequest.sending") : t("orderRequest.submit")}
          </button>
        </form>
      )}

      {requests.length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListIcon className="size-4" />
            </span>
            <h3 className="text-base font-bold text-navy">
              {t("orderRequest.historyTitle")}
            </h3>
          </div>
          <div className="mt-3 space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="rounded-2xl bg-slate-50 p-3">
                <p className="text-sm font-bold text-navy">
                  {t(`orderRequest.statuses.${request.status}`)}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {t("orderRequest.historyItem", {
                    week: formatDate(request.requested_week_start_date, locale),
                    shift:
                      templateNames.get(request.requested_order_period_template_id) ??
                      t("orderRequest.unknownTemplate"),
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-xs font-bold">{label}</p>
      </div>
      <p className="mt-2 text-sm font-bold text-navy">{value}</p>
    </div>
  );
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+03:00`));
}
