import type { ReactNode } from "react";
import { DriverBottomNavigation } from "@/components/app-shell/driver-bottom-navigation";
import { DriverRoutePrefetcher } from "@/components/app-shell/driver-route-prefetcher";
import { DriverTopHeader } from "@/components/app-shell/driver-top-header";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import type { DriverAppContext } from "@/lib/app/driver-app-data";

type DriverAppShellProps = {
  children: ReactNode;
  context: DriverAppContext;
};

export function DriverAppShell({
  children,
  context,
}: DriverAppShellProps) {
  return (
    <main className="min-h-dvh w-full overflow-x-hidden bg-surface md:flex md:justify-center md:bg-navy">
      <div className="min-h-dvh w-full bg-surface md:max-w-[430px] md:shadow-[0_26px_90px_rgba(16,35,63,0.2)]">
        <DriverRoutePrefetcher />
        <DriverTopHeader
          avatarUrl={context.avatarUrl}
          driverName={context.session.driver.fullName}
          notificationCount={context.unreadNotificationCount}
          taskCount={context.taskCount}
        />
        <RealtimeRefresh
          channelName={`driver-notifications-${context.session.userId}`}
          table="app_notifications"
          filter={`recipient_user_id=eq.${context.session.userId}`}
          toast="تم تحديث الإشعارات"
        />
        <div className="px-[clamp(18px,5vw,24px)] pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-4">
          {children}
        </div>
        <DriverBottomNavigation />
      </div>
    </main>
  );
}
