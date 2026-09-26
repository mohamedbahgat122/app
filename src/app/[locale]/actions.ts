"use server";

import { redirect } from "next/navigation";
import { isLocale, type Locale } from "@/config/locales";
import {
  normalizeIqamaLoginIdentifier,
} from "@/lib/auth/driver-identity";
import { getVerifiedDriverSession } from "@/lib/auth/driver-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRiyadhDateString } from "@/lib/app/shift-change-window";
import { isMaintenanceCategory } from "@/lib/app/maintenance-categories";
import {
  isOilChangeCategory,
  normalizeOilChangeCategories,
} from "@/lib/app/oil-change-categories";
import type { Database } from "@/types/database";

export type LoginActionState = {
  resetKey?: string;
  status:
    | "idle"
    | "validation_error"
    | "invalid_credentials"
    | "unauthorized"
    | "application_error"
    | "configuration_error";
  messageKey?: string;
};

export type ChangePasswordActionState = {
  resetKey?: string;
  status:
    | "idle"
    | "validation_error"
    | "auth_error"
    | "update_failed"
    | "finalization_required";
  messageKey?: string;
};

export type DriverRequestActionState = {
  resetKey?: string;
  status:
    | "idle"
    | "success"
    | "validation_error"
    | "auth_error"
    | "submit_failed"
    | "request_table_missing"
    | "request_validation_failed"
    | "request_insert_failed"
    | "request_permission_denied"
    | "request_type_not_supported";
  messageKey?: string;
};

export type OrderShiftChangeActionState = {
  resetKey?: string;
  status: "idle" | "success" | "validation_error" | "auth_error" | "submit_failed";
  messageKey?: string;
};

type MaintenanceRequestRpcArgs = Extract<
  Database["public"]["Functions"]["submit_driver_maintenance_request"]["Args"],
  { p_maintenance_categories: string[] }
>;
type OilChangeRequestRpcArgs = Extract<
  Database["public"]["Functions"]["submit_driver_oil_change_request"]["Args"],
  { p_oil_change_categories: string[] }
>;

export async function loginDriverAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const localeValue = formData.get("locale")?.toString();
  const locale: Locale =
    localeValue && isLocale(localeValue) ? localeValue : "ar";
  const rawResidencyNumber = formData.get("residencyNumber")?.toString() ?? "";
  const residencyNumber = normalizeIqamaLoginIdentifier(rawResidencyNumber);
  const password = formData.get("password")?.toString() ?? "";

  if (!rawResidencyNumber.trim()) {
    return {
      resetKey: Date.now().toString(),
      status: "validation_error",
      messageKey: "residencyNumberRequired",
    };
  }

  if (!residencyNumber) {
    return invalidLoginState();
  }

  if (!password) {
    return invalidLoginState();
  }

  let supabase;
  let admin;

  try {
    supabase = await createSupabaseServerClient();
    admin = createSupabaseAdminClient();
  } catch {
    return {
      resetKey: Date.now().toString(),
      status: "configuration_error",
      messageKey: "networkError",
    };
  }

  const { data: identifier, error: identifierError } = await admin
    .from("driver_login_identifiers")
    .select("driver_id")
    .eq("identifier_type", "iqama")
    .eq("identifier_normalized", residencyNumber)
    .maybeSingle();

  if (identifierError || !identifier) {
    return invalidLoginState();
  }

  const { data: driver, error: driverError } = await admin
    .from("drivers")
    .select("id, auth_user_id, status, deleted_at")
    .eq("id", identifier.driver_id)
    .maybeSingle();

  if (
    driverError ||
    !driver ||
    driver.deleted_at ||
    driver.status !== "active" ||
    !driver.auth_user_id
  ) {
    return invalidLoginState();
  }

  const { data: authUser, error: authUserError } =
    await admin.auth.admin.getUserById(driver.auth_user_id);
  const authEmail = authUser.user?.email?.trim();

  if (authUserError || !authEmail) {
    return invalidLoginState();
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });

  if (error) {
    return invalidLoginState();
  }

  const sessionResult = await getVerifiedDriverSession(supabase);

  if (sessionResult.status !== "verified") {
    await supabase.auth.signOut();

    return {
      resetKey: Date.now().toString(),
      status:
        sessionResult.status === "application_error"
          ? "application_error"
          : "invalid_credentials",
      messageKey:
        sessionResult.status === "application_error"
          ? "applicationError"
          : "invalidCredentials",
    };
  }

  redirect(
    sessionResult.session.mustChangePassword
      ? `/${locale}/change-password`
      : `/${locale}/home`,
  );
}

