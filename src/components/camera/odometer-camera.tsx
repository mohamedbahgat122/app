"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LiveFrameAnalyzer } from "@/lib/odometer/live-frame-analysis";
import { OCR_DEBUG } from "@/lib/odometer/ocr-debug-flag";

type CameraStatus = "idle" | "loading" | "ready" | "captured" | "error";
type DetectionStatus = "idle" | "aligned" | "capturing";
type FacingMode = "environment" | "user";

type OdometerCameraProps = {
  onClose: () => void;
  onUsePhoto: (
    blob: Blob,
    capturedAt: string,
    previewUrl: string
  ) => void;
  onRetake?: () => void;
};

export function OdometerCamera({ onClose, onUsePhoto, onRetake }: OdometerCameraProps) {
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
    serverPath?: string;
  } | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);

  // Dev-only debug info
  const [devCropInfo, setDevCropInfo] = useState<string | null>(null);
  const [devOcrPanel, setDevOcrPanel] = useState<string | null>(null);

  useEffect(() => {
    analyzerRef.current = new LiveFrameAnalyzer();
    void openCamera(facingMode);

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

  async function openCamera(mode: FacingMode) {
    setStatus("loading");
    setErrorKey(null);
    setDetectionStatus("idle");
    setTorchSupported(false);
    setTorchEnabled(false);
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
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Check capabilities for torch
      const track = stream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const capabilities = track.getCapabilities() as any;
        if (capabilities.torch) {
          setTorchSupported(true);
        }
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
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      if (track && torchEnabled) {
        try {
          track.applyConstraints({ advanced: [{ torch: false } as any] });
        } catch(e) {}
      }
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function toggleTorch() {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextTorch = !torchEnabled;
      await track.applyConstraints({ advanced: [{ torch: nextTorch } as any] });
      setTorchEnabled(nextTorch);
      console.info("[odometer-camera] torch_changed", { enabled: nextTorch });
    } catch (error) {
      console.error("Failed to toggle torch", error);
      setTorchEnabled(false);
    }
  }

  function toggleFacingMode() {
    stopCamera();
    const nextMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(nextMode);
    void openCamera(nextMode);
  }

  function calculateVideoFrameCrop(
    videoElement: HTMLVideoElement,
    frameElement: HTMLDivElement
  ) {
    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;
    const videoRect = videoElement.getBoundingClientRect();
    const frameRect = frameElement.getBoundingClientRect();

    const scale = Math.max(
      videoRect.width / videoWidth,
      videoRect.height / videoHeight
    );

    const displayedWidth = videoWidth * scale;
    const displayedHeight = videoHeight * scale;

    const offsetX = (displayedWidth - videoRect.width) / 2;
    const offsetY = (displayedHeight - videoRect.height) / 2;

    const relativeFrameX = frameRect.left - videoRect.left;
    const relativeFrameY = frameRect.top - videoRect.top;

    const sourceX = (relativeFrameX + offsetX) / scale;
    const sourceY = (relativeFrameY + offsetY) / scale;
    const sourceWidth = frameRect.width / scale;
    const sourceHeight = frameRect.height / scale;

    return {
      sourceX: Math.max(0, sourceX),
      sourceY: Math.max(0, sourceY),
      sourceWidth: Math.min(videoWidth - sourceX, sourceWidth),
      sourceHeight: Math.min(videoHeight - sourceY, sourceHeight),
      displayedWidth,
      displayedHeight,
      frameRect,
    };
  }

  async function captureFrame() {
    const video = videoRef.current;
    const guide = guideRef.current;

    if (!video || !guide || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0 || guide.getBoundingClientRect().width === 0) {
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    const crop = calculateVideoFrameCrop(video, guide);

    if (crop.sourceWidth <= 0 || crop.sourceHeight <= 0) {
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    console.info("[odometer-camera] frame_crop_calculated", {
      videoIntrinsicWidth: video.videoWidth,
      videoIntrinsicHeight: video.videoHeight,
      videoRenderedWidth: crop.displayedWidth,
      videoRenderedHeight: crop.displayedHeight,
      frameRect: crop.frameRect,
      sourceRect: { x: crop.sourceX, y: crop.sourceY, w: crop.sourceWidth, h: crop.sourceHeight }
    });

    const canvas = document.createElement("canvas");
    canvas.width = crop.sourceWidth;
    canvas.height = crop.sourceHeight;
    const context = canvas.getContext("2d");

    if (!context) {
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    try {
      context.drawImage(
        video,
        crop.sourceX,
        crop.sourceY,
        crop.sourceWidth,
        crop.sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      // Verify pixels before upload
      const points = [
        { x: 0.5, y: 0.5 },
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.25, y: 0.75 },
        { x: 0.75, y: 0.75 }
      ];
      let allBlack = true;
      for (const pt of points) {
        const px = context.getImageData(Math.floor(canvas.width * pt.x), Math.floor(canvas.height * pt.y), 1, 1).data;
        if (px[0] > 5 || px[1] > 5 || px[2] > 5) {
          allBlack = false;
          break;
        }
      }

      if (allBlack) {
        console.warn("[odometer-camera] black_capture_detected", { sourceRect: crop });
        setErrorKey("captureFailed");
        setStatus("error");
        autoCaptureLockedRef.current = false;
        return;
      }

      // Diagnostic log for center pixel
      const pixel = context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
      console.info("[odometer-camera] drawImage_check (center_pixel)", { 
        r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3],
        isEmpty: pixel[0] === 0 && pixel[1] === 0 && pixel[2] === 0 && pixel[3] === 0
      });

    } catch (err) {
      console.error("[odometer-camera] drawImage_error", err);
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.9);
    });

    if (!blob) {
      setErrorKey("captureFailed");
      setStatus("error");
      autoCaptureLockedRef.current = false;
      return;
    }

    console.info("[odometer-camera] capture_success_trace", {
      videoIntrinsic: { width: video.videoWidth, height: video.videoHeight },
      canvas: { width: canvas.width, height: canvas.height },
      blobSize: blob.size,
      blobType: blob.type
    });

    clearAutoCaptureTimer();
    setIsFinalizing(true);
    setErrorKey(null);

    const capturedAt = new Date().toISOString();
    const previewUrl = URL.createObjectURL(blob);

    stopCamera();
    setCapture({
      blob,
      capturedAt,
      url: previewUrl
    });
    setStatus("captured");
    setIsFinalizing(false);
  }

  function retake() {
    if (capture?.url) {
      URL.revokeObjectURL(capture.url);
    }
    if (onRetake) {
      onRetake();
    }
    
    setCapture(null);
    setDetectionStatus("idle");
    setErrorKey(null);
    autoCaptureLockedRef.current = false;
    void openCamera(facingMode);
  }

  function close() {
    liveRunRef.current += 1;
    clearAutoCaptureTimer();
    stopCamera();
    if (capture?.url) {
      URL.revokeObjectURL(capture.url);
    }
    if (onRetake) {
      onRetake();
    }
    onClose();
  }

  useEffect(() => {
    if (status !== "ready") return;

    const runId = ++liveRunRef.current;
    const interval = window.setInterval(() => {
      runLiveFrameAnalysis(runId);
    }, 200);

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

    // Pass dummy crop for live visual analysis because the true crop requires layout computation 
    // that might be expensive to do 10x per second. Just keep it simple.
    const analysis = analyzerRef.current.analyzeFrame(
      video,
      0,
      0,
      1,
      1
    );

    if (OCR_DEBUG) {
      setDevOcrPanel(
        `LIVE VISUAL:\ncontent=${analysis.hasDigitContent} | stable=${analysis.isStable} | ready=${analysis.isReadyForCapture}\ncontrast=${analysis.contrast} | edgeDensity=${analysis.edgeDensity}%`,
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex h-dvh items-stretch justify-center bg-navy/95 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white">
      <div className="flex min-h-0 w-full max-w-[430px] flex-col overflow-hidden rounded-[1.25rem] bg-navy shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-white/10 p-3.5">
          <p className="text-sm font-bold text-white">{t("title")}</p>
          <div className="flex items-center gap-2">
            {torchSupported && status === "ready" && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`flex size-10 items-center justify-center rounded-lg text-lg font-semibold [touch-action:manipulation] ${torchEnabled ? 'bg-amber-500/30 text-amber-300' : 'bg-white/10 text-white'}`}
                aria-label="Toggle Flash"
              >
                ⚡
              </button>
            )}
            <button
              type="button"
              onClick={toggleFacingMode}
              className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-lg font-semibold [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label="Switch Camera"
            >
              🔄
            </button>
            <button
              type="button"
              onClick={close}
              className="flex size-10 items-center justify-center rounded-lg bg-white/10 text-lg font-semibold [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              aria-label={t("close")}
            >
              ×
            </button>
          </div>
        </div>

        {/* Viewport */}
        <div className="relative bg-black flex-1 min-h-0">
          <div className="relative w-full h-full overflow-hidden bg-black">
            {status === "captured" && capture ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img 
                  src={capture.url} 
                  alt={t("previewAlt")} 
                  className="max-h-full max-w-full object-contain" 
                  onLoad={() => console.info("[odometer-camera] img_onLoad_fired", { url: capture.url })}
                  onError={() => console.error("[odometer-camera] img_onError_fired", { url: capture.url })}
                />
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                
                {/* Visual Guide Overlay */}
                {status === "ready" && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                    {/* Shadow overlay */}
                    
                    {/* Clear frame in center */}
                    <div className="relative w-[90%] aspect-[16/7] z-20">
                       <div ref={guideRef} className="absolute inset-0 border-2 border-white rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] overflow-hidden" />
                       <div className="absolute -top-8 inset-x-0 text-center text-xs font-bold text-white drop-shadow-md">
                         ضع لوحة العدادات داخل الإطار
                       </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {status === "loading" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-xs font-semibold text-white z-30">
                {t("loading")}
              </div>
            ) : null}

            {status === "error" ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/85 px-4 text-center text-xs font-semibold leading-5 text-amber-200 z-30">
                {t(`errors.${errorKey ?? "unavailable"}`)}
              </div>
            ) : null}
          </div>

          {OCR_DEBUG && devOcrPanel ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 bg-black/85 px-2 py-0.5 font-mono text-[9px] text-yellow-200 whitespace-pre">
              {devOcrPanel}
            </div>
          ) : null}
        </div>

        {/* Footer controls */}
        <div className="space-y-3 p-4 shrink-0">
          <p className="text-center text-xs font-medium text-white/80">
            {status === "captured" ? (
              "هل العداد واضح في هذه الصورة؟"
            ) : (
              "صوّر لوحة العدادات كاملة وبوضوح"
            )}
          </p>

          {status === "captured" && capture ? (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={retake} className="min-h-12 rounded-[0.85rem] bg-white/10 px-4 text-sm font-semibold [touch-action:manipulation]">
                {t("retake")}
              </button>
              <button
                type="button"
                onClick={() => {
                  onUsePhoto(capture.blob, capture.capturedAt, capture.url);
                }}
                className="min-h-12 rounded-[0.85rem] bg-primary px-4 text-sm font-semibold [touch-action:manipulation] disabled:opacity-50"
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
