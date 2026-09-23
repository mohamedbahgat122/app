"use client";

import { startTransition } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";

type MonthOption = {
  value: string;
  label: string;
};

export function MonthSelector({
  label,
  options,
  selectedMonth,
}: {
  label: string;
  options: MonthOption[];
  selectedMonth: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="rounded-xl border border-border bg-white p-3 shadow-sm">
      <label htmlFor="salary-month" className="mb-2 block text-xs font-bold text-muted">
        {label}
      </label>
      <select
        id="salary-month"
        value={selectedMonth}
        onChange={(event) => {
          const query = `?month=${encodeURIComponent(event.target.value)}`;
          startTransition(() => router.replace(`${pathname}${query}`));
        }}
        className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-3 text-sm font-bold text-navy outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