function invalidLoginState(): LoginActionState {
  return {
    resetKey: Date.now().toString(),
    status: "invalid_credentials",
    messageKey: "invalidCredentials",
  };
}

export async function logoutDriverAction(formData: FormData) {
  const localeValue = formData.get("locale")?.toString();
  const locale: Locale =
    localeValue && isLocale(localeValue) ? localeValue : "ar";
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut();

  redirect(`/${locale}`);
}

export async function changeDriverPasswordAction(
  _previousState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const locale = getLocaleFromFormData(formData);
  const newPassword = formData.get("newPassword")?.toString() ?? "";
  const confirmPassword = formData.get("confirmPassword")?.toString() ?? "";

  const validationMessageKey = validateNewPassword(
    newPassword,
    confirmPassword,
  );

  if (validationMessageKey) {
    return {
      resetKey: Date.now().toString(),
      status: "validation_error",
      messageKey: validationMessageKey,
    };
  }

  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (sessionResult.status !== "verified") {
    return {
      resetKey: Date.now().toString(),
      status: "auth_error",
      messageKey: "sessionUnavailable",
    };
  }

  if (!sessionResult.session.mustChangePassword) {
    redirect(`/${locale}/home`);
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (updateError) {
    return {
      resetKey: Date.now().toString(),
      status: "update_failed",
      messageKey: "updateFailed",
    };
  }

  return completePasswordChangeFlag(supabase, locale);
}

export async function retryCompleteDriverPasswordChangeAction(
  _previousState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const locale = getLocaleFromFormData(formData);
  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (sessionResult.status !== "verified") {
    return {
      status: "auth_error",
      messageKey: "sessionUnavailable",
    };
  }

  if (!sessionResult.session.mustChangePassword) {
    redirect(`/${locale}/home`);
  }

  return completePasswordChangeFlag(supabase, locale);
}

export async function submitLeaveRequestAction(
  _previousState: DriverRequestActionState,
  formData: FormData,
): Promise<DriverRequestActionState> {
  const submissionId = formData.get("submissionId")?.toString() ?? "";
  const leaveType = formData.get("leaveType")?.toString() ?? "";
  const startDate = formData.get("startDate")?.toString() ?? "";
  const endDate = formData.get("endDate")?.toString() ?? "";
  const reason = formData.get("reason")?.toString().trim() ?? "";

  if (!isUuid(submissionId)) {
    return requestValidation("submitFailed");
  }

  if (
    !["sick", "weekly", "annual"].includes(leaveType) ||
    !isDate(startDate) ||
    !isDate(endDate) ||
    endDate < startDate ||
    !reason
  ) {
    return requestValidation("invalidLeave");
  }

  return submitRequestRpc("submit_driver_leave_request", {
    p_leave_type: leaveType,
    p_start_date: startDate,
    p_end_date: endDate,
    p_reason: reason,
    p_submission_id: submissionId,
  });
}

export async function submitMaintenanceRequestAction(
  _previousState: DriverRequestActionState,
  formData: FormData,
): Promise<DriverRequestActionState> {
  const submissionId = formData.get("submissionId")?.toString() ?? "";
  const categories = Array.from(
    new Set(
      formData
        .getAll("categories")
        .map((value) => value.toString().trim())
        .filter(Boolean),
    ),
  );
  const urgency = formData.get("urgency")?.toString() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";

  if (!isUuid(submissionId)) {
    return requestValidation("submitFailed");
  }

  if (
    categories.length === 0 ||
    categories.some((category) => !isMaintenanceCategory(category)) ||
    !["normal", "urgent"].includes(urgency) ||
    !description
  ) {
    return requestValidation("invalidMaintenance");
  }

  return submitRequestRpc("submit_driver_maintenance_request", {
    p_maintenance_categories: categories,
    p_urgency: urgency,
    p_problem_description: description,
    p_submission_id: submissionId,
  });
}

export async function submitMeetingRequestAction(
  _previousState: DriverRequestActionState,
  formData: FormData,
): Promise<DriverRequestActionState> {
  const submissionId = formData.get("submissionId")?.toString() ?? "";
  const subject = formData.get("subject")?.toString().trim() ?? "";
  const reason = formData.get("reason")?.toString().trim() ?? "";
  const requestedManagerUserId =
    formData.get("requestedManagerUserId")?.toString() ?? "";
  const preferredDate = formData.get("preferredDate")?.toString() ?? "";
  const preferredTime = formData.get("preferredTime")?.toString() ?? "";

  if (!isUuid(submissionId)) {
    return requestValidation("submitFailed");
  }

  if (!subject || !reason) {
    return requestValidation("invalidMeeting");
  }

  if (!isUuid(requestedManagerUserId)) {
    return requestValidation("meeting_manager_required");
  }

  if (preferredTime && !isMeetingTimeWithinOfficeHours(preferredTime)) {
    return requestValidation("invalidMeetingTime");
  }

  return submitRequestRpc("submit_driver_meeting_request", {
    p_subject: subject,
    p_reason: reason,
    p_requested_manager_user_id: requestedManagerUserId,
    p_preferred_date: isDate(preferredDate) ? preferredDate : undefined,
    p_preferred_time: preferredTime || undefined,
    p_submission_id: submissionId,
  });
}

function isMeetingTimeWithinOfficeHours(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;

  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) return false;

  const totalMinutes = hours * 60 + minutes;
  return totalMinutes >= 10 * 60 && totalMinutes <= 20 * 60;
}

