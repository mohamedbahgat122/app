import { getDirection, type Locale } from "@/config/locales";
import { BrandHeader } from "@/components/auth/brand-header";
import { LanguageSwitcher } from "@/components/auth/language-switcher";
import { LoginForm } from "@/components/auth/login-form";

type LoginPageProps = {
  locale: Locale;
};

export function LoginPage({ locale }: LoginPageProps) {
  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-surface md:flex md:items-stretch md:justify-center md:bg-navy md:px-5 md:py-6">
      <div className="flex min-h-dvh w-full flex-col bg-surface md:max-w-[430px] md:overflow-hidden md:rounded-[1.6rem] md:shadow-[0_26px_90px_rgba(16,35,63,0.2)]">
        <BrandHeader />
        <section className="relative z-20 -mt-7 flex flex-1 flex-col rounded-t-[26px] bg-surface px-[clamp(22px,6vw,24px)] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6 md:rounded-t-[1.75rem] md:px-6">
          <div className="flex w-full flex-col">
            <div className="mb-6 flex justify-end" dir={getDirection(locale)}>
              <LanguageSwitcher locale={locale} />
            </div>
            <LoginForm locale={locale} />
          </div>
        </section>
      </div>
    </main>
  );
}
