#!/usr/bin/env node
"use strict";

const path = require("path");
const fs   = require("fs");

const CWD = process.cwd();

function loadSharp() {
  const candidates = [
    path.join(CWD, "node_modules", "next", "node_modules", "sharp"),
    path.join(CWD, "node_modules", "sharp"),
    "sharp",
  ];
  for (const p of candidates) {
    try { return require(p); } catch (_) {}
  }
  throw new Error("sharp not found in any expected location");
}

const TESSERACT_WORKER_PATH = path.join(
  CWD, "node_modules", "tesseract.js", "src", "worker-script", "node", "index.js"
);
const TESSERACT_CORE_PATH = path.join(CWD, "node_modules", "tesseract.js-core");
const TESSERACT_LANG_PATH = path.join(CWD, "src", "server", "odometer", "tessdata");

const MIN_DIGITS          = 4;
const MAX_DIGITS          = 9;
const WORKER_INIT_TIMEOUT = 15000;
const RECOGNIZE_TIMEOUT   = 12000;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function toRect(imgW, imgH, crop) {
  const left   = clamp(Math.round(crop.x * imgW), 0, imgW - 1);
  const top    = clamp(Math.round(crop.y * imgH), 0, imgH - 1);
  const right  = clamp(Math.round((crop.x + crop.width)  * imgW), left + 1, imgW);
  const bottom = clamp(Math.round((crop.y + crop.height) * imgH), top  + 1, imgH);
  return { left, top, width: right - left, height: bottom - top };
}

function clampRect(r, imgW, imgH) {
  const left   = clamp(r.left,            0, imgW - 1);
  const top    = clamp(r.top,             0, imgH - 1);
  const right  = clamp(r.left + r.width,  left + 1, imgW);
  const bottom = clamp(r.top  + r.height, top  + 1, imgH);
  return { left, top, width: right - left, height: bottom - top };
}

function isValidCrop(crop) {
  return (
    crop != null && typeof crop === "object" &&
    Number.isFinite(crop.x) && Number.isFinite(crop.y) &&
    Number.isFinite(crop.width) && Number.isFinite(crop.height) &&
    crop.x >= 0 && crop.y >= 0 &&
    crop.width > 0.05 && crop.height > 0.03 &&
    crop.x + crop.width <= 1 && crop.y + crop.height <= 1
  );
}

function normalizeOcrText(text, preserveO) {
  return Array.from(text.normalize("NFKC")).map((ch) => {
    const e = "٠١٢٣٤٥٦٧٨٩".indexOf(ch);
    if (e >= 0) return String(e);
    const p = "۰۱۲۳۴۵۶۷۸۹".indexOf(ch);
    if (p >= 0) return String(p);
    if (/[|Il]/u.test(ch)) return "1";
    if (!preserveO && /[Oo]/u.test(ch)) return "0";
    return ch;
  }).join("");
}

function isPlausibleOdometerDigits(digits) {
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return false;
  if (/^0+$/u.test(digits)) return false;
  const v = Number(digits);
  return Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
}

function looksLikeNonOdometerNumber(raw, ctx) {
  // Reject clock patterns (12:34)
  if (/\d{1,2}:\d{2}/u.test(ctx)) return true;
  // Reject speed units and explicit temperature-like patterns.
  // NOTE: c\b alone is too broad — it matches the C in "34C".
  // Require a digit immediately before C/F so that "34C" (temperature) is
  // rejected but "084649km" (odometer) is NOT rejected just because a
  // temperature reading appears elsewhere in the same OCR text block.
  if (/(temp|trip|rpm|km\/h|kph|mph|degrees)/iu.test(ctx)) return true;
  if (/\d+\s*[cf]\b/iu.test(ctx) && !/\d+\s*km/iu.test(ctx)) return true;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length <= 3) return true;
  return false;
}

