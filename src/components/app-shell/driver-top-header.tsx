import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { DriverAvatar } from "@/components/app-shell/driver-avatar";
import { HeaderLanguageSwitch } from "@/components/app-shell/header-language-switch";
import { BellIcon, OilWarningIcon } from "@/components/app-shell/icons";
import { Link } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createDriverAvatarUrl } from "@/lib/app/driver-app-data";
import { loadDriverUnreadNotificationCount } from "@/lib/app/driver-notifications";
import { loadDriverOilMaintenanceStatus } from "@/lib/app/oil-maintenance-status";
import type {
  DriverOilMaintenanceStatus,
  OilMaintenanceStatus,
} from "@/lib/app/oil-maintenance-types";
import type { VerifiedDriverSession } from "@/lib/auth/driver-session";

type DriverTopHeaderProps = {
 session: VerifiedDriverSession;
};

export async function DriverTopHeader({
 session,
}: DriverTopHeaderProps) {
 const t = await getTranslations("Shell");
 const driverName = session.driver.fullName;
 const firstName = getFirstName(driverName);

 const supabase = await createSupabaseServerClient();
 const [avatarUrl, notificationCount, oilStatus] = await Promise.all([
  createDriverAvatarUrl(session.driver.profilePhotoPath),
  loadDriverUnreadNotificationCount(supabase),
  loadDriverOilMaintenanceStatus(session),
 ]);

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
  <HeaderIconLink
   href="/requests/new/oil-change"
   label={getOilStatusLabel(t, oilStatus.oilStatus)}
   title={getOilStatusLabel(t, oilStatus.oilStatus)}
   tone={getOilStatusTone(oilStatus)}
  >
  <OilWarningIcon />
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
 title,
 tone = "neutral",
}: {
 children: ReactNode;
 count?: number;
 href: string;
 label: string;
 title?: string;
 tone?: "neutral" | "due_soon" | "due";
}) {
 const toneClassName =
  tone === "due"
   ? "bg-red-100 text-red-700 hover:bg-red-100 hover:text-red-700"
   : tone === "due_soon"
    ? "bg-amber-100 text-amber-800 hover:bg-amber-100 hover:text-amber-800"
    : "text-navy hover:bg-primary-soft hover:text-primary";
 const dotClassName =
  tone === "due"
   ? "bg-red-600 ring-red-100"
   : tone === "due_soon"
    ? "bg-amber-500 ring-amber-100"
    : null;

 return (
 <Link
 href={href}
 aria-label={label}
 title={title ?? label}
 className={`relative flex size-11 items-center justify-center rounded-lg transition touch-manipulation focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-primary ${toneClassName}`}
 >
 {children}
 {count ? (
 <span className="absolute inset-e-1.5 top-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.62rem] font-bold leading-4 text-white">
  {count}
 </span>
 ) : null}
 {dotClassName ? (
 <span
  aria-hidden="true"
  className={`absolute inset-e-1.5 top-1.5 size-2.5 rounded-full ring-2 ${dotClassName}`}
 />
 ) : null}
 </Link>
 );
}

function getFirstName(name: string) {
 return name.trim().split(/\s+/)[0] ?? name;
}

function getOilStatusTone({
 oilStatus,
}: DriverOilMaintenanceStatus): "neutral" | "due_soon" | "due" {
 if (oilStatus === "due") {
  return "due";
 }

 if (oilStatus === "due_soon") {
  return "due_soon";
 }

 return "neutral";
}

function getOilStatusLabel(
 t: Awaited<ReturnType<typeof getTranslations>>,
 status: OilMaintenanceStatus,
) {
 if (status === "due") {
  return t("oilStatus.due");
 }

 if (status === "due_soon") {
  return t("oilStatus.due_soon");
 }

 return t("oilStatus.default");
}
