import { getTranslations, setRequestLocale } from "next-intl/server";
import { AppError } from "@/components/app-shell/app-error";
import { DriverAppShell } from "@/components/app-shell/driver-app-shell";
import {
  markAllDriverNotificationsReadAction,
  markDriverNotificationReadAction,
} from "@/app/[locale]/notification-actions";
import { isLocale } from "@/config/locales";
import { loadDriverAppContext } from "@/lib/app/driver-app-data";
import { loadDriverNotifications } from "@/lib/app/driver-notifications";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function NotificationsPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const app = await loadDriverAppContext(locale);
  if (app.status === "application_error") return <AppError locale={locale} />;
  const t = await getTranslations({ locale, namespace: "Notifications" });
  const notifications = await loadDriverNotifications({ supabase: app.supabase });

  return (
    <DriverAppShell context={app.context}>
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
              <article
                key={notification.id}
                className="rounded-[0.85rem] border border-border bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-navy">{notification.title}</p>
                    <p className="mt-1 text-sm font-semibold text-muted">
                      {notification.message}
                    </p>
                  </div>
                  <span className="rounded-full bg-primary-soft px-2 py-1 text-xs font-bold text-primary">
                    {t(notification.isRead ? "read" : "unread")}
                  </span>
                </div>
                <p className="mt-3 text-xs font-semibold text-muted">
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(notification.createdAt))}
                </p>
                {!notification.isRead ? (
                  <form action={markDriverNotificationReadAction} className="mt-3">
                    <input type="hidden" name="locale" value={locale} />
                    <input
                      type="hidden"
                      name="notificationId"
                      value={notification.id}
                    />
                    <button className="rounded-[0.85rem] border border-border px-3 py-2 text-xs font-bold text-navy">
                      {t("markRead")}
                    </button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </main>
    </DriverAppShell>
  );
}
