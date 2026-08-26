"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { OdometerCamera } from "@/components/camera/odometer-camera";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ShiftMode = "start" | "end";

type CapturedPhoto = {
  blob: Blob;
  capturedAt: string;
  url: string;
  serverPath?: string;
};

type ShiftActionCardProps = {
  mode: ShiftMode;
  startReading?: number | null;
};

type OdometerShiftResponse =
  | {
      ok: true;
      status: "pending_review";
      reviewStatus: "pending_review";
      detectedReading: number;
      confidence: number;
    }
  | {
      ok: false;
      status: "error";
      code?: string;
      message?: string;
      redirectTo?: string;
    }
  | {
      ok: false;
      status?: undefined;
      code: string;
      message?: string;
    };

export function ShiftActionCard({ mode }: ShiftActionCardProps) {
  const t = useTranslations("Odometer");
  const router = useRouter();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [enteredReading, setEnteredReading] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [stepKey, setStepKey] = useState<"uploading" | "reading" | "saving" | "reconciling" | null>(null);
  const [success, setSuccess] = useState<{
    mode: ShiftMode;
    reading: string;
    confidence: number;
    capturedAt: string;
    reviewStatus: "pending_review";
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();
  const title = mode === "start" ? t("startShift") : t("endShift");

  useEffect(() => {
    return () => {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
      }
      abortRef.current?.abort();
    };
  }, []);



  async function handleRetakePhoto(serverPath: string) {
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.storage.from("driver-odometer").remove([serverPath]);
    } catch (error) {
      console.warn("[shift-action] Failed to delete unused photo:", error);
    }
  }

  function acceptPhoto(
    blob: Blob,
    capturedAt: string,
    url: string
  ) {
    const capturedPhoto = { blob, capturedAt, url };
    setPhoto(capturedPhoto);
    setIsCameraOpen(false);
    setErrorKey(null);
    setServerErrorMessage(null);
    setSuccess(null);
    setEnteredReading("");
  }

  async function submitShift(capturedPhoto: CapturedPhoto) {
    if (isSaving || !enteredReading.trim()) return;

    setIsSaving(true);
    setErrorKey(null);
    setServerErrorMessage(null);
    
    let path = capturedPhoto.serverPath;
    
    if (!path) {
      setStepKey("uploading");
      try {
        const supabase = createSupabaseBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setErrorKey("sessionExpired");
          setIsSaving(false);
          setStepKey(null);
          return;
        }

        const captureId = crypto.randomUUID();
        path = `${user.id}/${captureId}/${mode}.jpg`;
        const upload = await supabase.storage
          .from("driver-odometer")
          .upload(path, capturedPhoto.blob, {
            cacheControl: "3600",
            contentType: "image/jpeg",
            upsert: false,
          });

        if (upload.error) {
          setErrorKey("uploadFailed");
          setIsSaving(false);
          setStepKey(null);
          return;
        }
        
        setPhoto(prev => prev ? { ...prev, serverPath: path } : null);
      } catch (error) {
        setErrorKey("networkFailed");
        setIsSaving(false);
        setStepKey(null);
        return;
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    requestTimeoutRef.current = setTimeout(() => {
      controller.abort();
    }, 35_000);

    try {
      const response = await fetch("/api/driver-odometer/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: mode,
          photoPath: path,
          photoCapturedAt: capturedPhoto.capturedAt,
          enteredOdometerReading: enteredReading,
        }),
      });

      setStepKey("saving");
      const result = (await response.json().catch(() => null)) as OdometerShiftResponse | null;

      if (!result) {
        setErrorKey("saveFailed");
        return;
      }

      if (!response.ok || result.ok === false) {
        const errorCode = "code" in result ? result.code : undefined;
        const redirectTo = hasRedirect(result) ? result.redirectTo : undefined;
        if (redirectTo) {
          startTransition(() => router.push(redirectTo));
        }

        if (result.status === "error" && result.message && !isRetakeOnlyError(errorCode)) {
          setServerErrorMessage(result.message);
          setErrorKey(null);
          return;
        }

        setServerErrorMessage(null);
        setErrorKey(mapShiftError(errorCode ?? ""));
        return;
      }

      setSuccess({
        mode,
        reading: String(result.detectedReading),
        confidence: result.confidence,
        capturedAt: capturedPhoto.capturedAt,
        reviewStatus: "pending_review",
      });
      URL.revokeObjectURL(capturedPhoto.url);
      setPhoto(null);
      startTransition(() => router.refresh());
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (isAbort || !navigator.onLine) {
        setStepKey("reconciling");
        console.warn("[shift-action] Network timeout or drop, attempting server reconciliation...");

        let reconciled = false;
        for (let i = 0; i < 3; i++) {
          try {
            const check = await fetch(
              `/api/driver-odometer/shift?action=${mode}&photoPath=${encodeURIComponent(path!)}`,
              { method: "GET" }
            );
            if (check.ok) {
              const checkResult = await check.json();
              if (checkResult.ok && checkResult.detectedReading !== undefined) {
                console.info("[shift-action] Reconciliation successful", checkResult);
                setSuccess({
                  mode,
                  reading: String(checkResult.detectedReading),
                  confidence: checkResult.confidence ?? 0,
                  capturedAt: capturedPhoto.capturedAt,
                  reviewStatus: "pending_review",
                });
                URL.revokeObjectURL(capturedPhoto.url);
                setPhoto(null);
                startTransition(() => router.refresh());
                reconciled = true;
                break;
              }
            }
          } catch (e) {
            console.warn(`[shift-action] Reconciliation attempt ${i + 1} failed`, e);
          }
          await new Promise((r) => setTimeout(r, 2000));
        }

        if (reconciled) return;
      }

      setErrorKey("networkFailed");
    } finally {
      if (requestTimeoutRef.current) {
        clearTimeout(requestTimeoutRef.current);
        requestTimeoutRef.current = null;
      }
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsSaving(false);
      setStepKey(null);
    }
  }

  function retake() {
    if (photo) {
      URL.revokeObjectURL(photo.url);
    }
    setPhoto(null);
    setEnteredReading("");
    setErrorKey(null);
    setServerErrorMessage(null);
    setSuccess(null);
    setIsCameraOpen(true);
  }

  return (
    <section className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
      <div className="space-y-3">
        {!photo ? (
          <button
            type="button"
            onClick={() => setIsCameraOpen(true)}
            className="min-h-14 w-full rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white shadow-[0_12px_24px_rgba(11,108,251,0.16)] transition [touch-action:manipulation] active:translate-y-px"
          >
            {title}
          </button>
        ) : (
          <>
            <div className="overflow-hidden rounded-[0.85rem] border border-border bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={t("capturedPhoto")} className="max-h-56 w-full object-contain" />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                اكتب قراءة العداد كما تظهر في الصورة
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={enteredReading}
                onChange={(e) => {
                  const raw = e.target.value;
                  const normalizedStr = raw.replace(/[٠-٩۰-۹]/g, (d) => String("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹".indexOf(d) % 10)).replace(/[^\d]/g, "");
                  setEnteredReading(normalizedStr);
                }}
                className="w-full rounded-[0.85rem] border border-border bg-background px-4 py-3 text-lg font-bold placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="مثال: 25433"
                dir="ltr"
                disabled={isSaving || !!success}
              />
            </div>

            {isSaving ? (
              <p className="rounded-[0.85rem] border border-primary/20 bg-primary-soft px-3 py-2 text-center text-sm font-semibold text-primary">
                {t(`steps.${stepKey ?? "reading"}`)}
              </p>
            ) : null}

            {serverErrorMessage ? (
              <p role="alert" className="text-center text-sm font-semibold text-red-600">
                {serverErrorMessage}
              </p>
            ) : errorKey ? (
              <p role="alert" className="text-center text-sm font-semibold text-red-600">
                {t(`errors.${errorKey}`)}
              </p>
            ) : null}

            {!isSaving && !success && (errorKey || serverErrorMessage) ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={retake}
                  className="min-h-12 w-full rounded-[0.85rem] bg-secondary px-4 text-sm font-semibold text-secondary-foreground [touch-action:manipulation]"
                >
                  {t("retake")}
                </button>
                <button
                  type="button"
                  disabled={!enteredReading.trim()}
                  onClick={() => submitShift(photo)}
                  className="min-h-12 w-full rounded-[0.85rem] bg-primary px-4 text-sm font-semibold text-white [touch-action:manipulation] disabled:opacity-50"
                >
                  تحقق وحفظ
                </button>
              </div>
            ) : !isSaving && !success ? (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={retake}
                  className="min-h-12 w-full rounded-[0.85rem] bg-secondary px-4 text-sm font-semibold text-secondary-foreground [touch-action:manipulation]"
                >
                  {t("retake")}
                </button>
                <button
                  type="button"
                  disabled={!enteredReading.trim()}
                  onClick={() => submitShift(photo)}
                  className="min-h-12 w-full rounded-[0.85rem] bg-primary px-4 text-sm font-semibold text-white [touch-action:manipulation] disabled:opacity-50"
                >
                  تحقق وحفظ
                </button>
              </div>
            ) : null}
          </>
        )}

        {success ? (
          <div className="rounded-[0.85rem] border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            <p>{success.mode === "start" ? t("success.start") : t("success.end")}</p>
            <p className="mt-2">{t("ocr.accepted", { value: success.reading })}</p>
            <p className="mt-1">
              {t("submittedAt", {
                value: new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(success.capturedAt)),
              })}
            </p>
            <p className="mt-1">{t("reviewStatus.pending_review")}</p>
          </div>
        ) : null}
      </div>

      {isCameraOpen ? (
        <OdometerCamera
          onClose={() => setIsCameraOpen(false)}
          onUsePhoto={acceptPhoto}
        />
      ) : null}
    </section>
  );
}

