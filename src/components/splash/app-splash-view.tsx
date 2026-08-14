import Image from "next/image";
import type { Direction } from "@/config/locales";

type AppSplashViewProps = {
  brandName: string;
  brandSubtitle: string;
  direction: Direction;
  isExiting?: boolean;
  isReducedMotion?: boolean;
  loadingLabel: string;
  logoAlt: string;
  subtitle: string;
  title: string;
};

export function AppSplashView({
  brandName,
  brandSubtitle,
  direction,
  isExiting = false,
  isReducedMotion = false,
  loadingLabel,
  logoAlt,
  subtitle,
  title,
}: AppSplashViewProps) {
  const textAlignClass = direction === "rtl" ? "text-right" : "text-left";

  return (
    <section
      aria-live="polite"
      dir={direction}
      className={`fixed inset-0 z-[100] flex min-h-dvh items-center justify-center overflow-hidden bg-navy px-6 py-[max(1.5rem,env(safe-area-inset-top))] text-white ${
        isExiting ? "alfaris-splash-exit" : ""
      } ${isReducedMotion ? "alfaris-splash-reduced" : ""}`}
    >
      <div className="pointer-events-none absolute inset-0 alfaris-splash-light" />
      <div className="pointer-events-none absolute inset-x-8 top-[max(2rem,env(safe-area-inset-top))] h-px bg-gold/40" />
      <div className="pointer-events-none absolute inset-x-8 bottom-[max(2rem,env(safe-area-inset-bottom))] h-px bg-gold/25" />

      <div className="relative z-10 flex w-full max-w-[430px] flex-col gap-8 pb-[env(safe-area-inset-bottom)]">
        <div className={`alfaris-splash-brand ${textAlignClass}`}>
          <div className="flex items-center gap-4">
            <div className="flex w-[88px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-black shadow-[0_18px_46px_rgba(0,0,0,0.26)]">
              <Image
                src="/brand/al-faris-logo-cropped.png"
                alt={logoAlt}
                width={720}
                height={480}
                priority
                sizes="88px"
                className="h-auto w-full"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[0.8rem] font-semibold text-gold">
                {loadingLabel}
              </p>
              <h1 className="mt-1 text-[1.55rem] font-semibold leading-tight text-gold">
                {brandName}
              </h1>
              <p className="mt-1 text-sm font-medium leading-6 text-white/75">
                {brandSubtitle}
              </p>
            </div>
          </div>
        </div>

        <div className={`alfaris-splash-copy ${textAlignClass}`}>
          <h2 className="text-[1.45rem] font-semibold leading-tight text-white">
            {title}
          </h2>
          <p className="mt-2 text-sm font-medium leading-6 text-white/68">
            {subtitle}
          </p>
        </div>

        <DeliveryScene />
      </div>
    </section>
  );
}

function DeliveryScene() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 390 190"
      className="alfaris-delivery-scene h-auto w-full"
      fill="none"
    >
      <defs>
        <filter id="vehicleShadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="7" floodOpacity="0.24" />
        </filter>
      </defs>

      <path
        d="M28 145H362"
        stroke="rgba(255,255,255,0.34)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="18 16"
      />
      <path
        d="M300 61c0 21-24 43-24 43s-24-22-24-43a24 24 0 1 1 48 0Z"
        fill="#D7AA4B"
        className="alfaris-pin"
      />
      <circle cx="276" cy="61" r="8" fill="#10233F" />
      <circle
        cx="276"
        cy="104"
        r="15"
        stroke="#D7AA4B"
        strokeWidth="2"
        className="alfaris-pin-pulse"
      />

      <g className="alfaris-vehicle" filter="url(#vehicleShadow)">
        <path
          d="M82 112h118c9 0 18 8 21 18l5 15H65l5-21c2-7 5-12 12-12Z"
          fill="#F8FBFF"
        />
        <path
          d="M112 78h58c8 0 15 5 18 12l13 29H91l7-26c2-9 7-15 14-15Z"
          fill="#D7AA4B"
        />
        <path
          d="M123 89h39c5 0 9 3 11 8l5 12h-61l3-13c1-4 2-7 3-7Z"
          fill="#10233F"
          opacity="0.88"
        />
        <path d="M69 130h162v18H65l4-18Z" fill="#0B6CFB" />
        <path d="M189 96h28l15 34h-31l-12-34Z" fill="#F8FBFF" />
        <g className="alfaris-parcel">
          <rect x="79" y="91" width="35" height="28" rx="4" fill="#C6922F" />
          <path d="M96.5 91v28M79 101h35" stroke="#F7E4B5" strokeWidth="2" />
        </g>
        <g className="alfaris-wheel">
          <circle cx="103" cy="147" r="18" fill="#10233F" />
          <circle cx="103" cy="147" r="8" stroke="#F8FBFF" strokeWidth="3" />
          <path d="M103 129v36M85 147h36" stroke="#D7AA4B" strokeWidth="2" />
        </g>
        <g className="alfaris-wheel">
          <circle cx="194" cy="147" r="18" fill="#10233F" />
          <circle cx="194" cy="147" r="8" stroke="#F8FBFF" strokeWidth="3" />
          <path d="M194 129v36M176 147h36" stroke="#D7AA4B" strokeWidth="2" />
        </g>
      </g>

      <g className="alfaris-check">
        <circle cx="316" cy="62" r="18" fill="#F8FBFF" />
        <path
          d="m307 62 6 6 13-15"
          stroke="#0B6CFB"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
