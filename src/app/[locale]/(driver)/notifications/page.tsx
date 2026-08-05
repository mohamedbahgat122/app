import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  markAllDriverNotificationsReadAction,
  markDriverNotificationReadAction,
  openDriverNotificationAction,
} from "@/app/[locale]/notification-actions";
import { isLocale, type Locale } from "@/config/locales";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";
import { loadDriverNotifications } from "@/lib/app/driver-notifications";
import { getLocalizedNotificationContent } from "@/lib/app/notification-localization";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function NotificationsPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return null;
  const t = await getTranslations({ locale, namespace: "Notifications" });
  const notifications = await loadDriverNotifications({ supabase: app.supabase });

  return (
      <main className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-navy">{t("title")}</h1>
          {notifications.some((notification) => !notification.isRead) ? (
            <form action={markAllDriverNotificationsReadAction}>
              <input type="hidden" name="locale" value={locale} />
              <button className="rounded-[0.85rem] border border-border bg-white px-3 py-2 text-xs font-bold text-primary">
                {t("markAllRead")}
              </button>
            </form>
          ) : null}
        </div>
        {notifications.length === 0 ? (
          <p className="rounded-[0.85rem] border border-border bg-white p-4 text-sm font-semibold text-muted">
            {t("empty")}
          </p>
        ) : (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <NotificationCard
                key={notification.id}
                locale={locale}
                notification={notification}
                t={(key, values) => t(key, values)}
              />
            ))}
          </div>
        )}
      </main>
  );
}

function NotificationCard({
  locale,
  notification,
  t,
}: {
  locale: Locale;
  notification: Awaited<ReturnType<typeof loadDriverNotifications>>[number];
  t: (key: string, values?: Record<string, string>) => string;
}) {
  const content = getLocalizedNotificationContent({
    notification,
    locale,
    t,
  });
  const targetPath = getNotificationTargetPath(notification, locale);

  return (
    <article className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold text-navy">{content.title}</p>
          <p className="mt-1 text-sm font-semibold text-muted">
            {content.message}
          </p>
        </div>
        <span className="rounded-full bg-primary-soft px-2 py-1 text-xs font-bold text-primary">
          {t(notification.isRead ? "read" : "unread")}
        </span>
      </div>
      <p className="mt-3 text-xs font-semibold text-muted">
        {formatDate(notification.createdAt, locale, t("notAvailable"))}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {targetPath ? (
          <form action={openDriverNotificationAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="notificationId" value={notification.id} />
            <input type="hidden" name="targetPath" value={targetPath} />
            <button className="rounded-[0.85rem] bg-primary px-3 py-2 text-xs font-bold text-white">
              {content.actionLabel}
            </button>
          </form>
        ) : null}
        {!notification.isRead ? (
          <form action={markDriverNotificationReadAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="notificationId" value={notification.id} />
            <button className="rounded-[0.85rem] border border-border px-3 py-2 text-xs font-bold text-navy">
              {t("markRead")}
            </button>
          </form>
        ) : null}
      </div>
    </article>
  );
}

function getNotificationTargetPath(
  notification: { entityType: string | null; entityId: string | null },
  locale: Locale,
) {
  if (!notification.entityType || !notification.entityId) {
    return null;
  }

  if (notification.entityType === "driver_warning") {
    return `/${locale}/warnings/${notification.entityId}`;
  }

  if (notification.entityType === "driver_app_request") {
    return `/${locale}/requests`;
  }

  return null;
}

function formatDate(value: string | null | undefined, locale: Locale, fallback: string) {
  if (!value) return fallback;

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
