"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { DriverOrderShiftOperationalContext } from "@/lib/app/driver-app-data";
import { ClockIcon, ShiftIcon } from "@/components/app-shell/icons";

type Props = {
  context: DriverOrderShiftOperationalContext | null;
  labels: Record<string, string>;
  locale: string;
  compact?: boolean;
};

export function OrderShiftOperationalStatus({ context, labels, locale, compact = false }: Props) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const boundaryRefreshHandled = useRef(false);

  useEffect(() => {
    const clientNow = Date.now();
    setNow(clientNow);
    setServerOffset(context?.server_now ? Date.parse(context.server_now) - clientNow : 0);
    boundaryRefreshHandled.current = false;
  }, [context?.server_now]);

  const effectiveNow = now === null ? null : now + serverOffset;
  const backendState = context?.state;
  const currentOpensAt = context?.earliest_start_at ? Date.parse(context.earliest_start_at) : context?.opens_at ? Date.parse(context.opens_at) : null;
  const nextOpensAt = context?.next_opens_at ? Date.parse(context.next_opens_at) : null;
  const isNextOpening = backendState === "closed" && nextOpensAt !== null && effectiveNow !== null && effectiveNow < nextOpensAt;
  const opensAt = isNextOpening ? nextOpensAt : currentOpensAt;
  const closesAt: number | null = null;
  const isBeforeOpening =
    (backendState === "before_open_window" || isNextOpening) &&
    opensAt !== null &&
    effectiveNow !== null &&
    effectiveNow < opensAt;
  const isOpenNow =
    (backendState === "open" || backendState === "manually_opened" || backendState === "before_open_window") &&
    opensAt !== null &&
    effectiveNow !== null &&
    effectiveNow >= opensAt;
  const isExpired = false;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const clientNow = Date.now();
      const current = clientNow + serverOffset;
      setNow(clientNow);
      const boundary = isBeforeOpening ? opensAt : null;
      if (boundary !== null && current >= boundary && !boundaryRefreshHandled.current) {
        boundaryRefreshHandled.current = true;
        router.refresh();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [closesAt, isBeforeOpening, isNextOpening, isOpenNow, opensAt, router, serverOffset]);

  const positive = isOpenNow;
  const title = !context
    ? labels.unavailable
    : isExpired
      ? localized(locale, "انتهت مهلة فتح الشيفت", "The shift opening window has ended")
      : isNextOpening
        ? labels.nextOpen ?? labels.beforeOpen
        : isBeforeOpening
          ? labels.beforeOpen
        : positive
          ? labels[backendState === "manually_opened" ? "manuallyOpened" : "open"] ?? labels.open
          : labels[backendState ?? "unavailable"] ?? labels.unavailable;
  const frameTone = positive ? "border-emerald-200 bg-emerald-50" : isExpired ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50";
  const iconTone = positive ? "text-emerald-700" : isExpired ? "text-slate-600" : "text-amber-700";
  const textTone = positive ? "text-emerald-800" : isExpired ? "text-slate-800" : "text-amber-900";

  return (
    <article className={`${compact ? "rounded-xl border p-3" : "rounded-3xl border p-4 shadow-sm"} ${frameTone}`} dir={locale === "ar" || locale === "ur" ? "rtl" : "ltr"}>
      <div className="flex items-start gap-3">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/80 ${iconTone}`}>
          {positive ? <ShiftIcon className="size-4" /> : <ClockIcon className="size-4" />}
        </span>
        <div className="min-w-0">
          {!compact ? <p className="text-xs font-bold text-slate-500">{labels.status}</p> : null}
          <p className={`${compact ? "text-sm" : "mt-1 text-base"} font-bold ${textTone}`}>{title}</p>
        </div>
      </div>
      {isBeforeOpening && opensAt !== null ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-600">{formatOpeningDay(opensAt, effectiveNow, locale)} {formatTime(opensAt, locale)}</p>
          <Countdown label={localized(locale, "المتبقي على الفتح", "Time until opening")} value={formatDuration(opensAt - (effectiveNow ?? opensAt))} />
        </div>
      ) : null}
      {isOpenNow && opensAt !== null && closesAt !== null ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-slate-600">{formatElapsedMessage(effectiveNow === null ? 0 : effectiveNow - opensAt, locale)}</p>
          <Countdown label={localized(locale, "المتبقي لإغلاق نافذة الفتح", "Time until opening closes")} value={formatDuration(closesAt - (effectiveNow ?? closesAt))} />
        </div>
      ) : null}
      {isExpired && closesAt !== null ? <p className="mt-2 text-xs font-semibold text-slate-600">{formatMissedMessage(effectiveNow === null ? 0 : effectiveNow - closesAt, locale)}</p> : null}
    </article>
  );
}

function Countdown({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/70 bg-white/70 px-3 py-2"><div className="flex items-center gap-2 text-xs font-bold text-slate-600"><ClockIcon className="size-3.5" />{label}</div><p className="mt-1 text-center font-mono text-lg font-black tabular-nums tracking-normal text-slate-900" dir="ltr">{value}</p></div>;
}

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatOpeningDay(target: number, current: number | null, locale: string) {
  if (current !== null) {
    const targetDay = riyadhDate(target);
    const currentDay = riyadhDate(current);
    if (targetDay === currentDay) return localized(locale, "يفتح اليوم الساعة", "Opens today at");
    const tomorrow = new Date(`${currentDay}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    if (targetDay === tomorrow.toISOString().slice(0, 10)) return localized(locale, "يفتح غدًا الساعة", "Opens tomorrow at");
  }
  return localized(locale, "يفتح يوم", "Opens on") + ` ${new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale === "ur" ? "ur-PK" : locale === "bn" ? "bn-BD" : "en-US", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Riyadh" }).format(new Date(target))} ${localized(locale, "الساعة", "at")}`;
}

function formatTime(value: number, locale: string) {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : locale === "ur" ? "ur-PK" : locale === "bn" ? "bn-BD" : "en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Riyadh" }).format(new Date(value));
}

function formatElapsedMessage(milliseconds: number, locale: string) {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
  if (locale === "ar") return minutes < 1 ? "مضت أقل من دقيقة من وقت الفتح" : `مضت ${minutes} دقيقة من وقت الفتح`;
  return minutes < 1 ? "Less than a minute has passed since opening" : `${minutes} minute${minutes === 1 ? "" : "s"} have passed since opening`;
}

function formatMissedMessage(milliseconds: number, locale: string) {
  const minutes = Math.floor(Math.max(0, milliseconds) / 60000);
  if (locale === "ar") return `فات موعد فتح الشيفت منذ ${minutes < 1 ? "أقل من دقيقة" : `${minutes} دقيقة`}`;
  return `The opening window ended ${minutes < 1 ? "less than a minute" : `${minutes} minute${minutes === 1 ? "" : "s"}`} ago`;
}

function riyadhDate(value: number) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === "year")?.value}-${parts.find((part) => part.type === "month")?.value}-${parts.find((part) => part.type === "day")?.value}`;
}

function localized(locale: string, arabic: string, english: string) {
  return locale === "ar" ? arabic : english;
}
