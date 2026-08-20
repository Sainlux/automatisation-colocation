# Gestion locative — Annemasse

Application locale pour générer **attestations de domiciliation**, **quittances de loyer** et **factures** pour les colocataires du 5, rue René Blanc à Annemasse.

## Démarrage

```powershell
# 1) Installer les dépendances (une seule fois)
npm install

# 2) Configurer l'email (optionnel — pour l'envoi)
copy .env.example .env
notepad .env

# 3) Extraire votre signature depuis une image (capture/scan/photo)
#    Le script détecte automatiquement la zone d'encre et rend le fond transparent.
npm run signature -- "C:\chemin\vers\votre-image.png"
# Pour cibler manuellement une zone : --bbox=x,y,largeur,hauteur
# npm run signature -- image.png --bbox=420,950,560,180
# Le PNG final atterrit dans public\signature.png

# 4) Lancer
npm start
```

Ouvrir ensuite [http://localhost:3000](http://localhost:3000).

## Parcours

```
Demande en langage naturel → Identification du document
→ Recherche du colocataire → Pré-remplissage automatique
→ Aperçu modifiable (PDF temps réel) → Validation
→ Génération PDF avec signature → Téléchargement ou envoi email
→ Archivage automatique dans l'historique
```

## Fonctionnalités

- **Langage naturel** : « quittance de loyer Nicolas pour octobre 2025 » crée le brouillon directement.
- **Éditeur** : modification de tous les champs (nom, période, montants, texte, mention légale, signature).
- **Aperçu PDF temps réel** dans l'éditeur.
- **Quatre boutons** : Modifier · Enregistrer comme brouillon · Valider et générer PDF · Annuler les modifications.
- **Recherche globale** instantanée avec filtres : Tous · Colocataires · Documents · Brouillons · Envoyés · Anciens colocataires.
- **Historique** : voir, télécharger, dupliquer (modifier une copie), renvoyer par email, supprimer.
- **Signature** : image PNG positionnable (X/Y) sur la page.
- **Envoi email** via SMTP (nodemailer).

## Stockage

- Base SQLite locale : `data/app.db`
- PDF générés : `data/pdfs/`
- Aucune donnée n'est envoyée à l'extérieur (sauf email SMTP si configuré).

## Format des noms de fichier

- `attestation_domiciliation_[nom]_[date].pdf`
- `quittance_loyer_[nom]_[mois]_[annee].pdf`
- `facture_[nom]_[date].pdf`
