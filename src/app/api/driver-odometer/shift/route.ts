import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  resolveRepresentativeContext,
  type RepresentativeContextCode,
} from "@/lib/app/representative-context";
import {
  verifyOdometerPhoto,
  type OdometerPhotoCrop,
  type OdometerVerificationResult,
} from "@/server/odometer/photo-verification";
import type { Database } from "@/types/database";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 45;

type ShiftAction = "start" | "end";
type DriverShiftInsert = Database["public"]["Tables"]["driver_shifts"]["Insert"];
type DriverShiftUpdate = Database["public"]["Tables"]["driver_shifts"]["Update"];
type SupabaseAdminClient = SupabaseClient<Database>;
type ForbiddenCode =
  | RepresentativeContextCode
  | "image_path_forbidden"
  | "image_owner_mismatch";

type RequestBody = {
  action?: unknown;
  photoPath?: unknown;
  photoCapturedAt?: unknown;
  photoCrop?: unknown;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const photoPath = searchParams.get("photoPath");

  if (!action || !photoPath) {
    return NextResponse.json({ ok: false, reason: "invalid_request" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, reason: "session_expired" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  if (action === "start") {
    const { data } = await admin
      .from("driver_shifts")
      .select("id, status, start_odometer_reading, start_ocr_confidence")
      .eq("driver_id", user.id)
      .eq("start_photo_path", photoPath)
      .maybeSingle();

    if (data) {
      return NextResponse.json({
        ok: true,
        detectedReading: data.start_odometer_reading,
        confidence: data.start_ocr_confidence,
      });
    }
  } else if (action === "end") {
    const { data } = await admin
      .from("driver_shifts")
      .select("id, status, end_odometer_reading, end_ocr_confidence")
      .eq("driver_id", user.id)
      .eq("end_photo_path", photoPath)
      .maybeSingle();

    if (data && data.end_odometer_reading !== null) {
      return NextResponse.json({
        ok: true,
        detectedReading: data.end_odometer_reading,
        confidence: data.end_ocr_confidence,
      });
    }
  }

  return NextResponse.json({ ok: false, reason: "not_found" });
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let stage = "request_received";
  let photoPath = "";
  let admin: SupabaseAdminClient | null = null;

  try {
    logStage(requestId, stage);
    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const action = body?.action === "start" || body?.action === "end" ? body.action : null;
    photoPath = typeof body?.photoPath === "string" ? body.photoPath : "";
    const photoCapturedAt =
      typeof body?.photoCapturedAt === "string" ? body.photoCapturedAt : "";
    const photoCrop = parsePhotoCrop(body?.photoCrop);

    if (!action || !photoPath || !photoCapturedAt) {
      return jsonError("invalid_request", 400);
    }

    stage = "auth_validated";
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("session_expired", 401);
    }

    logStage(requestId, stage);

    admin = createSupabaseAdminClient();

    const driverContext = await resolveRepresentativeContext(admin, user.id, {
      enforcePasswordChange: true,
      requireVehicle: true,
      organizationSupabase: supabase,
      onStage: (contextStage) => {
        stage = contextStage;
        logStage(requestId, contextStage);
      },
      onWarning: (code, details) => {
        logConfigurationWarning(requestId, code, details);
      },
      onFailure: (code, details) => {
        logContextFailure(requestId, code, details);
      },
    });

    if (driverContext.status !== "ready") {
      if (isOwnedOdometerPath(photoPath, user.id)) {
        await cleanupPhoto(photoPath, admin);
      }
      return forbidden(requestId, driverContext.stage, driverContext.status);
    }
    logStage(requestId, "representative_context_resolved");

    stage = "image_path_validation";
    logStage(requestId, "image_path_validation_started");
    if (!isOdometerPathShape(photoPath)) {
      return forbidden(requestId, stage, "image_path_forbidden");
    }
    logStage(requestId, "image_path_validated");

    stage = "image_ownership_validation";
    logStage(requestId, "image_ownership_validation_started");
    if (!isOwnedOdometerPath(photoPath, user.id)) {
      await cleanupPhoto(photoPath, admin);
      return forbidden(requestId, stage, "image_owner_mismatch");
    }
    logStage(requestId, "image_ownership_validated");

    stage = "image_downloaded";
    const { data, error } = await admin.storage.from("driver-odometer").download(photoPath);
    if (error || !data) throw new Error("ODOMETER_IMAGE_DOWNLOAD_FAILED");
    logStage(requestId, stage);

    stage = "server_ocr_started";
    logStage(requestId, stage);
    const image = Buffer.from(await data.arrayBuffer());
    const currentShiftStartReading =
      action === "end"
        ? await loadOpenShiftStartReading({
            driverId: driverContext.driver.id,
            organizationId: driverContext.driver.organization_id,
            supabase: admin,
          })
        : null;

    const verification = await verifyOdometerPhoto({
      action,
      crop: null, // Full dashboard pipeline
      currentShiftStartReading,
      driverId: driverContext.driver.id,
      image,
      supabase: admin,
      vehicleId: driverContext.vehicle?.id ?? null,
    });

    if (!verification.accepted) {
      await cleanupPhoto(photoPath, admin);
      logOcrRejected(requestId, verification);
      return jsonError(mapOcrRejectionCode(verification.rejectionReason), 422);
    }
    logStage(requestId, "server_ocr_completed");
    logStage(requestId, "server_ocr_accepted");

    const shift =
      action === "start"
        ? await startShift({
            driver: driverContext.driver,
            vehicle: driverContext.vehicle,
            reading: verification.detectedReading,
            verification,
            photoPath,
            photoCapturedAt,
            supabase: admin,
          })
        : await endShift({
            driverId: driverContext.driver.id,
            organizationId: driverContext.driver.organization_id,
            reading: verification.detectedReading,
            verification,
            photoPath,
            photoCapturedAt,
            supabase: admin,
          });

    stage = "shift_saved";
    logStage(requestId, stage);

    if (action === "start") {
      console.info("[odometer-shift] shift_start_saved", { shiftId: shift.id, reading: verification.detectedReading });
    } else {
      console.info("[odometer-shift] shift_end_saved", { shiftId: shift.id, reading: verification.detectedReading });
    }

    await recordActivity({
      action:
        action === "start"
          ? "driver_shift_start_submitted_for_review"
          : "driver_shift_end_submitted_for_review",
      userId: user.id,
      organizationId: driverContext.driver.organization_id,
      driverId: driverContext.driver.id,
      vehicleId: driverContext.vehicle?.id ?? null,
      shiftId: shift.id,
      shiftAction: action,
      supabase: admin,
    });
    await recordActivity({
      action: action === "start" ? "driver_shift_started" : "driver_shift_completed",
      userId: user.id,
      organizationId: driverContext.driver.organization_id,
      driverId: driverContext.driver.id,
      vehicleId: driverContext.vehicle?.id ?? null,
      shiftId: shift.id,
      shiftAction: action,
      supabase: admin,
    });

    logStage(requestId, "response_sent");
    return NextResponse.json({
      ok: true,
      status: "pending_review",
      reviewStatus: "pending_review",
      detectedReading: verification.detectedReading,
      confidence: verification.confidence,
      shift,
    });
  } catch (error) {
    // We intentionally removed cleanupPhoto from this global catch block.
    // If we crash here (e.g. during DB save or activity logging), the photo remains in storage
    // so it can be reconciled or recovered. It is only cleaned up early if OCR definitively rejects it.
    logFailure(requestId, stage, error);
    const { code, status } = mapServerError(error);
    return jsonError(code, status);
  }
}

async function startShift({
  driver,
  vehicle,
  reading,
  verification,
  photoPath,
  photoCapturedAt,
  supabase,
}: {
  driver: {
    id: string;
    organization_id: string;
    keeta_vehicle_plate_number: string | null;
    vehicle_number: string | null;
  };
  vehicle: { id: string; plate_number: string | null } | null;
  reading: number;
  verification: Extract<OdometerVerificationResult, { accepted: true }>;
  photoPath: string;
  photoCapturedAt: string;
  supabase: SupabaseAdminClient;
}) {
  const { data: existing } = await supabase
    .from("driver_shifts")
    .select("id, start_photo_path")
    .eq("driver_id", driver.id)
    .eq("status", "open")
    .maybeSingle();

  if (existing) {
    // If the open shift was started with the exact same photo, treat as successful duplicate.
    if (existing.start_photo_path === photoPath) {
      return existing;
    }
    throw new Error("SHIFT_OPEN_EXISTS");
  }

  const insert: DriverShiftInsert = {
    driver_id: driver.id,
    organization_id: driver.organization_id,
    vehicle_id: vehicle?.id ?? null,
    vehicle_plate_snapshot:
      vehicle?.plate_number ?? driver.keeta_vehicle_plate_number ?? driver.vehicle_number ?? "",
    status: "open",
    start_odometer_reading: reading,
    start_photo_path: photoPath,
    start_photo_captured_at: photoCapturedAt,
    start_ocr_confidence: verification.confidence,
    start_ocr_provider: "tesseract.js",
    start_ocr_reading: verification.rawDigits,
    start_review_status: "pending_review",
    start_verified_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("driver_shifts")
    .insert(insert)
    .select("id, status, started_at, start_odometer_reading, start_photo_captured_at, start_review_status, vehicle_plate_snapshot")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function endShift({
  driverId,
  organizationId,
  reading,
  verification,
  photoPath,
  photoCapturedAt,
  supabase,
}: {
  driverId: string;
  organizationId: string;
  reading: number;
  verification: Extract<OdometerVerificationResult, { accepted: true }>;
  photoPath: string;
  photoCapturedAt: string;
  supabase: SupabaseAdminClient;
}) {
  const { data: openShift } = await supabase
    .from("driver_shifts")
    .select("id, start_odometer_reading")
    .eq("driver_id", driverId)
    .eq("status", "open")
    .maybeSingle();

  if (!openShift) {
    // Check if there is already a completed shift with the exact same end photo
    const { data: recentlyCompleted } = await supabase
      .from("driver_shifts")
      .select("id")
      .eq("driver_id", driverId)
      .eq("end_photo_path", photoPath)
      .maybeSingle();

    if (recentlyCompleted) {
      return recentlyCompleted;
    }
    throw new Error("SHIFT_NO_OPEN_SHIFT");
  }
  
  if (reading < openShift.start_odometer_reading) throw new Error("SHIFT_END_BELOW_START");

  const update: DriverShiftUpdate = {
    status: "completed",
    ended_at: new Date().toISOString(),
    end_odometer_reading: reading,
    end_photo_path: photoPath,
    end_photo_captured_at: photoCapturedAt,
    end_ocr_confidence: verification.confidence,
    end_ocr_provider: "tesseract.js",
    end_ocr_reading: verification.rawDigits,
    end_review_status: "pending_review",
    end_verified_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("driver_shifts")
    .update(update)
    .eq("id", openShift.id)
    .eq("driver_id", driverId)
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .select("id, status, started_at, ended_at, start_odometer_reading, end_odometer_reading, end_photo_captured_at, end_review_status, vehicle_plate_snapshot")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

async function recordActivity({
  action,
  userId,
  organizationId,
  driverId,
  vehicleId,
  shiftId,
  shiftAction,
  supabase,
}: {
  action: string;
  userId: string;
  organizationId: string;
  driverId: string;
  vehicleId: string | null;
  shiftId: string | null;
  shiftAction: ShiftAction;
  supabase: SupabaseAdminClient;
}) {
  try {
    await supabase.from("activity_logs").insert({
      actor_user_id: userId,
      target_user_id: null,
      organization_id: organizationId,
      action,
      entity_type: "driver_shift",
      entity_id: shiftId ?? driverId,
      after_data: {
        driver_id: driverId,
        vehicle_id: vehicleId,
        shift_action: shiftAction,
        review_status: "pending_review",
      },
      metadata: { source: "driver_pwa_odometer" },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[odometer-shift] activity_log_failed", {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function loadOpenShiftStartReading({
  driverId,
  organizationId,
  supabase,
}: {
  driverId: string;
  organizationId: string;
  supabase: SupabaseAdminClient;
}) {
  const { data, error } = await supabase
    .from("driver_shifts")
    .select("start_odometer_reading")
    .eq("driver_id", driverId)
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("SHIFT_NO_OPEN_SHIFT");

  return data.start_odometer_reading;
}

async function cleanupPhoto(path: string, supabase: SupabaseAdminClient | null) {
  if (!path) return;
  if (!supabase) return;
  try {
    await supabase.storage.from("driver-odometer").remove([path]);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[odometer-shift] cleanup_failed", {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function parsePhotoCrop(value: unknown): OdometerPhotoCrop | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<Record<keyof OdometerPhotoCrop, unknown>>;
  const crop = {
    x: Number(candidate.x),
    y: Number(candidate.y),
    width: Number(candidate.width),
    height: Number(candidate.height),
  };

  if (
    Number.isFinite(crop.x) &&
    Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) &&
    Number.isFinite(crop.height) &&
    crop.x >= 0 &&
    crop.y >= 0 &&
    crop.width > 0 &&
    crop.height > 0 &&
    crop.x + crop.width <= 1 &&
    crop.y + crop.height <= 1
  ) {
    return crop;
  }

  return null;
}

function isOwnedOdometerPath(path: string, userId: string) {
  return (
    path === path.trim() &&
    path.startsWith(`${userId}/`) &&
    isOdometerPathShape(path)
  );
}

function isOdometerPathShape(path: string) {
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(?:start|end)\.jpg$/i.test(path);
}

function mapOcrRejectionCode(
  reason: Extract<OdometerVerificationResult, { accepted: false }>["rejectionReason"],
) {
  if (reason === "end_below_start") return "end_below_start";
  if (reason === "below_previous") return "reading_below_previous";
  if (reason === "image_dimensions_unavailable" || reason === "ocr_failed") {
    return "invalid_photo";
  }

  return "odometer_unverified";
}

function mapServerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("Missing Supabase server secret configuration")) {
    return { code: "supabase_configuration_missing", status: 503 };
  }
  if (message.includes("ODOMETER_IMAGE")) {
    return { code: "invalid_photo", status: 422 };
  }
  if (message.includes("SHIFT_OPEN_EXISTS")) return { code: "open_exists", status: 409 };
  if (message.includes("SHIFT_NO_OPEN_SHIFT")) return { code: "no_open_shift", status: 409 };
  if (message.includes("SHIFT_END_BELOW_START")) return { code: "end_below_start", status: 400 };
  if (message.includes("SHIFT_INVALID")) return { code: "invalid_reading", status: 400 };
  if (message.includes("vehicle_plate_snapshot")) return { code: "no_vehicle", status: 403 };
  return { code: "save_failed", status: 500 };
}

function jsonError(code: string, status: number) {
  return NextResponse.json(
    {
      ok: false,
      status: "error",
      code,
      message: messageForCode(code),
      redirectTo: code === "password_change_required" ? "/change-password" : undefined,
    },
    { status },
  );
}

function forbidden(requestId: string, stage: string, code: ForbiddenCode) {
  logForbidden(requestId, stage, code);
  return jsonError(code, statusForForbiddenCode(code));
}

function messageForCode(code: string) {
  if (code === "driver_lookup_failed") {
    return "تعذر قراءة بيانات ارتباط الحساب، حاول مرة أخرى.";
  }
  if (code === "driver_account_not_linked") {
    return "حساب التطبيق غير مرتبط ببيانات مندوب.";
  }
  if (code === "duplicate_driver_link") {
    return "تعذر التحقق من ربط حساب المندوب. تواصل مع الإدارة.";
  }
  if (code === "driver_profile_missing") {
    return "انتهت الجلسة. سجل الدخول مرة أخرى.";
  }
  if (code === "invalid_driver_role") {
    return "هذا الحساب غير مصرح له باستخدام تطبيق المندوب.";
  }
  if (code === "password_change_required") {
    return "يجب تغيير كلمة المرور المؤقتة قبل بداية الدوام.";
  }
  if (code === "driver_inactive") {
    return "حساب المندوب غير نشط حاليًا.";
  }
  if (code === "driver_archived") {
    return "حساب المندوب غير متاح حاليًا.";
  }
  if (code === "organization_not_resolved") {
    return "تعذر تحديد مؤسسة المندوب من بياناته.";
  }
  if (code === "organization_lookup_failed") {
    return "تعذر قراءة بيانات مؤسسة المندوب، حاول مرة أخرى.";
  }
  if (code === "organization_inactive") {
    return "مؤسسة المندوب غير نشطة حاليًا.";
  }
  if (code === "organization_profile_mismatch") {
    return "بيانات مؤسسة حساب التطبيق غير متزامنة مع بيانات المندوب.";
  }
  if (code === "vehicle_organization_mismatch") {
    return "المركبة المرتبطة لا تتبع مؤسسة المندوب.";
  }
  if (code === "vehicle_not_assigned") {
    return "لا توجد مركبة مرتبطة بحسابك حاليًا.";
  }
  if (code === "image_path_forbidden" || code === "image_owner_mismatch") {
    return "تعذر التحقق من ملكية صورة العداد.";
  }
  if (code === "supabase_configuration_missing") {
    return "تعذر تشغيل خدمة الخادم حاليًا.";
  }
  if (code === "invalid_reading") {
    return "أدخل قراءة عداد صحيحة.";
  }
  if (code === "odometer_unverified") {
    return "تعذر التحقق من قراءة العداد";
  }
  if (code === "reading_below_previous") {
    return "قراءة العداد أقل من آخر قراءة معتمدة.";
  }
  if (code === "no_open_shift") {
    return "لا توجد بداية دوام مسجلة لهذا اليوم.";
  }
  if (code === "end_below_start") {
    return "قراءة نهاية الدوام لا يمكن أن تكون أقل من قراءة البداية.";
  }
  if (code === "invalid_photo") {
    return "تعذر التحقق من صورة العداد.";
  }
  return "تعذر حفظ بيانات الدوام، حاول مرة أخرى.";
}

function logOcrRejected(
  requestId: string,
  verification: Extract<OdometerVerificationResult, { accepted: false }>,
) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[odometer-shift] server_ocr_rejected", {
      requestId,
      rejectionReason: verification.rejectionReason,
      confidence: verification.confidence,
      previousReading: verification.previousReading,
      candidateCount: verification.candidates.length,
      candidates: verification.candidates.slice(0, 5).map((candidate) => ({
        digits: candidate.digits,
        confidence: candidate.confidence,
        score: candidate.score,
        source: candidate.source,
        reason: candidate.reason,
      })),
    });
  }
}

function statusForForbiddenCode(code: ForbiddenCode) {
  if (code === "driver_lookup_failed" || code === "organization_lookup_failed") {
    return 500;
  }
  return 403;
}

function logStage(requestId: string, stage: string) {
  if (process.env.NODE_ENV !== "production") {
    console.info("[odometer-shift]", stage, { requestId });
  }
}

function logFailure(requestId: string, stage: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.error("[odometer-shift] failed", {
      requestId,
      stage,
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

function logForbidden(requestId: string, stage: string, code: ForbiddenCode) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[odometer-shift] forbidden", {
      requestId,
      stage,
      code,
      safeReason: code,
    });
  }
}

function logConfigurationWarning(
  requestId: string,
  code: "organization_profile_mismatch",
  details: {
    hasProfileOrganizationId: boolean;
    driverOrganizationCode: string;
    profileOrganizationCode: string | null;
  },
) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[odometer-shift] configuration_warning", {
      requestId,
      code,
      hasProfileOrganizationId: details.hasProfileOrganizationId,
      driverOrganizationCode: details.driverOrganizationCode,
      profileOrganizationCode: details.profileOrganizationCode,
    });
  }
}

function logContextFailure(
  requestId: string,
  code: RepresentativeContextCode,
  details: {
    stage: string;
    authUserIdSuffix?: string;
    profileRole?: string;
    profileStatus?: string;
    matchingDriverCount?: number;
    driverLookupErrored?: boolean;
    hasDriverOrganizationId?: boolean;
    organizationJoined?: boolean;
    organizationLookupFound?: boolean;
    organizationLookupErrored?: boolean;
    organizationActive?: boolean;
  },
) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[odometer-shift] context_failure", {
      requestId,
      code,
      stage: details.stage,
      authUserIdSuffix: details.authUserIdSuffix,
      profileRole: details.profileRole,
      profileStatus: details.profileStatus,
      matchingDriverCount: details.matchingDriverCount,
      driverLookupErrored: details.driverLookupErrored,
      hasDriverOrganizationId: details.hasDriverOrganizationId,
      organizationJoined: details.organizationJoined,
      organizationLookupFound: details.organizationLookupFound,
      organizationLookupErrored: details.organizationLookupErrored,
      organizationActive: details.organizationActive,
    });
  }
}
