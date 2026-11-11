// Fonction Netlify : /api/health et /api/claude (même rôle que server.mjs en local).
// Dans Netlify : Site settings > Environment variables > ANTHROPIC_API_KEY
import { askClaude } from "../../lib/claude-core.mjs";

export default async (req) => {
  const path = new URL(req.url).pathname;
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (path.endsWith("/health")) return json(200, { ai: !!process.env.ANTHROPIC_API_KEY });
  if (path.endsWith("/claude") && req.method === "POST") {
    const { prompt } = await req.json().catch(() => ({}));
    const out = await askClaude(prompt);
    return json(out.status, out.body);
  }
  return json(404, { error: "introuvable" });
};

export const config = { path: ["/api/health", "/api/claude"] };
