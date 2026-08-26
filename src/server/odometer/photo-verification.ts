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

export type OdometerSignals = {
  independentOccurrences: number;
  anchor:                 boolean;
  primarySource:          boolean;
  delta:                  number | null;
};

export type OdometerVerificationCandidate = {
  reading:    number;
  /** Raw OCR digit string — preserves leading zeros (e.g. "084649"). */
  digits:     string;
  confidence: number;
  score:      number;
  signals:    OdometerSignals;
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
      score:           number;
      signals:         OdometerSignals;
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
        | "ambiguous"
        | "extreme_delta_uncorroborated"
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

/**
 * Minimum composite score for fallback / multi-pass candidates.
 * Can be relaxed if independent evidence is high.
 */
const minimumAcceptedScore = 92;

/**
 * Minimum composite score for primary-crop candidates.
 * Intentionally lower — a clean digits-only primary crop should be accepted
 * without needing anchor keywords, occurrence bonuses, or multiple passes.
 */
const minimumPrimaryAcceptedScore = 55;

// Delta scoring constants
const DELTA_BONUS_HEALTHY = 1000;
const DELTA_BONUS_MODERATE = 10000;
const DELTA_PENALTY_MODERATE = 50000;
const DELTA_EXTREME = 50000;

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

    // ------------------------------------------------------------------
    // Classify candidate numeric context
    // ------------------------------------------------------------------
    const fallbackCandidates: RawCandidate[] = [];
    const directMatches: RawCandidate[] = [];

    for (const c of ocrResult.candidates) {
      if (c.rejectedContext) continue;

      let classification = "UNKNOWN";
      let rejectedReason = "";

      const before = c.contextBefore || "";
      const after = c.contextAfter || "";
      const ctx = `${before}${c.digits}${after}`;

      // 1. Explicit RPM rejection
      if (
        /(?:x\s*|×\s*|X\s*|rpm\s*|r\/min\s*|rev\/min\s*|1\/min\s*)$/i.test(before) || 
        /^\s*(?:rpm|r\/min|rev\/min|1\/min)/i.test(after) ||
        // Strict catch-all for RPM multipliers in the 18-char window
        /(?:x|×|X)\s*(?:100|1000)\b/.test(ctx) && (c.digits === "100" || c.digits === "1000")
      ) {
        classification = "RPM";
        rejectedReason = "rpm_multiplier";
      } 
      // 2. Explicit Speed rejection
      else if (
        /^\s*(?:km\/h|kmh|kph|mph)/i.test(after)
      ) {
        classification = "SPEED";
        rejectedReason = "speed_indicator";
      } 
      // 3. Explicit Temperature rejection
      else if (
        /(?:temp|degrees)\s*$/i.test(before) || 
        /^\s*(?:°|deg)?\s*[cf]\b/i.test(after)
      ) {
        classification = "TEMPERATURE";
        rejectedReason = "temperature";
      } 
      // 4. Explicit Clock rejection
      else if (
        /(?:time|clock)\s*$/i.test(before)
      ) {
        classification = "CLOCK";
        rejectedReason = "clock";
      } 
      // 5. Explicit ODOMETER match
      else if (
        /(?:odo|odometer|total|mileage)\s*$/i.test(before) ||
        /^\s*(?:km|mi\b|miles\b|odo|odometer|total|mileage)/i.test(after) ||
        c.hasOdometerAnchor
      ) {
        classification = "ODOMETER";
      }

      if (process.env.NODE_ENV !== "production") {
        console.info("[odometer-photo-ocr] candidate_context", {
          rawDigits: c.digits,
          classification,
          nearbyText: ctx,
          anchor: c.hasOdometerAnchor,
          rejectedReason: rejectedReason || undefined,
        });
      }

      if (!rejectedReason) {
        fallbackCandidates.push(c);
        if (classification === "ODOMETER") {
          directMatches.push(c);
        }
      }
    }

    // ------------------------------------------------------------------
    // STAGE 2 & 3: Direct Match Priority vs Fallback
    // ------------------------------------------------------------------
    const finalRawCandidates = directMatches.length > 0 ? directMatches : fallbackCandidates;

    if (process.env.NODE_ENV !== "production") {
      if (directMatches.length > 0) {
        console.info("[odometer-photo-ocr] direct_distance_matches", {
          matches: Array.from(new Set(directMatches.map(c => c.digits)))
        });
      } else {
        console.info("[odometer-photo-ocr] direct_odometer_not_found_fallback_started");
      }
    }

    // ------------------------------------------------------------------
    // Score and rank candidates
    // ------------------------------------------------------------------
    candidates = scoreCandidates({
      action,
      currentShiftStartReading,
      previousReading,
      rawCandidates: finalRawCandidates,
    });

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
  // Extreme Delta Corroboration Check
  // ------------------------------------------------------------------
  if (
    best.signals.delta !== null && 
    best.signals.delta > DELTA_EXTREME
  ) {
    if (best.signals.independentOccurrences < 2 && !best.signals.anchor) {
      logOcrStage("extreme_delta_uncorroborated", {
        reading: best.reading,
        delta: best.signals.delta,
        occurrences: best.signals.independentOccurrences,
        anchor: best.signals.anchor
      });
      return rejected("extreme_delta_uncorroborated", candidates, previousReading, best.confidence);
    }
  }

  // ------------------------------------------------------------------
  // Ambiguity / Conflict check
  // ------------------------------------------------------------------
  // If the second best candidate is very close in score but represents
  // a different reading, we must reject rather than guess.
  if (
    second &&
    second.reading !== best.reading &&
    (best.score - second.score) <= 15
  ) {
    return rejected("ambiguous", candidates, previousReading, best.confidence);
  }

  // ------------------------------------------------------------------
  // Absolute minimum score safety
  // ------------------------------------------------------------------
  if (best.score < 20) {
    logOcrStage("low_confidence", {
      score:     best.score,
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
    signals:    best.signals,
  });

  logMemory("after_candidate_selected");

  return {
    accepted:        true,
    detectedReading: best.reading,
    rawDigits:       best.digits,
    confidence:      Math.round(best.confidence),
    score:           best.score,
    signals:         best.signals,
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

  // ------------------------------------------------------------------
  // RECONCILIATION: spurious/missing leading digits
  // ------------------------------------------------------------------
  const toDelete = new Set<string>();

  const countIndependentSources = (occs: RawCandidate[]) => {
    const base = new Set<string>();
    for (const c of occs) {
      base.add(c.source.split(":")[0]!);
    }
    return base.size;
  };

  const digitsKeys = Array.from(grouped.keys());

  for (let i = 0; i < digitsKeys.length; i++) {
    for (let j = i + 1; j < digitsKeys.length; j++) {
      const a = digitsKeys[i]!;
      const b = digitsKeys[j]!;

      if (toDelete.has(a) || toDelete.has(b)) continue;

      let sDigits: string;
      let lDigits: string;

      if (a.length === b.length + 1 && a.endsWith(b)) {
        lDigits = a;
        sDigits = b;
      } else if (b.length === a.length + 1 && b.endsWith(a)) {
        lDigits = b;
        sDigits = a;
      } else {
        continue; // Not a single leading digit difference
      }

      const sOccs = grouped.get(sDigits)!;
      const lOccs = grouped.get(lDigits)!;

      const sIndep = countIndependentSources(sOccs);
      const lIndep = countIndependentSources(lOccs);

      const sAnchor = sOccs.some((c) => c.hasOdometerAnchor);
      const lAnchor = lOccs.some((c) => c.hasOdometerAnchor);

      let winner: string | null = null;
      let loser: string | null = null;
      let reason = "";

      const sScore = sIndep + (sAnchor ? 10 : 0);
      const lScore = lIndep + (lAnchor ? 10 : 0);

      if (sScore > lScore && sIndep >= 2) {
        winner = sDigits;
        loser = lDigits;
        reason = "spurious_leading_digit";
      } else if (lScore > sScore && lIndep >= 2) {
        winner = lDigits;
        loser = sDigits;
        reason = "missing_leading_digit";
      } else if (sAnchor && !lAnchor) {
        winner = sDigits;
        loser = lDigits;
        reason = "spurious_leading_digit_anchor";
      } else if (lAnchor && !sAnchor) {
        winner = lDigits;
        loser = sDigits;
        reason = "missing_leading_digit_anchor";
      }

      if (winner && loser) {
        const winnerOccs = grouped.get(winner)!;
        const loserOccs = grouped.get(loser)!;

        logOcrStage("candidate_reconciled", {
          selectedRawDigits: winner,
          rejectedVariant: loser,
          reason,
          selectedOccurrences: countIndependentSources(winnerOccs),
          variantOccurrences: countIndependentSources(loserOccs),
        });

        // Merge evidence so the winner is even stronger
        winnerOccs.push(...loserOccs);
        toDelete.add(loser);
      }
    }
  }

  for (const del of toDelete) {
    grouped.delete(del);
  }

  // Log final grouped candidates in development
  if (process.env.NODE_ENV !== "production") {
    const summary = Array.from(grouped.entries()).map(([k, v]) => ({
      digits: k,
      independentSources: countIndependentSources(v),
      anchored: v.some(c => c.hasOdometerAnchor)
    }));
    logOcrStage("candidates_grouped", { summary });
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

    const hasPrimary = occurrences.some((c) => isPrimarySource(c.source));

    // Primary bonus applies at a lower confidence gate than before (15, was 35).
    const primaryBonus =
      hasPrimary &&
      bestConfidence >= minimumPrimaryConfidence
        ? primaryCropBonus
        : 0;

    const indepCount = countIndependentSources(occurrences);
    const reason: string[] = [
      `${occurrences.length} OCR pass(es)`,
      `${indepCount} independent pass(es)`,
      `${digits.length} digit(s)`,
      `independent_occurrences:${indepCount}` // Marker for consensus logic
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
    let deltaScore = 0;
    let delta: number | null = null;

    if (previousReading !== null) {
      delta = reading - previousReading;
      if (delta < 0) {
        monotonicPenalty += 90;
        reason.push("below previous reading");
      } else {
        if (delta <= DELTA_BONUS_HEALTHY) {
          deltaScore = 20;
          reason.push("healthy historical delta");
        } else if (delta <= DELTA_BONUS_MODERATE) {
          deltaScore = 5;
          reason.push("moderate historical delta");
        } else if (delta > DELTA_PENALTY_MODERATE) {
          deltaScore = -30;
          reason.push("extreme historical delta penalty");
        } else {
          reason.push("large historical delta");
        }
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
        regionBonus +
        deltaScore -
        monotonicPenalty,
      ),
      signals: {
        independentOccurrences: indepCount,
        anchor:                 hasAnchor,
        primarySource:          hasPrimary,
        delta:                  delta,
      },
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