function extractDigitCandidates(text, confidence, source, centerBias) {
  const norm    = normalizeOcrText(text, false);
  const normAnc = normalizeOcrText(text, true);
  const results = [];
  const patterns = [
    // Pattern 0 — km/KM suffix anchor: "084649km", "084649 km"
    // This is the most common real-world odometer format on dashboard photos.
    { re: /(\d{4,9})\s*km\b/giu, anchor: true,  t: norm    },
    // Pattern 1 — ODO / TOTAL keyword anchor
    { re: /(?:odo|od0|0do|odometer|total)\s*[:=]?\s*(\d[\d\s,.]{2,12}\d)/giu, anchor: true,  t: normAnc },
    // Pattern 2 — separator-formatted numbers (e.g. 123,456)
    { re: /(?<!\d)(?:\d{1,3}(?:[\s,.]\d{3}){1,3})(?!\d)/gu,                  anchor: false, t: norm    },
    // Pattern 3 — plain digit run 4-9 digits
    { re: /(?<!\d)\d{4,9}(?!\d)/gu,                                            anchor: false, t: norm    },
  ];
  for (const pat of patterns) {
    for (const m of pat.t.matchAll(pat.re)) {
      const raw    = m[1] ?? m[0];
      const digits = raw.replace(/[^\d]/g, "");
      if (!isPlausibleOdometerDigits(digits)) continue;
      const idx    = m.index ?? 0;
      const before = pat.t.slice(Math.max(0, idx - 18), idx);
      const after  = pat.t.slice(idx + m[0].length, idx + m[0].length + 18);
      const ctx    = `${before}${m[0]}${after}`;
      results.push({
        digits,
        confidence: Math.min(100, Math.max(0, Math.round(confidence))),
        source,
        hasOdometerAnchor: pat.anchor,
        rejectedContext:   looksLikeNonOdometerNumber(raw, ctx),
        centerBias,
      });
    }
  }
  return results;
}

async function runPass(worker, imgBuf, source, centerBias, log) {
  log.push({ stage: "pass_started", source });
  let recData;
  try {
    const { data } = await Promise.race([
      worker.recognize(imgBuf, { rotateAuto: false }, { text: true, blocks: true }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("RECOGNIZE_TIMEOUT:" + source)), RECOGNIZE_TIMEOUT)
      ),
    ]);
    recData = data;
  } catch (err) {
    log.push({ stage: "pass_error", source, error: err.message });
    return [];
  }
  const confidence = Math.round(recData.confidence ?? 0);
  const rawText    = (recData.text ?? "").trim();
  log.push({ stage: "pass_result", source, confidence, rawText });
  const candidates = [];
  candidates.push(...extractDigitCandidates(rawText, confidence, source, centerBias));
  for (const block of recData.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const lConf = line.confidence ?? para.confidence ?? block.confidence ?? confidence;
        candidates.push(...extractDigitCandidates(line.text ?? "", lConf, source + ":line", centerBias));
        for (const word of line.words ?? []) {
          const wConf = word.confidence ?? lConf;
          candidates.push(...extractDigitCandidates(word.text ?? "", wConf, source + ":word", centerBias));
        }
      }
    }
  }
  const useful = candidates.filter((c) => !c.rejectedContext);
  log.push({ stage: "pass_candidates", source, total: candidates.length, useful: useful.length,
    items: useful.slice(0, 10).map((c) => ({ digits: c.digits, confidence: c.confidence })) });
  return candidates;
}

