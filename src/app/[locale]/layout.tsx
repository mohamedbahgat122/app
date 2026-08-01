import type { Metadata, Viewport } from "next";
import { Cairo, Geist_Mono, Noto_Nastaliq_Urdu, Noto_Sans_Bengali } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getDirection, type Locale } from "@/config/locales";
import { routing } from "@/i18n/routing";
import "../globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const urdu = Noto_Nastaliq_Urdu({
  variable: "--font-urdu",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const bengali = Noto_Sans_Bengali({
  variable: "--font-bengali",
  subsets: ["bengali", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fontByLocale: Record<Locale, string> = {
  ar: "--font-cairo",
  en: "--font-cairo",
  ur: "--font-urdu",
  bn: "--font-bengali",
};

export const metadata: Metadata = {
  title: {
    default: "الفارس جروب | تطبيق المندوب",
    template: "%s",
  },
  description: "Al Faris Group driver application",
  icons: {
    icon: "/brand/al-faris-logo-cropped.png",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f5f8fc",
};

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params;

  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const typedLocale = locale as Locale;

  return (
    <html
      lang={typedLocale}
      dir={getDirection(typedLocale)}
      className={`${cairo.variable} ${urdu.variable} ${bengali.variable} ${geistMono.variable} h-full antialiased`}
      style={{
        "--font-app": `var(${fontByLocale[typedLocale]})`,
      } as React.CSSProperties}
    >
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
