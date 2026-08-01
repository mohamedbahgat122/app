"use client";

import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { LanguageIcon } from "@/components/app-shell/icons";
import { isLocale, type Locale } from "@/config/locales";
import { usePathname, useRouter } from "@/i18n/navigation";

export function HeaderLanguageSwitch() {
  const currentLocale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextLocale: Locale = currentLocale === "ar" ? "en" : "ar";
  const label =
    currentLocale === "ar"
      ? "تغيير اللغة إلى الإنجليزية"
      : "Switch language to Arabic";

  function switchLanguage() {
    if (!isLocale(nextLocale) || nextLocale === currentLocale) {
      return;
    }

    const query = searchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      locale: nextLocale,
    });
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={switchLanguage}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg text-navy transition [touch-action:manipulation] hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <LanguageIcon />
    </button>
  );
}
