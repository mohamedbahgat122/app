import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/config/locales";
import { routing } from "@/i18n/routing";
import { refreshSupabaseSession } from "@/lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);
const protectedSegments = new Set([
  "account",
  "change-password",
  "home",
  "notifications",
  "requests",
  "salary",
  "shifts",
  "tasks",
  "vehicle",
]);

export default async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = handleI18nRouting(request);
  const { response: refreshedResponse, user } = await refreshSupabaseSession(
    request,
    response,
  );
  const [, locale, segment] = pathname.split("/");

  if (isLocale(locale) && protectedSegments.has(segment) && !user) {
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  return refreshedResponse;
}

export const config = {
  matcher: [
    "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
  ],
};
