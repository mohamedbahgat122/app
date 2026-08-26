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

function clampRect(r, imgW, imgH) {
  const left   = clamp(r.left,            0, imgW - 1);
  const top    = clamp(r.top,             0, imgH - 1);
  const right  = clamp(r.left + r.width,  left + 1, imgW);
  const bottom = clamp(r.top  + r.height, top  + 1, imgH);
  return { left, top, width: right - left, height: bottom - top };
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

function isPlausibleOdometerDigits(digits, expectedDigits) {
  if (expectedDigits) {
    const numericStr = String(Number(expectedDigits));
    return digits === expectedDigits || digits === numericStr;
  }
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return false;
  if (/^0+$/u.test(digits)) return false;
  const v = Number(digits);
  return Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
}

function looksLikeNonOdometerNumber(raw, ctx) {
  return false;
}

function extractDigitCandidates(text, confidence, source, centerBias, bbox, expectedDigits) {
  const norm    = normalizeOcrText(text, false);
  const normAnc = normalizeOcrText(text, true);
  const results = [];
  const patterns = [
    { re: /(\d{4,9})\s*km\b/giu, anchor: true,  t: norm    },
    { re: /(?:odo|od0|0do|odometer|total)\s*[:=]?\s*(\d[\d\s,.]{2,12}\d)/giu, anchor: true,  t: normAnc },
    { re: /(?<!\d)(?:\d{1,3}(?:[\s,.]\d{3}){1,3})(?!\d)/gu,                  anchor: false, t: norm    },
    { re: /(?<!\d)\d{4,9}(?!\d)/gu,                                            anchor: false, t: norm    },
  ];
  if (expectedDigits) {
    const numericStr = String(Number(expectedDigits));
    const patStr = numericStr !== expectedDigits ? `(?<!\\d)(?:${expectedDigits}|${numericStr})(?!\\d)` : `(?<!\\d)${expectedDigits}(?!\\d)`;
    patterns.push({ re: new RegExp(patStr, "gu"), anchor: false, t: norm });
  }
  for (const pat of patterns) {
    for (const m of pat.t.matchAll(pat.re)) {
      const raw    = m[1] ?? m[0];
      const digits = raw.replace(/[^\d]/g, "");
      if (!isPlausibleOdometerDigits(digits, expectedDigits)) continue;
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
        contextBefore:     before,
        contextAfter:      after,
        bbox,
      });
    }
  }
  return results;
}

