"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CarIcon,
  FileTextIcon,
  OrganizationIcon,
  ShieldCheckIcon,
  TasksIcon,
  UserIcon,
} from "@/components/app-shell/icons";

const tips = [
  { id: "uniform", icon: UserIcon },
  { id: "acceptFast", icon: ShieldCheckIcon },
  { id: "goRestaurant", icon: OrganizationIcon },
  { id: "checkOrder", icon: TasksIcon },
  { id: "protectOrder", icon: FileTextIcon },
  { id: "professionalDelivery", icon: CarIcon },
] as const;

export function DriverTipsSlider() {
  const t = useTranslations("Home.driverTips");
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const pointerStart = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % tips.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [activeIndex, reducedMotion]);

  function selectTip(index: number) {
    setActiveIndex((index + tips.length) % tips.length);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    pointerStart.current = event.clientX;
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) < 40) return;
    selectTip(activeIndex + (distance < 0 ? 1 : -1));
  }

  const activeTip = tips[activeIndex];
  const Icon = activeTip.icon;

  return (
    <section className="rounded-xl border border-border bg-surface p-4 shadow-sm" aria-labelledby="driver-tips-title">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <ShieldCheckIcon className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 id="driver-tips-title" className="text-base font-bold text-navy">{t("title")}</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-muted">{t("subtitle")}</p>
        </div>
      </div>
      <div
        className="mt-4 min-h-28 touch-pan-y select-none overflow-hidden rounded-xl bg-primary-soft/45 p-4"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { pointerStart.current = null; }}
        role="region"
        aria-live="polite"
        aria-label={t("sliderLabel")}
      >
        <div className={reducedMotion ? "" : "transition-all duration-300 ease-out"}>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-primary shadow-sm">
              <Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <h4 className="text-sm font-extrabold text-navy">{t(`items.${activeTip.id}.title`)}</h4>
              <p className="mt-1 text-sm font-medium leading-6 text-muted">{t(`items.${activeTip.id}.description`)}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-center gap-1.5" aria-label={t("paginationLabel")}>
        {tips.map((tip, index) => (
          <button
            key={tip.id}
            type="button"
            onClick={() => selectTip(index)}
            aria-label={t("goTo", { number: index + 1 })}
            aria-current={index === activeIndex ? "true" : undefined}
            className={`size-2 rounded-full transition-colors ${index === activeIndex ? "bg-primary" : "bg-primary/25"}`}
          />
        ))}
      </div>
    </section>
  );
}
