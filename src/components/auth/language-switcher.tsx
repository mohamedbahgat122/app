"use client";

import { useTranslations } from "next-intl";
import { isLocale, type Locale } from "@/config/locales";
import { locales } from "@/config/locales";
import { usePathname, useRouter } from "@/i18n/navigation";

type LanguageSwitcherProps = {
  locale: Locale;
};

export function LanguageSwitcher({ locale }: LanguageSwitcherProps) {
  const t = useTranslations("Languages");
  const router = useRouter();
  const pathname = usePathname();

  function switchLocale(nextLocale: string) {
    if (!isLocale(nextLocale) || nextLocale === locale) {
      return;
    }

    router.replace(pathname, { locale: nextLocale });
  }

  return (
    <div className="relative z-30 inline-flex min-h-11 items-center rounded-lg border border-border bg-surface text-navy shadow-sm transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary hover:border-primary/35 hover:text-primary">
      <GlobeIcon />
      <select
        value={locale}
        aria-label={t("selector")}
        onChange={(event) => switchLocale(event.target.value)}
        className="relative z-10 min-h-11 appearance-none rounded-lg border-0 bg-transparent py-2.5 ps-9 pe-9 text-base font-semibold text-current outline-none [touch-action:manipulation]"
      >
        {locales.map((item) => (
          <option key={item} value={item}>
            {t(item)}
          </option>
        ))}
      </select>
      <ChevronIcon />
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="pointer-events-none absolute start-3 size-4"
      fill="none"
    >
      <path
        d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="pointer-events-none absolute end-3 size-4"
      fill="none"
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}
