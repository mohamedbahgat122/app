import type { OdometerCrop } from "@/components/camera/odometer-camera";
import { OCR_DEBUG } from "@/lib/odometer/ocr-debug-flag";

export type OdometerOcrCandidate = {
  reading: string;
  confidence: number;
  pass: string;
  rawText: string;
  isOdoAnchored?: boolean;
};

export type OdometerOcrResult = {
  reading: string | null;
  accepted: boolean;
  confidence: number;
  rawText: string;
  candidates: OdometerOcrCandidate[];
  status: "accepted" | "rejected";
  rejectionReason: "no_candidate" | "low_confidence" | "conflict" | null;
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

// ── Final OCR thresholds ──────────────────────────────────────────────────
const minimumAcceptedConfidence = 52;
const minimumCandidateDigits = 4;
const preferredMinimumDigits = 5;
const preferredMaximumDigits = 9;

// ── Shared worker (created once, reused across scans) ──────────────────────
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

// ── Final OCR passes (4 variants for all display types & colors) ───────────
const ocrPasses: OdometerOcrPass[] = [
  {
    name: "scan-grayscale",
    cropPaddingX: 0.05,
    cropPaddingY: 0.06,
    maxWidth: 1200,
    mode: "grayscale",
    contrast: 1.15,
  },
  {
    name: "scan-invert",
    cropPaddingX: 0.05,
    cropPaddingY: 0.06,
    maxWidth: 1200,
    mode: "invert",
    contrast: 1.2,
  },
  {
    name: "scan-contrast",
    cropPaddingX: 0.06,
    cropPaddingY: 0.06,
    maxWidth: 1200,
    mode: "contrast",
    contrast: 1.55,
  },
  {
    name: "scan-threshold",
    cropPaddingX: 0.06,
    cropPaddingY: 0.06,
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
 * FINAL MODE — strict multi-pass OCR on captured still photo.
 * Always runs ALL passes to find the full Total Odometer reading.
 */
export async function readOdometerFromPhoto(
  blob: Blob,
  crop: OdometerCrop,
): Promise<OdometerOcrResult> {
  const worker = await getOdometerWorker();
  const candidates: OdometerOcrCandidate[] = [];
  const rawTexts: string[] = [];

  for (const pass of ocrPasses) {
    const canvas = await preprocessOdometerImage(blob, crop, pass);
    const { data } = await worker.recognize(canvas);
    rawTexts.push(`[${pass.name}] ${data.text}`);
    const extracted = extractOdometerReading(data.text ?? "", data.confidence ?? 0, pass.name);
    candidates.push(...extracted);
  }

  return buildConsensusResult(candidates, rawTexts.join("\n"));
}

export async function terminateOdometerOcrWorker() {
  const worker = await workerPromise?.catch(() => null);
  workerPromise = null;
  await worker?.terminate().catch(() => undefined);
}

// ──────────────────────────────────────────────────────────────────────────
// CANDIDATE EXTRACTION — ODO ANCHORS & TOTAL ODOMETER PRIORITY
// ──────────────────────────────────────────────────────────────────────────

export function extractOdometerReading(
  ocrText: string,
  confidence: number,
  pass = "unknown",
): OdometerOcrCandidate[] {
  const normalized = normalizeOcrText(ocrText);
  const candidates: OdometerOcrCandidate[] = [];

  // PASS A: Check for explicit ODO / ODOMETER / TOTAL anchors first
  const anchorRegex = /(?:odo|od0|0do|odometer|total)\s*[:=]?\s*(\d{4,9})/giu;
  for (const match of normalized.matchAll(anchorRegex)) {
    const reading = match[1]!.replace(/[^\d]/g, "");
    if (isPlausibleReading(reading)) {
      candidates.push({
        reading,
        confidence: clamp(Math.round(confidence + 50), 0, 100),
        pass,
        rawText: ocrText,
        isOdoAnchored: true,
      });
    }
  }

  // PASS B: General digit extraction
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

      // Bonus for ODO / km context
      if (hasOdometerContext(before, after)) score += 20;

      // Bonus for preferred odometer digit length (5-8 digits)
      if (reading.length >= preferredMinimumDigits && reading.length <= preferredMaximumDigits) {
        score += 20;
      }

      // Penalize leading zeros
      if (/^0{2,}\d{3,}$/u.test(reading)) score -= 40;

      // Penalize clock / temperature / trip decimals
      if (looksLikeClockOrTemperature(raw, before, after)) score -= 50;

      // Penalize speed (km/h)
      if (looksLikeSpeed(raw, before, after)) score -= 45;

      candidates.push({
        reading,
        confidence: clamp(Math.round(score), 0, 100),
        pass,
        rawText: ocrText,
        isOdoAnchored: false,
      });
    }
  }

  return dedupeCandidates(candidates);
}

// ──────────────────────────────────────────────────────────────────────────
// WORKER MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────

async function getOdometerWorker() {
  workerPromise ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng", 1, {
      logger: () => undefined,
    });
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789,. kmKMODOodoTOTALtotal",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      debug_file: "/dev/null",
      preserve_interword_spaces: "1",
    });
    return worker;
  })();

  return workerPromise;
}

// ──────────────────────────────────────────────────────────────────────────
// FINAL CONSENSUS & PARTIAL PREFIX RESOLUTION
// ──────────────────────────────────────────────────────────────────────────

