import { getDirection, type Locale } from "@/config/locales";

const loadingText: Record<Locale, string> = {
  ar: "جاري التحميل...",
  en: "Loading...",
  ur: "لوڈ ہو رہا ہے...",
  bn: "লোড হচ্ছে...",
};

type RouteSplashFallbackProps = {
  locale: Locale;
};

export function RouteSplashFallback({ locale }: RouteSplashFallbackProps) {
  return (
    <div
      dir={getDirection(locale)}
      className="flex min-h-[42dvh] items-center justify-center bg-surface px-6 py-10 text-navy"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <span
          aria-hidden="true"
          className="size-9 animate-spin rounded-full border-3 border-primary/20 border-t-primary"
        />
        <p className="text-sm font-bold text-muted">{loadingText[locale]}</p>
      </div>
    </div>
  );
}
