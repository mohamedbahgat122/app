import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

function getSupabaseStorageHostname() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    return null;
  }

  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const supabaseStorageHostname = getSupabaseStorageHostname();

const nextConfig: NextConfig = {
  images: supabaseStorageHostname
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: supabaseStorageHostname,
            pathname: "/storage/v1/object/**",
          },
        ],
      }
    : undefined,
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
