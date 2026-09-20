"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { getDirection, type Locale } from "@/config/locales";

let startupSplashCompletedForCurrentDocument = false;

type StartupSplashProps = {
  locale: Locale;
};

export function StartupSplash({ locale }: StartupSplashProps) {
  const brand = useTranslations("Brand");
  const [isVisible, setIsVisible] = useState(
    !startupSplashCompletedForCurrentDocument,
  );
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (startupSplashCompletedForCurrentDocument) {
      return;
    }

    const exitTimer = window.setTimeout(() => {
      setIsExiting(true);
    }, 760);
    const removeTimer = window.setTimeout(() => {
      startupSplashCompletedForCurrentDocument = true;
      setIsVisible(false);
    }, 1080);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <section
      aria-live="polite"
      dir={getDirection(locale)}
      className={`fixed inset-0 z-[100] flex min-h-dvh items-center justify-center overflow-hidden bg-navy px-6 text-center text-white ${
        isExiting ? "alfaris-startup-minimal-exit" : ""
      }`}
      style={{
        paddingTop: "max(1.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="alfaris-startup-minimal relative flex w-full max-w-[320px] flex-col items-center">
        <div className="alfaris-startup-logo-shell relative flex size-32 items-center justify-center rounded-full border border-gold/25 bg-black/35 shadow-[0_24px_70px_rgba(0,0,0,0.34)]">
          <span
            aria-hidden="true"
            className="alfaris-startup-ring absolute inset-[-10px] rounded-full border border-gold/45"
          />
          <Image
            src="/brand/al-faris-logo-cropped.png"
            alt={brand("logoAlt")}
            width={720}
            height={480}
            priority
            sizes="128px"
            className="relative z-10 h-auto w-24"
          />
        </div>

        <div className="alfaris-startup-title mt-8">
          <h1 className="text-2xl font-bold leading-tight text-gold">
            {brand("name")}
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/70">
            {brand("subtitle")}
          </p>
        </div>

        <div
          aria-hidden="true"
          className="alfaris-startup-progress mt-7 h-1 w-36 overflow-hidden rounded-full bg-white/12"
        >
          <span className="block h-full w-1/2 rounded-full bg-gold" />
        </div>
      </div>

      <style jsx>{`
        .alfaris-startup-minimal {
          animation: alfaris-startup-content 680ms cubic-bezier(0.16, 1, 0.3, 1)
            both;
        }

        .alfaris-startup-logo-shell {
          animation: alfaris-startup-logo 720ms cubic-bezier(0.16, 1, 0.3, 1)
            both;
        }

        .alfaris-startup-ring {
          animation: alfaris-startup-ring 1100ms ease-out both;
        }

        .alfaris-startup-title {
          animation: alfaris-startup-title 620ms ease 180ms both;
        }

        .alfaris-startup-progress span {
          animation: alfaris-startup-progress 900ms ease-in-out infinite;
        }

        .alfaris-startup-minimal-exit {
          animation: alfaris-startup-exit 320ms ease forwards;
        }

        @keyframes alfaris-startup-content {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes alfaris-startup-logo {
          from {
            opacity: 0;
            transform: scale(0.86);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes alfaris-startup-ring {
          0% {
            opacity: 0;
            transform: scale(0.88);
          }
          45% {
            opacity: 1;
          }
          100% {
            opacity: 0.35;
            transform: scale(1.08);
          }
        }

        @keyframes alfaris-startup-title {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes alfaris-startup-progress {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(240%);
          }
        }

        @keyframes alfaris-startup-exit {
          to {
            opacity: 0;
            transform: scale(0.99);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .alfaris-startup-minimal,
          .alfaris-startup-logo-shell,
          .alfaris-startup-ring,
          .alfaris-startup-title,
          .alfaris-startup-progress span,
          .alfaris-startup-minimal-exit {
            animation-duration: 1ms;
            animation-iteration-count: 1;
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}
