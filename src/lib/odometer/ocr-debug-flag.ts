/**
 * TEMPORARY DEBUG FLAG — OCR live detection diagnostics.
 *
 * Set to `true`  → debug panel, preview images, and console logs appear
 *                   in BOTH development and production (Vercel).
 * Set to `false` → all debug output is hidden (no UI change, no perf cost).
 *
 * ⚠️  Remember to set back to `false` after production testing is done.
 */
export const OCR_DEBUG = process.env.NODE_ENV !== "production" && false;
