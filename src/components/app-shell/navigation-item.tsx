"use client";

import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

type NavigationItemProps = {
  href: string;
  icon: ReactNode;
  label: string;
};

export function NavigationItem({ href, icon, label }: NavigationItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 text-[0.68rem] font-semibold transition [touch-action:manipulation] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        isActive
          ? "text-primary"
          : "text-muted hover:bg-primary-soft/70 hover:text-navy active:text-primary"
      }`}
    >
      {icon}
      <span className="max-w-full truncate">{label}</span>
    </Link>
  );
}
