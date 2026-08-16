import type { OdometerCrop } from "@/components/camera/odometer-camera";

export type OdometerOcrCandidate = {
  reading: string;
  confidence: number;
  pass: string;
  rawText: string;
};

export type OdometerOcrResult = {
  reading: string | null;
  accepted: boolean;
  confidence: number;
  rawText: string;
  candidates: OdometerOcrCandidate[];
  status: "accepted" | "rejected";
  rejectionReason: "no_candidate" | "low_confidence" | "conflict" | null;
  /** DEV-ONLY: per-pass raw texts from live detection */
  _debugPasses?: Record<string, string>;
};

type OdometerOcrPass = {
  name: string;
  cropPaddingX: number;
  cropPaddingY: number;
  maxWidth: number;
  mode: "grayscale" | "contrast" | "threshold" | "invert";
  threshold?: number;
  contrast?: number;
};

// ── Final OCR thresholds (strict) ──────────────────────────────────────────
const minimumAcceptedConfidence = 55;
const minimumCandidateDigits = 4;
const preferredMinimumDigits = 5;
const preferredMaximumDigits = 8;
const strongDisagreementRatio = 0.55;

// ── Live OCR thresholds (lenient) ──────────────────────────────────────────
/** Minimum digits in live mode: 3–8 */
const liveMinimumDigits = 3;
/** Accept if raw Tesseract confidence ≥ this value */
const minimumLiveConfidence = 15;

// ── Dev-only debug flag ────────────────────────────────────────────────────
const IS_DEV = process.env.NODE_ENV === "development";

// ── Shared worker (created once, reused across scans) ──────────────────────
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

// ── Live OCR: two lightweight passes ─────────────────────────────────────
// Pass 1: normal grayscale + gentle contrast  (light digits on dark bg → may need invert)
// Pass 2: inverted grayscale                  (dark on light, classic OCR expectation)
const liveOcrPassNormal: OdometerOcrPass = {
  name: "live-normal",
  cropPaddingX: 0.08,
  cropPaddingY: 0.08,
  maxWidth: 800,
  mode: "grayscale",
  contrast: 1.1,
};

const liveOcrPassInvert: OdometerOcrPass = {
  name: "live-invert",
  cropPaddingX: 0.08,
  cropPaddingY: 0.08,
  maxWidth: 800,
  mode: "invert",
  contrast: 1.15,
};

// ── Final OCR passes (multi-pass, strict) ─────────────────────────────────
const ocrPasses: OdometerOcrPass[] = [
  {
    name: "scan-grayscale",
    cropPaddingX: 0.06,
    cropPaddingY: 0.08,
    maxWidth: 1100,
    mode: "grayscale",
    contrast: 1.15,
  },
  {
    name: "scan-contrast",
    cropPaddingX: 0.07,
    cropPaddingY: 0.08,
    maxWidth: 1100,
    mode: "contrast",
    contrast: 1.55,
  },
  {
    name: "scan-threshold",
    cropPaddingX: 0.08,
    cropPaddingY: 0.1,
    maxWidth: 1200,
    mode: "threshold",
    contrast: 1.35,
    threshold: 138,
  },
];

// ──────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ──────────────────────────────────────────────────────────────────────────

/**
 * LIVE MODE — lenient two-pass OCR (normal + inverted).
 *
 * Returns accepted=true as soon as ANY 3–8 digit sequence is found in
 * either pass. No consensus, no penalties, no repeated-reading requirement.
 */
