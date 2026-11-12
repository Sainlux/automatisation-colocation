// Construit public/ à partir de src/app.html + src/imgs.json (images d'exemple de l'aperçu)
// et copie projets/ (chansons créées par Claude) dans public/projets.
// Lancer : node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, cpSync } from "node:fs";
const app = readFileSync("src/app.html", "utf8");
const imgs = readFileSync("src/imgs.json", "utf8");
mkdirSync("public", { recursive: true });
writeFileSync("public/index.html", app.replace("__IMGS__", imgs));
rmSync("public/projets", { recursive: true, force: true });
if (existsSync("projets")) cpSync("projets", "public/projets", { recursive: true });
console.log("public/index.html prêt" + (existsSync("projets") ? " (+ projets/)" : ""));
