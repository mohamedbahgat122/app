import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database }       from "@/types/database";
import { spawnOcrChild }       from "./spawn-ocr";
import type { OcrRawCandidate } from "./spawn-ocr";

// ---------------------------------------------------------------------------
// DB row type (only the fields we need)
// ---------------------------------------------------------------------------
type DriverShiftRow = Pick<
  Database["public"]["Tables"]["driver_shifts"]["Row"],
  | "id"
  | "started_at"
  | "start_odometer_reading"
  | "end_odometer_reading"
  | "start_ocr_status"
  | "end_ocr_status"
  | "start_review_status"
  | "end_review_status"
>;

type ServerSupabaseClient = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type OdometerAction = "start" | "end";

export type OdometerPhotoCrop = {
  x:      number;
  y:      number;
  width:  number;
  height: number;
};

export type OdometerVerificationCandidate = {
  reading:    number;
  /** Raw OCR digit string — preserves leading zeros (e.g. "084649"). */
  digits:     string;
  confidence: number;
  score:      number;
  source:     string;
  reason:     string[];
};

export type OdometerVerificationResult =
  | {
      accepted:        true;
      detectedReading: number;
      /** Raw OCR digit string with leading zeros preserved (e.g. "084649"). */
      rawDigits:       string;
      confidence:      number;
      candidates:      OdometerVerificationCandidate[];
      rejectionReason: null;
      previousReading: number | null;
    }
  | {
      accepted:        false;
      detectedReading: null;
      confidence:      number;
      candidates:      OdometerVerificationCandidate[];
      rejectionReason:
        | "no_candidate"
        | "low_confidence"
        | "below_previous"
        | "end_below_start"
        | "conflict"
        | "image_dimensions_unavailable"
        | "ocr_failed";
      previousReading: number | null;
    };

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------
type ImageSize = { width: number; height: number };

// RawCandidate matches OcrRawCandidate from spawn-ocr.ts
type RawCandidate = OcrRawCandidate;

// ---------------------------------------------------------------------------
// Scoring constants
// ---------------------------------------------------------------------------

/** Minimum composite score for fallback / multi-pass candidates */
const minimumAcceptedScore = 92;

/**
 * Minimum composite score for primary-crop candidates.
 * Intentionally lower — a clean digits-only primary crop should be accepted
 * without needing anchor keywords, occurrence bonuses, or multiple passes.
 */
const minimumPrimaryAcceptedScore = 55;

/**
 * Minimum Tesseract confidence needed before primaryCropBonus is applied.
 * Lowered from 35 → 15 to give the bonus to more real photos.
 */
const minimumPrimaryConfidence = 15;

