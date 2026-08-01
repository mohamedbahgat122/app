import Image from "next/image";
import { useTranslations } from "next-intl";

export function BrandHeader() {
  const t = useTranslations("Brand");

  return (
    <section className="relative flex h-[clamp(270px,37dvh,340px)] shrink-0 items-center justify-center overflow-hidden bg-navy px-6 pb-12 pt-[max(1.75rem,env(safe-area-inset-top))] text-center md:h-[clamp(280px,38dvh,318px)] md:pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="pointer-events-none absolute inset-x-10 top-[max(2.1rem,env(safe-area-inset-top))] h-px bg-gold/45 md:top-[max(2.25rem,env(safe-area-inset-top))]" />
      <div className="relative z-10 w-full">
        <div className="mx-auto flex w-full max-w-[clamp(112px,34vw,128px)] items-center justify-center overflow-hidden rounded-2xl bg-black shadow-[0_18px_46px_rgba(16,35,63,0.24)] md:max-w-[126px]">
          <Image
            src="/brand/al-faris-logo-cropped.png"
            alt={t("logoAlt")}
            width={720}
            height={480}
            priority
            sizes="126px"
            className="h-auto w-full"
          />
        </div>
        <h1 className="mx-auto mt-4 text-[1.6rem] font-semibold leading-tight tracking-normal text-gold md:mt-5 md:text-[1.7rem]">
          {t("name")}
        </h1>
        <p className="mx-auto mt-2 max-w-[20rem] text-[0.92rem] font-medium leading-6 text-white/78 md:text-[0.95rem]">
          {t("subtitle")}
        </p>
      </div>
    </section>
  );
}
