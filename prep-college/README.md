# Prep'Collège 2026

Plateforme de révision pour le collège (6ᵉ → 3ᵉ), conforme aux programmes 2026, pour une petite bande d'élèves.

## Démarrer

```bash
cd prep-college
npm install        # facultatif : installe seulement le SDK Claude (coach IA)
npm start          # http://localhost:3100
npm test           # tests API + validation de tous les exercices
```

Node.js ≥ 22.5 (utilise `node:sqlite` intégré, aucune autre dépendance).

| Variable | Rôle |
|---|---|
| `PORT` | Port HTTP (3100 par défaut) |
| `DATA_DIR` | Dossier de la base SQLite (`data/` par défaut) |
| `ADMIN_PIN` | Code initial de Samuel au premier lancement (sinon `0000`) |
| `ANTHROPIC_API_KEY` | Active le bilan rédigé par Claude dans « Mes progrès » (sinon analyse locale) |

## Comptes

| Classe | Élèves |
|---|---|
| 6ᵉ (Mme Martin) | Samuel (admin), Élie, Zoé, Nathan, Paul |
| 5ᵉ (M. Dubois) | Terry, Isaë |
| 4ᵉ (Mme Laurent) | Noémi |
| 3ᵉ (M. Alex) | Noha, Eliesia, Sarah |

- Connexion : on touche son prénom puis on tape son **code à 4 chiffres**. Code de départ `0000`, à changer obligatoirement à la première connexion. 5 erreurs → blocage 5 min.
- **Seul Samuel est administrateur** : il voit les résultats, l'historique et l'analyse de tout le monde ; il ajoute, modifie ou supprime des élèves, remet un code à `0000` et efface un historique.
- Un élève ne voit **que ses propres résultats**.
- Chaque élève peut **ouvrir le programme et faire les exercices de tous les niveaux** (sélecteur 6ᵉ/5ᵉ/4ᵉ/3ᵉ en haut de l'accueil).

## Fonctionnalités

- **Entraînement infini** : exercices générés (valeurs aléatoires ou banques), correction détaillée par le professeur référent. Bouton « Je suis bloqué·e » : le personnage du niveau (Plume 🦉, Globo 🐢, Pi 🤖, Flash 🦅) donne un indice sans dévoiler la réponse.
- **Sprint Chrono** : 60 s d'automatismes, record personnel, liste des erreurs.
- **Flashcards** : cartes à retourner, les cartes ratées reviennent dans le paquet.
- **Simulateur Brevet 2026** : contrôle continu 40 % (/320) + 5 épreuves finales 60 % (/480), mentions et points manquants.
- **Mes progrès** : réussite par matière, notions à retravailler et points forts, historique, conseils du coach (Claude si la clé API est définie).
- **Thème par niveau** : les couleurs du professeur référent s'appliquent au niveau consulté, sur un fond façon cahier Séyès.
- **Avatars** : chaque élève choisit son personnage dans son profil.

## Organisation du code

```
server.js                    démarrage
src/app.js                   serveur HTTP, routes API, fichiers statiques
src/db.js                    schéma SQLite, élèves de départ, requêtes
src/auth.js                  codes (scrypt), sessions, anti-devinette
src/analysis.js              analyse des résultats + coach IA optionnel
public/js/curriculum.js      niveaux, professeurs, matières, règles DNB (partagé client/serveur)
public/js/content/           générateurs d'exercices et flashcards par niveau et matière
public/js/app.js             application monopage (connexion, accueil, progrès, profil, admin)
public/js/activities.js      entraînement, sprint, flashcards, simulateur DNB
```

Pour ajouter des exercices : ajouter une fonction dans `generators` de la matière voulue (contrat décrit en tête de `public/js/content/util.js`), puis lancer `npm test`.