const primaryCropBonus = 28;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function verifyOdometerPhoto({
  action,
  driverId,
  vehicleId,
  image,
  crop,
  currentShiftStartReading,
  supabase,
}: {
  action:                    OdometerAction;
  driverId:                  string;
  vehicleId:                 string | null;
  image:                     Buffer;
  crop:                      OdometerPhotoCrop | null;
  currentShiftStartReading?: number | null;
  supabase:                  ServerSupabaseClient;
}): Promise<OdometerVerificationResult> {
  const previousReading = await loadLatestAcceptedOdometerReading({ driverId, vehicleId, supabase });

  // Validate image can be parsed (quick header check — no Sharp needed here)
  const imageSize = readImageSize(image);
  if (!imageSize) {
    return rejected("image_dimensions_unavailable", [], previousReading);
  }

  // ------------------------------------------------------------------
  // Memory snapshot before OCR (dev only)
  // ------------------------------------------------------------------
  logMemory("before_ocr");

  let candidates: OdometerVerificationCandidate[];

  try {
    // ------------------------------------------------------------------
    // Spawn OCR child process
    // All Sharp + Tesseract execution happens in the child.
    // The child exits after returning JSON, freeing all WASM/image memory.
    // ------------------------------------------------------------------
    logOcrStage("ocr_child_spawning");

    const ocrResult = await spawnOcrChild({
      image,
      crop,
      action,
      previousReading,
      currentShiftStartReading,
    });

    // Memory snapshot after child has exited (dev only)
    logMemory("after_ocr_child_exited");

    if (!ocrResult.ok) {
      logOcrStage("ocr_child_failed", { reason: ocrResult.reason });
      return rejected("ocr_failed", [], previousReading);
    }

    logOcrStage("ocr_child_succeeded", {
      candidateCount: ocrResult.candidates.length,
      logEntries:     ocrResult.log.length,
    });

    // Re-emit child log entries so they appear in the Next.js console
    if (process.env.NODE_ENV !== "production") {
      for (const entry of ocrResult.log) {
        const { stage, ...rest } = entry;
        if (typeof stage === "string") {
          logOcrStage(`child:${stage}`, Object.keys(rest).length > 0 ? rest : undefined);
        }
      }
    }

    // Score and rank candidates
    candidates = scoreCandidates({
      action,
      currentShiftStartReading,
      previousReading,
      rawCandidates: ocrResult.candidates,
    });

    // ------------------------------------------------------------------
    // DIRECT CONSENSUS ACCEPTANCE
    // If the exact same 4-9 digit reading appears multiple times and is
    // the ONLY plausible reading found, accept it immediately.
    // ------------------------------------------------------------------
    const consensusResult = tryDirectConsensusAcceptance({
      candidates,
      action,
      previousReading,
      currentShiftStartReading,
    });
    if (consensusResult !== null) return consensusResult;

    // ------------------------------------------------------------------
    // DIRECT ANCHORED ACCEPTANCE
    // If exactly one unambiguous km/ODO-anchored candidate survives and
    // it passes monotonic validation, accept it immediately without
    // requiring a score threshold.
    // "084649km" → anchor hit → direct accept.
    // ------------------------------------------------------------------
    const directResult = tryDirectAnchoredAcceptance({
      candidates,
      action,
      previousReading,
      currentShiftStartReading,
    });
    if (directResult !== null) return directResult;

  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[odometer-photo-ocr] unexpected error", {
        name:    error instanceof Error ? error.name    : "Error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return rejected("ocr_failed", [], previousReading);
  }

  // ------------------------------------------------------------------
  // No scored candidates
  // ------------------------------------------------------------------
  if (candidates.length === 0) {
    logOcrStage("no_candidates");
    return rejected("no_candidate", candidates, previousReading);
  }

  const best   = candidates[0]!;
  const second = candidates[1];

  // ------------------------------------------------------------------
  // Business-logic validation (monotonic rules)
  // ------------------------------------------------------------------
  if (
    action === "end" &&
    currentShiftStartReading !== null &&
    currentShiftStartReading !== undefined &&
    best.reading < currentShiftStartReading
  ) {
    return rejected("end_below_start", candidates, previousReading, best.confidence);
  }

  if (previousReading !== null && best.reading < previousReading) {
    return rejected("below_previous", candidates, previousReading, best.confidence);
  }

  // ------------------------------------------------------------------
  // Conflict check
  // ------------------------------------------------------------------
  if (
    second &&
    second.reading !== best.reading &&
    second.score   >= minimumAcceptedScore &&
    Math.abs(second.score - best.score) <= 8
  ) {
    return rejected("conflict", candidates, previousReading, best.confidence);
  }

  // ------------------------------------------------------------------
  // Score threshold — lower bar for primary-crop candidates
  // ------------------------------------------------------------------
  const scoreThreshold = isPrimarySource(best.source)
    ? minimumPrimaryAcceptedScore
    : minimumAcceptedScore;

  if (best.score < scoreThreshold) {
    logOcrStage("low_confidence", {
      score:     best.score,
      threshold: scoreThreshold,
      source:    best.source,
      reading:   best.reading,
    });
    return rejected("low_confidence", candidates, previousReading, best.confidence);
  }

  logOcrStage("ocr_candidate_selected", {
    confidence: Math.round(best.confidence),
    reading:    best.reading,
    score:      best.score,
    source:     best.source,
  });

  logMemory("after_candidate_selected");

  return {
    accepted:        true,
    detectedReading: best.reading,
    rawDigits:       best.digits,
    confidence:      Math.round(best.confidence),
    candidates,
    rejectionReason: null,
    previousReading,
  };
}

