import { AppSplashView } from "@/components/splash/app-splash-view";
import { getDirection, type Locale } from "@/config/locales";

const fallbackText: Record<
  Locale,
  {
    brandName: string;
    brandSubtitle: string;
    loadingLabel: string;
    logoAlt: string;
    subtitle: string;
    title: string;
  }
> = {
  ar: {
    brandName: "الفارس جروب",
    brandSubtitle: "نظام إدارة الخدمات اللوجستية",
    loadingLabel: "جاري التجهيز",
    logoAlt: "شعار الفارس جروب",
    subtitle: "توصيل أسرع... وتنفيذ أدق",
    title: "نجهز رحلتك",
  },
  en: {
    brandName: "Al Faris Group",
    brandSubtitle: "Logistics services management",
    loadingLabel: "Loading",
    logoAlt: "Al Faris Group logo",
    subtitle: "Faster delivery, sharper execution",
    title: "Preparing your route",
  },
  ur: {
    brandName: "الفارس گروپ",
    brandSubtitle: "لاجسٹک سروسز مینجمنٹ",
    loadingLabel: "تیاری جاری ہے",
    logoAlt: "الفارس گروپ لوگو",
    subtitle: "تیز تر ترسیل، بہتر عمل درآمد",
    title: "آپ کا سفر تیار کیا جا رہا ہے",
  },
  bn: {
    brandName: "Al Faris Group",
    brandSubtitle: "Logistics services management",
    loadingLabel: "Loading",
    logoAlt: "Al Faris Group logo",
    subtitle: "Faster delivery, sharper execution",
    title: "Preparing your route",
  },
};

type RouteSplashFallbackProps = {
  locale: Locale;
};

export function RouteSplashFallback({ locale }: RouteSplashFallbackProps) {
  const text = fallbackText[locale];

  return (
    <AppSplashView
      brandName={text.brandName}
      brandSubtitle={text.brandSubtitle}
      direction={getDirection(locale)}
      isReducedMotion
      loadingLabel={text.loadingLabel}
      logoAlt={text.logoAlt}
      subtitle={text.subtitle}
      title={text.title}
    />
  );
}
