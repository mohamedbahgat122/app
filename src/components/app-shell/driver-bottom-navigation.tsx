"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { CarIcon, GaugeIcon, ListIcon, MoneyIcon, ShiftIcon, HomeIcon } from "@/components/app-shell/icons";
import { NavigationItem } from "@/components/app-shell/navigation-item";
import { usePathname } from "@/i18n/navigation";

export function DriverBottomNavigation() {
 const t = useTranslations("Shell.nav");
 const pathname = usePathname();
 const [pendingHref, setPendingHref] = useState<string | null>(null);
 const visiblePendingHref =
 pendingHref && pathname !== pendingHref ? pendingHref : null;
 const items = useMemo(
 () => [
  { href: "/home", icon: <HomeIcon />, label: t("home") },
  { href: "/odometer", icon: <GaugeIcon />, label: t("odometer") },
  { href: "/requests", icon: <ListIcon />, label: t("requests") },
  { href: "/shifts", icon: <ShiftIcon />, label: t("shifts") },
  { href: "/vehicle", icon: <CarIcon />, label: t("vehicle") },
  { href: "/salary", icon: <MoneyIcon />, label: t("salary") },
 ],
 [t],
 );

 return (
 <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-10px_28px_rgba(16,35,63,0.08)] backdrop-blur md:left-1/2 md:w-107.5 md:-translate-x-1/2">
  <div className="mx-auto flex w-full max-w-107.5 items-center justify-between gap-1">
  {items.map((item) => (
   <NavigationItem
   key={item.href}
   href={item.href}
   icon={item.icon}
   label={item.label}
   isPending={visiblePendingHref === item.href}
   optimisticActive={visiblePendingHref === item.href}
   onNavigate={() => {
    if (pathname !== item.href) {
    setPendingHref(item.href);
    }
   }}
   />
  ))}
  </div>
 </nav>
 );
}
