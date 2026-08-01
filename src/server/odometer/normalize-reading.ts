import "server-only";

const easternArabicDigits = new Map(
  Array.from("٠١٢٣٤٥٦٧٨٩").map((digit, index) => [digit, String(index)]),
);
const persianDigits = new Map(
  Array.from("۰۱۲۳۴۵۶۷۸۹").map((digit, index) => [digit, String(index)]),
);
const maxDbReading = BigInt(2_147_483_647);

export type NormalizedReading =
  | { status: "valid"; digits: string; value: bigint }
  | { status: "invalid"; reason: "empty" | "negative" | "decimal" | "letters" | "out_of_range" };

export function normalizeOdometerReading(input: string): NormalizedReading {
  let value = input.trim();

  value = value.replace(/\s*(?:km|KM|Km|kM|كم)\s*$/u, "");
  value = Array.from(value)
    .map((char) => easternArabicDigits.get(char) ?? persianDigits.get(char) ?? char)
    .join("");
  value = value.replace(/(?<=\d)[,\s](?=\d)/gu, "");

  if (!value) return { status: "invalid", reason: "empty" };
  if (value.startsWith("-")) return { status: "invalid", reason: "negative" };
  if (value.includes(".")) return { status: "invalid", reason: "decimal" };
  if (!/^\d+$/u.test(value)) return { status: "invalid", reason: "letters" };

  const numericValue = BigInt(value);
  if (numericValue > maxDbReading) {
    return { status: "invalid", reason: "out_of_range" };
  }

  return {
    status: "valid",
    digits: value,
    value: numericValue,
  };
}
