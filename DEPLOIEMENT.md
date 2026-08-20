# Mise en ligne — Fly.io

L'application est prête à être déployée sur **Fly.io** (région Paris CDG, gratuit).

## Étape 1 — Installer flyctl (une seule fois)

Ouvrir PowerShell et exécuter :

```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

Redémarrer PowerShell, puis vérifier :

```powershell
flyctl version
```

## Étape 2 — Créer le compte Fly.io (une seule fois)

```powershell
flyctl auth signup
```

Une carte bancaire est demandée pour vérifier l'identité, mais le tier gratuit (3 VMs partagées + 3 Go de volume) suffit largement pour cette app.

## Étape 3 — Lancer l'application

Depuis `C:\Users\ghmer\Automatisation colocation` :

```powershell
# 3.1 — Créer l'app sur Fly (uniquement la première fois)
flyctl launch --no-deploy --copy-config --region cdg

# Si "gestion-locative-annemasse" est déjà pris, flyctl proposera un autre nom.

# 3.2 — Créer le volume persistant 1 Go (uniquement la première fois)
flyctl volumes create data --region cdg --size 1

# 3.3 — Définir les secrets (mot de passe d'accès + SMTP)
flyctl secrets set AUTH_USER=merhawi AUTH_PASS="UN_MOT_DE_PASSE_FORT_ICI"
flyctl secrets set SMTP_HOST=smtp.gmail.com SMTP_PORT=587 SMTP_SECURE=false
flyctl secrets set SMTP_USER=ghmerhawi@hotmail.com SMTP_PASS="MOT_DE_PASSE_APP_SMTP"
flyctl secrets set SMTP_FROM="Merhawi Ghebre Negus <ghmerhawi@hotmail.com>"

# 3.4 — Déployer
flyctl deploy
```

L'URL publique sera : `https://gestion-locative-annemasse.fly.dev` (ou le nom choisi).

Au premier accès, le navigateur demandera le couple `AUTH_USER / AUTH_PASS`.

## Étape 4 — Mises à jour ultérieures

Toute modification de code :

```powershell
flyctl deploy
```

## Commandes utiles

```powershell
flyctl status              # État de l'app
flyctl logs                # Logs en temps réel
flyctl ssh console         # Shell distant
flyctl secrets list        # Lister les secrets (valeurs masquées)
flyctl volumes list        # Lister les volumes
```

## Restauration de la base SQLite locale vers Fly

Si tu veux migrer ta DB locale (`data/app.db`) vers Fly :

```powershell
flyctl ssh sftp shell
# Dans le shell SFTP :
put data/app.db /data/app.db
quit
flyctl machine restart
```

## Coût attendu

- Tier gratuit Fly.io : 3 VMs `shared-cpu-1x` + 3 Go de volume → **0 €/mois**
- L'app s'éteint automatiquement après inactivité (`auto_stop_machines`) et redémarre à la première requête.

## Sécurité

- ✅ HTTPS automatique (force_https)
- ✅ Authentification HTTP Basic obligatoire en prod
- ✅ Données stockées sur volume persistant chiffré chez Fly.io (Paris)
- ⚠️ Le mot de passe `AUTH_PASS` doit être robuste (16+ caractères, généré aléatoirement)
- ⚠️ Ne jamais commiter `.env` dans git