export async function submitOilChangeRequestAction(
  _previousState: DriverRequestActionState,
  formData: FormData,
): Promise<DriverRequestActionState> {
  const submissionId = formData.get("submissionId")?.toString() ?? "";
  const readingText = formData.get("odometerReading")?.toString() ?? "";
  const note = formData.get("note")?.toString().trim() ?? "";
  const rawCategories = formData
    .getAll("oilCategories")
    .map((value) => value.toString().trim());
  const categories = normalizeOilChangeCategories(rawCategories);

  if (!isUuid(submissionId)) {
    return requestValidation("submitFailed");
  }

  if (
    categories.length === 0 ||
    rawCategories.some((category) => !isOilChangeCategory(category))
  ) {
    return requestValidation("submitFailed");
  }

  if (!/^\d+$/.test(readingText)) {
    return requestValidation("invalidOdometer");
  }

  const reading = Number(readingText);

  if (!Number.isSafeInteger(reading) || reading < 0) {
    return requestValidation("invalidOdometer");
  }

  return submitRequestRpc("submit_driver_oil_change_request", {
    p_oil_change_categories: categories,
    p_current_odometer_reading: reading,
    p_note: note || undefined,
    p_submission_id: submissionId,
  });
}

async function completePasswordChangeFlag(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  locale: Locale,
): Promise<ChangePasswordActionState> {
  const { error: rpcError } = await supabase.rpc(
    "complete_driver_password_change",
  );

  if (rpcError) {
    console.error("[driver-auth:password-change]", {
      stage: "complete-password-change",
      code: rpcError.code,
      message: rpcError.message,
    });

    return {
      resetKey: Date.now().toString(),
      status: "finalization_required",
      messageKey: "finalizationRequired",
    };
  }

  const refreshedSession = await getVerifiedDriverSession(supabase);

  if (
    refreshedSession.status !== "verified" ||
    refreshedSession.session.mustChangePassword
  ) {
    return {
      resetKey: Date.now().toString(),
      status: "finalization_required",
      messageKey: "finalizationRequired",
    };
  }

  redirect(`/${locale}/home`);
}

