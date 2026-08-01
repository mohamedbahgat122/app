import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getDirection, isLocale, type Locale } from "@/config/locales";
import { getVerifiedDriverSession } from "@/lib/auth/driver-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ChangePasswordRouteProps = {
  params: Promise<{
    locale: string;
  }>;
};

export default async function ChangePasswordRoute({
  params,
}: ChangePasswordRouteProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const sessionResult = await getVerifiedDriverSession(supabase);

  if (sessionResult.status !== "verified") {
    redirect(`/${locale}`);
  }

  if (!sessionResult.session.mustChangePassword) {
    redirect(`/${locale}/home`);
  }

  const t = await getTranslations({ locale, namespace: "ChangePassword" });
  const textAlignClass =
    getDirection(locale as Locale) === "rtl" ? "text-right" : "text-left";

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-surface md:flex md:items-stretch md:justify-center md:bg-navy md:px-5 md:py-6">
      <section className="flex min-h-dvh w-full flex-col justify-center bg-surface px-[clamp(22px,6vw,24px)] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] md:max-w-[430px] md:overflow-hidden md:rounded-[1.6rem] md:px-6 md:shadow-[0_26px_90px_rgba(16,35,63,0.2)]">
        <div className={textAlignClass}>
          <h1 className="text-[1.65rem] font-semibold leading-tight tracking-normal text-navy">
            {t("title")}
          </h1>
          <p className="mt-3 text-sm font-medium leading-6 text-muted">
            {t("description")}
          </p>
          <ChangePasswordForm locale={locale} />
        </div>
      </section>
    </main>
  );
}
