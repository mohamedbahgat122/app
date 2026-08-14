import type { ReactNode } from "react";
import { DriverBottomNavigation } from "@/components/app-shell/driver-bottom-navigation";
import { DriverRoutePrefetcher } from "@/components/app-shell/driver-route-prefetcher";
import { DriverTopHeader } from "@/components/app-shell/driver-top-header";
import { RealtimeRefresh } from "@/components/app-shell/realtime-refresh";
import { GlobalNavigationLoader } from "@/components/app-shell/global-navigation-loader";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";

type DriverAppShellProps = {
 children: ReactNode;
 session: VerifiedDriverSession;
};

export function DriverAppShell({
 children,
 session,
}: DriverAppShellProps) {
 return (
  <main className="min-h-dvh w-full overflow-x-clip bg-surface md:flex md:justify-center md:bg-navy">
   <div className="min-h-dvh w-full bg-surface md:max-w-107.5 md:shadow-[0_26px_90px_rgba(16,35,63,0.2)]">
    <DriverRoutePrefetcher />
    <DriverTopHeader
     driverName={session.driver.fullName}
     profilePhotoPath={session.driver.profilePhotoPath}
     userId={session.userId}
    />
    <RealtimeRefresh
     channelName={`driver-notifications-${session.userId}`}
     table="app_notifications"
     filter={`recipient_user_id=eq.${session.userId}`}
     toast="تم تحديث الإشعارات"
    />
    <div className="px-[clamp(18px,5vw,24px)] pb-[calc(5.25rem+env(safe-area-inset-bottom))] pt-4">
     <GlobalNavigationLoader>
      {children}
     </GlobalNavigationLoader>
    </div>
    <DriverBottomNavigation />
   </div>
  </main>
 );
}
