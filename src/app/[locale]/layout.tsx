import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { RouteSplashFallback } from "@/components/splash/route-splash-fallback";
import { StartupSplash } from "@/components/splash/startup-splash";
import { getDirection, type Locale } from "@/config/locales";
import { routing } from "@/i18n/routing";
import { localFontVariables } from "@/lib/fonts";
import "../globals.css";

const fontByLocale: Record<Locale, string> = {
  ar: "var(--font-cairo), var(--font-cairo-latin)",
  en: "var(--font-cairo-latin), var(--font-cairo)",
  ur: "var(--font-urdu), var(--font-urdu-latin)",
  bn: "var(--font-bengali), var(--font-bengali-latin)",
};

export const metadata: Metadata = {
  title: {
    default: "الفارس جروب | تطبيق المندوب",
    template: "%s",
  },
  description: "Al Faris Group driver application",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
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
  themeColor: "#10233f",
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
      className={`${localFontVariables} h-full antialiased`}
      style={{
        "--font-app": fontByLocale[typedLocale],
      } as React.CSSProperties}
    >
      <body className="min-h-full bg-navy">
        <NextIntlClientProvider>
          <StartupSplash locale={typedLocale} />
          <Suspense fallback={<RouteSplashFallback locale={typedLocale} />}>
            {children}
          </Suspense>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
