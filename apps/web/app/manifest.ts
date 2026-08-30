import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PHAROS — Payment Incident Intelligence",
    short_name: "PHAROS",
    description: "Detect the drop. Prove the cause.",
    start_url: "/",
    display: "standalone",
    background_color: "#0B0B12",
    theme_color: "#0B0B12",
    icons: [
      {
        src: "/assets/pharos-icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/assets/pharos-icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
