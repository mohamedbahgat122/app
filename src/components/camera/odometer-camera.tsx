"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  readOdometerLiveDetection,
  readOdometerFromPhoto,
  type OdometerOcrResult,
} from "@/lib/odometer/ocr";

type CameraStatus = "idle" | "loading" | "ready" | "captured" | "error";
type DetectionStatus = "scanning" | "aligned";

type OdometerCameraProps = {
  onClose: () => void;
  onUsePhoto: (
    blob: Blob,
    capturedAt: string,
    previewUrl: string,
    crop: OdometerCrop,
  ) => void;
};

export type OdometerCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function OdometerCamera({ onClose, onUsePhoto }: OdometerCameraProps) {
  const t = useTranslations("Camera");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const liveOcrActiveRef = useRef(false);
  const liveOcrRunRef = useRef(0);
  const liveFailedScansRef = useRef(0);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>("scanning");
  const [liveOcrResult, setLiveOcrResult] = useState<OdometerOcrResult | null>(null);
  const [isLiveScanning, setIsLiveScanning] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [capture, setCapture] = useState<{
    blob: Blob;
    capturedAt: string;
    url: string;
    crop: OdometerCrop;
  } | null>(null);

  useEffect(() => {
    void openCamera();

    function handleVisibilityChange() {
      if (document.hidden) {
        stopCamera();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      liveOcrRunRef.current += 1;
      stopCamera();
      if (capture?.url) {
        URL.revokeObjectURL(capture.url);
      }
    };
    // Opening happens once per intentional modal mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openCamera() {
    setStatus("loading");
    setErrorKey(null);
    setLiveOcrResult(null);
    setDetectionStatus("scanning");
    liveFailedScansRef.current = 0;

    if (!window.isSecureContext) {
      setErrorKey("insecure");
      setStatus("error");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorKey("unavailable");
      setStatus("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1600 },
          height: { ideal: 1200 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setStatus("ready");
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      setErrorKey(
        name === "NotAllowedError"
          ? "permission"
          : name === "NotFoundError"
            ? "noDevice"
            : "unavailable",
      );
      setStatus("error");
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function captureFrame() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorKey("captureFailed");
      setStatus("error");
      return;
    }

    const scale = Math.min(1600 / video.videoWidth, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext("2d");

    if (!context) {
      setErrorKey("captureFailed");
      setStatus("error");
      return;
    }

    const crop = getNormalizedGuideCrop(video);

    if (!crop) {
      setErrorKey("captureFailed");
      setStatus("error");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.85);
    });

    if (!blob) {
      setErrorKey("captureFailed");
      setStatus("error");
      return;
    }

    if (!liveOcrResult?.accepted || !liveOcrResult.reading) {
      setErrorKey("alignFirst");
      return;
    }

    setIsFinalizing(true);

    try {
      const finalResult = await readOdometerFromPhoto(blob, crop);

      if (
        !finalResult.accepted ||
        !finalResult.reading ||
        finalResult.reading !== liveOcrResult.reading
      ) {
        setLiveOcrResult(finalResult);
        setDetectionStatus("scanning");
        setErrorKey("finalVerificationFailed");
        return;
      }
    } catch {
      setDetectionStatus("scanning");
      setErrorKey("finalVerificationFailed");
      return;
    } finally {
      setIsFinalizing(false);
    }

    stopCamera();
    setCapture({
      blob,
      capturedAt: new Date().toISOString(),
      url: URL.createObjectURL(blob),
      crop,
    });
    setStatus("captured");
  }

  function retake() {
    if (capture?.url) {
      URL.revokeObjectURL(capture.url);
    }
    setCapture(null);
    setLiveOcrResult(null);
    setDetectionStatus("scanning");
    liveFailedScansRef.current = 0;
    setErrorKey(null);
    void openCamera();
  }

  function close() {
    liveOcrRunRef.current += 1;
    stopCamera();
    onClose();
  }

  useEffect(() => {
    if (status !== "ready") return;

    const runId = ++liveOcrRunRef.current;
    const interval = window.setInterval(() => {
      void runLiveOcr(runId);
    }, 1000);

    void runLiveOcr(runId);

    return () => {
      window.clearInterval(interval);
    };
    // Live detection intentionally follows camera readiness.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-navy/95 p-4 text-white">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[430px] flex-col overflow-hidden rounded-[1rem] bg-navy shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
          <p className="text-sm font-semibold">{t("title")}</p>
          <button
            type="button"
            onClick={close}
            className="flex size-11 items-center justify-center rounded-lg bg-white/10 text-xl font-semibold [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        <div ref={frameRef} className="relative min-h-[320px] bg-black">
          {status === "captured" && capture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capture.url} alt={t("previewAlt")} className="h-full max-h-[60dvh] w-full object-contain" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full max-h-[60dvh] min-h-[320px] w-full object-cover"
            />
          )}

          {status === "ready" ? (
            <>
              <div
                ref={guideRef}
                className={[
                  "pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-xl border-[3px] shadow-[0_0_0_999px_rgba(0,0,0,0.42)] transition-colors",
                  detectionStatus === "aligned"
                    ? "border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.34),0_0_28px_rgba(52,211,153,0.38)]"
                    : "border-amber-300",
                ].join(" ")}
              >
                {detectionStatus === "aligned" ? (
                  <span className="absolute -top-4 end-4 flex size-8 items-center justify-center rounded-full bg-emerald-400 text-base font-black text-navy shadow-lg">
                    ✓
                  </span>
                ) : null}
              </div>
              <div className="pointer-events-none absolute inset-x-6 top-[calc(50%+4.25rem)] rounded-xl bg-black/55 px-3 py-2 text-center text-xs font-semibold text-white">
                {detectionStatus === "aligned"
                  ? t("alignment.aligned")
                  : isLiveScanning
                    ? t("alignment.verifying")
                    : t("alignment.hint")}
              </div>
            </>
          ) : null}

          {status === "loading" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm font-semibold">
              {t("loading")}
            </div>
          ) : null}

          {status === "error" ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 px-6 text-center text-sm font-semibold leading-6">
              {t(`errors.${errorKey ?? "unavailable"}`)}
            </div>
          ) : null}
        </div>

        <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-sm font-medium text-white/76">
            {t("instruction")}
          </p>

          {status === "captured" && capture ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={retake} className="min-h-12 rounded-[0.85rem] bg-white/10 px-4 text-sm font-semibold [touch-action:manipulation]">
                {t("retake")}
              </button>
              <button
                type="button"
                onClick={() => onUsePhoto(capture.blob, capture.capturedAt, capture.url, capture.crop)}
                className="min-h-12 rounded-[0.85rem] bg-primary px-4 text-sm font-semibold [touch-action:manipulation]"
              >
                {t("usePhoto")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={captureFrame}
              disabled={status !== "ready" || detectionStatus !== "aligned" || isFinalizing}
              className="min-h-14 w-full rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white transition [touch-action:manipulation] disabled:opacity-60"
            >
              {isFinalizing ? t("finalizing") : t("capture")}
            </button>
          )}
          {status === "ready" && errorKey ? (
            <p role="alert" className="text-center text-sm font-semibold text-amber-200">
              {t(`errors.${errorKey}`)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  async function runLiveOcr(runId: number) {
    const video = videoRef.current;
    const crop = video ? getNormalizedGuideCrop(video) : null;

    if (
      liveOcrActiveRef.current ||
      runId !== liveOcrRunRef.current ||
      status !== "ready" ||
      !video ||
      !crop
    ) {
      return;
    }

    liveOcrActiveRef.current = true;

    try {
      setIsLiveScanning(true);
      const blob = await captureScanBoxBlob(video, crop, 760, 0.76, 0.06);
      if (!blob || runId !== liveOcrRunRef.current) return;

      const result = await readOdometerLiveDetection(blob, {
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      });

      if (runId !== liveOcrRunRef.current) return;

      if (result.accepted) {
        liveFailedScansRef.current = 0;
        setLiveOcrResult(result);
        setDetectionStatus("aligned");
      } else {
        liveFailedScansRef.current += 1;
        if (liveFailedScansRef.current >= 3) {
          setLiveOcrResult(null);
          setDetectionStatus("scanning");
        }
      }
      setErrorKey(null);
    } catch {
      if (runId === liveOcrRunRef.current) {
        liveFailedScansRef.current += 1;
        if (liveFailedScansRef.current >= 3) {
          setLiveOcrResult(null);
          setDetectionStatus("scanning");
        }
      }
    } finally {
      liveOcrActiveRef.current = false;
      setIsLiveScanning(false);
    }
  }

  function getNormalizedGuideCrop(video: HTMLVideoElement): OdometerCrop | null {
    const guide = guideRef.current;

    if (!guide || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null;
    }

    const frameRect = video.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();
    const coverScale = Math.max(
      frameRect.width / video.videoWidth,
      frameRect.height / video.videoHeight,
    );
    const displayedWidth = video.videoWidth * coverScale;
    const displayedHeight = video.videoHeight * coverScale;
    const offsetX = (frameRect.width - displayedWidth) / 2;
    const offsetY = (frameRect.height - displayedHeight) / 2;

    const x = (guideRect.left - frameRect.left - offsetX) / displayedWidth;
    const y = (guideRect.top - frameRect.top - offsetY) / displayedHeight;
    const width = guideRect.width / displayedWidth;
    const height = guideRect.height / displayedHeight;

    return {
      x: clamp01(x),
      y: clamp01(y),
      width: clamp01(width),
      height: clamp01(height),
    };
  }
}

async function captureScanBoxBlob(
  video: HTMLVideoElement,
  crop: OdometerCrop,
  maxWidth: number,
  quality: number,
  paddingRatio = 0,
) {
  const padded = expandCrop(crop, paddingRatio);
  const sourceX = Math.round(padded.x * video.videoWidth);
  const sourceY = Math.round(padded.y * video.videoHeight);
  const sourceWidth = Math.max(1, Math.round(padded.width * video.videoWidth));
  const sourceHeight = Math.max(1, Math.round(padded.height * video.videoHeight));
  const scale = Math.min(maxWidth / sourceWidth, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d");

  if (!context) return null;

  context.drawImage(
    video,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });
}

function expandCrop(crop: OdometerCrop, paddingRatio: number): OdometerCrop {
  if (paddingRatio <= 0) return crop;

  const paddingX = crop.width * paddingRatio;
  const paddingY = crop.height * paddingRatio;
  const x = clamp01(crop.x - paddingX);
  const y = clamp01(crop.y - paddingY);
  const right = clamp01(crop.x + crop.width + paddingX);
  const bottom = clamp01(crop.y + crop.height + paddingY);

  return {
    x,
    y,
    width: Math.max(0.01, right - x),
    height: Math.max(0.01, bottom - y),
  };
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