function getLocaleFromFormData(formData: FormData): Locale {
  const localeValue = formData.get("locale")?.toString();

  return localeValue && isLocale(localeValue) ? localeValue : "ar";
}

function validateNewPassword(newPassword: string, confirmPassword: string) {
  if (!newPassword || !confirmPassword) {
    return "required";
  }

  if (newPassword !== confirmPassword) {
    return "mismatch";
  }

  if (
    newPassword.length < 8 ||
    newPassword.length > 128 ||
    ["password", "12345678", "qwerty123"].includes(newPassword.toLowerCase())
  ) {
    return "weak";
  }

  return null;
}

async function submitRequestRpc(
  ...request:
    | [
        "submit_driver_leave_request",
        Database["public"]["Functions"]["submit_driver_leave_request"]["Args"],
      ]
    | [
        "submit_driver_maintenance_request",
        MaintenanceRequestRpcArgs,
      ]
    | [
        "submit_driver_meeting_request",
        Database["public"]["Functions"]["submit_driver_meeting_request"]["Args"],
      ]
    | [
        "submit_driver_oil_change_request",
        OilChangeRequestRpcArgs,
      ]
): Promise<DriverRequestActionState> {
  const [rpcName, args] = request;
  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (sessionResult.status !== "verified" || sessionResult.session.mustChangePassword) {
    logDriverRequestDiagnostic({
      stage: "session",
      rpcName,
      requestType: getRequestTypeFromRpc(rpcName),
      error: {
        message: sessionResult.status,
      },
    });

    return {
      resetKey: Date.now().toString(),
      status: "auth_error",
      messageKey: "sessionUnavailable",
    };
  }

  const { error } =
    rpcName === "submit_driver_leave_request"
      ? await supabase.rpc(rpcName, args)
      : rpcName === "submit_driver_maintenance_request"
        ? await supabase.rpc(rpcName, args)
        : rpcName === "submit_driver_meeting_request"
          ? await supabase.rpc(rpcName, args)
          : await supabase.rpc(rpcName, args);

  if (error) {
    logDriverRequestDiagnostic({
      stage: "rpc",
      rpcName,
      requestType: getRequestTypeFromRpc(rpcName),
      leaveType:
        rpcName === "submit_driver_leave_request" && "p_leave_type" in args
          ? args.p_leave_type
          : undefined,
      authUserId: sessionResult.session.userId,
      driverId: sessionResult.session.driver.id,
      organizationId: sessionResult.session.organization?.id,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      },
    });
    const mappedError = mapRequestError(error);

    return {
      resetKey: Date.now().toString(),
      status: mappedError.status,
      messageKey: mappedError.messageKey,
    };
  }

  return {
    resetKey: Date.now().toString(),
    status: "success",
    messageKey: "submitted",
  };
}