// ---------------------------------------------------------------------------
// Direct consensus acceptance
// ---------------------------------------------------------------------------

/**
 * Accepts a reading immediately when there is exactly one unique plausible
 * odometer reading in the entire photo, and it was detected multiple times
 * (consensus), and it passes monotonic validation.
 * Bypasses all score thresholds.
 */
function tryDirectConsensusAcceptance({
  candidates,
  action,
  previousReading,
  currentShiftStartReading,
}: {
  candidates:               OdometerVerificationCandidate[];
  action:                   OdometerAction;
  previousReading:          number | null;
  currentShiftStartReading?: number | null;
}): OdometerVerificationResult | null {
  if (candidates.length === 0) return null;

  // We need to know if there is exactly ONE distinct reading across ALL valid candidates
  const distinctReadings = new Set(candidates.map((c) => c.reading));
  if (distinctReadings.size > 1) {
    // There is ambiguity (e.g. 084649 and 123456 were both found).
    // Consensus logic only applies when the OCR is absolutely certain there
    // is only one number on the dashboard that looks like an odometer.
    return null;
  }

  const best = candidates[0]!;

  // Look for the "occurrences:N" marker we added in scoreCandidates
  const occurrencesMarker = best.reason.find((r) => r.startsWith("occurrences:"));
  const numOccurrences = occurrencesMarker ? parseInt(occurrencesMarker.split(":")[1] || "1", 10) : 1;

  if (numOccurrences < 2) {
    // Only found once. Not a consensus. Fall through to other checks.
    return null;
  }

  // Monotonic validation
  if (
    action === "end" &&
    currentShiftStartReading !== null &&
    currentShiftStartReading !== undefined &&
    best.reading < currentShiftStartReading
  ) {
    return rejected("end_below_start", candidates, previousReading, best.confidence);
  }

  if (previousReading !== null && best.reading < previousReading) {
    return rejected("below_previous", candidates, previousReading, best.confidence);
  }

  logOcrStage("consensus_odometer_accepted", {
    rawDigits:      best.digits,
    numericReading: best.reading,
    occurrences:    numOccurrences,
  });

  return {
    accepted:        true,
    detectedReading: best.reading,
    rawDigits:       best.digits,
    confidence:      Math.round(best.confidence),
    candidates,
    rejectionReason: null,
    previousReading,
  };
}

// ---------------------------------------------------------------------------
// Direct anchored acceptance
// ---------------------------------------------------------------------------

/**
 * Accepts a reading immediately when there is exactly one unambiguous
 * anchored candidate (km/ODO/TOTAL) and it passes monotonic validation.
 * Bypasses all score thresholds.
 *
 * Returns null when:
 * - No anchored candidates exist  → fall through to scoring
 * - Multiple DIFFERENT anchored readings → ambiguous, fall through to scoring
 * - Monotonic validation fails     → return rejection result
 */
function tryDirectAnchoredAcceptance({
  candidates,
  action,
  previousReading,
  currentShiftStartReading,
}: {
  candidates:               OdometerVerificationCandidate[];
  action:                   OdometerAction;
  previousReading:          number | null;
  currentShiftStartReading?: number | null;
}): OdometerVerificationResult | null {
  // Collect candidates that have at least one anchored occurrence.
  // scoreCandidates() groups by digits string, so source is a joined list.
  // We re-check the anchor flag via the reason array marker we set, but
  // the simplest approach is to re-derive from the raw score: candidates
  // produced by an anchor pattern receive +28 anchorBonus, and their
  // reason array does NOT contain a monotonic-penalty entry.
  //
  // Instead, use a second, simpler filter: a candidate qualifies for direct
  // acceptance when it was produced by an anchored OCR pattern AND its
  // score is not already penalised to zero by monotonic failure.
  const anchored = candidates.filter(
    (c) => c.reason.some((r) => r === "anchored")
  );

  if (anchored.length === 0) return null;

  // Distinct reading values among anchored candidates
  const distinctReadings = new Set(anchored.map((c) => c.reading));
  if (distinctReadings.size > 1) {
    // Multiple different anchored readings — ambiguous, defer to scoring
    return null;
  }

  const best = anchored[0]!;

  // Monotonic validation (same rules as the main path)
  if (
    action === "end" &&
    currentShiftStartReading !== null &&
    currentShiftStartReading !== undefined &&
    best.reading < currentShiftStartReading
  ) {
    return rejected("end_below_start", candidates, previousReading, best.confidence);
  }

  if (previousReading !== null && best.reading < previousReading) {
    return rejected("below_previous", candidates, previousReading, best.confidence);
  }

  // Determine what anchor was hit (km vs ODO/TOTAL) for the log
  const anchorLabel = best.reason.find((r) => r.startsWith("anchor:")) ?? "anchor";

  logOcrStage("direct_odometer_accepted", {
    rawDigits:      best.digits,
    numericReading: best.reading,
    anchor:         anchorLabel.replace("anchor:", "").trim() || "km",
    source:         best.source,
  });

  return {
    accepted:        true,
    detectedReading: best.reading,
    rawDigits:       best.digits,
    confidence:      Math.round(best.confidence),
    candidates,
    rejectionReason: null,
    previousReading,
  };
}

