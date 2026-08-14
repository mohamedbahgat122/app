import type { ReactNode } from "react";
import { AppError } from "@/components/app-shell/app-error";
import { DriverAppShell } from "@/components/app-shell/driver-app-shell";
import { isLocale } from "@/config/locales";
import { loadDriverSession } from "@/lib/app/driver-app-data";

type DriverLayoutProps = {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export default async function DriverLayout({
  children,
  params,
}: DriverLayoutProps) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    return null;
  }

  const app = await loadDriverSession(locale);

  if (app.status === "application_error") {
    return <AppError locale={locale} />;
  }

  return <DriverAppShell session={app.session}>{children}</DriverAppShell>;
}
