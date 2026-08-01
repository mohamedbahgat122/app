import "server-only";

export function normalizeDriverLoginId(value: string | null | undefined) {
  return value?.trim() ?? "";
}

export function buildDriverInternalEmail(normalizedDriverLoginId: string) {
  const localPart = normalizedDriverLoginId
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `driver.${localPart || "account"}@auth.alfaris.internal`;
}
