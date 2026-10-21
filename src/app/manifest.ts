import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Claro",
    short_name: "Claro",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF7F3",
    theme_color: "#F54F1B",
    icons: [
      { src: "/icons/claro-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/claro-icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/claro-icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