export async function readOdometerLiveDetection(
  blob: Blob,
  crop: OdometerCrop,
): Promise<OdometerOcrResult> {
  const worker = await getOdometerWorker();
  await setOdometerWorkerMode("live");

  const passes = [liveOcrPassNormal, liveOcrPassInvert];
  const passResults: Record<string, string> = {};

  for (const pass of passes) {
    // Returns canvas directly — no Blob URL needed
    const canvas = await preprocessOdometerImage(blob, crop, pass);

    const { data } = await worker.recognize(canvas);
    const rawText = data.text ?? "";
    const rawConf = data.confidence ?? 0;

    passResults[pass.name] = rawText.trim();

    if (IS_DEV) {
      // dataURL for debug preview — independent of OCR, never revoked
      const dataUrl = canvas.toDataURL("image/png");
      showDebugPreview(dataUrl, pass.name);
      console.log(
        `[OCR] ${pass.name} conf=${rawConf.toFixed(1)} | text=${JSON.stringify(rawText.trim())}`,
      );
    }

    const candidates = extractLiveCandidates(rawText, rawConf);

    if (candidates.length > 0) {
      const best = candidates[0]!;
      if (IS_DEV) {
        console.log(
          `[OCR] FOUND via ${pass.name}: "${best.reading}" conf=${best.confidence} accepted=true`,
        );
      }
      return {
        reading: best.reading,
        accepted: true,
        confidence: best.confidence,
        rawText,
        candidates,
        status: "accepted",
        rejectionReason: null,
        _debugPasses: IS_DEV ? { ...passResults } : undefined,
      };
    }
  }

  if (IS_DEV) {
    console.log(
      `[OCR] No candidate. passes: ${JSON.stringify(passResults)}`,
    );
  }

  return {
    ...rejectedResult("no_candidate", "", []),
    _debugPasses: IS_DEV ? passResults : undefined,
  };
}

/**
 * FINAL MODE — strict multi-pass OCR after photo is captured.
 * Unchanged behaviour.
 */
export async function readOdometerFromPhoto(
  blob: Blob,
  crop: OdometerCrop,
): Promise<OdometerOcrResult> {
  const worker = await getOdometerWorker();
  const candidates: OdometerOcrCandidate[] = [];
  const rawTexts: string[] = [];

  for (const pass of ocrPasses) {
    // Canvas passed directly — no Blob URL lifecycle risk
    await setOdometerWorkerMode("final");
    const canvas = await preprocessOdometerImage(blob, crop, pass);
    const { data } = await worker.recognize(canvas);
    rawTexts.push(`[${pass.name}] ${data.text}`);
    const extracted = extractOdometerReading(data.text, data.confidence, pass.name);
    candidates.push(...extracted);
  }

  return buildConsensusResult(candidates, rawTexts.join("\n"));
}

export async function terminateOdometerOcrWorker() {
  const worker = await workerPromise?.catch(() => null);
  workerPromise = null;
  await worker?.terminate().catch(() => undefined);
}

/** Used by final-mode only. */
export function extractOdometerReading(
  ocrText: string,
  confidence: number,
  pass = "unknown",
): OdometerOcrCandidate[] {
  const normalized = normalizeOcrText(ocrText);
  const candidates: OdometerOcrCandidate[] = [];
  const patterns = [
    /(?<!\d)(?:\d{1,3}(?:[\s,.]\d{3}){1,3})(?!\d)/gu,
    /(?<!\d)\d{4,9}(?!\d)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const raw = match[0];
      const reading = raw.replace(/[^\d]/g, "");
      if (!isPlausibleReading(reading)) continue;

      const before = normalized.slice(Math.max(0, match.index - 14), match.index);
      const after = normalized.slice(match.index + raw.length, match.index + raw.length + 14);
      let score = confidence;

      if (hasOdometerContext(before, after)) score += 18;
      if (reading.length >= preferredMinimumDigits && reading.length <= preferredMaximumDigits) score += 16;
      if (/^0{2,}\d{3,}$/u.test(reading)) score -= 45;
      if (looksLikeClockOrTemperature(raw, before, after)) score -= 50;
      if (looksLikeSpeed(raw, before, after)) score -= 35;

      candidates.push({
        reading,
        confidence: clamp(Math.round(score), 0, 100),
        pass,
        rawText: ocrText,
      });
    }
  }

  return dedupeCandidates(candidates);
}

