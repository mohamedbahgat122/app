"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import {
  loginDriverAction,
  type LoginActionState,
} from "@/app/[locale]/actions";
import { PasswordField } from "@/components/auth/password-field";
import { getDirection, type Locale } from "@/config/locales";

type LoginFormProps = {
  locale: Locale;
};

export function LoginForm({ locale }: LoginFormProps) {
  const t = useTranslations("Login");
  const isRtl = getDirection(locale) === "rtl";
  const textAlignClass = isRtl ? "text-right" : "text-left";
  const [residencyNumber, setResidencyNumber] = useState("");
  const [state, formAction, isPending] = useActionState<
    LoginActionState,
    FormData
  >(loginDriverAction, { status: "idle" });
  const errorId = "login-form-error";
  const hasError = state.status !== "idle" && Boolean(state.messageKey);

  return (
    <>
      <div>
        <p className="text-[0.8rem] font-bold text-primary">{t("eyebrow")}</p>
        <h2 className="mt-2 text-[1.65rem] font-semibold leading-tight tracking-normal text-navy">
          {t("welcomeTitle")}
        </h2>
        <p className="mt-3 text-sm font-medium leading-6 text-muted">
          {t("description")}
        </p>
      </div>
      <form
        className="mt-6 space-y-3.5 md:mt-7 md:space-y-4"
        action={formAction}
        noValidate
      >
        <input type="hidden" name="locale" value={locale} />
        <div className="space-y-2">
          <label
            htmlFor="residency-number"
            className={`block text-sm font-semibold text-navy ${textAlignClass}`}
          >
            {t("residencyNumberLabel")}
          </label>
          <input
            id="residency-number"
            name="residencyNumber"
            type="text"
            inputMode="numeric"
            autoComplete="username"
            dir="ltr"
            placeholder={t("residencyNumberPlaceholder")}
            value={residencyNumber}
            onChange={(event) => setResidencyNumber(event.target.value)}
            disabled={isPending}
            aria-describedby={hasError ? errorId : undefined}
            className={`min-h-14 w-full rounded-[0.85rem] border border-border bg-primary-soft/70 px-4 text-base text-navy outline-none transition placeholder:text-muted/70 focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 ${textAlignClass}`}
          />
        </div>
        <PasswordField
          ariaDescribedBy={hasError ? errorId : undefined}
          disabled={isPending}
          isRtl={isRtl}
          key={state.resetKey ?? "initial-password"}
        />
        {hasError ? (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className={`text-sm font-semibold text-red-600 ${textAlignClass}`}
          >
            {t(`validation.${state.messageKey}`)}
          </p>
        ) : null}
        <button
          type="submit"
          className="inline-flex min-h-14 w-full items-center justify-center rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white shadow-[0_12px_24px_rgba(11,108,251,0.2)] transition [touch-action:manipulation] hover:bg-primary-hover active:translate-y-px disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          disabled={isPending}
        >
          {isPending ? t("submitting") : t("submit")}
        </button>
      </form>
    </>
  );
}
