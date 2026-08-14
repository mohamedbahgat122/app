"use client";

import { useEffect, useState } from "react";
import { AppSplash } from "@/components/splash/app-splash";
import type { Locale } from "@/config/locales";

let startupSplashCompletedForCurrentDocument = false;

type StartupSplashProps = {
  locale: Locale;
};

export function StartupSplash({ locale }: StartupSplashProps) {
  const [isVisible, setIsVisible] = useState(
    !startupSplashCompletedForCurrentDocument,
  );

  useEffect(() => {
    if (startupSplashCompletedForCurrentDocument) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        startupSplashCompletedForCurrentDocument = true;
        setIsVisible(false);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <AppSplash
      locale={locale}
      isExiting={false}
      isReducedMotion={false}
    />
  );
}
