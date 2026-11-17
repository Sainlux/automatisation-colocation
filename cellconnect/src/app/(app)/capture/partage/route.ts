import { NextResponse, type NextRequest } from "next/server";

/**
 * Repli du partage vers l'application lorsque le service worker n'est pas
 * encore actif : on conserve le texte partagé ; les fichiers ne peuvent pas
 * être transmis par redirection, l'utilisateur est invité à les ajouter.
 */
export async function POST(req: NextRequest) {
  const url = new URL("/capture", req.url);
  try {
    const form = await req.formData();
    const text = [form.get("title"), form.get("text"), form.get("url")].filter((v) => typeof v === "string" && v).join("\n");
    if (text) url.searchParams.set("text", text.slice(0, 5000));
    if (form.getAll("files").length) url.searchParams.set("fichiers", "1");
  } catch {
    /* formulaire illisible : simple redirection */
  }
  return NextResponse.redirect(url, 303);
}
