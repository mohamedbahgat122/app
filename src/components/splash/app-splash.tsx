"use client";

import { useTranslations } from "next-intl";
import { AppSplashView } from "@/components/splash/app-splash-view";
import { getDirection, type Locale } from "@/config/locales";

type AppSplashProps = {
  locale: Locale;
  isExiting: boolean;
  isReducedMotion: boolean;
};

export function AppSplash({
  locale,
  isExiting,
  isReducedMotion,
}: AppSplashProps) {
  const brand = useTranslations("Brand");
  const splash = useTranslations("Splash");

  return (
    <AppSplashView
      brandName={brand("name")}
      brandSubtitle={brand("subtitle")}
      direction={getDirection(locale)}
      isExiting={isExiting}
      isReducedMotion={isReducedMotion}
      loadingLabel={splash("loading")}
      logoAlt={brand("logoAlt")}
      subtitle={splash("subtitle")}
      title={splash("title")}
    />
  );
}