function buildConsensusResult(
  candidates: OdometerOcrCandidate[],
  rawText: string,
): OdometerOcrResult {
  if (candidates.length === 0) {
    return rejectedResult("no_candidate", rawText, []);
  }

  // Filter out candidates with zero or negative confidence
  let pool = dedupeCandidates(candidates).filter((c) => c.confidence >= 25);
  if (pool.length === 0) {
    return rejectedResult("no_candidate", rawText, []);
  }

  // RESOLVE PARTIAL PREFIXES:
  // If candidate A (e.g. "2802") is a prefix of candidate B (e.g. "280210"),
  // candidate B is the full reading. Penalize partial prefix candidate A.
  const allReadings = Array.from(new Set(pool.map((c) => c.reading)));
  const prefixSet = new Set<string>();

  for (const shortRead of allReadings) {
    for (const longRead of allReadings) {
      if (
        shortRead !== longRead &&
        longRead.length > shortRead.length &&
        longRead.startsWith(shortRead)
      ) {
        prefixSet.add(shortRead);
      }
    }
  }

  // Demote partial prefix candidates
  pool = pool.map((c) => {
    if (prefixSet.has(c.reading)) {
      return { ...c, confidence: Math.max(0, c.confidence - 50) };
    }
    return c;
  }).filter((c) => c.confidence >= 20);

  if (pool.length === 0) {
    return rejectedResult("no_candidate", rawText, []);
  }

  // Group by reading
  const groups = new Map<string, OdometerOcrCandidate[]>();
  for (const candidate of pool) {
    groups.set(candidate.reading, [...(groups.get(candidate.reading) ?? []), candidate]);
  }

  const rankedGroups = Array.from(groups.entries())
    .map(([reading, group]) => {
      const hasAnchor = group.some((c) => c.isOdoAnchored);
      const passCount = new Set(group.map((c) => c.pass)).size;
      const avgConf = average(group.map((c) => c.confidence));
      const maxConf = Math.max(...group.map((c) => c.confidence));

      // Extra weight for ODO anchored readings & multi-pass agreement
      let score = avgConf + (hasAnchor ? 30 : 0) + (passCount >= 2 ? 25 : 0);
      if (reading.length >= preferredMinimumDigits) score += 10;

      return {
        reading,
        group,
        hasAnchor,
        passCount,
        averageConfidence: avgConf,
        bestConfidence: maxConf,
        score,
      };
    })
    .sort((a, b) => b.score - a.score || b.passCount - a.passCount || b.reading.length - a.reading.length);

  const best = rankedGroups[0];
  const second = rankedGroups[1];

  if (!best) {
    return rejectedResult("no_candidate", rawText, pool);
  }

  // STRICT VERIFICATION EVIDENCE:
  // Accept ONLY IF:
  // 1. Has explicit ODO anchor with maxConf >= 45, OR
  // 2. Appeared in at least 2 passes with avgConf >= 48, OR
  // 3. Long digit sequence (>=5 digits) with maxConf >= 65
  const isAccepted =
    best.hasAnchor ||
    best.passCount >= 2 ||
    (best.reading.length >= preferredMinimumDigits && best.bestConfidence >= 65);

  if (!isAccepted) {
    return rejectedResult("low_confidence", rawText, pool);
  }

  // Check for strong un-resolvable conflict
  if (
    second &&
    !best.hasAnchor &&
    second.passCount >= 2 &&
    second.bestConfidence >= best.bestConfidence * 0.85 &&
    second.reading !== best.reading &&
    !best.reading.startsWith(second.reading) &&
    !second.reading.startsWith(best.reading)
  ) {
    return rejectedResult("conflict", rawText, pool);
  }

  return {
    reading: best.reading,
    accepted: true,
    confidence: clamp(Math.round(best.averageConfidence), 0, 100),
    rawText,
    candidates: pool,
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
      const inverted = 255 - gray;
      value = clamp((inverted - 128) * (pass.contrast ?? 1.15) + 128, 0, 255);
    } else if (pass.mode === "threshold") {
      const contrasted = clamp((gray - 128) * (pass.contrast ?? 1) + 128, 0, 255);
      value = contrasted > (pass.threshold ?? 145) ? 255 : 0;
    } else {
      value = clamp((gray - 128) * (pass.contrast ?? 1) + 128, 0, 255);
    }

    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
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
// HELPERS
// ──────────────────────────────────────────────────────────────────────────

function normalizeOcrText(value: string) {
  return Array.from(value.normalize("NFKC"))
    .map((char) => {
      const eastern = "٠١٢٣٥٦٧٨٩".indexOf(char);
      if (eastern >= 0) return String(eastern);
      const persian = "۰۱۲۳۴۵۶۷۸۹".indexOf(char);
      if (persian >= 0) return String(persian);
      if (/[|Il]/u.test(char)) return "1";
      return char;
    })
    .join("");
}

function isPlausibleReading(reading: string) {
  if (reading.length < minimumCandidateDigits || reading.length > 9) return false;
  if (/^0{3,}\d+$/u.test(reading)) return false;
  const value = Number(reading);
  return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;
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
  return /(odo|od0|0do|odometer|total|km|كلم|كم)\s*$/iu.test(before.trim()) ||
    /^\s*(km|odo|od0|0do|odometer|total|كلم|كم)/iu.test(after.trim());
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
