import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Al Faris Group | Driver App",
    short_name: "Al Faris Driver",
    description: "Al Faris Group driver application",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f8fc",
    theme_color: "#f5f8fc",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
