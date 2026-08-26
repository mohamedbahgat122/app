"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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

    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      console.warn("[odometer-camera] capture_not_ready", {
        readyState: video?.readyState,
        videoWidth: video?.videoWidth,
        videoHeight: video?.videoHeight
      });
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      console.error("[odometer-camera] capture_failed", { stage: "getContext" });
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    try {
      context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    } catch (err) {
      console.error("[odometer-camera] capture_failed", { stage: "drawImage", error: err });
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!blob) {
      console.error("[odometer-camera] capture_failed", { stage: "toBlob" });
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    console.info("[odometer-camera] capture_success", {
      width: canvas.width,
      height: canvas.height,
      blobSize: blob.size,
      blobType: blob.type
    });

    clearAutoCaptureTimer();
    setIsFinalizing(true);
    setErrorKey(null);

    const capturedAt = new Date().toISOString();
    const previewUrl = URL.createObjectURL(blob);
    // Provide a full-frame dummy crop for downstream compatibility until fully removed
    const dummyCrop: OdometerCrop = { x: 0, y: 0, width: 1, height: 1 };

    stopCamera();
    setCapture({
      blob,
      capturedAt,
      url: previewUrl,
      crop: dummyCrop,
    });
    setStatus("captured");
    setIsFinalizing(false);
    onUsePhoto(blob, capturedAt, previewUrl, dummyCrop);
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
      !video ||
      video.readyState < 2 ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0 ||
      autoCaptureLockedRef.current ||
      !analyzerRef.current
    ) {
      return;
    }

    const crop: OdometerCrop = { x: 0, y: 0, width: 1, height: 1 };

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
      setDetectionStatus("aligned");
    } else {
      setDetectionStatus("idle");
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
                {/* No Guide Frame Overlay - Full Dashboard expected */}
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
            صوّر لوحة العدادات كاملة وبوضوح
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
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
