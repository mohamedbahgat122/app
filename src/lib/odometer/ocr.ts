import type { OdometerCrop } from "@/components/camera/odometer-camera";

export type OdometerOcrResult = {
  reading: string | null;
  confidence: number;
  rawText: string;
  status: "high" | "low" | "failed";
};

const highConfidenceThreshold = 68;
let workerPromise: Promise<import("tesseract.js").Worker> | null = null;

export async function readOdometerFromPhoto(
  blob: Blob,
  crop: OdometerCrop,
): Promise<OdometerOcrResult> {
  const image = await preprocessOdometerImage(blob, crop);

  try {
    const worker = await getOdometerWorker();
    const { data } = await worker.recognize(image);
    const extracted = extractOdometerReading(data.text, data.confidence);

    return {
      reading: extracted.reading,
      confidence: extracted.confidence,
      rawText: data.text,
      status:
        extracted.reading && extracted.confidence >= highConfidenceThreshold
          ? "high"
          : extracted.reading
            ? "low"
            : "failed",
    };
  } finally {
    URL.revokeObjectURL(image);
  }
}

export async function terminateOdometerOcrWorker() {
  const worker = await workerPromise?.catch(() => null);
  workerPromise = null;
  await worker?.terminate().catch(() => undefined);
}

export function extractOdometerReading(
  ocrText: string,
  confidence: number,
): { reading: string | null; confidence: number; rawText: string } {
  const normalized = normalizeOcrText(ocrText);
  const candidates = Array.from(normalized.matchAll(/\d[\d,\s]{2,12}\d|\d{4,10}/gu))
    .map((match) => {
      const raw = match[0];
      const reading = raw.replace(/[^\d]/g, "");
      const before = normalized.slice(Math.max(0, match.index - 10), match.index);
      const after = normalized.slice(match.index + raw.length, match.index + raw.length + 10);
      let score = confidence;

      if (/(odo|odometer|km|كلم|كم)$/iu.test(before.trim())) score += 18;
      if (/^(km|odo|odometer|كلم|كم)/iu.test(after.trim())) score += 18;
      if (reading.length >= 5 && reading.length <= 7) score += 16;
      if (reading.length < 4) score -= 40;
      if (reading.length > 8) score -= 15;
      if (looksLikeClockOrTemperature(raw, before, after)) score -= 45;

      return { reading, score };
    })
    .filter((candidate) => {
      if (!candidate.reading) return false;
      const value = Number(candidate.reading);
      return Number.isInteger(value) && value >= 0 && value <= 2_147_483_647;
    })
    .sort((a, b) => b.score - a.score || b.reading.length - a.reading.length);

  const best = candidates[0];

  return {
    reading: best?.reading ?? null,
    confidence: Math.max(0, Math.min(100, Math.round(best?.score ?? confidence))),
    rawText: ocrText,
  };
}

async function getOdometerWorker() {
  workerPromise ??= (async () => {
    const { createWorker, PSM } = await import("tesseract.js");
    const worker = await createWorker("eng");
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz,. kmKMODOodo",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });
    return worker;
  })();

  return workerPromise;
}

async function preprocessOdometerImage(blob: Blob, crop: OdometerCrop) {
  const bitmap = await createImageBitmap(blob);
  const source = getSourceCrop(bitmap.width, bitmap.height, crop);
  const maxWidth = 900;
  const scale = Math.min(maxWidth / source.width, 1);
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

  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
    const contrasted = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
    const thresholded = contrasted > 148 ? 255 : 0;
    data[index] = thresholded;
    data[index + 1] = thresholded;
    data[index + 2] = thresholded;
  }

  context.putImageData(imageData, 0, 0);

  const processedBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });

  if (!processedBlob) {
    throw new Error("ODOMETER_OCR_PREPROCESS_FAILED");
  }

  return URL.createObjectURL(processedBlob);
}

function getSourceCrop(width: number, height: number, crop: OdometerCrop) {
  const paddingX = crop.width * 0.12;
  const paddingY = crop.height * 0.22;
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
      return char;
    })
    .join("")
    .replace(/[|Il]/g, "1")
    .replace(/[Oo]/g, "0");
}

function looksLikeClockOrTemperature(raw: string, before: string, after: string) {
  const context = `${before}${raw}${after}`;
  return /(\d{1,2}:\d{2}|°|c\b|temp|trip)/iu.test(context);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
