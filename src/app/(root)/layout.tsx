import type { Metadata, Viewport } from "next";
import { localFontVariables } from "@/lib/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: "Al Faris Group | Driver App",
  description: "Al Faris Group driver application",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#10233f",
};

export default function RootRedirectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${localFontVariables} h-full antialiased`}
      style={{
        "--font-app": "var(--font-cairo), var(--font-cairo-latin)",
      } as React.CSSProperties}
    >
      <body className="min-h-full bg-navy">{children}</body>
    </html>
  );
}
