"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

type CameraStatus = "idle" | "loading" | "ready" | "captured" | "error";

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
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [errorKey, setErrorKey] = useState<string | null>(null);
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
    void openCamera();
  }

  function close() {
    stopCamera();
    onClose();
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
            <div
              ref={guideRef}
              className="pointer-events-none absolute inset-x-8 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-gold shadow-[0_0_0_999px_rgba(0,0,0,0.22)]"
            />
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
              disabled={status !== "ready"}
              className="min-h-14 w-full rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white transition [touch-action:manipulation] disabled:opacity-60"
            >
              {t("capture")}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  function getNormalizedGuideCrop(video: HTMLVideoElement): OdometerCrop | null {
    const frame = frameRef.current;
    const guide = guideRef.current;

    if (!frame || !guide || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return null;
    }

    const frameRect = frame.getBoundingClientRect();
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

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
