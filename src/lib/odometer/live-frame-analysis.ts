/**
 * Visual-only live frame analyzer for camera odometer scanning.
 *
 * Performs downsampled canvas ROI processing (contrast, edge density, vertical strokes)
 * and frame-to-frame motion stability tracking.
 *
 * NO Tesseract / OCR calls are executed here.
 */

export type FrameAnalysisResult = {
  /** True if contrast, vertical edges, and pixel structure resemble digits */
  hasDigitContent: boolean;
  /** True if ROI has remained still across consecutive frames */
  isStable: boolean;
  /** True when both digit content is present and frame is stable */
  isReadyForCapture: boolean;
  /** Metrics for debug UI */
  contrast: number;
  edgeDensity: number;
  motionDiff: number;
};

export class LiveFrameAnalyzer {
  private history: Uint8Array[] = [];
  private historyCapacity = 4;
  private stableCount = 0;
  private requiredStableFrames = 3; // ~3-4 consecutive stable checks (~300-500ms)

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

    // 1. Edge & Vertical Stroke Analysis
    let highEdgeCount = 0;
    let verticalTransitions = 0;
    const w = this.sampleWidth;
    const h = this.sampleHeight;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const dx = Math.abs(gray[idx + 1]! - gray[idx - 1]!);
        const dy = Math.abs(gray[idx + w]! - gray[idx - w]!);
        const grad = dx + dy;

        if (grad >= 28) {
          highEdgeCount++;
        }
        if (dx >= 32) {
          verticalTransitions++;
        }
      }
    }

    const edgeDensityRatio = highEdgeCount / len; // 0..1

    // Digit-like ROI features:
    // - Adequate contrast (>= 32)
    // - Moderate edge density (3.5% to 50%)
    // - Significant vertical stroke transitions (>= 12 across ROI)
    const hasDigitContent =
      contrast >= 32 &&
      edgeDensityRatio >= 0.035 &&
      edgeDensityRatio <= 0.50 &&
      verticalTransitions >= 12;

    // 2. Motion / Stability Analysis (MAD against previous frame)
    let motionDiff = 0;
    if (this.history.length > 0) {
      const lastGray = this.history[this.history.length - 1]!;
      let diffSum = 0;
      for (let i = 0; i < len; i++) {
        diffSum += Math.abs(gray[i]! - lastGray[i]!);
      }
      motionDiff = diffSum / len; // Mean Absolute Difference (0..255)
    } else {
      motionDiff = 999;
    }

    // Push to history
    this.history.push(gray);
    if (this.history.length > this.historyCapacity) {
      this.history.shift();
    }

    // Motion threshold: MAD < 15.0 means camera is held still
    const isFrameStill = motionDiff < 15.0;

    if (hasDigitContent && isFrameStill) {
      this.stableCount++;
    } else {
      this.stableCount = Math.max(0, this.stableCount - 1);
    }

    const isStable = this.stableCount >= this.requiredStableFrames;
    const isReadyForCapture = isStable && hasDigitContent;

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
