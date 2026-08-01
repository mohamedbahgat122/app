export const locales = ["ar", "en", "ur", "bn"] as const;

export type Locale = (typeof locales)[number];

export type Direction = "rtl" | "ltr";

export const defaultLocale: Locale = "ar";

export const localeDirections: Record<Locale, Direction> = {
  ar: "rtl",
  en: "ltr",
  ur: "rtl",
  bn: "ltr",
};

export function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function getDirection(locale: Locale): Direction {
  return localeDirections[locale];
}