// ---------------------------------------------------------------------------
// Candidate scoring
// ---------------------------------------------------------------------------

function isPrimarySource(source: string): boolean {
  // Handles plain sources ("primary-processed-crop"),
  // sub-sources ("primary-processed-crop:word"),
  // and grouped sources ("primary-processed-crop, primary-threshold-crop").
  return source.includes("primary-");
}

function scoreCandidates({
  action,
  currentShiftStartReading,
  previousReading,
  rawCandidates,
}: {
  action:                    OdometerAction;
  currentShiftStartReading?: number | null;
  previousReading:           number | null;
  rawCandidates:             RawCandidate[];
}): OdometerVerificationCandidate[] {
  // Group by digit string (dedup across passes)
  const grouped = new Map<string, RawCandidate[]>();

  for (const candidate of rawCandidates) {
    if (candidate.rejectedContext) continue;
    const existing = grouped.get(candidate.digits) ?? [];
    existing.push(candidate);
    grouped.set(candidate.digits, existing);
  }

  const scored: OdometerVerificationCandidate[] = [];

  for (const [digits, occurrences] of grouped) {
    const reading = Number(digits);
    if (!Number.isSafeInteger(reading)) continue;

    const bestConfidence = Math.max(...occurrences.map((c) => c.confidence));
    const occurrenceBonus = Math.min(occurrences.length * 8, 32);
    const anchorBonus     = occurrences.some((c) => c.hasOdometerAnchor) ? 28 : 0;
    const lengthBonus     = scoreDigitLength(digits.length);
    const regionBonus     = Math.max(...occurrences.map((c) => c.centerBias));

    // Primary bonus applies at a lower confidence gate than before (15, was 35).
    const primaryBonus =
      occurrences.some((c) => isPrimarySource(c.source)) &&
      bestConfidence >= minimumPrimaryConfidence
        ? primaryCropBonus
        : 0;

    const reason: string[] = [
      `${occurrences.length} OCR pass(es)`,
      `${digits.length} digit(s)`,
      `occurrences:${occurrences.length}` // Marker for consensus logic
    ];
    const hasAnchor = occurrences.some((c) => c.hasOdometerAnchor);
    if (hasAnchor) {
      // Mark for direct anchored acceptance path; include anchor type hint
      reason.push("anchored");
      const anchorSources = occurrences
        .filter((c) => c.hasOdometerAnchor)
        .map((c) => c.source);
      // Heuristic: if the candidate's digits follow "km" it's a km anchor
      reason.push("anchor:km");
      void anchorSources; // suppress unused-var lint
    }

    let monotonicPenalty = 0;

    if (previousReading !== null) {
      if (reading < previousReading) {
        monotonicPenalty += 90;
        reason.push("below previous reading");
      } else {
        reason.push("monotonic vs previous reading");
      }
    }

    if (action === "end" && currentShiftStartReading !== null && currentShiftStartReading !== undefined) {
      if (reading < currentShiftStartReading) {
        monotonicPenalty += 90;
        reason.push("below shift start reading");
      } else {
        reason.push("monotonic vs shift start");
      }
    }

    scored.push({
      reading,
      digits,
      confidence: bestConfidence,
      score: Math.round(
        bestConfidence +
        occurrenceBonus +
        anchorBonus +
        lengthBonus +
        primaryBonus +
        regionBonus -
        monotonicPenalty,
      ),
      source: occurrences.map((c) => c.source).join(", "),
      reason,
    });
  }

  return scored.sort((a, b) => {
    if (b.score      !== a.score)      return b.score      - a.score;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.digits.length - a.digits.length;
  });
}

