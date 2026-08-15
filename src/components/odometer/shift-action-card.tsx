"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { OdometerCamera, type OdometerCrop } from "@/components/camera/odometer-camera";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  readOdometerFromPhoto,
  terminateOdometerOcrWorker,
  type OdometerOcrResult,
} from "@/lib/odometer/ocr";

type ShiftMode = "start" | "end";

type ShiftActionCardProps = {
  mode: ShiftMode;
  startReading?: number;
};

export function ShiftActionCard({ mode, startReading }: ShiftActionCardProps) {
  const t = useTranslations("Odometer");
  const router = useRouter();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<{
    blob: Blob;
    capturedAt: string;
    url: string;
    crop: OdometerCrop;
  } | null>(null);
  const [reading, setReading] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [serverErrorMessage, setServerErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    mode: ShiftMode;
    reading: string;
    capturedAt: string;
    reviewStatus: "pending_review";
  } | null>(null);
  const [stepKey, setStepKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [ocrResult, setOcrResult] = useState<OdometerOcrResult | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const ocrRunRef = useRef(0);
  const [, startTransition] = useTransition();

  const title = mode === "start" ? t("startShift") : t("endShift");
  const distancePreview = getDistancePreview(mode, startReading, reading);
  const canSubmit =
    Boolean(photo) &&
    Boolean(reading) &&
    ocrResult?.accepted === true &&
    !isOcrProcessing &&
    !errorKey &&
    !isSaving;

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      ocrRunRef.current += 1;
      void terminateOdometerOcrWorker();
    };
  }, []);

  function acceptPhoto(blob: Blob, capturedAt: string, url: string, crop: OdometerCrop) {
    setPhoto({ blob, capturedAt, url, crop });
    setIsCameraOpen(false);
    setErrorKey(null);
    setServerErrorMessage(null);
    setSuccess(null);
    setOcrResult(null);
    setIsOcrProcessing(true);

    const runId = ++ocrRunRef.current;
    readOdometerFromPhoto(blob, crop)
      .then((result) => {
        if (ocrRunRef.current !== runId) return;
        setOcrResult(result);
        if (result.accepted && result.reading) {
          setReading(result.reading);
          if (
            mode === "end" &&
            startReading !== undefined &&
            BigInt(result.reading) < BigInt(startReading)
          ) {
            setErrorKey("endBelowStart");
          }
        } else {
          setReading("");
          setErrorKey("unreadable");
        }
      })
      .catch(() => {
        if (ocrRunRef.current !== runId) return;
        setOcrResult({
          reading: null,
          accepted: false,
          confidence: 0,
          rawText: "",
          candidates: [],
          status: "rejected",
          rejectionReason: "no_candidate",
        });
        setReading("");
        setErrorKey("unreadable");
      })
      .finally(() => {
        if (ocrRunRef.current === runId) {
          setIsOcrProcessing(false);
        }
      });
  }

  async function submitShift() {
    if (isSaving) return;

    if (!photo) {
      setErrorKey("photoRequired");
      return;
    }

    if (isOcrProcessing || ocrResult?.accepted !== true || !reading) {
      setErrorKey("unreadable");
      return;
    }

    if (!/^[\d\u0660-\u0669\u06F0-\u06F9]+$/u.test(reading)) {
      setErrorKey("invalidReading");
      return;
    }

    if (
      mode === "end" &&
      startReading !== undefined &&
      BigInt(normalizeClientDigits(reading)) < BigInt(startReading)
    ) {
      setErrorKey("endBelowStart");
      return;
    }

    setIsSaving(true);
    setErrorKey(null);
    setServerErrorMessage(null);
    setSuccess(null);
    setStepKey("uploading");

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrorKey("sessionExpired");
        return;
      }

      const captureId = crypto.randomUUID();
      const path = `${user.id}/${captureId}/${mode}.jpg`;
      const upload = await supabase.storage
        .from("driver-odometer")
        .upload(path, photo.blob, {
          cacheControl: "3600",
          contentType: "image/jpeg",
          upsert: false,
        });

      if (upload.error) {
        setErrorKey("uploadFailed");
        return;
      }

      setStepKey("saving");
      const response = await fetch("/api/driver-odometer/shift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: mode,
          manualReading: reading,
          photoPath: path,
          photoCapturedAt: photo.capturedAt,
        }),
      });

      const result = (await response.json().catch(() => null)) as OdometerShiftResponse | null;

      if (!result) {
        setErrorKey("saveFailed");
        return;
      }

      if (!response.ok) {
        if (hasErrorCode(result)) {
          setErrorKey(mapShiftError(result.code));
          setServerErrorMessage(null);
          const redirectTo = hasRedirect(result) ? result.redirectTo : undefined;
          if (redirectTo) {
            startTransition(() => {
              router.push(redirectTo);
            });
          }
          return;
        }

        if (result.status === "error" && result.message) {
          setServerErrorMessage(result.message);
          setErrorKey(null);
          const redirectTo = result.redirectTo;
          if (redirectTo) {
            startTransition(() => {
              router.push(redirectTo);
            });
          }
          return;
        }
        setErrorKey(result.status === "error" ? mapShiftError(result.code ?? "") : "saveFailed");
        return;
      }

      if (result.status === "error") {
        if (result.message) {
          setServerErrorMessage(result.message);
          setErrorKey(null);
        } else {
          setErrorKey(mapShiftError(result.code ?? ""));
        }
        return;
      }

      setSuccess({
        mode,
        reading,
        capturedAt: photo.capturedAt,
        reviewStatus: "pending_review",
      });
      URL.revokeObjectURL(photo.url);
      setPhoto(null);
      setReading("");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setErrorKey(error instanceof DOMException && error.name === "AbortError" ? "requestAborted" : "networkFailed");
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
      setIsSaving(false);
      setStepKey(null);
    }
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
            <label htmlFor="odometer-reading" className="block text-sm font-semibold text-navy">
              {t("readingLabel")}
            </label>
            <input
              id="odometer-reading"
              name="odometerReading"
              inputMode="numeric"
              dir="ltr"
              value={reading}
              readOnly
              placeholder={t("readingPlaceholder")}
              disabled={isSaving || isOcrProcessing}
              className="min-h-14 w-full rounded-[0.85rem] border border-border bg-primary-soft/70 px-4 text-left text-base font-bold text-navy outline-none transition placeholder:text-muted/70 read-only:cursor-default read-only:focus:border-border read-only:focus:ring-0 disabled:opacity-80"
            />
            <OcrStatusMessage
              isProcessing={isOcrProcessing}
              result={ocrResult}
            />
            {distancePreview !== null ? (
              <p className="rounded-[0.85rem] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                {t("distancePreview", { value: distancePreview })}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  ocrRunRef.current += 1;
                  URL.revokeObjectURL(photo.url);
                  setPhoto(null);
                  setReading("");
                  setOcrResult(null);
                  setIsOcrProcessing(false);
                  setServerErrorMessage(null);
                  setErrorKey(null);
                }}
                disabled={isSaving}
                className="min-h-12 rounded-[0.85rem] border border-border px-4 text-sm font-semibold text-navy [touch-action:manipulation]"
              >
                {t("retake")}
              </button>
              <button
                type="button"
                onClick={submitShift}
                disabled={!canSubmit}
                className="min-h-12 rounded-[0.85rem] bg-primary px-4 text-sm font-semibold text-white [touch-action:manipulation] disabled:opacity-70"
              >
                {isSaving
                  ? t(`steps.${stepKey ?? "saving"}`)
                  : mode === "start"
                    ? t("confirmStart")
                    : t("confirmEnd")}
              </button>
            </div>
          </>
        )}

        {serverErrorMessage ? (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {serverErrorMessage}
          </p>
        ) : errorKey ? (
          <p role="alert" className="text-sm font-semibold text-red-600">
            {t(`errors.${errorKey}`)}
          </p>
        ) : null}
        {success ? (
          <div className="rounded-[0.85rem] border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
            <p>{success.mode === "start" ? t("success.start") : t("success.end")}</p>
            <p className="mt-2">{t("submittedReading", { value: success.reading })}</p>
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

function OcrStatusMessage({
  isProcessing,
  result,
}: {
  isProcessing: boolean;
  result: OdometerOcrResult | null;
}) {
  const t = useTranslations("Odometer");

  if (isProcessing) {
    return (
      <p className="rounded-[0.85rem] border border-primary/20 bg-primary-soft px-3 py-2 text-sm font-semibold text-primary">
        {t("ocr.processing")}
      </p>
    );
  }

  if (!result) return null;

  if (result.accepted && result.reading) {
    return (
      <p className="rounded-[0.85rem] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
        {t("ocr.accepted", { value: result.reading })}
      </p>
    );
  }

  return (
    <p className="rounded-[0.85rem] border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
      {t("ocr.rejected")}
    </p>
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
  if (message.includes("invalid_reading") || message.includes("invalidReading") || message.includes("SHIFT_INVALID_READING")) {
    return "invalidReading";
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

function normalizeClientDigits(value: string) {
  return Array.from(value)
    .map((char) => {
      const eastern = "٠١٢٣٤٥٦٧٨٩".indexOf(char);
      if (eastern >= 0) return String(eastern);
      const persian = "۰۱۲۳۴۵۶۷۸۹".indexOf(char);
      if (persian >= 0) return String(persian);
      return char;
    })
    .join("");
}

function getDistancePreview(
  mode: ShiftMode,
  startReading: number | undefined,
  reading: string,
) {
  if (mode !== "end" || startReading === undefined || !reading) return null;
  if (!/^[\d\u0660-\u0669\u06F0-\u06F9]+$/u.test(reading)) return null;

  const value = Number(normalizeClientDigits(reading));
  if (!Number.isSafeInteger(value) || value < startReading) return null;

  return (value - startReading).toLocaleString("en-US");
}

function hasErrorCode(
  result: OdometerShiftResponse,
): result is OdometerShiftResponse & { code: string } {
  return "code" in result && typeof result.code === "string" && result.code.length > 0;
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

type OdometerShiftResponse =
  | {
      ok: true;
      status: "pending_review";
      reviewStatus: "pending_review";
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
