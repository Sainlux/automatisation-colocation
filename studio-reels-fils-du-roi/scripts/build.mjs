// Construit public/index.html à partir de src/app.html + src/imgs.json (images d'exemple de l'aperçu).
// Lancer : node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const app = readFileSync("src/app.html", "utf8");
const imgs = readFileSync("src/imgs.json", "utf8");
mkdirSync("public", { recursive: true });
writeFileSync("public/index.html", app.replace("__IMGS__", imgs));
console.log("public/index.html prêt");
