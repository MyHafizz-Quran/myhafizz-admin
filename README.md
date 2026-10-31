# MyHafizz Admin

Administration de MyHafizz, déployée **à part** du client sur son propre projet Vercel.

## Structure
```
myhafizz-admin/
├── src/            → le site admin (React + Vite + Tailwind, design Lagon)
│   ├── main.jsx    → barre latérale, routes, contrôle de connexion
│   ├── pages/      → Tableau de bord, Utilisateurs, Groupes, Défis, Rappels, Équipe, Journal, Système, Connexion
│   ├── ui.jsx      → composants communs
│   └── lib.js      → Neon Auth (projet admin), appels /api, formats
├── api/index.js    → fonction Vercel : reçoit toutes les routes /api/*
├── server/app.js   → l'API (Hono) : contrôle d'accès + requêtes sur les deux bases
├── server/dev.js   → API en local
├── db/001_admin.sql→ schéma de la base admin
└── vercel.json
```

## Vercel (projet séparé)
- Root Directory : `myhafizz-admin`
- Framework : Vite (build `npm run build`, sortie `dist`)
- Variables : voir `.env.example` (`VITE_ADMIN_AUTH_URL`, `ADMIN_DATABASE_URL`, `CLIENT_DATABASE_URL`, `NEON_AUTH_JWKS_URL`)
- Ajouter l'adresse Vercel dans les domaines autorisés du Neon Auth admin : `neon neon-auth domain add https://...`

## Accès
Liste blanche `admin.admin_users`. Rôles : propriétaire (tout), admin (tout sauf l'équipe), lecture seule. Email confirmé par code obligatoire.

## En local
```bash
cp .env.example .env.local   # remplir les valeurs
npm install && npm run dev
```
