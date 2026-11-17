import type { MetadataRoute } from "next";

/** Manifeste PWA : installation sur l'écran d'accueil + partage de texte vers l'app (Web Share Target). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CellConnect AI",
    short_name: "CellConnect",
    description: "Vos messages deviennent des dates dans votre agenda.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#f6f4ef",
    lang: "fr",
    // PNG pour Android et l'installation ; l'icône 512 a une marge suffisante pour le recadrage « maskable ».
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    // Partage depuis une autre application (images, PDF, texte) — traité par le service worker (public/sw.js).
    share_target: {
      action: "/capture/partage",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "files", accept: ["image/*", "application/pdf"] }] },
    },
  };
}
