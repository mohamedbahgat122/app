import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { DriverAvatar } from "@/components/app-shell/driver-avatar";
import { HeaderLanguageSwitch } from "@/components/app-shell/header-language-switch";
import { BellIcon, TasksIcon } from "@/components/app-shell/icons";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDriverAvatarUrl } from "@/lib/app/driver-app-data";
import { loadDriverUnreadNotificationCount } from "@/lib/app/driver-notifications";

type DriverTopHeaderProps = {
 driverName: string;
 profilePhotoPath: string | null;
 userId: string;
};

export async function DriverTopHeader({
 driverName,
 profilePhotoPath,
 userId,
}: DriverTopHeaderProps) {
 const t = await getTranslations("Shell");
 const firstName = getFirstName(driverName);

 const supabase = await createSupabaseServerClient();
 const [avatarUrl, notificationCount] = await Promise.all([
  createDriverAvatarUrl(profilePhotoPath),
  loadDriverUnreadNotificationCount(supabase),
 ]);

 const taskCount = 0; // Keeping task count at 0 as in original implementation

 return (
 <header className="sticky top-0 z-50 border-b border-border bg-surface px-[clamp(18px,5vw,24px)] pb-3 pt-[max(0.9rem,env(safe-area-inset-top))]">
 <div className="flex items-center justify-between gap-2.5">
 <div className="min-w-0">
  <p className="truncate text-[1.05rem] font-bold leading-6 text-navy">
  {t("welcome", { name: firstName })}
  </p>
  <p className="truncate text-xs font-semibold text-muted">
  {t("subtitle")}
  </p>
 </div>
 <div className="flex shrink-0 items-center gap-1">
  <HeaderLanguageSwitch />
  <HeaderIconLink href="/tasks" label={t("tasks")} count={taskCount}>
  <TasksIcon />
  </HeaderIconLink>
  <HeaderIconLink href="/notifications" label={t("notifications")} count={notificationCount}>
  <BellIcon />
  </HeaderIconLink>
  <Link
  href="/account"
  aria-label={t("account")}
  className="rounded-full touch-manipulation focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
  >
  <DriverAvatar imageUrl={avatarUrl} name={driverName} />
  </Link>
 </div>
 </div>
 </header>
 );
}

function HeaderIconLink({
 children,
 count,
 href,
 label,
}: {
 children: ReactNode;
 count?: number;
 href: string;
 label: string;
}) {
 return (
 <Link
 href={href}
 aria-label={label}
 className="relative flex size-11 items-center justify-center rounded-lg text-navy transition touch-manipulation hover:bg-primary-soft hover:text-primary focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary"
 >
 {children}
 {count ? (
 <span className="absolute inset-e-1.5 top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.62rem] font-bold leading-4 text-white">
  {count}
 </span>
 ) : null}
 </Link>
 );
}

function getFirstName(name: string) {
 return name.trim().split(/\s+/)[0] ?? name;
}
