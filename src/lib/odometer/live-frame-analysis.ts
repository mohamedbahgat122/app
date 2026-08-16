/**
 * Ultra-fast, visual-only live frame analyzer for camera odometer scanning.
 *
 * Checks for digit/text-like contrast and edge structure inside the scan strip.
 * Requires minimal stability (1-2 fast frames) for instant auto-capture.
 *
 * NO Tesseract / OCR calls are executed here.
 */

export type FrameAnalysisResult = {
  /** True if contrast and pixel structure resemble digits/text */
  hasDigitContent: boolean;
  /** True if frame is sufficiently still */
  isStable: boolean;
  /** True when ready for instant auto-capture */
  isReadyForCapture: boolean;
  /** Metrics for debug UI */
  contrast: number;
  edgeDensity: number;
  motionDiff: number;
};

export class LiveFrameAnalyzer {
  private history: Uint8Array[] = [];
  private historyCapacity = 3;
  private stableCount = 0;
  private requiredStableFrames = 1; // Instant ready on first/second clear detection

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private sampleWidth: number;
  private sampleHeight: number;

  constructor(sampleWidth = 120, sampleHeight = 30) {
    this.sampleWidth = sampleWidth;
    this.sampleHeight = sampleHeight;

    if (typeof document !== "undefined") {
      this.canvas = document.createElement("canvas");
      this.canvas.width = sampleWidth;
      this.canvas.height = sampleHeight;
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }
  }

  public reset(): void {
    this.history = [];
    this.stableCount = 0;
  }

  public analyzeFrame(
    video: HTMLVideoElement,
    cropX: number,
    cropY: number,
    cropWidth: number,
    cropHeight: number,
  ): FrameAnalysisResult {
    if (!this.ctx || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return {
        hasDigitContent: false,
        isStable: false,
        isReadyForCapture: false,
        contrast: 0,
        edgeDensity: 0,
        motionDiff: 999,
      };
    }

    const sx = Math.round(cropX * video.videoWidth);
    const sy = Math.round(cropY * video.videoHeight);
    const sw = Math.max(1, Math.round(cropWidth * video.videoWidth));
    const sh = Math.max(1, Math.round(cropHeight * video.videoHeight));

    // Draw downsampled crop ROI directly onto sample canvas (120x30)
    this.ctx.drawImage(video, sx, sy, sw, sh, 0, 0, this.sampleWidth, this.sampleHeight);

    const imgData = this.ctx.getImageData(0, 0, this.sampleWidth, this.sampleHeight);
    const data = imgData.data;
    const len = this.sampleWidth * this.sampleHeight;
    const gray = new Uint8Array(len);

    let minLum = 255;
    let maxLum = 0;

    for (let i = 0; i < len; i++) {
      const idx = i * 4;
      const g = Math.round(data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114);
      gray[i] = g;
      if (g < minLum) minLum = g;
      if (g > maxLum) maxLum = g;
    }

    const contrast = maxLum - minLum; // 0..255

    // Fast Edge Gradient Analysis
    let highEdgeCount = 0;
    const w = this.sampleWidth;
    const h = this.sampleHeight;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const dx = Math.abs(gray[idx + 1]! - gray[idx - 1]!);
        const dy = Math.abs(gray[idx + w]! - gray[idx - w]!);
        const grad = dx + dy;

        if (grad >= 22) {
          highEdgeCount++;
        }
      }
    }

    const edgeDensityRatio = highEdgeCount / len; // 0..1

    // Ultra-lenient digit/text content check:
    // - Reasonable contrast (>= 24)
    // - Simple edge density (>= 2.5%)
    const hasDigitContent = contrast >= 24 && edgeDensityRatio >= 0.025;

    // Fast Motion Check
    let motionDiff = 0;
    if (this.history.length > 0) {
      const lastGray = this.history[this.history.length - 1]!;
      let diffSum = 0;
      for (let i = 0; i < len; i++) {
        diffSum += Math.abs(gray[i]! - lastGray[i]!);
      }
      motionDiff = diffSum / len;
    } else {
      motionDiff = 999;
    }

    this.history.push(gray);
    if (this.history.length > this.historyCapacity) {
      this.history.shift();
    }

    // Lenient motion check: MAD < 25.0 (handles slight hand movement)
    const isFrameStill = motionDiff < 25.0;

    if (hasDigitContent && isFrameStill) {
      this.stableCount++;
    } else {
      this.stableCount = Math.max(0, this.stableCount - 1);
    }

    const isStable = this.stableCount >= this.requiredStableFrames;
    const isReadyForCapture = hasDigitContent && isStable;

    return {
      hasDigitContent,
      isStable,
      isReadyForCapture,
      contrast,
      edgeDensity: Math.round(edgeDensityRatio * 100),
      motionDiff: Math.round(motionDiff * 10) / 10,
    };
  }
}
