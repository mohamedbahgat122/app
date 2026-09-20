"use client";

import { useActionState, useEffect, useMemo, useState, type ComponentType } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { suppressNextRealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { CalendarIcon, CarIcon, FileTextIcon, GaugeIcon, OilWarningIcon, SendIcon, ShiftIcon, UserIcon, ClockIcon } from "@/components/app-shell/icons";
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
type RequestHeaderIcon = "leave" | "maintenance" | "meeting" | "oil-change";

const requestHeaderIcons = {
  leave: CalendarIcon,
  maintenance: CarIcon,
  meeting: UserIcon,
  "oil-change": OilWarningIcon,
} as const;

export function RequestPageHeader({
  icon,
  title,
  subtitle,
}: {
  icon: RequestHeaderIcon;
  title: string;
  subtitle: string;
}) {
  const Icon = requestHeaderIcons[icon];

  return (
    <div className="flex items-center gap-3 px-1">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <h1 className="text-xl font-bold text-navy">{title}</h1>
        <p className="mt-1 text-sm font-medium text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

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
  driverId,
  vehiclePlate,
  vehicleErrorCode,
  meetingManagers = [],
  onOdometerReadingChange,
}: {
  type: RequestFormType;
  driverId: string;
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
      suppressNextRealtimeRefresh({
        table: "driver_app_requests",
        filter: `driver_id=eq.${driverId}`,
        eventType: "INSERT",
      });
      router.push("/requests");
    }
  }, [driverId, router, state.status]);

  const requiresVehicle = type === "maintenance" || type === "oil-change";
  const vehicleMessageKey =
    type === "maintenance" && vehicleErrorCode
      ? vehicleErrorCode
      : "vehicleRequired";

  return (
    <form action={formAction} className="space-y-4 rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
      <input type="hidden" name="submissionId" value={submissionId} />
      {requiresVehicle ? (
        <div className="flex items-center gap-3 rounded-[0.85rem] bg-primary-soft/70 p-3 text-sm font-semibold text-navy">
          <CarIcon className="size-5 shrink-0 text-primary" />
          <span>{t("vehicle")}: {vehiclePlate ?? t("notAvailable")}</span>
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
      {pending ? <Spinner /> : <SendIcon className="size-4" />}
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
      <Select name="leaveType" label={t("fields.leaveType")} icon={CalendarIcon}>
        <option value="sick">{t("leaveTypes.sick")}</option>
        <option value="weekly">{t("leaveTypes.weekly")}</option>
        <option value="annual">{t("leaveTypes.annual")}</option>
      </Select>
      <Input name="startDate" type="date" label={t("fields.startDate")} icon={CalendarIcon} />
      <Input name="endDate" type="date" label={t("fields.endDate")} icon={CalendarIcon} />
      <Textarea name="reason" label={t("fields.reason")} icon={FileTextIcon} />
    </>
  );
}

function MaintenanceFields() {
  const t = useTranslations("Requests");

  return (
    <>
      <Input name="category" label={t("fields.category")} icon={CarIcon} />
      <Select name="urgency" label={t("fields.urgency")} icon={ShiftIcon}>
        <option value="normal">{t("urgency.normal")}</option>
        <option value="urgent">{t("urgency.urgent")}</option>
      </Select>
      <Textarea name="description" label={t("fields.description")} icon={FileTextIcon} />
    </>
  );
}

function MeetingFields({
  meetingManagers,
}: {
  meetingManagers: MeetingManagerOption[];
}) {
  const t = useTranslations("Requests");
  const [preferredTime, setPreferredTime] = useState("");
  const invalidTime = preferredTime !== "" && !isMeetingTimeWithinOfficeHours(preferredTime);

  return (
    <>
      <Select
        name="requestedManagerUserId"
        label={t("fields.meetingWith")}
        required
        icon={UserIcon}
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
      <Input name="subject" label={t("fields.subject")} icon={FileTextIcon} />
      <Textarea name="reason" label={t("fields.reason")} icon={FileTextIcon} />
      <Input name="preferredDate" type="date" label={t("fields.preferredDate")} icon={CalendarIcon} />
      <div className="min-w-0 max-w-full space-y-2">
        <Input
          name="preferredTime"
          type="time"
          label={t("fields.preferredTime")}
          icon={ClockIcon}
          min="10:00"
          max="20:00"
          value={preferredTime}
          onChange={setPreferredTime}
          ariaInvalid={invalidTime}
        />
        <div className="flex items-start gap-2 rounded-xl bg-primary-soft/60 px-3 py-2 text-xs font-semibold text-muted">
          <ClockIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="min-w-0 break-words">{t("officeHours")}: {t("officeHoursHelp")}</span>
        </div>
        {invalidTime ? <p className="break-words text-sm font-bold text-red-600">{t("errors.invalidMeetingTime")}</p> : null}
      </div>
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
        icon={GaugeIcon}
        onChange={onOdometerReadingChange}
      />
      <Textarea name="note" label={t("fields.note")} icon={FileTextIcon} />
    </>
  );
}

function Input({
  name,
  label,
  type = "text",
  inputMode,
  onChange,
  icon: Icon = FileTextIcon,
  min,
  max,
  value,
  ariaInvalid,
}: {
  name: string;
  label: string;
  type?: string;
  inputMode?: "numeric";
  onChange?: (value: string) => void;
  icon?: ComponentType<{ className?: string }>;
  min?: string;
  max?: string;
  value?: string;
  ariaInvalid?: boolean;
}) {
  const inputAppearanceClass =
    type === "date"
      ? " appearance-none [-webkit-appearance:none]"
      : type === "time"
        ? " appearance-none"
        : "";

  return (
    <label className="block min-w-0 max-w-full space-y-2 text-sm font-semibold text-navy">
      <span className="flex min-w-0 items-center gap-2 break-words"><Icon className="size-4 shrink-0 text-primary" />{label}</span>
      <input
        name={name}
        type={type}
        inputMode={inputMode}
        min={min}
        max={max}
        value={value}
        aria-invalid={ariaInvalid}
        onChange={(event) => onChange?.(event.currentTarget.value)}
        dir={type === "time" ? "ltr" : undefined}
        className={`box-border block min-h-12 w-full min-w-0 max-w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 text-base text-navy outline-none focus:border-primary focus:bg-white${inputAppearanceClass}`}
      />
    </label>
  );
}

function Textarea({ name, label, icon: Icon = FileTextIcon }: { name: string; label: string; icon?: ComponentType<{ className?: string }> }) {
  return (
    <label className="block min-w-0 max-w-full space-y-2 text-sm font-semibold text-navy">
      <span className="flex items-center gap-2"><Icon className="size-4 text-primary" />{label}</span>
      <textarea
        name={name}
        className="min-h-28 w-full min-w-0 max-w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 py-3 text-base text-navy outline-none focus:border-primary focus:bg-white"
      />
    </label>
  );
}

function Select({
  name,
  label,
  required = false,
  children,
  icon: Icon = FileTextIcon,
}: {
  name: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <label className="block min-w-0 max-w-full space-y-2 text-sm font-semibold text-navy">
      <span className="flex items-center gap-2"><Icon className="size-4 text-primary" />{label}</span>
      <select
        name={name}
        required={required}
        className="min-h-12 w-full min-w-0 max-w-full rounded-[0.85rem] border border-border bg-primary-soft/60 px-4 text-base text-navy outline-none focus:border-primary focus:bg-white"
      >
        {children}
      </select>
    </label>
  );
}

function isMeetingTimeWithinOfficeHours(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hours, minutes] = value.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes;
  return hours <= 23 && minutes <= 59 && totalMinutes >= 600 && totalMinutes <= 1200;
}