function mapShiftError(message: string) {
  if (message.includes("network_failed")) return "networkFailed";
  if (message.includes("open_exists") || message.includes("openExists") || message.includes("SHIFT_OPEN_EXISTS")) {
    return "openExists";
  }
  if (message.includes("no_open_shift") || message.includes("noOpenShift") || message.includes("SHIFT_NO_OPEN_SHIFT")) {
    return "noOpenShift";
  }
  if (message.includes("end_below_start") || message.includes("endBelowStart") || message.includes("SHIFT_END_BELOW_START")) {
    return "endBelowStart";
  }
  if (message.includes("no_vehicle") || message.includes("noVehicle") || message.includes("SHIFT_VEHICLE_UNAVAILABLE")) {
    return "noVehicle";
  }
  if (message.includes("invalid_input") || message.includes("invalid_reading") || message.includes("invalidReading") || message.includes("SHIFT_INVALID_READING")) {
    return "invalidInput";
  }
  if (message.includes("image_unreadable")) {
    return "imageUnreadable";
  }


  if (
    message.includes("odometer_unverified") ||
    message.includes("low_confidence") ||
    message.includes("no_candidate")
  ) {
    return "unreadable";
  }
  if (message.includes("reading_below_previous") || message.includes("below_previous")) {
    return "readingBelowPrevious";
  }
  if (message.includes("session_expired") || message.includes("sessionExpired") || message.includes("SHIFT_AUTH_REQUIRED")) {
    return "sessionExpired";
  }
  if (message.includes("driver_lookup_failed")) return "driverLookupFailed";
  if (message.includes("driver_account_not_linked")) return "driverAccountNotLinked";
  if (message.includes("duplicate_driver_link")) return "duplicateDriverLink";
  if (message.includes("organization_lookup_failed")) return "organizationLookupFailed";
  if (message.includes("organization_not_resolved")) return "organizationNotResolved";
  if (message.includes("organization_inactive")) return "organizationInactive";
  if (message.includes("image_processor_unavailable")) return "imageProcessorUnavailable";
  if (message.includes("invalid_photo")) return "invalidPhoto";

  return "saveFailed";
}

function isRetakeOnlyError(code: string | undefined) {
  return (
    code === "odometer_unverified" ||
    code === "reading_below_previous" ||
    code === "invalid_photo" ||
    code === "image_unreadable" ||
    code === "invalid_input"
  );
}

function hasRedirect(
  result: OdometerShiftResponse,
): result is OdometerShiftResponse & { redirectTo: string } {
  return (
    "redirectTo" in result &&
    typeof result.redirectTo === "string" &&
    result.redirectTo.length > 0
  );
}
