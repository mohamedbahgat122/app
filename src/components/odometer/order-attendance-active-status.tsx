"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function OrderAttendanceActiveStatus({
  startedAt,
  endAvailableAt,
  endDelayConfigured,
  locale,
}: {
  startedAt: string;
  endAvailableAt: string | null;
  endDelayConfigured: boolean;
  locale: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const refreshed = useRef(false);
  const target = endAvailableAt ? Date.parse(endAvailableAt) : null;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (now !== null && target !== null && now >= target && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [now, router, target]);

  const remaining = target === null || now === null ? null : Math.max(0, target - now);
  const rtl = locale === "ar" || locale === "ur";
  const unitLabels = countdownUnitLabels(locale);

  return (
    <div className="rounded-xl border border-primary/20 bg-primary-soft px-4 py-3 text-sm font-bold text-navy" dir={rtl ? "rtl" : "ltr"}>
      <p>{locale === "ar" ? "الشيفت مفتوح" : locale === "ur" ? "شفٹ کھلی ہے" : locale === "bn" ? "শিফট খোলা আছে" : "Order shift is open"}</p>
      <p className="mt-1 text-xs text-muted">
        {locale === "ar" ? "بدأ فعليًا:" : locale === "ur" ? "شروع ہوا:" : locale === "bn" ? "শুরু হয়েছে:" : "Started:"} <span dir="ltr">{new Date(startedAt).toLocaleTimeString()}</span>
      </p>
      {!endDelayConfigured ? (
        <p className="mt-1 text-xs text-muted">
          {locale === "ar" ? "لم يتم تحديد مدة السماح بإنهاء الدوام. يرجى مراجعة الإدارة." : locale === "ur" ? "حاضری ختم کرنے کی مدت مقرر نہیں ہے۔ انتظامیہ سے رابطہ کریں۔" : locale === "bn" ? "ডিউটি শেষ করার সময় নির্ধারণ করা হয়নি। প্রশাসনের সাথে যোগাযোগ করুন।" : "End is unavailable because the End duration is not configured."}
        </p>
      ) : remaining !== null ? (
        <div className="mt-3 rounded-lg border border-primary/10 bg-white/60 px-3 py-2">
          <p className="text-center text-xs font-semibold text-muted">
            {countdownLabel(locale)}
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2" dir="ltr">
            {formatCountdown(remaining).map((part, index) => (
              <div key={part.unit} className="min-w-0 text-center">
                <p className="whitespace-nowrap font-mono text-xl font-black tabular-nums tracking-normal text-navy">
                  {part.value}
                </p>
                <p className="mt-0.5 truncate text-[10px] font-bold text-muted" dir={rtl ? "rtl" : "ltr"}>
                  {unitLabels[index]}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    { value: String(hours).padStart(2, "0"), unit: "hours" },
    { value: String(minutes).padStart(2, "0"), unit: "minutes" },
    { value: String(seconds).padStart(2, "0"), unit: "seconds" },
  ];
}

function countdownLabel(locale: string) {
  if (locale === "ar") return "متبقي حتى إتاحة إنهاء الدوام";
  if (locale === "ur") return "حاضری ختم کرنے تک باقی وقت";
  if (locale === "bn") return "ডিউটি শেষ করার সুযোগ পর্যন্ত বাকি";
  return "Until attendance can be ended";
}

function countdownUnitLabels(locale: string) {
  if (locale === "ar") return ["ساعة", "دقيقة", "ثانية"];
  if (locale === "ur") return ["گھنٹے", "منٹ", "سیکنڈ"];
  if (locale === "bn") return ["ঘণ্টা", "মিনিট", "সেকেন্ড"];
  return ["Hours", "Minutes", "Seconds"];
}
