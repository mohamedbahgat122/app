"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  changeDriverPasswordAction,
  retryCompleteDriverPasswordChangeAction,
  type ChangePasswordActionState,
} from "@/app/[locale]/actions";
import { PasswordField } from "@/components/auth/password-field";
import { getDirection, type Locale } from "@/config/locales";

type ChangePasswordFormProps = {
  locale: Locale;
};

export function ChangePasswordForm({ locale }: ChangePasswordFormProps) {
  const t = useTranslations("ChangePassword");
  const isRtl = getDirection(locale) === "rtl";
  const textAlignClass = isRtl ? "text-right" : "text-left";
  const [state, formAction, isPending] = useActionState<
    ChangePasswordActionState,
    FormData
  >(changeDriverPasswordAction, { status: "idle" });
  const [retryState, retryAction, isRetryPending] = useActionState<
    ChangePasswordActionState,
    FormData
  >(retryCompleteDriverPasswordChangeAction, { status: "idle" });
  const activeState =
    retryState.status !== "idle" && state.status === "finalization_required"
      ? retryState
      : state;
  const hasError =
    activeState.status !== "idle" && Boolean(activeState.messageKey);
  const errorId = "change-password-error";

  return (
    <form
      action={
        state.status === "finalization_required" ? retryAction : formAction
      }
      className="mt-6 space-y-3.5 md:mt-7 md:space-y-4"
      noValidate
    >
      <input type="hidden" name="locale" value={locale} />
      {state.status === "finalization_required" ? null : (
        <div className="space-y-3.5 md:space-y-4" key={state.resetKey}>
          <PasswordField
            ariaDescribedBy={hasError ? errorId : undefined}
            autoComplete="new-password"
            disabled={isPending}
            id="new-password"
            isRtl={isRtl}
            label={t("newPassword")}
            name="newPassword"
            placeholder={t("newPassword")}
          />
          <PasswordField
            ariaDescribedBy={hasError ? errorId : undefined}
            autoComplete="new-password"
            disabled={isPending}
            id="confirm-password"
            isRtl={isRtl}
            label={t("confirmPassword")}
            name="confirmPassword"
            placeholder={t("confirmPassword")}
          />
        </div>
      )}

      {hasError ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className={`text-sm font-semibold text-red-600 ${textAlignClass}`}
        >
          {t(`validation.${activeState.messageKey}`)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending || isRetryPending}
        className="inline-flex min-h-14 w-full items-center justify-center rounded-[0.85rem] bg-primary px-5 text-base font-semibold text-white shadow-[0_12px_24px_rgba(11,108,251,0.2)] transition [touch-action:manipulation] hover:bg-primary-hover active:translate-y-px disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {isPending || isRetryPending
          ? t("submitting")
          : state.status === "finalization_required"
            ? t("continue")
            : t("submit")}
      </button>
    </form>
  );
}
