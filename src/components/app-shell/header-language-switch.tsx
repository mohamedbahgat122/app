"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { LanguageIcon } from "@/components/app-shell/icons";
import { isLocale, locales } from "@/config/locales";
import { usePathname, useRouter } from "@/i18n/navigation";

export function HeaderLanguageSwitch() {
  const currentLocale = useLocale();
  const t = useTranslations("Languages");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  function switchLanguage(nextLocale: string) {
    if (!isLocale(nextLocale)) {
      return;
    }

    setIsOpen(false);

    if (nextLocale === currentLocale) {
      return;
    }

    const query = searchParams.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      locale: nextLocale,
    });
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t("selector")}
        title={t("selector")}
        onClick={() => setIsOpen((value) => !value)}
        className="flex size-11 shrink-0 items-center justify-center rounded-lg text-navy transition [touch-action:manipulation] hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <LanguageIcon />
      </button>
      {isOpen ? (
        <div
          role="menu"
          aria-label={t("selector")}
          className="absolute end-0 top-[calc(100%+0.45rem)] z-50 w-40 overflow-hidden rounded-lg border border-border bg-white py-1 text-sm font-bold text-navy shadow-[0_18px_50px_rgba(16,35,63,0.16)]"
        >
          {locales.map((locale) => {
            const isSelected = locale === currentLocale;

            return (
              <button
                key={locale}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => switchLanguage(locale)}
                className={`flex min-h-10 w-full items-center justify-between gap-3 px-3 text-start transition [touch-action:manipulation] hover:bg-primary-soft ${
                  isSelected ? "text-primary" : "text-navy"
                }`}
              >
                <span>{t(locale)}</span>
                <span aria-hidden="true" className="w-4 text-center">
                  {isSelected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