// ──────────────────────────────────────────────────────────────────────────
// LIVE EXTRACTION — no penalties, just find digits
// ──────────────────────────────────────────────────────────────────────────

function extractLiveCandidates(
  ocrText: string,
  confidence: number,
): OdometerOcrCandidate[] {
  const normalized = normalizeOcrText(ocrText);
  const candidates: OdometerOcrCandidate[] = [];

  // Patterns: formatted numbers (e.g. 300,250) and plain digit sequences 3-8 digits
  const patterns = [
    /(?<!\d)(?:\d{1,3}(?:[\s,.]\d{3}){1,2})(?!\d)/gu,
    /(?<!\d)\d{3,8}(?!\d)/gu,
  ];

  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const raw = match[0];
      const reading = raw.replace(/[^\d]/g, "");
      if (!isLivePlausibleReading(reading)) continue;

      let score = confidence;
      if (reading.length >= preferredMinimumDigits && reading.length <= preferredMaximumDigits) {
        score += 8;
      }

      candidates.push({
        reading,
        confidence: clamp(Math.round(score), 0, 100),
        pass: "live",
        rawText: ocrText,
      });
    }
  }

  // Dedup by reading, keep highest confidence
  const map = new Map<string, OdometerOcrCandidate>();
  for (const c of candidates) {
    const existing = map.get(c.reading);
    if (!existing || c.confidence > existing.confidence) {
      map.set(c.reading, c);
    }
  }

  return Array.from(map.values())
    .filter((c) => c.confidence >= minimumLiveConfidence)
    .sort((a, b) => b.confidence - a.confidence || b.reading.length - a.reading.length);
}

// ──────────────────────────────────────────────────────────────────────────
// WORKER MANAGEMENT (single shared worker, reused)
// ──────────────────────────────────────────────────────────────────────────

async function getOdometerWorker() {
  workerPromise ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: () => undefined, // suppress all Tesseract console output
    });
    await worker.setParameters({
      // Start in live mode params; setOdometerWorkerMode will switch as needed
      tessedit_char_whitelist: "0123456789",
      tessedit_pageseg_mode: PSM.SINGLE_LINE,
      debug_file: "/dev/null",
      preserve_interword_spaces: "0",
    });
    return worker;
  })();

  return workerPromise;
}

async function setOdometerWorkerMode(mode: "live" | "final") {
  const { PSM } = await import("tesseract.js");
  const worker = await getOdometerWorker();

  await worker.setParameters(
    mode === "live"
      ? {
          // Digits only — no km/ODO noise to confuse the model
          tessedit_char_whitelist: "0123456789",
          // SINGLE_LINE: treat the crop as one line of digits
          tessedit_pageseg_mode: PSM.SINGLE_LINE,
          debug_file: "/dev/null",
          preserve_interword_spaces: "0",
        }
      : {
          tessedit_char_whitelist: "0123456789,. kmKMODOodo",
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          debug_file: "/dev/null",
          preserve_interword_spaces: "1",
        },
  );
}

// ──────────────────────────────────────────────────────────────────────────
// FINAL-MODE CONSENSUS
// ──────────────────────────────────────────────────────────────────────────

