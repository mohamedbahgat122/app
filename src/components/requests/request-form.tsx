"use client";

import { useActionState, useEffect, useMemo } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  submitLeaveRequestAction,
  submitMaintenanceRequestAction,
  submitMeetingRequestAction,
  submitOilChangeRequestAction,
  type DriverRequestActionState,
} from "@/app/[locale]/actions";
import type { MeetingManagerOption } from "@/lib/app/meeting-managers";

type RequestFormType = "leave" | "maintenance" | "meeting" | "oil-change";
type MaintenanceVehicleErrorCode =
  | "vehicle_not_linked"
  | "vehicle_not_found"
  | "vehicle_ambiguous"
  | "vehicle_inactive"
  | "vehicle_organization_mismatch";

const initialState: DriverRequestActionState = { status: "idle" };

function createSubmissionId() {
  const browserCrypto = globalThis.crypto;

  if (browserCrypto) {
    if (typeof browserCrypto.randomUUID === "function") {
      return browserCrypto.randomUUID();
    }

    if (typeof browserCrypto.getRandomValues === "function") {
      const bytes = browserCrypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (char) => {
    const nibble = Math.floor(Math.random() * 16);
    const shift = Number(char) / 4;

    return (Number(char) ^ (nibble >> shift)).toString(16);
  });
}

export function RequestForm({
  type,
  vehiclePlate,
  vehicleErrorCode,
  meetingManagers = [],
  onOdometerReadingChange,
}: {
  type: RequestFormType;
  vehiclePlate: string | null;
  vehicleErrorCode?: MaintenanceVehicleErrorCode | null;
  meetingManagers?: MeetingManagerOption[];
  onOdometerReadingChange?: (value: string) => void;
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
  const submissionId = useMemo(() => createSubmissionId(), []);

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
      <input type="hidden" name="submissionId" value={submissionId} />
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
      {type === "meeting" ? (
        <MeetingFields meetingManagers={meetingManagers} />
      ) : null}
      {type === "oil-change" ? (
        <OilChangeFields onOdometerReadingChange={onOdometerReadingChange} />
      ) : null}
      {state.status !== "idle" && state.status !== "success" ? (
        <p className="text-sm font-bold text-red-600">
          {t(`errors.${state.messageKey ?? "submitFailed"}`)}
        </p>
      ) : null}
      <RequestSubmitButton
        disabled={
          (requiresVehicle && !vehiclePlate) ||
          (type === "meeting" && meetingManagers.length === 0)
        }
        label={t("submit")}
        pendingLabel={t("sending")}
      />
    </form>
  );
}

function RequestSubmitButton({
  disabled,
  label,
  pendingLabel,
}: {
  disabled: boolean;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={pending}
      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[0.85rem] bg-primary px-5 text-sm font-bold text-white transition disabled:opacity-60"
    >
      {pending ? <Spinner /> : null}
      {pending ? pendingLabel : label}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
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

function MeetingFields({
  meetingManagers,
}: {
  meetingManagers: MeetingManagerOption[];
}) {
  const t = useTranslations("Requests");

  return (
    <>
      <Select
        name="requestedManagerUserId"
        label={t("fields.meetingWith")}
        required
      >
        <option value="">{t("fields.meetingWithPlaceholder")}</option>
        {meetingManagers.map((manager) => (
          <option key={manager.id} value={manager.id}>
            {formatMeetingManagerLabel(
              manager.displayName,
              manager.jobTitle,
              t("managerNotSpecified"),
            )}
          </option>
        ))}
      </Select>
      {meetingManagers.length === 0 ? (
        <p className="rounded-[0.85rem] border border-border bg-primary-soft/60 p-3 text-sm font-semibold text-muted">
          {t("emptyMeetingManagers")}
        </p>
      ) : null}
      <Input name="subject" label={t("fields.subject")} />
      <Textarea name="reason" label={t("fields.reason")} />
      <Input name="preferredDate" type="date" label={t("fields.preferredDate")} />
      <Input name="preferredTime" type="time" label={t("fields.preferredTime")} />
    </>
  );
}

function formatMeetingManagerLabel(
  displayName: string | null,
  jobTitle: string | null,
  fallback: string,
) {
  const parts = [displayName, jobTitle].filter(Boolean);

  return parts.length > 0 ? parts.join(" — ") : fallback;
}

function OilChangeFields({
  onOdometerReadingChange,
}: {
  onOdometerReadingChange?: (value: string) => void;
}) {
  const t = useTranslations("Requests");

  return (
    <>
      <Input
        name="odometerReading"
        inputMode="numeric"
        label={t("fields.odometerReading")}
        onChange={onOdometerReadingChange}
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
  onChange,
}: {
  name: string;
  label: string;
  type?: string;
  inputMode?: "numeric";
  onChange?: (value: string) => void;
}) {
  const dateInputClass =
    type === "date" ? " appearance-none [-webkit-appearance:none]" : "";

  return (
    <label className="block space-y-2 text-sm font-semibold text-navy">
      <span>{label}</span>
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        className={`min-h-12 w-full min-w-0 max-w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 text-base text-navy outline-none focus:border-primary focus:bg-white${dateInputClass}`}
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
  required = false,
  children,
}: {
  name: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold text-navy">
      <span>{label}</span>
      <select
        name={name}
        required={required}
        className="min-h-12 w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 text-base text-navy outline-none focus:border-primary focus:bg-white"
      >
        {children}
      </select>
    </label>
  );
}
