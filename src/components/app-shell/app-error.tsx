import { getTranslations } from "next-intl/server";
import type { Locale } from "@/config/locales";

export async function AppError({ locale }: { locale: Locale }) {
  const t = await getTranslations({ locale, namespace: "Home" });

  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-surface md:flex md:justify-center md:bg-navy">
      <section className="flex min-h-dvh w-full flex-col justify-center bg-surface px-[clamp(18px,5vw,24px)] md:max-w-[430px]">
        <p className="rounded-[0.85rem] border border-border bg-primary-soft/70 px-4 py-3 text-sm font-semibold text-navy">
          {t("applicationError")}
        </p>
      </section>
    </main>
  );
}