function buildConsensusResult(
  candidates: OdometerOcrCandidate[],
  rawText: string,
): OdometerOcrResult {
  const usableCandidates = dedupeCandidates(candidates)
    .filter((candidate) => candidate.confidence >= 35)
    .sort((a, b) => b.confidence - a.confidence);

  if (usableCandidates.length === 0) {
    return rejectedResult("no_candidate", rawText, []);
  }

  const groups = new Map<string, OdometerOcrCandidate[]>();

  for (const candidate of usableCandidates) {
    groups.set(candidate.reading, [...(groups.get(candidate.reading) ?? []), candidate]);
  }

  const rankedGroups = Array.from(groups.entries())
    .map(([reading, group]) => ({
      reading,
      group,
      passCount: new Set(group.map((candidate) => candidate.pass)).size,
      averageConfidence: average(group.map((candidate) => candidate.confidence)),
      bestConfidence: Math.max(...group.map((candidate) => candidate.confidence)),
    }))
    .sort((a, b) => {
      if (b.passCount !== a.passCount) return b.passCount - a.passCount;
      if (b.averageConfidence !== a.averageConfidence) return b.averageConfidence - a.averageConfidence;
      return b.reading.length - a.reading.length;
    });

  const best = rankedGroups[0];
  const second = rankedGroups[1];

  if (!best) {
    return rejectedResult("no_candidate", rawText, usableCandidates);
  }

  if (best.passCount < 2) {
    return rejectedResult("conflict", rawText, usableCandidates);
  }

  if (best.averageConfidence < minimumAcceptedConfidence && best.bestConfidence < 72) {
    return rejectedResult("low_confidence", rawText, usableCandidates);
  }

  if (
    second &&
    second.passCount >= 2 &&
    second.averageConfidence >= best.averageConfidence * strongDisagreementRatio &&
    second.reading !== best.reading
  ) {
    return rejectedResult("conflict", rawText, usableCandidates);
  }

  return {
    reading: best.reading,
    accepted: true,
    confidence: clamp(Math.round(best.averageConfidence), 0, 100),
    rawText,
    candidates: usableCandidates,
    status: "accepted",
    rejectionReason: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// IMAGE PREPROCESSING
// ──────────────────────────────────────────────────────────────────────────

async function preprocessOdometerImage(
  blob: Blob,
  crop: OdometerCrop,
  pass: OdometerOcrPass,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const source = getSourceCrop(bitmap.width, bitmap.height, crop, pass);
  const scale = Math.min(pass.maxWidth / source.width, 1);
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    bitmap.close();
    throw new Error("ODOMETER_OCR_CANVAS_UNAVAILABLE");
  }

  context.drawImage(
    bitmap,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    width,
    height,
  );
  bitmap.close();
  applyImageProcessing(context, width, height, pass);

  // Return the canvas directly — callers pass it to worker.recognize()
  // No Blob URL created here, so no revocation race condition.
  return canvas;
}

function applyImageProcessing(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  pass: OdometerOcrPass,
) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index]!;
    const g = data[index + 1]!;
    const b = data[index + 2]!;
    const gray = r * 0.299 + g * 0.587 + b * 0.114;

    let value: number;

    if (pass.mode === "invert") {
      // Invert then contrast — converts bright-on-dark to dark-on-light
      const inverted = 255 - gray;
      value = clamp((inverted - 128) * (pass.contrast ?? 1.15) + 128, 0, 255);
    } else if (pass.mode === "threshold") {
      const contrasted = clamp((gray - 128) * (pass.contrast ?? 1) + 128, 0, 255);
      value = contrasted > (pass.threshold ?? 145) ? 255 : 0;
    } else {
      // grayscale or contrast
      value = clamp((gray - 128) * (pass.contrast ?? 1) + 128, 0, 255);
    }

    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    // alpha unchanged
  }

  context.putImageData(imageData, 0, 0);
}

