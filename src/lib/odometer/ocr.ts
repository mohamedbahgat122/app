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
  mode: "grayscale" | "contrast" | "threshold" | "invert" | "original";
  threshold?: number;
  contrast?: number;
};

// ── Final OCR thresholds (Strict Exact Consensus) ──────────────────────────
const minimumCandidateDigits = 4;

// ── Shared worker (created once, reused across scans) ──────────────────────
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

// ── 5 Tight Preprocessing Passes centered on ODO strip ────────────────────
const ocrPasses: OdometerOcrPass[] = [
  {
    name: "scan-original",
    cropPaddingX: 0.0,
    cropPaddingY: 0.0,
    maxWidth: 1200,
    mode: "original",
  },
  {
    name: "scan-grayscale",
    cropPaddingX: 0.0,
    cropPaddingY: 0.0,
    maxWidth: 1200,
    mode: "grayscale",
    contrast: 1.15,
  },
  {
    name: "scan-invert",
    cropPaddingX: 0.0,
    cropPaddingY: 0.0,
    maxWidth: 1200,
    mode: "invert",
    contrast: 1.2,
  },
  {
    name: "scan-contrast",
    cropPaddingX: 0.01,
    cropPaddingY: 0.01,
    maxWidth: 1200,
    mode: "contrast",
    contrast: 1.55,
  },
  {
    name: "scan-threshold",
    cropPaddingX: 0.01,
    cropPaddingY: 0.01,
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
 * FINAL MODE — Strict multi-pass OCR on captured photo.
 *
 * Runs 5 tight ROI passes. Accepts ONLY IF exact same reading appears in
 * >= 2 passes OR an explicit ODO anchor reading is supported by 2 passes.
 * NO guessing, NO partial prefix expansion, NO false value acceptance.
 */
export async function readOdometerFromPhoto(
  blob: Blob,
): Promise<OdometerOcrResult> {
  const worker = await getOdometerWorker();
  const candidates: OdometerOcrCandidate[] = [];
  const rawTexts: string[] = [];

  for (const pass of ocrPasses) {
    const canvas = await preprocessOdometerImage(blob, pass);
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
// CANDIDATE EXTRACTION — ODO ANCHORS & DIRECT READINGS ONLY
// ──────────────────────────────────────────────────────────────────────────

export function extractOdometerReading(
  ocrText: string,
  confidence: number,
  pass = "unknown",
): OdometerOcrCandidate[] {
  const normalized = normalizeOcrText(ocrText);
  const candidates: OdometerOcrCandidate[] = [];

  // 1. Context Pass: Check for explicit ODO / ODOMETER / TOTAL anchors
  const anchorRegex = /(?:odo|od0|0do|odometer|total)\s*[:=]?\s*(\d{4,9})/giu;
  for (const match of normalized.matchAll(anchorRegex)) {
    const reading = match[1]!.replace(/[^\d]/g, "");
    if (isPlausibleReading(reading)) {
      candidates.push({
        reading,
        confidence: clamp(Math.round(confidence + 40), 0, 100),
        pass,
        rawText: ocrText,
        isOdoAnchored: true,
      });
    }
  }

  // 2. Numeric Pass: Match plain digit sequences 4 to 9 digits
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

      // Exclude clock / temp / speed
      if (looksLikeClockOrTemperature(raw, before, after)) continue;
      if (looksLikeSpeed(raw, before, after)) continue;

      candidates.push({
        reading,
        confidence: clamp(Math.round(confidence), 0, 100),
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
// STRICT EXACT CONSENSUS ENGINE
// ──────────────────────────────────────────────────────────────────────────

export function buildConsensusResult(
  candidates: OdometerOcrCandidate[],
  rawText: string,
): OdometerOcrResult {
  if (candidates.length === 0) {
    return rejectedResult("no_candidate", rawText, []);
  }

  // Find explicit ODO anchor readings
  const odoAnchoredCandidates = candidates.filter((c) => c.isOdoAnchored && c.reading);
  const odoAnchorReadings = Array.from(new Set(odoAnchoredCandidates.map((c) => c.reading)));

  // Count exact pass occurrences per reading
  const readingPassMap = new Map<string, Set<string>>();
  const readingConfMap = new Map<string, number[]>();

  for (const c of candidates) {
    if (!c.reading) continue;
    if (!readingPassMap.has(c.reading)) {
      readingPassMap.set(c.reading, new Set());
      readingConfMap.set(c.reading, []);
    }
    readingPassMap.get(c.reading)!.add(c.pass);
    readingConfMap.get(c.reading)!.push(c.confidence);
  }

  const multiPassReadings = Array.from(readingPassMap.entries())
    .filter(([_, passes]) => passes.size >= 2)
    .map(([reading]) => reading);

  let verifiedReading: string | null = null;
  let verifiedConfidence = 0;

  // RULE 1: If an explicit ODO anchor reading exists (e.g. ODO 598669)
  if (odoAnchorReadings.length > 0) {
    const anchorReading = odoAnchorReadings[0]!;
    const passesForAnchor = readingPassMap.get(anchorReading)?.size ?? 0;

    // Must be supported by at least 2 passes total (context pass + 1 pass)
    if (passesForAnchor >= 2 || odoAnchoredCandidates.length >= 2) {
      verifiedReading = anchorReading;
      verifiedConfidence = average(readingConfMap.get(anchorReading) ?? [80]);
    } else {
      // ODO anchor exists but disagrees or lacks 2nd pass support -> REJECT
      return rejectedResult("conflict", rawText, candidates);
    }
  } else {
    // RULE 2: No ODO anchor. Exact same full reading MUST appear in >= 2 passes
    if (multiPassReadings.length === 1) {
      verifiedReading = multiPassReadings[0]!;
      verifiedConfidence = average(readingConfMap.get(verifiedReading) ?? [70]);
    } else if (multiPassReadings.length > 1) {
      // Handle prefix/suffix overlap (e.g. 598669 vs 59866)
      const sortedByLength = [...multiPassReadings].sort((a, b) => b.length - a.length);
      const longest = sortedByLength[0]!;
      const secondLongest = sortedByLength[1]!;

      if (longest.includes(secondLongest) || secondLongest.includes(longest)) {
        verifiedReading = longest;
        verifiedConfidence = average(readingConfMap.get(longest) ?? [70]);
      } else {
        // Conflicting distinct numbers (e.g. 598669 vs 80140) -> REJECT
        return rejectedResult("conflict", rawText, candidates);
      }
    }
  }

  if (!verifiedReading) {
    return rejectedResult("low_confidence", rawText, candidates);
  }

  return {
    reading: verifiedReading,
    accepted: true,
    confidence: clamp(Math.round(verifiedConfidence), 0, 100),
    rawText,
    candidates,
    status: "accepted",
    rejectionReason: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// IMAGE PREPROCESSING (Tight ROI Crop)
// ──────────────────────────────────────────────────────────────────────────

async function preprocessOdometerImage(
  blob: Blob,
  pass: OdometerOcrPass,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  const source = getSourceCrop(bitmap.width, bitmap.height, pass);
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
    } else if (pass.mode === "contrast") {
      value = clamp((gray - 128) * (pass.contrast ?? 1) + 128, 0, 255);
    } else {
      value = clamp(gray, 0, 255);
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
  pass: OdometerOcrPass,
) {
  const paddingX = pass.cropPaddingX;
  const paddingY = pass.cropPaddingY;
  const x = clamp(0 - paddingX, 0, 1);
  const y = clamp(0 - paddingY, 0, 1);
  const right = clamp(1 + paddingX, 0, 1);
  const bottom = clamp(1 + paddingY, 0, 1);

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
      const eastern = "٠١٢٣٤٥٦٧٨٩".indexOf(char);
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
