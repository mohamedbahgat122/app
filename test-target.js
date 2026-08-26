import fs from "fs";

// Need to read the file and evaluate extractDigitCandidates since it's not exported
const ocrScript = fs.readFileSync("./src/server/odometer/ocr-worker.js", "utf8");

// Mocking some functions
global.MIN_DIGITS = 4;
global.MAX_DIGITS = 9;

// Extract just the functions we need
const codeToEval = ocrScript.substring(
  ocrScript.indexOf("function normalizeOcrText"),
  ocrScript.indexOf("async function runPass")
);

const extractDigitCandidates = new Function("MIN_DIGITS", "MAX_DIGITS", codeToEval + "\nreturn extractDigitCandidates;")(4, 9);

const targetTests = [
  // expected "0417", OCR "0417" => ACCEPT
  { text: "0417 km", conf: 80, source: "test", centerBias: 0, bbox: undefined, expectedDigits: "0417", expectedRes: ["0417"] },
  // expected "0417", OCR "417" => ACCEPT
  { text: "417 km", conf: 80, source: "test", centerBias: 0, bbox: undefined, expectedDigits: "0417", expectedRes: ["417"] },
  // expected "0417", OCR "1417" => REJECT
  { text: "1417 km", conf: 80, source: "test", centerBias: 0, bbox: undefined, expectedDigits: "0417", expectedRes: [] },
  // expected "50", OCR "150" => REJECT
  { text: "150 km", conf: 80, source: "test", centerBias: 0, bbox: undefined, expectedDigits: "50", expectedRes: [] },
  // expected "00050", OCR "50" => ACCEPT
  { text: "50 km", conf: 80, source: "test", centerBias: 0, bbox: undefined, expectedDigits: "00050", expectedRes: ["50"] },
  // expected "300250", OCR "300250 km" => ACCEPT
  { text: "300250 km", conf: 80, source: "test", centerBias: 0, bbox: undefined, expectedDigits: "300250", expectedRes: ["300250"] },
];

let allPass = true;
for (let i = 0; i < targetTests.length; i++) {
  const t = targetTests[i];
  const cands = extractDigitCandidates(t.text, t.conf, t.source, t.centerBias, t.bbox, t.expectedDigits);
  const resultArr = Array.from(new Set(cands.map(c => c.digits)));
  const pass = JSON.stringify(resultArr) === JSON.stringify(t.expectedRes);
  allPass = allPass && pass;
  console.log(`[${pass ? "PASS" : "FAIL"}] Target Test ${i + 1}: expectedDigits=${t.expectedDigits} | text="${t.text}" -> ${JSON.stringify(resultArr)} (Expected: ${JSON.stringify(t.expectedRes)})`);
}

process.exit(allPass ? 0 : 1);
