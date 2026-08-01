"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

type PasswordFieldProps = {
  ariaDescribedBy?: string;
  autoComplete?: string;
  disabled?: boolean;
  id?: string;
  isRtl: boolean;
  label?: string;
  name?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  value?: string;
};

export function PasswordField({
  ariaDescribedBy,
  autoComplete = "current-password",
  disabled,
  id = "password",
  isRtl,
  label,
  name = "password",
  onChange,
  placeholder,
  value,
}: PasswordFieldProps) {
  const t = useTranslations("Login");
  const [isVisible, setIsVisible] = useState(false);
  const textAlignClass = isRtl ? "text-right" : "text-left";

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className={`block text-sm font-semibold text-navy ${textAlignClass}`}
      >
        {label ?? t("passwordLabel")}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          dir={isRtl ? "rtl" : "ltr"}
          placeholder={placeholder ?? t("passwordPlaceholder")}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          disabled={disabled}
          aria-describedby={ariaDescribedBy}
          className={`min-h-14 w-full rounded-[0.85rem] border border-border bg-primary-soft/70 px-4 pe-12 text-base text-navy outline-none transition placeholder:text-muted/70 focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 ${textAlignClass}`}
        />
        <button
          type="button"
          aria-label={isVisible ? t("hidePassword") : t("showPassword")}
          aria-pressed={isVisible}
          disabled={disabled}
          onClick={() => setIsVisible((current) => !current)}
          className="absolute inset-y-0 end-1 my-auto flex size-11 items-center justify-center rounded-lg text-muted transition [touch-action:manipulation] hover:bg-white hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {isVisible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
      <path
        d="m4 4 16 16M9.9 5.6A9.4 9.4 0 0 1 12 5c6.1 0 9.5 7 9.5 7a15.8 15.8 0 0 1-2.9 3.7M6.5 7.7A16.4 16.4 0 0 0 2.5 12s3.4 7 9.5 7c1.4 0 2.6-.3 3.7-.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M9.9 9.9a3 3 0 0 0 4.2 4.2"
        stroke="currentColor"
        strokeLinecap="round"
      />
    </svg>
  );
}