async function runPass(worker, imgBuf, source, centerBias, log, expectedDigits) {
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
    return { candidates: [], words: [] };
  }
  const confidence = Math.round(recData.confidence ?? 0);
  const rawText    = (recData.text ?? "").trim();
  log.push({ stage: "pass_result", source, confidence, rawText });
  const candidates = [];
  const allWords = [];
  candidates.push(...extractDigitCandidates(rawText, confidence, source, centerBias, null, expectedDigits));
  for (const block of recData.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        const lConf = line.confidence ?? para.confidence ?? block.confidence ?? confidence;
        candidates.push(...extractDigitCandidates(line.text ?? "", lConf, source + ":line", centerBias, line.bbox, expectedDigits));
        for (const word of line.words ?? []) {
          const wConf = word.confidence ?? lConf;
          if (word.bbox && word.text && word.text.trim().length > 0) {
            allWords.push({ text: word.text, bbox: word.bbox });
          }
          candidates.push(...extractDigitCandidates(word.text ?? "", wConf, source + ":word", centerBias, word.bbox, expectedDigits));
        }
      }
    }
  }
  const useful = candidates.filter((c) => !c.rejectedContext);
  log.push({ stage: "pass_candidates", source, total: candidates.length, useful: useful.length,
    items: useful.slice(0, 10).map((c) => ({ digits: c.digits, confidence: c.confidence })) });
  return { candidates, words: allWords };
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
  const { imagePath, expectedDigits } = input;
  if (!imagePath || !fs.existsSync(imagePath)) {
    process.stderr.write("OCR_WORKER: imagePath not found: " + imagePath + "\n");
    process.exit(1);
  }
  const sharp = loadSharp();
  const { createWorker, PSM } = require("tesseract.js");
  const imageBuffer = fs.readFileSync(imagePath);
  const log = [];
  
  const normalizedBuf = await sharp(imageBuffer, { failOn: "none" }).rotate().png().toBuffer();
  const meta = await sharp(normalizedBuf, { failOn: "none" }).metadata();
  const imgW = meta.width  ?? 0;
  const imgH = meta.height ?? 0;
  log.push({ stage: "image_normalized", width: imgW, height: imgH });
  
  if (imgW < 100 || imgH < 100) {
    log.push({ stage: "image_rejected", reason: "too_small" });
    process.stdout.write(JSON.stringify({ candidates: [], words: [], log }));
    process.exit(0);
  }

  try {
    const grayStats = await sharp(normalizedBuf, { failOn: "none" }).grayscale().stats();
    const mean = grayStats.channels[0].mean;
    const stdev = grayStats.channels[0].stdev;
    log.push({ stage: "image_stats", mean, stdev });

    if (stdev < 5 || mean < 10) {
      log.push({ stage: "image_rejected", reason: "blank_or_black" });
      process.stdout.write(JSON.stringify({ candidates: [], words: [], log }));
      process.exit(0);
    }
  } catch (err) {
    log.push({ stage: "image_stats_error", error: err.message });
  }

  const worker = await Promise.race([
    createWorker("eng", 1, {
      cacheMethod: "none", corePath: TESSERACT_CORE_PATH, errorHandler: () => undefined,
      gzip: false, langPath: TESSERACT_LANG_PATH, logger: () => undefined, workerPath: TESSERACT_WORKER_PATH,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("WORKER_INIT_TIMEOUT")), WORKER_INIT_TIMEOUT)),
  ]);
  log.push({ stage: "worker_ready" });
  
  let allCandidates = [];
  let allWords = [];

  try {
    await worker.setParameters({
      tessedit_char_whitelist: "0123456789,. kmKMODOodoTOTALtotalTRIPtripTEMPtemp:C",
      tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1", user_defined_dpi: "220",
    });

    const passStartTime = Date.now();
    const passes = [
      { id: "passA", buf: normalizedBuf, name: "original" },
      { id: "passB", buf: await sharp(normalizedBuf, { failOn: "none" }).grayscale().normalize().sharpen({ sigma: 0.8 }).png().toBuffer(), name: "enhanced" },
      { id: "passC", buf: await sharp(normalizedBuf, { failOn: "none" }).grayscale().linear(1.5, -0.2).png().toBuffer(), name: "high_contrast" },
      { id: "passD", buf: await sharp(normalizedBuf, { failOn: "none" }).median(3).threshold(128).png().toBuffer(), name: "thresholded" }
    ];

    const passDurations = [];

    for (const p of passes) {
      log.push({ stage: `starting_${p.id}` });
      const startT = Date.now();
      const res = await runPass(worker, p.buf, p.id, 0, log, expectedDigits);
      const durationMs = Date.now() - startT;
      
      passDurations.push({ pass: p.id, durationMs, candidates: res.candidates.length });
      
      allCandidates.push(...res.candidates);
      allWords.push(...res.words);

      // Early exit if a 5-9 digit reading is corroborated across 2 independent passes
      // and there are no other competing plausible 5-9 digit readings.
      const grouped = new Map();
      for (const c of allCandidates) {
        if (!grouped.has(c.digits)) grouped.set(c.digits, new Set());
        grouped.get(c.digits).add(c.source.split(":")[0]);
      }
      if (expectedDigits) {
        const numericStr = String(Number(expectedDigits));
        if (grouped.has(expectedDigits) || grouped.has(numericStr)) {
          log.push({ stage: "early_exit_decisive_corroboration_expected", pass: p.id, digits: expectedDigits });
          break;
        }
      } else {
        let clearWinnerCount = 0;
        let otherPlausibleCount = 0;
        
        for (const [digits, sources] of grouped.entries()) {
          if (digits.length >= 5 && digits.length <= 9) {
            if (sources.size >= 2) {
              clearWinnerCount++;
            } else {
              otherPlausibleCount++;
            }
          }
        }
        
        if (clearWinnerCount === 1 && otherPlausibleCount === 0) {
           log.push({ stage: "early_exit_decisive_corroboration", pass: p.id });
           break;
        }
      }
    }

    const totalDurationMs = Date.now() - passStartTime;
    log.push({ stage: "ensemble_pass_result", passes: passDurations, totalDurationMs });

  } finally {
    await worker.terminate().catch(() => undefined);
    log.push({ stage: "worker_terminated" });
  }
  process.stdout.write(JSON.stringify({ candidates: allCandidates, words: allWords, log }) + "\n");
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write("OCR_WORKER_FATAL: " + msg + "\n");
  process.exit(1);
});
