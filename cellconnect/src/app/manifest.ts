import type { MetadataRoute } from "next";

/** Manifeste PWA : installation sur l'écran d'accueil + partage de texte vers l'app (Web Share Target). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CellConnect AI",
    short_name: "CellConnect",
    description: "Transformez une capture en événements organisés.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#1d3a8a",
    lang: "fr",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
    // Partage depuis une autre application (images, PDF, texte) — traité par le service worker (public/sw.js).
    share_target: {
      action: "/capture/partage",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "files", accept: ["image/*", "application/pdf"] }] },
    },
  };
}
