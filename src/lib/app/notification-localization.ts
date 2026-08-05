import type { Locale } from "@/config/locales";
import type { DriverNotification } from "@/lib/app/driver-notifications";

type NotificationTranslator = (
  key: string,
  values?: Record<string, string>,
) => string;

type LocalizedNotificationContent = {
  title: string;
  message: string;
  actionLabel: string;
};

const requestTypes = new Set(["leave", "maintenance", "meeting", "oil_change"]);

export function getLocalizedNotificationContent({
  notification,
  locale,
  t,
}: {
  notification: DriverNotification;
  locale: Locale;
  t: NotificationTranslator;
}): LocalizedNotificationContent {
  void locale;

  if (notification.type === "driver_warning_issued") {
    return {
      title: t("localized.driver_warning_issued.title"),
      message: t("localized.driver_warning_issued.message"),
      actionLabel: t("openWarning"),
    };
  }

  if (
    notification.type === "driver_app_request_submitted" &&
    isRequestType(notification.requestType)
  ) {
    return {
      title: t(`localized.driver_app_request_submitted.${notification.requestType}.title`),
      message: t(
        `localized.driver_app_request_submitted.${notification.requestType}.message`,
        { driverName: t("driverFallback") },
      ),
      actionLabel: t("openRequest"),
    };
  }

  if (
    (notification.type === "driver_app_request_approved" ||
      notification.type === "driver_app_request_rejected") &&
    isRequestType(notification.requestType)
  ) {
    const decision =
      notification.type === "driver_app_request_approved" ? "approved" : "rejected";

    return {
      title: t(`localized.driver_app_request_${decision}.${notification.requestType}.title`),
      message: t(`localized.driver_app_request_${decision}.${notification.requestType}.message`),
      actionLabel: t("openRequest"),
    };
  }

  if (notification.type === "task_assigned") {
    return {
      title: t("localized.task_assigned.title"),
      message: t("localized.task_assigned.message"),
      actionLabel: t("openTask"),
    };
  }

  if (notification.type === "task_updated") {
    return {
      title: t("localized.task_updated.title"),
      message: t("localized.task_updated.message"),
      actionLabel: t("openTask"),
    };
  }

  return {
    title: notification.title,
    message: notification.message,
    actionLabel:
      notification.entityType === "driver_warning"
        ? t("openWarning")
        : notification.entityType === "driver_app_request"
          ? t("openRequest")
          : t("open"),
  };
}

function isRequestType(value: string | null): value is "leave" | "maintenance" | "meeting" | "oil_change" {
  return Boolean(value && requestTypes.has(value));
}
