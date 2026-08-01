import { useTranslations } from "next-intl";
import { CarIcon, GaugeIcon, ListIcon, MoneyIcon, ShiftIcon } from "@/components/app-shell/icons";
import { NavigationItem } from "@/components/app-shell/navigation-item";
export function DriverBottomNavigation() {
  const t = useTranslations("Shell.nav");

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-10px_28px_rgba(16,35,63,0.08)] backdrop-blur md:left-1/2 md:w-[430px] md:-translate-x-1/2">
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-between gap-1">
        <NavigationItem href="/home" icon={<GaugeIcon />} label={t("odometer")} />
        <NavigationItem href="/requests" icon={<ListIcon />} label={t("requests")} />
        <NavigationItem href="/shifts" icon={<ShiftIcon />} label={t("shifts")} />
        <NavigationItem href="/vehicle" icon={<CarIcon />} label={t("vehicle")} />
        <NavigationItem href="/salary" icon={<MoneyIcon />} label={t("salary")} />
      </div>
    </nav>
  );
}
