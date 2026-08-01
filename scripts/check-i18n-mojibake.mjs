import fs from "node:fs";
import path from "node:path";

const messagesDir = path.join(process.cwd(), "src", "messages");

const suspiciousPatterns = [
  /[\uFFFD]/u,
  /\?{3,}/u,
  /(?:[\u0637\u0638][\u00A0-\u00FF\u02C6\u201A\u201E\u0679]){2,}/u,
  /(?:\u00E0[\u00A0-\u00FF\u201A\u201C\u201D\u2021\u00A7]){2,}/u,
  /(?:\u00C3[\u0080-\u00BF]){2,}/u,
  /(?:\u00C2[\u0080-\u00BF]){2,}/u,
  /(?:\u00EF[\u00A0-\u00BF]){2,}/u,
];

const failures = [];

for (const fileName of fs.readdirSync(messagesDir).filter((name) => name.endsWith(".json"))) {
  const filePath = path.join(messagesDir, fileName);
  const messages = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""));
  scanValue(messages, filePath, []);
}

if (failures.length > 0) {
  console.error("Suspicious mojibake found in localization files:");
  for (const failure of failures) {
    console.error(`- ${failure.file}:${failure.key} -> ${JSON.stringify(failure.value)}`);
  }
  process.exit(1);
}

function scanValue(value, filePath, keyPath) {
  if (typeof value === "string") {
    if (suspiciousPatterns.some((pattern) => pattern.test(value))) {
      failures.push({
        file: path.relative(process.cwd(), filePath),
        key: keyPath.join("."),
        value,
      });
    }
    return;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    scanValue(child, filePath, [...keyPath, key]);
  }
}