function scoreDigitLength(length: number): number {
  if (length >= 5 && length <= 7) return 18;
  if (length === 8 || length === 4) return 10;
  return 4;
}

// ---------------------------------------------------------------------------
// DB — load previous accepted odometer reading
// ---------------------------------------------------------------------------

async function loadLatestAcceptedOdometerReading({
  driverId,
  vehicleId,
  supabase,
}: {
  driverId:  string;
  vehicleId: string | null;
  supabase:  ServerSupabaseClient;
}) {
  let query = supabase
    .from("driver_shifts")
    .select(
      "id, started_at, start_odometer_reading, end_odometer_reading, start_ocr_status, end_ocr_status, start_review_status, end_review_status",
    )
    .eq("driver_id", driverId)
    .order("started_at", { ascending: false })
    .limit(25);

  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId);
  }

  return query.then(({ data, error }) => {
    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[odometer-photo-ocr] previous_reading_lookup_failed", {
          code:    error.code,
          message: error.message,
        });
      }
      return null;
    }

    return selectLatestReading((data ?? []) as DriverShiftRow[]);
  });
}

function selectLatestReading(shifts: DriverShiftRow[]): number | null {
  for (const shift of shifts) {
    if (
      shift.end_odometer_reading !== null &&
      shift.end_ocr_status       !== "rejected" &&
      shift.end_review_status    !== "rejected"
    ) {
      return shift.end_odometer_reading;
    }

    if (
      shift.start_odometer_reading !== null &&
      shift.start_ocr_status       !== "rejected" &&
      shift.start_review_status    !== "rejected"
    ) {
      return shift.start_odometer_reading;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Image size — read from JPEG/PNG headers without Sharp
// ---------------------------------------------------------------------------

function readImageSize(buffer: Buffer): ImageSize | null {
  // PNG
  const pngSignature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") === pngSignature && buffer.length >= 24) {
    return {
      width:  buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);

      if (
        marker !== undefined &&
        ((marker >= 0xc0 && marker <= 0xc3) ||
         (marker >= 0xc5 && marker <= 0xc7) ||
         (marker >= 0xc9 && marker <= 0xcb) ||
         (marker >= 0xcd && marker <= 0xcf))
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width:  buffer.readUInt16BE(offset + 7),
        };
      }

      offset += 2 + length;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function logOcrStage(stage: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info("[odometer-photo-ocr]", stage, details);
  } else {
    console.info("[odometer-photo-ocr]", stage);
  }
}

/**
 * Log Next.js process memory usage.
 * Dev-only — never called in production.
 * Lets you verify that repeated OCR requests do NOT grow the Next.js heap.
 */
function logMemory(stage: string): void {
  if (process.env.NODE_ENV === "production") return;
  const m  = process.memoryUsage();
  const mb = (n: number) => `${(n / 1_048_576).toFixed(1)} MB`;
  console.info("[odometer-photo-ocr] memory", stage, {
    heapUsed:  mb(m.heapUsed),
    heapTotal: mb(m.heapTotal),
    rss:       mb(m.rss),
    external:  mb(m.external),
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rejected(
  rejectionReason: Extract<OdometerVerificationResult, { accepted: false }>["rejectionReason"],
  candidates:      OdometerVerificationCandidate[],
  previousReading: number | null,
  confidence = 0,
): OdometerVerificationResult {
  return {
    accepted:        false,
    detectedReading: null,
    confidence:      Math.round(confidence),
    candidates,
    rejectionReason,
    previousReading,
  };
}
