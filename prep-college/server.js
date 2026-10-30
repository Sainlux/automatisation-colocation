import { openDb } from './src/db.js';
import { createApp } from './src/app.js';

const PORT = Number(process.env.PORT) || 3100;
const db = openDb();

createApp(db).listen(PORT, () => {
  console.log(`Prep'Collège 2026 → http://localhost:${PORT}`);
  console.log(process.env.ANTHROPIC_API_KEY ? 'Coach IA : Claude activé' : 'Coach IA : analyse locale (définir ANTHROPIC_API_KEY pour activer Claude)');
});
