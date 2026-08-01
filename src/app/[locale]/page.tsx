import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { LoginPage } from "@/components/auth/login-page";
import { LoginExperience } from "@/components/splash/login-experience";
import { isLocale, type Locale } from "@/config/locales";
import { getVerifiedDriverSession } from "@/lib/auth/driver-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type LoginRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({
  params,
}: LoginRouteProps): Promise<Metadata> {
  const { locale } = await params;
  const safeLocale: Locale = isLocale(locale) ? locale : "ar";
  const t = await getTranslations({ locale: safeLocale, namespace: "Metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function LoginRoute({ params }: LoginRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (sessionResult.status === "verified") {
    redirect(`/${locale}/home`);
  }

  return (
    <LoginExperience locale={locale}>
      <LoginPage locale={locale} />
    </LoginExperience>
  );
}
