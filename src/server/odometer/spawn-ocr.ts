import "server-only";

import { spawn }             from "node:child_process";
import { join }              from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir }            from "node:os";
import { randomUUID }        from "node:crypto";

const OCR_WORKER_PATH   = join(process.cwd(), "src", "server", "odometer", "ocr-worker.js");
const OCR_CHILD_TIMEOUT = 22_000;
const MAX_STDOUT_BYTES  = 2 * 1024 * 1024;

export type OcrRawCandidate = {
  digits:            string;
  confidence:        number;
  source:            string;
  hasOdometerAnchor: boolean;
  rejectedContext:   boolean;
  centerBias:        number;
};

export type OcrChildResult =
  | { ok: true;  candidates: OcrRawCandidate[]; log: Array<Record<string, unknown>> }
  | { ok: false; reason: "timeout" | "crash" | "parse_error" | "worker_not_found"; log: Array<Record<string, unknown>> };

export async function spawnOcrChild({
  image,
  crop,
  action,
  previousReading,
  currentShiftStartReading,
}: {
  image:                     Buffer;
  crop:                      { x: number; y: number; width: number; height: number } | null;
  action:                    "start" | "end";
  previousReading:           number | null;
  currentShiftStartReading?: number | null;
}): Promise<OcrChildResult> {
  const { existsSync } = await import("node:fs");
  if (!existsSync(OCR_WORKER_PATH)) {
    console.error("[ocr-child] worker script not found:", OCR_WORKER_PATH);
    return { ok: false, reason: "worker_not_found", log: [] };
  }

  const tmpPath = join(tmpdir(), `ocr-img-${randomUUID()}.jpg`);

  try {
    await writeFile(tmpPath, image);

    const childInput = JSON.stringify({
      imagePath:                tmpPath,
      crop,
      action,
      previousReading,
      currentShiftStartReading: currentShiftStartReading ?? null,
    });

    return await runChildProcess(childInput);
  } finally {
    await unlink(tmpPath).catch(() => undefined);
  }
}

function runChildProcess(stdinJson: string): Promise<OcrChildResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [OCR_WORKER_PATH], {
      cwd:   process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrText  = "";
    let timedOut    = false;
    let settled     = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, OCR_CHILD_TIMEOUT);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_STDOUT_BYTES) stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrText += chunk.toString("utf8");
      if (stderrText.length > 4000) stderrText = stderrText.slice(-4000);
    });

    child.on("close", (code: number | null) => {
      clearTimeout(timeoutHandle);
      if (settled) return;
      settled = true;

      if (stderrText.trim() && process.env.NODE_ENV !== "production") {
        console.warn("[ocr-child] stderr:", stderrText.slice(0, 2000));
      }

      if (timedOut) {
        console.warn("[ocr-child] timed out after", OCR_CHILD_TIMEOUT, "ms");
        resolve({ ok: false, reason: "timeout", log: [] });
        return;
      }

      if (code !== 0) {
        console.warn("[ocr-child] exited with non-zero code", code);
        resolve({ ok: false, reason: "crash", log: [] });
        return;
      }

      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();

      try {
        const parsed = JSON.parse(stdout) as { candidates: OcrRawCandidate[]; log: unknown[] };
        resolve({
          ok:         true,
          candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
          log:        (Array.isArray(parsed.log) ? parsed.log : []) as Array<Record<string, unknown>>,
        });
      } catch {
        console.warn("[ocr-child] failed to parse stdout JSON; length:", stdout.length);
        resolve({ ok: false, reason: "parse_error", log: [] });
      }
    });

    child.on("error", (err: Error) => {
      clearTimeout(timeoutHandle);
      if (settled) return;
      settled = true;
      console.error("[ocr-child] spawn error:", err.message);
      resolve({ ok: false, reason: "crash", log: [] });
    });

    child.stdin.write(stdinJson, "utf8");
    child.stdin.end();
  });
}
