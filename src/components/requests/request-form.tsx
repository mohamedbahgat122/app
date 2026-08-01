"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  submitLeaveRequestAction,
  submitMaintenanceRequestAction,
  submitMeetingRequestAction,
  submitOilChangeRequestAction,
  type DriverRequestActionState,
} from "@/app/[locale]/actions";

type RequestFormType = "leave" | "maintenance" | "meeting" | "oil-change";
type MaintenanceVehicleErrorCode =
  | "vehicle_not_linked"
  | "vehicle_not_found"
  | "vehicle_ambiguous"
  | "vehicle_inactive"
  | "vehicle_organization_mismatch";

const initialState: DriverRequestActionState = { status: "idle" };

export function RequestForm({
  type,
  vehiclePlate,
  vehicleErrorCode,
}: {
  type: RequestFormType;
  vehiclePlate: string | null;
  vehicleErrorCode?: MaintenanceVehicleErrorCode | null;
}) {
  const t = useTranslations("Requests");
  const router = useRouter();
  const action =
    type === "leave"
      ? submitLeaveRequestAction
      : type === "maintenance"
        ? submitMaintenanceRequestAction
        : type === "meeting"
          ? submitMeetingRequestAction
          : submitOilChangeRequestAction;
  const [state, formAction] = useActionState(action, initialState);

  useEffect(() => {
    if (state.status === "success") {
      router.push("/requests");
      router.refresh();
    }
  }, [router, state.status]);

  const requiresVehicle = type === "maintenance" || type === "oil-change";
  const vehicleMessageKey =
    type === "maintenance" && vehicleErrorCode
      ? vehicleErrorCode
      : "vehicleRequired";

  return (
    <form action={formAction} className="space-y-4 rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
      {requiresVehicle ? (
        <div className="rounded-[0.85rem] bg-primary-soft/70 p-3 text-sm font-semibold text-navy">
          {t("vehicle")}: {vehiclePlate ?? t("notAvailable")}
        </div>
      ) : null}
      {requiresVehicle && !vehiclePlate ? (
        <p className="text-sm font-bold text-red-600">
          {t(`errors.${vehicleMessageKey}`)}
        </p>
      ) : null}
      {type === "leave" ? <LeaveFields /> : null}
      {type === "maintenance" ? <MaintenanceFields /> : null}
      {type === "meeting" ? <MeetingFields /> : null}
      {type === "oil-change" ? <OilChangeFields /> : null}
      {state.status !== "idle" && state.status !== "success" ? (
        <p className="text-sm font-bold text-red-600">
          {t(`errors.${state.messageKey ?? "submitFailed"}`)}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={requiresVehicle && !vehiclePlate}
        className="min-h-12 w-full rounded-[0.85rem] bg-primary px-5 text-sm font-bold text-white disabled:opacity-60"
      >
        {t("submit")}
      </button>
    </form>
  );
}

function LeaveFields() {
  const t = useTranslations("Requests");

  return (
    <>
      <Select name="leaveType" label={t("fields.leaveType")}>
        <option value="sick">{t("leaveTypes.sick")}</option>
        <option value="weekly">{t("leaveTypes.weekly")}</option>
        <option value="annual">{t("leaveTypes.annual")}</option>
      </Select>
      <Input name="startDate" type="date" label={t("fields.startDate")} />
      <Input name="endDate" type="date" label={t("fields.endDate")} />
      <Textarea name="reason" label={t("fields.reason")} />
    </>
  );
}

function MaintenanceFields() {
  const t = useTranslations("Requests");

  return (
    <>
      <Input name="category" label={t("fields.category")} />
      <Select name="urgency" label={t("fields.urgency")}>
        <option value="normal">{t("urgency.normal")}</option>
        <option value="urgent">{t("urgency.urgent")}</option>
      </Select>
      <Textarea name="description" label={t("fields.description")} />
    </>
  );
}

function MeetingFields() {
  const t = useTranslations("Requests");

  return (
    <>
      <Input name="subject" label={t("fields.subject")} />
      <Textarea name="reason" label={t("fields.reason")} />
      <Input name="preferredDate" type="date" label={t("fields.preferredDate")} />
      <Input name="preferredTime" type="time" label={t("fields.preferredTime")} />
    </>
  );
}

function OilChangeFields() {
  const t = useTranslations("Requests");

  return (
    <>
      <Input
        name="odometerReading"
        inputMode="numeric"
        label={t("fields.odometerReading")}
      />
      <Textarea name="note" label={t("fields.note")} />
    </>
  );
}

function Input({
  name,
  label,
  type = "text",
  inputMode,
}: {
  name: string;
  label: string;
  type?: string;
  inputMode?: "numeric";
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-navy">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        className="min-h-12 w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 text-base text-navy outline-none focus:border-primary focus:bg-white"
      />
    </label>
  );
}

function Textarea({ name, label }: { name: string; label: string }) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-navy">
      <span>{label}</span>
      <textarea
        name={name}
        className="min-h-28 w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 py-3 text-base text-navy outline-none focus:border-primary focus:bg-white"
      />
    </label>
  );
}

function Select({
  name,
  label,
  children,
}: {
  name: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-navy">
      <span>{label}</span>
      <select
        name={name}
        className="min-h-12 w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 text-base text-navy outline-none focus:border-primary focus:bg-white"
      >
        {children}
      </select>
    </label>
  );
}
