"use client";

import { useState } from "react";

type Props = {
  disabled: boolean;
  label: string;
  unavailableMessage: string;
};

export function PerOrderStartButton({ disabled, label, unavailableMessage }: Props) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setMessage(unavailableMessage)}
        className="min-h-12 w-full rounded-xl bg-primary px-4 py-3 text-base font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
      >
        {label}
      </button>
      {message ? <p className="text-xs font-semibold text-muted">{message}</p> : null}
    </div>
  );
}
