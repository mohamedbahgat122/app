"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { DriverAttendanceContext } from "@/lib/app/driver-app-data";

export function AttendanceStatus({ context, locale }: { context: DriverAttendanceContext | null; locale: string }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const refreshTarget = context?.state === "before_start_window"
    ? context.start_available_at
    : context?.state === "started_waiting_for_end"
      ? context.end_available_at
      : null;
  const wasBeforeTargetRef = useRef<boolean | null>(null);
  const refreshedRef = useRef(false);

  useEffect(() => {
    refreshedRef.current = false;
    setNow(Date.now());
    wasBeforeTargetRef.current = refreshTarget !== null && refreshTarget !== undefined && Date.parse(refreshTarget) > Date.now();
  }, [refreshTarget]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      const targetTime = refreshTarget ? Date.parse(refreshTarget) : null;
      const isBeforeTarget = targetTime !== null && current < targetTime;
      if (targetTime !== null && wasBeforeTargetRef.current && !isBeforeTarget && !refreshedRef.current) {
        refreshedRef.current = true;
        router.refresh();
      }
      wasBeforeTargetRef.current = isBeforeTarget;
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [router, refreshTarget]);

  if (!context) return <Message locale={locale} ar="تعذر تحميل حالة الحضور." en="Attendance status could not be loaded." tone="warning" />;
  if (context.state === "no_assignment" || context.state === "no_current_assignment") return <Message locale={locale} ar="لا يوجد شيفت مؤهل حالياً." en="No current eligible shift." />;

  if (context.state === "shift_ended_without_start") {
    return <Message
      locale={locale}
      ar={`انتهى وقت شيفت ${context.shift_name ?? "المحدد"} ولم يتم تسجيل بدء الدوام. لا يمكن تسجيل البداية الآن.`}
      en={`The ${context.shift_name ?? "assigned"} shift ended without a recorded Start. Start is no longer available.`}
      tone="warning"
      details={formatSchedule(context, locale)}
    />;
  }

  if (!context.policy_configured) return <Message locale={locale} ar="لم يتم إعداد أوقات الدوام لهذا الشيفت بعد." en="Attendance times are not configured for this shift yet." tone="warning" />;

  const target = context.state === "before_start_window" ? context.start_available_at : context.end_available_at;
  if (target) {
    const offset = now === null ? 0 : Date.parse(context.server_now) - now;
    const remaining = now === null ? null : Math.max(0, Date.parse(target) - (now + offset));
    if (remaining !== null && remaining > 0) {
      const ar = context.state === "before_start_window" ? "متبقي {time} على إتاحة بدء الدوام" : "متبقي {time} على إتاحة إنهاء الدوام";
      const en = context.state === "before_start_window" ? "{time} until shift start is available" : "{time} until shift end is available";
      return <Message locale={locale} ar={ar.replace("{time}", formatRemaining(remaining))} en={en.replace("{time}", formatRemaining(remaining))} details={formatSchedule(context, locale)} />;
    }
  }

  if (context.state === "start_available") {
    return <Message locale={locale} ar="يمكن بدء الدوام الآن." en="Shift Start is available now." details={formatSchedule(context, locale)} />;
  }

  if (context.state === "late_but_active") {
    const offset = now === null ? 0 : Date.parse(context.server_now) - now;
    const elapsed = now === null ? 0 : Math.max(0, now + offset - Date.parse(context.scheduled_start_at ?? context.server_now));
    const message = `بدأ الشيفت منذ ${formatElapsed(elapsed)} وما زال بدء الدوام متاحاً.`;
    return <Message locale={locale} ar={message} en={`The shift started ${formatElapsed(elapsed)} ago. Start is still available.`} details={formatSchedule(context, locale)} />;
  }

  if (context.state === "started_waiting_for_end" && !context.can_end_now) return <Message locale={locale} ar="لم يحن وقت إنهاء الدوام بعد." en="The minimum end duration has not elapsed yet." details={formatSchedule(context, locale)} />;
  return null;
}

function Message({ locale, ar, en, tone = "normal", details }: { locale: string; ar: string; en: string; tone?: "normal" | "warning"; details?: string }) {
  return <div className={`rounded-[0.85rem] border p-3 text-sm font-semibold ${tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-border bg-surface-raised text-muted"}`}>
    <p>{locale === "ar" ? ar : en}</p>
    {details ? <p className="mt-2 text-xs font-medium opacity-80">{details}</p> : null}
  </div>;
}

function formatSchedule(context: DriverAttendanceContext, locale: string) {
  const format = (value?: string) => value ? new Intl.DateTimeFormat(locale === "ar" ? "ar-SA" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "";
  return `${format(context.scheduled_start_at)} - ${format(context.scheduled_end_at)}`;
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatElapsed(milliseconds: number) {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