function requestValidation(messageKey: string): DriverRequestActionState {
  return {
    resetKey: Date.now().toString(),
    status: "validation_error",
    messageKey,
  };
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapRequestError(error: { code?: string; message: string }) {
  const match = error.message.match(/APP_REQUEST_[A-Z_]+/);
  const vehicleError = error.message.match(
    /vehicle_(?:not_linked|not_found|ambiguous|inactive|organization_mismatch)/,
  );
  const meetingManagerError = error.message.match(
    /meeting_manager_(?:required|not_found|inactive|not_authorized|organization_mismatch)/,
  );

  if (vehicleError) {
    return {
      status: "request_validation_failed" as const,
      messageKey: vehicleError[0],
    };
  }

  if (meetingManagerError) {
    return {
      status: "request_validation_failed" as const,
      messageKey: meetingManagerError[0],
    };
  }

  if (match?.[0] === "APP_REQUEST_VEHICLE_REQUIRED") {
    return { status: "request_validation_failed" as const, messageKey: "vehicleRequired" };
  }

  if (match?.[0] === "APP_REQUEST_ODOMETER_BELOW_LATEST") {
    return { status: "request_validation_failed" as const, messageKey: "odometerBelowLatest" };
  }

  if (match?.[0] === "APP_REQUEST_INVALID_LEAVE_TYPE") {
    return { status: "request_type_not_supported" as const, messageKey: "invalidLeave" };
  }

  if (
    match?.[0] === "APP_REQUEST_INVALID_DATE_RANGE" ||
    match?.[0] === "APP_REQUEST_REASON_REQUIRED"
  ) {
    return { status: "request_validation_failed" as const, messageKey: "invalidLeave" };
  }

  if (error.code === "42P01" || error.code === "42883") {
    return { status: "request_table_missing" as const, messageKey: "submitFailed" };
  }

  if (error.code === "42501") {
    return { status: "request_permission_denied" as const, messageKey: "submitFailed" };
  }

  return { status: "request_insert_failed" as const, messageKey: "submitFailed" };
}

function getRequestTypeFromRpc(
  rpcName: Parameters<typeof submitRequestRpc>[0],
) {
  return rpcName === "submit_driver_leave_request"
    ? "leave"
    : rpcName === "submit_driver_maintenance_request"
      ? "maintenance"
      : rpcName === "submit_driver_meeting_request"
        ? "meeting"
        : "oil_change";
}

function logDriverRequestDiagnostic({
  stage,
  rpcName,
  requestType,
  leaveType,
  authUserId,
  driverId,
  organizationId,
  error,
}: {
  stage: "session" | "rpc";
  rpcName: string;
  requestType: "leave" | "maintenance" | "meeting" | "oil_change";
  leaveType?: string;
  authUserId?: string;
  driverId?: string;
  organizationId?: string;
  error: {
    code?: string;
    message: string;
    details?: string | null;
    hint?: string | null;
  };
}) {
  if (process.env.NODE_ENV === "production") return;

  console.error("[driver-app:request-submit]", {
    stage,
    rpcName,
    requestType,
    leaveType,
    authUserIdSuffix: safeSuffix(authUserId),
    driverIdSuffix: safeSuffix(driverId),
    organizationIdSuffix: safeSuffix(organizationId),
    error,
  });
}

function safeSuffix(value: string | null | undefined) {
  return value ? value.slice(-8) : "";
}

export async function submitShiftChangeRequestAction(
  _previousState: DriverRequestActionState,
  formData: FormData,
): Promise<DriverRequestActionState> {
  const currentShiftId = formData.get("currentShiftId")?.toString() ?? "";
  const requestedShiftId = formData.get("requestedShiftId")?.toString() ?? "";
  const driverNote = formData.get("driverNote")?.toString().trim() ?? "";
  const requestedWeekStartDate =
    formData.get("requestedWeekStartDate")?.toString() ?? "";

  if (!currentShiftId || !requestedShiftId) {
    return {
      status: "validation_error",
      messageKey: "allFieldsRequired",
    };
  }

  if (!isDate(requestedWeekStartDate)) {
    return {
      status: "validation_error",
      messageKey: "shiftChangeWindowClosed",
    };
  }

  if (currentShiftId === requestedShiftId) {
    return {
      status: "validation_error",
      messageKey: "sameShiftError",
    };
  }

  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (sessionResult.status !== "verified" || sessionResult.session.mustChangePassword) {
    return {
      status: "auth_error",
      messageKey: "unauthorized",
    };
  }

  const driver = sessionResult.session.driver;
  const organizationId = sessionResult.session.organization?.id;

  if (!organizationId) {
    return {
      status: "submit_failed",
      messageKey: "noOrganization",
    };
  }

  const today = getRiyadhDateString();
  const { data: effectiveAssignment, error: assignmentError } = await supabase
    .from("organization_shift_assignments")
    .select("shift_template_id")
    .eq("driver_id", driver.id)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .or(`assignment_start_date.is.null,assignment_start_date.lte.${today}`)
    .or(`assignment_end_date.is.null,assignment_end_date.gte.${today}`)
    .order("assignment_start_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (assignmentError || effectiveAssignment?.shift_template_id !== currentShiftId) {
    return {
      status: "submit_failed",
      messageKey: "currentShiftChanged",
    };
  }

  const { data: requestedShift, error: requestedShiftError } = await supabase
    .from("organization_shift_templates")
    .select("id")
    .eq("id", requestedShiftId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .is("archived_at", null)
    .not("published_at", "is", null)
    .maybeSingle();

  if (requestedShiftError || !requestedShift) {
    return {
      status: "validation_error",
      messageKey: "requestedShiftUnavailable",
    };
  }

  // Verify pending requests
  const { data: actionableRequests, error: pendingError } = await supabase
    .from("driver_shift_change_requests")
    .select("id")
    .eq("driver_id", driver.id)
    .eq("requested_week_start_date", requestedWeekStartDate)
    .in("status", ["pending", "approved"]);

  if (pendingError) {
    return {
      status: "submit_failed",
      messageKey: "networkError",
    };
  }

  if (actionableRequests && actionableRequests.length > 0) {
    return {
      status: "validation_error",
      messageKey: "alreadyHasActionable",
    };
  }

  // Insert request
  const { error: insertError } = await supabase
    .from("driver_shift_change_requests")
    .insert({
      driver_id: driver.id,
      organization_id: organizationId,
      current_shift_id: currentShiftId,
      requested_shift_id: requestedShiftId,
      requested_week_start_date: requestedWeekStartDate,
      driver_note: driverNote || null,
      status: "pending",
    });

  if (insertError) {
    console.error("submitShiftChangeRequestAction insert error:", insertError);
    return {
      status: "submit_failed",
      messageKey:
        insertError.code === "42501"
          ? "shiftChangeWindowClosed"
          : "insertFailed",
    };
  }

  return {
    status: "success",
  };
}

export async function submitOrderShiftChangeRequestAction(
  _previousState: OrderShiftChangeActionState,
  formData: FormData,
): Promise<OrderShiftChangeActionState> {
  const requestedTemplateId = formData.get("requestedOrderPeriodTemplateId")?.toString() ?? "";
  const reason = formData.get("reason")?.toString().trim() ?? "";

  if (!requestedTemplateId) {
    return { status: "validation_error", messageKey: "templateRequired" };
  }
  if (reason.length > 2000) {
    return { status: "validation_error", messageKey: "reasonTooLong" };
  }

  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (
    sessionResult.status !== "verified" ||
    sessionResult.session.mustChangePassword ||
    sessionResult.session.driver.settlementType !== "per_order"
  ) {
    return { status: "auth_error", messageKey: "unauthorized" };
  }

  const rpc = (supabase.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { code?: string; message?: string; details?: string; hint?: string } | null }>).bind(supabase);
  const { data, error } = await rpc("create_my_order_shift_change_request", {
    p_requested_order_period_template_id: requestedTemplateId,
    p_reason: reason || null,
  });

  if (error) {
    console.error("[driver-app:order-shift-change-submit]", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { status: "submit_failed", messageKey: "submitFailed" };
  }

  const result = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (result?.success === true) {
    return { resetKey: Date.now().toString(), status: "success" };
  }

  return {
    status: "submit_failed",
    messageKey: mapOrderShiftChangeError(
      typeof result?.error === "string" ? result.error : "",
    ),
  };
}

function mapOrderShiftChangeError(error: string) {
  switch (error) {
    case "ORDER_SHIFT_CHANGE_DAY_NOT_ALLOWED":
      return "dayNotAllowed";
    case "ORDER_SHIFT_CHANGE_PENDING_REQUEST_EXISTS":
    case "ORDER_SHIFT_CHANGE_TARGET_ALREADY_REQUESTED":
      return "alreadyRequested";
    case "ORDER_SHIFT_CHANGE_TEMPLATE_INVALID":
      return "templateUnavailable";
    case "ORDER_SHIFT_CHANGE_NO_CURRENT_ASSIGNMENT":
      return "noCurrentAssignment";
    case "ORDER_SHIFT_CHANGE_TEMPLATE_UNCHANGED":
      return "sameTemplate";
    default:
      return "submitFailed";
  }
}
