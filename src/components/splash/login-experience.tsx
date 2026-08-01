"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppSplash } from "@/components/splash/app-splash";
import type { Locale } from "@/config/locales";

let splashCompletedForCurrentDocument = false;

type SplashStatus = "visible" | "fading" | "hidden";

type LoginExperienceProps = {
  children: ReactNode;
  locale: Locale;
};

export function LoginExperience({ children, locale }: LoginExperienceProps) {
  const [status, setStatus] = useState<SplashStatus>(
    splashCompletedForCurrentDocument ? "hidden" : "visible",
  );
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    let motionQuery: MediaQueryList | null = null;

    function updateMotionPreference(event: MediaQueryListEvent) {
      setIsReducedMotion(event.matches);
    }

    const initialTimer = window.setTimeout(() => {
      try {
        motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
        setIsReducedMotion(motionQuery.matches);
        motionQuery.addEventListener("change", updateMotionPreference);
      } catch {
        motionQuery = null;
      }
    }, 0);

    return () => {
      window.clearTimeout(initialTimer);
      motionQuery?.removeEventListener("change", updateMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (splashCompletedForCurrentDocument) {
      return;
    }

    let isComplete = false;

    function clearActiveTimers() {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
    }

    function hideSplash() {
      if (isComplete) {
        return;
      }

      isComplete = true;
      clearActiveTimers();
      splashCompletedForCurrentDocument = true;
      setStatus("hidden");
    }

    const fadeDelay = isReducedMotion ? 1400 : 3500;
    const totalDelay = isReducedMotion ? 1900 : 4000;

    const fadeTimer = window.setTimeout(() => {
      setStatus("fading");
    }, fadeDelay);
    const hideTimer = window.setTimeout(hideSplash, totalDelay);
    const failSafeTimer = window.setTimeout(hideSplash, 6000);

    return () => {
      clearActiveTimers();

      window.clearTimeout(failSafeTimer);
    };
  }, [isReducedMotion]);

  const isSplashVisible = status === "visible" || status === "fading";

  return (
    <>
      {children}
      {isSplashVisible ? (
        <AppSplash
          locale={locale}
          isExiting={status === "fading"}
          isReducedMotion={isReducedMotion}
        />
      ) : null}
    </>
  );
}
