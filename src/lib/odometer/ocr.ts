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
};

type OdometerOcrPass = {
  name: string;
  cropPaddingX: number;
  cropPaddingY: number;
  maxWidth: number;
  mode: "grayscale" | "contrast" | "threshold";
  threshold?: number;
  contrast?: number;
};

const minimumAcceptedConfidence = 55;
const minimumCandidateDigits = 4;
const preferredMinimumDigits = 5;
const preferredMaximumDigits = 8;
const strongDisagreementRatio = 0.55;
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

const ocrPasses: OdometerOcrPass[] = [
  {
    name: "scan-grayscale",
    cropPaddingX: 0,
    cropPaddingY: 0,
    maxWidth: 1100,
    mode: "grayscale",
    contrast: 1.15,
  },
  {
    name: "scan-contrast",
    cropPaddingX: 0,
    cropPaddingY: 0,
    maxWidth: 1100,
    mode: "contrast",
    contrast: 1.55,
  },
  {
    name: "scan-threshold",
    cropPaddingX: 0,
    cropPaddingY: 0,
    maxWidth: 1200,
    mode: "threshold",
    contrast: 1.35,
    threshold: 138,
  },
];

export async function readOdometerFromPhoto(
  blob: Blob,
  crop: OdometerCrop,
): Promise<OdometerOcrResult> {
  const worker = await getOdometerWorker();
  const candidates: OdometerOcrCandidate[] = [];
  const rawTexts: string[] = [];

  for (const pass of ocrPasses) {
    const image = await preprocessOdometerImage(blob, crop, pass);

    try {
      const { data } = await worker.recognize(image);
      rawTexts.push(`[${pass.name}] ${data.text}`);
      const extracted = extractOdometerReading(data.text, data.confidence, pass.name);
      candidates.push(...extracted);
    } finally {
      URL.revokeObjectURL(image);
    }
  }

  return buildConsensusResult(candidates, rawTexts.join("\n"));
}

export async function terminateOdometerOcrWorker() {
  const worker = await workerPromise?.catch(() => null);
  workerPromise = null;
  await worker?.terminate().catch(() => undefined);
}

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

async function getOdometerWorker() {
  workerPromise ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789,. kmKMODOodo",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });
    return worker;
  })();

  return workerPromise;
}

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

async function preprocessOdometerImage(
  blob: Blob,
  crop: OdometerCrop,
  pass: OdometerOcrPass,
) {
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

  const processedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

  if (!processedBlob) {
    throw new Error("ODOMETER_OCR_PREPROCESS_FAILED");
  }

  return URL.createObjectURL(processedBlob);
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
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = clamp((gray - 128) * (pass.contrast ?? 1) + 128, 0, 255);
    const value = pass.mode === "threshold"
      ? contrasted > (pass.threshold ?? 145)
        ? 255
        : 0
      : contrasted;

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
  if (/^0{2,}\d{3,}$/u.test(reading)) return false;

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
