"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  readOdometerFromPhoto,
  type OdometerOcrResult,
} from "@/lib/odometer/ocr";
import { LiveFrameAnalyzer } from "@/lib/odometer/live-frame-analysis";
import { OCR_DEBUG } from "@/lib/odometer/ocr-debug-flag";

type CameraStatus = "idle" | "loading" | "ready" | "captured" | "error";
type DetectionStatus = "idle" | "aligned" | "capturing";

type OdometerCameraProps = {
  onClose: () => void;
  onUsePhoto: (
    blob: Blob,
    capturedAt: string,
    previewUrl: string,
    crop: OdometerCrop,
    reading?: string,
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
  const guideRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const liveRunRef = useRef(0);
  const analyzerRef = useRef<LiveFrameAnalyzer | null>(null);
  const autoCaptureTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoCaptureLockedRef = useRef(false);

  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [detectionStatus, setDetectionStatus] = useState<DetectionStatus>("idle");
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [capture, setCapture] = useState<{
    blob: Blob;
    capturedAt: string;
    url: string;
    crop: OdometerCrop;
    reading: string;
  } | null>(null);

  // Dev-only debug info
  const [devCropInfo, setDevCropInfo] = useState<string | null>(null);
  const [devOcrPanel, setDevOcrPanel] = useState<string | null>(null);

  useEffect(() => {
    analyzerRef.current = new LiveFrameAnalyzer();
    void openCamera();

    function handleVisibilityChange() {
      if (document.hidden) {
        stopCamera();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      liveRunRef.current += 1;
      clearAutoCaptureTimer();
      stopCamera();
      if (capture?.url) {
        URL.revokeObjectURL(capture.url);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAutoCaptureTimer() {
    if (autoCaptureTimerRef.current) {
      clearTimeout(autoCaptureTimerRef.current);
      autoCaptureTimerRef.current = null;
    }
  }

  async function openCamera() {
    setStatus("loading");
    setErrorKey(null);
    setDetectionStatus("idle");
    autoCaptureLockedRef.current = false;
    analyzerRef.current?.reset();

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

  /**
   * Freeze the video frame onto a single high-res canvas.
   *
   * Both the saved image Blob AND the final OCR reading are derived
   * from this EXACT SAME canvas frame.
   */
  async function captureFrame() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
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
      autoCaptureLockedRef.current = false;
      return;
    }

    const crop = getNormalizedGuideCrop(video);

    if (!crop) {
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.88);
    });

    if (!blob) {
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    clearAutoCaptureTimer();
    setIsFinalizing(true);
    setErrorKey(null);

    try {
      // Execute Final Multi-pass OCR directly on the captured still frame
      const finalResult = await readOdometerFromPhoto(blob, crop);

      if (!finalResult.accepted || !finalResult.reading) {
        // Final OCR rejected reading: Unlock and return to camera search
        setDetectionStatus("idle");
        setErrorKey("finalVerificationFailed");
        autoCaptureLockedRef.current = false;
        analyzerRef.current?.reset();
        return;
      }

      // Success! Final OCR verified reading on saved frame
      const capturedAt = new Date().toISOString();
      const previewUrl = URL.createObjectURL(blob);

      stopCamera();
      setCapture({
        blob,
        capturedAt,
        url: previewUrl,
        crop,
        reading: finalResult.reading,
      });
      setStatus("captured");

      // Auto-pass verified result to parent component
      onUsePhoto(blob, capturedAt, previewUrl, crop, finalResult.reading);
    } catch {
      setDetectionStatus("idle");
      setErrorKey("finalVerificationFailed");
      autoCaptureLockedRef.current = false;
      analyzerRef.current?.reset();
    } finally {
      setIsFinalizing(false);
    }
  }

  function retake() {
    if (capture?.url) {
      URL.revokeObjectURL(capture.url);
    }
    setCapture(null);
    setDetectionStatus("idle");
    setErrorKey(null);
    autoCaptureLockedRef.current = false;
    void openCamera();
  }

  function close() {
    liveRunRef.current += 1;
    clearAutoCaptureTimer();
    stopCamera();
    onClose();
  }

  // ── Simplified Live Detection Loop (runs every 100ms) ──────────────────────
  useEffect(() => {
    if (status !== "ready") return;

    const runId = ++liveRunRef.current;
    const interval = window.setInterval(() => {
      runLiveFrameAnalysis(runId);
    }, 100);

    return () => {
      window.clearInterval(interval);
      clearAutoCaptureTimer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function runLiveFrameAnalysis(runId: number) {
    const video = videoRef.current;
    if (
      runId !== liveRunRef.current ||
      status !== "ready" ||
      isFinalizing ||
      autoCaptureLockedRef.current ||
      !video ||
      !analyzerRef.current
    ) {
      return;
    }

    const crop = getNormalizedGuideCrop(video);
    if (!crop) return;

    const analysis = analyzerRef.current.analyzeFrame(
      video,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
    );

    if (OCR_DEBUG) {
      setDevCropInfo(
        `video: ${video.videoWidth}×${video.videoHeight} | crop: x=${crop.x.toFixed(2)} y=${crop.y.toFixed(2)}`,
      );
      setDevOcrPanel(
        `LIVE VISUAL:\ncontent=${analysis.hasDigitContent} | stable=${analysis.isStable} | ready=${analysis.isReadyForCapture}\ncontrast=${analysis.contrast} | edgeDensity=${analysis.edgeDensity}%`,
      );
    }

    if (analysis.isReadyForCapture) {
      // ONE-SHOT LATCH: lock immediately once digit content is detected!
      autoCaptureLockedRef.current = true;
      setDetectionStatus("aligned");

      // Auto-trigger capture after 180ms fast delay
      if (!autoCaptureTimerRef.current && !isFinalizing) {
        autoCaptureTimerRef.current = setTimeout(() => {
          autoCaptureTimerRef.current = null;
          setDetectionStatus("capturing");
          void captureFrame();
        }, 180);
      }
    }
  }

  function getAlignmentLabel(): string {
    if (isFinalizing) return t("alignment.verifying");
    if (detectionStatus === "capturing") return t("alignment.capturing");
    if (detectionStatus === "aligned") return t("alignment.aligned");
    return t("alignment.hint");
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh items-center justify-center bg-navy/95 p-4 text-white">
      <div className="flex max-h-[calc(100dvh-2rem)] w-full max-w-[430px] flex-col overflow-hidden rounded-[1.25rem] bg-navy shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3.5">
          <p className="text-sm font-bold text-white">{t("title")}</p>
          <button
            type="button"
            onClick={close}
            className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-lg font-semibold [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label={t("close")}
          >
            ×
          </button>
        </div>

        {/* Compact Horizontal Odometer Camera Strip Viewport */}
        <div className="relative bg-black p-3">
          <div className="relative w-full aspect-[3.2/1] overflow-hidden rounded-xl bg-black border-2 border-white/20">
            {status === "captured" && capture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={capture.url} alt={t("previewAlt")} className="h-full w-full object-cover" />
            ) : (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
              />
            )}

            {status === "ready" ? (
              <>
                {/* Guide Frame Overlay matching the strip exactly */}
                <div
                  ref={guideRef}
                  className={[
                    "pointer-events-none absolute inset-1.5 rounded-lg border-[3px] transition-colors duration-150",
                    detectionStatus === "aligned" || detectionStatus === "capturing"
                      ? "border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]"
                      : "border-amber-300",
                  ].join(" ")}
                >
                  {detectionStatus === "aligned" || detectionStatus === "capturing" ? (
                    <span className="absolute -top-3 end-2 flex size-6 items-center justify-center rounded-full bg-emerald-400 text-xs font-black text-navy shadow-md">
                      ✓
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}

            {status === "loading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs font-semibold text-white">
                {t("loading")}
              </div>
            ) : null}

            {status === "error" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 px-4 text-center text-xs font-semibold leading-5 text-amber-200">
                {t(`errors.${errorKey ?? "unavailable"}`)}
              </div>
            ) : null}
          </div>

          {/* Status Label Banner under strip */}
          {status === "ready" ? (
            <div className="mt-2.5 rounded-lg bg-white/10 px-3 py-2 text-center text-xs font-bold text-white shadow-inner">
              {getAlignmentLabel()}
            </div>
          ) : null}

          {OCR_DEBUG && devCropInfo ? (
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/80 px-2 py-0.5 text-center font-mono text-[9px] text-green-300">
              {devCropInfo}
            </div>
          ) : null}

          {OCR_DEBUG && devOcrPanel ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/85 px-2 py-0.5 font-mono text-[9px] text-yellow-200 whitespace-pre">
              {devOcrPanel}
            </div>
          ) : null}
        </div>

        {/* Footer controls */}
        <div className="space-y-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-xs font-medium text-white/80">
            {t("instruction")}
          </p>

          {status === "captured" && capture ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={retake} className="min-h-12 rounded-[0.85rem] bg-white/10 px-4 text-sm font-semibold [touch-action:manipulation]">
                {t("retake")}
              </button>
              <button
                type="button"
                onClick={() => onUsePhoto(capture.blob, capture.capturedAt, capture.url, capture.crop, capture.reading)}
                className="min-h-12 rounded-[0.85rem] bg-primary px-4 text-sm font-semibold [touch-action:manipulation]"
              >
                {t("usePhoto")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={captureFrame}
              disabled={status !== "ready" || isFinalizing}
              className="min-h-14 w-full rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white transition [touch-action:manipulation] disabled:opacity-60"
            >
              {isFinalizing ? t("finalizing") : t("capture")}
            </button>
          )}
          {status === "ready" && errorKey ? (
            <p role="alert" className="text-center text-xs font-semibold text-amber-200">
              {t(`errors.${errorKey}`)}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  function getNormalizedGuideCrop(video: HTMLVideoElement): OdometerCrop | null {
    const guide = guideRef.current;

    if (!guide || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null;
    }

    const videoRect = video.getBoundingClientRect();
    const guideRect = guide.getBoundingClientRect();

    if (videoRect.width <= 0 || videoRect.height <= 0) return null;

    const coverScale = Math.max(
      videoRect.width  / video.videoWidth,
      videoRect.height / video.videoHeight,
    );

    const displayedWidth  = video.videoWidth  * coverScale;
    const displayedHeight = video.videoHeight * coverScale;

    const offsetX = (videoRect.width  - displayedWidth)  / 2;
    const offsetY = (videoRect.height - displayedHeight) / 2;

    const relLeft = guideRect.left - videoRect.left - offsetX;
    const relTop  = guideRect.top  - videoRect.top  - offsetY;

    const x      = relLeft / displayedWidth;
    const y      = relTop  / displayedHeight;
    const width  = guideRect.width  / displayedWidth;
    const height = guideRect.height / displayedHeight;

    return {
      x:      clamp01(x),
      y:      clamp01(y),
      width:  clamp01(width),
      height: clamp01(height),
    };
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
