# Configuration OpenAI (analyse des captures)

1. Créez une clé sur platform.openai.com (projet dédié recommandé, avec limite de dépenses).
2. Définissez `OPENAI_API_KEY` et, si besoin, `OPENAI_MODEL` (par défaut `gpt-4o` ; tout modèle compatible vision + `response_format: json_schema` convient).
3. Redémarrez : la page Paramètres → « État des services » affiche le modèle.

Fonctionnement : une requête par analyse (jusqu'à 5 images/PDF), température 0, sortie contrainte par le schéma `src/lib/schemas/extraction.ts`, revalidée par Zod. Les textes collés sont d'abord analysés localement et ne sont envoyés à OpenAI que si l'analyse locale ne trouve rien d'exploitable.

Confidentialité : informez vos utilisateurs que les images sont transmises à OpenAI ; consultez les réglages de rétention de votre organisation OpenAI. L'activation de la suppression des captures après analyse est conseillée (paramètre par défaut).

Coût indicatif : quelques centimes par capture (images en `detail: high`, redimensionnées à 2048 px côté navigateur).
