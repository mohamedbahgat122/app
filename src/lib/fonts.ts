import localFont from "next/font/local";

export const cairoArabic = localFont({
  src: "../app/fonts/cairo-arabic-wght-normal.woff2",
  variable: "--font-cairo",
  display: "swap",
  weight: "400 800",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const cairoLatin = localFont({
  src: "../app/fonts/cairo-latin-wght-normal.woff2",
  variable: "--font-cairo-latin",
  display: "swap",
  weight: "400 800",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const urduArabic = localFont({
  src: "../app/fonts/noto-nastaliq-urdu-arabic-wght-normal.woff2",
  variable: "--font-urdu",
  display: "swap",
  weight: "400 700",
  fallback: ["serif"],
});

export const urduLatin = localFont({
  src: "../app/fonts/noto-nastaliq-urdu-latin-wght-normal.woff2",
  variable: "--font-urdu-latin",
  display: "swap",
  weight: "400 700",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const bengaliBengali = localFont({
  src: "../app/fonts/noto-sans-bengali-bengali-wght-normal.woff2",
  variable: "--font-bengali",
  display: "swap",
  weight: "400 800",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const bengaliLatin = localFont({
  src: "../app/fonts/noto-sans-bengali-latin-wght-normal.woff2",
  variable: "--font-bengali-latin",
  display: "swap",
  weight: "400 800",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

export const geistMono = localFont({
  src: "../app/fonts/geist-mono-variable.woff2",
  variable: "--font-geist-mono",
  display: "swap",
  weight: "100 900",
  fallback: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
});

export const localFontVariables = [
  cairoArabic.variable,
  cairoLatin.variable,
  urduArabic.variable,
  urduLatin.variable,
  bengaliBengali.variable,
  bengaliLatin.variable,
  geistMono.variable,
].join(" ");
