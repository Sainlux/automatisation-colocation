// Appel à l'API Claude, partagé par le serveur local et la fonction Netlify.
// Variables : ANTHROPIC_API_KEY (obligatoire), CLAUDE_MODEL (facultatif).
const MODEL = () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

export async function askClaude(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { status: 503, body: { error: "ANTHROPIC_API_KEY manquante" } };
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 20000)
    return { status: 400, body: { error: "prompt invalide" } };
  let r;
  try { r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL(), max_tokens: 2000, messages: [{ role: "user", content: prompt }] }),
  }); } catch (e) { return { status: 502, body: { error: "API Claude injoignable", detail: String(e).slice(0, 200) } }; }
  if (r.status === 429) return { status: 429, body: { error: "rate_limited" } };
  if (!r.ok) return { status: 502, body: { error: `API Claude : ${r.status}`, detail: (await r.text()).slice(0, 300) } };
  const j = await r.json();
  const text = (j.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  return { status: 200, body: { text } };
}
