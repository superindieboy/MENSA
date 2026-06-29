# MENSA — Déploiement avec données partagées (Supabase)

Trois étapes : créer le backend, configurer l'app, héberger.

## 1. Backend Supabase (5 min)

1. Crée un compte et un projet sur **supabase.com**.
2. Ouvre **SQL Editor → New query**, colle tout le contenu de `mensa-schema.sql`, puis **Run**.
   → Cela crée les tables (profils, dégustations, cave, likes), la sécurité (RLS) et la création automatique du profil à l'inscription.
3. Va dans **Authentication → Providers → Email** et **désactive « Confirm email »**.
   → Sans ça, chaque inscription oblige à cliquer un lien reçu par mail avant de pouvoir se connecter. Pour un bêta, on désactive.
4. Récupère tes identifiants dans **Project Settings → API** :
   - **Project URL** (ex. `https://abcd1234.supabase.co`)
   - **anon public** key (longue chaîne)

## 2. Configurer l'app

Ouvre `MENSA.html` dans un éditeur de texte. Tout en haut du script, remplace :

```js
const SUPABASE_URL = 'https://VOTRE-PROJET.supabase.co';
const SUPABASE_ANON_KEY = 'VOTRE_CLE_ANON_PUBLIQUE';
```

par tes deux valeurs de l'étape 1.4. Enregistre.

> La clé « anon public » est faite pour être dans le navigateur : ce sont les règles RLS du schéma qui protègent les données, pas le secret de la clé.

## 3. Héberger (au choix)

**Netlify Drop (le plus simple)** : renomme `MENSA.html` en `index.html`, va sur **app.netlify.com/drop**, glisse-dépose le fichier. Tu obtiens une URL publique à partager.

**GitHub Pages** : pousse `index.html` dans un dépôt, puis **Settings → Pages → branche `main`**. URL : `https://tonpseudo.github.io/nom-du-repo/`.

Partage l'URL à tes ~10 membres. Ils créent leur compte (email + mot de passe), et **tout le monde voit les mêmes données** : fil, cave commune, membres, notes.

## Ce qui fonctionne
- Inscription / connexion (sécurisées, côté serveur)
- Fil de dégustations partagé + « j'aime »
- Cave commune du club
- Liste des membres (alimentée par les inscriptions)
- Profil + bio (persistés)
- Recherche dans le catalogue de 615 cigares

## Évolutions possibles ensuite
- Commentaires sur les dégustations
- Rôles (admin / membre), cooptation par invitation
- Photos de bagues, notation moyenne par cigare à l'échelle du club
