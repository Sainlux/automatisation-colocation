// Serveur local du Studio Reels (Node 18+, aucune dépendance).
// - sert public/index.html
// - /api/health : dit si l'IA est disponible (clé présente)
// - /api/claude : envoie un prompt à Claude avec ta clé API (la clé reste sur ton ordinateur)
// Lancer : node server.mjs   puis ouvrir http://localhost:8787
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { askClaude } from "./lib/claude-core.mjs";

// lit .env s'il existe (format CLE=valeur)
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const PORT = process.env.PORT || 8787;
const ROOT = join(process.cwd(), "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ai: !!process.env.ANTHROPIC_API_KEY }));
    }
    if (req.url === "/api/claude" && req.method === "POST") {
      let body = ""; for await (const c of req) body += c;
      const { prompt } = JSON.parse(body || "{}");
      const out = await askClaude(prompt);
      res.writeHead(out.status, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(out.body));
    }
    const path = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
    const file = join(ROOT, path === "/" ? "index.html" : path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    res.writeHead(e.code === "ENOENT" ? 404 : 500); res.end(e.code === "ENOENT" ? "Introuvable" : "Erreur");
  }
});
server.listen(PORT, () => console.log(`Studio Reels : http://localhost:${PORT}  (IA ${process.env.ANTHROPIC_API_KEY ? "activée" : "désactivée : ajoute ANTHROPIC_API_KEY dans .env"})`));
