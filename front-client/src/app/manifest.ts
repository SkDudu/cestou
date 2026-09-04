import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cestou",
    short_name: "Cestou",
    description:
      "Compare ofertas e ache o menor custo da sua lista de compras.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f7",
    theme_color: "#2f5f7a",
    orientation: "portrait-primary",
    lang: "pt-BR",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