function getSourceCrop(
  width: number,
  height: number,
  crop: OdometerCrop,
  pass: OdometerOcrPass,
) {
  const paddingX = crop.width * pass.cropPaddingX;
  const paddingY = crop.height * pass.cropPaddingY;
  const x = clamp(crop.x - paddingX, 0, 1);
  const y = clamp(crop.y - paddingY, 0, 1);
  const right = clamp(crop.x + crop.width + paddingX, 0, 1);
  const bottom = clamp(crop.y + crop.height + paddingY, 0, 1);

  return {
    x: Math.round(x * width),
    y: Math.round(y * height),
    width: Math.max(1, Math.round((right - x) * width)),
    height: Math.max(1, Math.round((bottom - y) * height)),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// DEV-ONLY: show the actual image sent to Tesseract as a small overlay
// ──────────────────────────────────────────────────────────────────────────

function showDebugPreview(dataUrl: string, passName: string) {
  if (typeof document === "undefined") return;
  const existingId = `ocr-debug-${passName}`;
  const existing = document.getElementById(existingId);
  if (existing) existing.remove();

  const wrapper = document.createElement("div");
  wrapper.id = existingId;
  wrapper.style.cssText = [
    "position:fixed",
    "bottom:" + (passName.includes("invert") ? "140px" : "80px"),
    "right:8px",
    "z-index:99999",
    "border:2px solid " + (passName.includes("invert") ? "#60a5fa" : "#fbbf24"),
    "background:#000",
    "font-size:9px",
    "color:#fff",
    "line-height:1.2",
    "padding:2px 4px",
    "border-radius:4px",
    "pointer-events:none",
  ].join(";");

  const label = document.createElement("div");
  label.textContent = passName;
  wrapper.appendChild(label);

  // dataURL — never revoked, always readable
  const img = document.createElement("img");
  img.src = dataUrl;
  img.style.cssText = "display:block;max-width:180px;max-height:48px;object-fit:contain";
  wrapper.appendChild(img);

  document.body.appendChild(wrapper);
  // Auto-remove after 3s so it doesn't accumulate
  setTimeout(() => wrapper.remove(), 3000);
}

// ──────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

function normalizeOcrText(value: string) {
  return Array.from(value.normalize("NFKC"))
    .map((char) => {
      const eastern = "٠١٢٣٤٥٦٧٨٩".indexOf(char);
      if (eastern >= 0) return String(eastern);
      const persian = "۰۱۲۳۴۵۶۷۸۹".indexOf(char);
      if (persian >= 0) return String(persian);
      if (/[|Il]/u.test(char)) return "1";
      return char;
    })
    .join("");
}

/** Plausibility for FINAL mode (≥4 digits). */
function isPlausibleReading(reading: string) {
  if (reading.length < minimumCandidateDigits || reading.length > 9) return false;
  if (/^0{2,}\d{3,}$/u.test(reading)) return false;
  const value = Number(reading);
  return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;
}

/** Plausibility for LIVE mode (≥3 digits, lenient). */
function isLivePlausibleReading(reading: string) {
  if (reading.length < liveMinimumDigits || reading.length > 8) return false;
  if (/^0{3,}$/u.test(reading)) return false;
  const value = Number(reading);
  return Number.isInteger(value) && value >= 0 && value <= 9_999_999;
}

function dedupeCandidates(candidates: OdometerOcrCandidate[]) {
  const map = new Map<string, OdometerOcrCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.pass}:${candidate.reading}`;
    const existing = map.get(key);
    if (!existing || candidate.confidence > existing.confidence) {
      map.set(key, candidate);
    }
  }
  return Array.from(map.values());
}

function rejectedResult(
  reason: OdometerOcrResult["rejectionReason"],
  rawText: string,
  candidates: OdometerOcrCandidate[],
): OdometerOcrResult {
  return {
    reading: null,
    accepted: false,
    confidence: 0,
    rawText,
    candidates,
    status: "rejected",
    rejectionReason: reason,
  };
}

function hasOdometerContext(before: string, after: string) {
  return /(odo|odometer|km|كلم|كم)\s*$/iu.test(before.trim()) ||
    /^\s*(km|odo|odometer|كلم|كم)/iu.test(after.trim());
}

function looksLikeClockOrTemperature(raw: string, before: string, after: string) {
  const context = `${before}${raw}${after}`;
  return /(\d{1,2}:\d{2}|°|c\b|temp|trip)/iu.test(context);
}

function looksLikeSpeed(raw: string, before: string, after: string) {
  const compact = `${before}${raw}${after}`.replace(/\s+/g, "");
  return /\b\d{1,3}km\/?h\b/iu.test(compact);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
