import { getTranslations, setRequestLocale } from "next-intl/server";
import { EmptyState } from "@/components/app-shell/page-card";
import { isLocale } from "@/config/locales";

type RouteProps = { params: Promise<{ locale: string }> };

export default async function SalaryPage({ params }: RouteProps) {
  const { locale } = await params;
  if (!isLocale(locale)) return null;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Salary" });

  return <EmptyState title={t("title")} description={t("empty")} />;
}