function hasPrimaryCandidate(candidates) {
  return candidates.some((c) => typeof c.source === "string" && c.source.startsWith("primary-") && !c.rejectedContext);
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) { chunks.push(chunk); }
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (parseErr) {
    process.stderr.write("OCR_WORKER: invalid stdin JSON: " + parseErr.message + "\n");
    process.exit(1);
  }
  const { imagePath, crop } = input;
  if (!imagePath || !fs.existsSync(imagePath)) {
    process.stderr.write("OCR_WORKER: imagePath not found: " + imagePath + "\n");
    process.exit(1);
  }
  const sharp = loadSharp();
  const { createWorker, PSM } = require("tesseract.js");
  const imageBuffer = fs.readFileSync(imagePath);
  const log = [];
  const allCandidates = [];
  const normalizedBuf = await sharp(imageBuffer, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(normalizedBuf, { failOn: "none" }).metadata();
  const imgW = meta.width  ?? 0;
  const imgH = meta.height ?? 0;
  log.push({ stage: "image_normalized", width: imgW, height: imgH });
  const worker = await Promise.race([
    createWorker("eng", 1, {
      cacheMethod: "none", corePath: TESSERACT_CORE_PATH, errorHandler: () => undefined,
      gzip: false, langPath: TESSERACT_LANG_PATH, logger: () => undefined, workerPath: TESSERACT_WORKER_PATH,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("WORKER_INIT_TIMEOUT")), WORKER_INIT_TIMEOUT)),
  ]);
  log.push({ stage: "worker_ready" });
  try {
    const usableCrop = isValidCrop(crop) ? crop : null;
    if (usableCrop && imgW > 0 && imgH > 0) {
      const rect = toRect(imgW, imgH, usableCrop);
      log.push({ stage: "crop_rect", rect });
      const primaryBuf = await sharp(normalizedBuf, { failOn: "none" })
        .extract(rect)
        .resize({ width: Math.max(1, rect.width * 3), withoutEnlargement: false })
        .grayscale().normalize().sharpen({ sigma: 1 }).png().toBuffer();
      const pm = await sharp(primaryBuf, { failOn: "none" }).metadata();
      log.push({ stage: "pass1_image", width: pm.width, height: pm.height });
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789", tessedit_pageseg_mode: PSM.SINGLE_LINE,
        preserve_interword_spaces: "1", user_defined_dpi: "300",
      });
      const r1 = await runPass(worker, primaryBuf, "primary-processed-crop", 16, log);
      allCandidates.push(...r1);
      const threshBuf = await sharp(primaryBuf, { failOn: "none" }).threshold(145).png().toBuffer();
      const r2 = await runPass(worker, threshBuf, "primary-threshold-crop", 16, log);
      allCandidates.push(...r2);
      if (hasPrimaryCandidate(allCandidates)) {
        log.push({ stage: "early_exit_after_primary_passes" });
        process.stdout.write(JSON.stringify({ candidates: allCandidates, log }) + "\n");
        return;
      }
    }
    if (imgW > 0 && imgH > 0) {
      const cr = clampRect({ left: Math.round(imgW * 0.08), top: Math.round(imgH * 0.36),
        width: Math.round(imgW * 0.84), height: Math.round(imgH * 0.28) }, imgW, imgH);
      const centerBuf = await sharp(normalizedBuf, { failOn: "none" })
        .extract(cr).resize({ width: Math.max(1, cr.width * 2), withoutEnlargement: false })
        .grayscale().normalize().sharpen({ sigma: 0.8 }).png().toBuffer();
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789,. kmKMODOodoTOTALtotalTRIPtripTEMPtemp:C",
        tessedit_pageseg_mode: PSM.SINGLE_LINE, preserve_interword_spaces: "1", user_defined_dpi: "220",
      });
      const r3 = await runPass(worker, centerBuf, "center-dashboard-strip", 8, log);
      allCandidates.push(...r3);
    }
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789,. kmKMODOodoTOTALtotalTRIPtripTEMPtemp:C",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", user_defined_dpi: "220",
    });
    const r4 = await runPass(worker, normalizedBuf, "full-frame", 0, log);
    allCandidates.push(...r4);
  } finally {
    await worker.terminate().catch(() => undefined);
    log.push({ stage: "worker_terminated" });
  }
  process.stdout.write(JSON.stringify({ candidates: allCandidates, log }) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write("OCR_WORKER_FATAL: " + msg + "\n");
  process.exit(1);
});
