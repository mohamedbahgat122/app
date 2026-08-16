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

    clearAutoCaptureTimer();
    setIsFinalizing(true);
    setErrorKey(null);

    try {
      const finalResult = await readOdometerFromPhoto(blob, crop);

      if (!finalResult.accepted || !finalResult.reading) {
        setDetectionStatus("idle");
        setErrorKey("finalVerificationFailed");
        analyzerRef.current?.reset();
        return;
      }

      // Success! Final OCR accepted reading
      stopCamera();
      setCapture({
        blob,
        capturedAt: new Date().toISOString(),
        url: URL.createObjectURL(blob),
        crop,
      });
      setStatus("captured");
    } catch {
      setDetectionStatus("idle");
      setErrorKey("finalVerificationFailed");
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
    void openCamera();
  }

  function close() {
    liveRunRef.current += 1;
    clearAutoCaptureTimer();
    stopCamera();
    onClose();
  }

  // ── Visual-only Live Frame Analysis Loop (NO Tesseract in live loop) ────────
  useEffect(() => {
    if (status !== "ready") return;

    const runId = ++liveRunRef.current;
    const interval = window.setInterval(() => {
      runLiveFrameAnalysis(runId);
    }, 120);

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
        `LIVE VISUAL:\ncontent=${analysis.hasDigitContent} | stable=${analysis.isStable} | ready=${analysis.isReadyForCapture}\ncontrast=${analysis.contrast} | edgeDensity=${analysis.edgeDensity}% | motionDiff=${analysis.motionDiff}`,
      );
    }

    if (analysis.isReadyForCapture) {
      if (detectionStatus !== "aligned" && detectionStatus !== "capturing") {
        setDetectionStatus("aligned");
      }

      // Schedule auto-capture after ~350ms of continuous stability
      if (!autoCaptureTimerRef.current && !isFinalizing) {
        autoCaptureTimerRef.current = setTimeout(() => {
          autoCaptureTimerRef.current = null;
          setDetectionStatus("capturing");
          void captureFrame();
        }, 350);
      }
    } else {
      // Lost alignment / moved
      clearAutoCaptureTimer();
      if (detectionStatus === "aligned" && !isFinalizing) {
        setDetectionStatus("idle");
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

        <div className="relative min-h-[320px] bg-black">
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
                  "pointer-events-none absolute inset-x-6 top-1/2 h-24 -translate-y-1/2 rounded-xl border-[3px] shadow-[0_0_0_999px_rgba(0,0,0,0.42)] transition-colors duration-200",
                  detectionStatus === "aligned" || detectionStatus === "capturing"
                    ? "border-emerald-400 shadow-[0_0_0_999px_rgba(0,0,0,0.34),0_0_28px_rgba(52,211,153,0.38)]"
                    : "border-amber-300",
                ].join(" ")}
              >
                {detectionStatus === "aligned" || detectionStatus === "capturing" ? (
                  <span className="absolute -top-4 end-4 flex size-8 items-center justify-center rounded-full bg-emerald-400 text-base font-black text-navy shadow-lg">
                    ✓
                  </span>
                ) : null}
              </div>
              <div className="pointer-events-none absolute inset-x-6 top-[calc(50%+4.25rem)] rounded-xl bg-black/55 px-3 py-2 text-center text-xs font-semibold text-white">
                {getAlignmentLabel()}
              </div>

              {OCR_DEBUG && devCropInfo ? (
                <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/70 px-2 py-1 text-center font-mono text-[9px] text-green-300">
                  {devCropInfo}
                </div>
              ) : null}

              {OCR_DEBUG && devOcrPanel ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/80 px-2 py-1 font-mono text-[9px] text-yellow-200 whitespace-pre">
                  {devOcrPanel}
                </div>
              ) : null}
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
              disabled={status !== "ready" || isFinalizing}
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
