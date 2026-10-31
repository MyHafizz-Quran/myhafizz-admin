# Sécurité · MyHafizz Admin

Dépôt privé du back-office. Faille ou fuite : **security@myhafizz.com** (pas d'issue publique).

- Accès réservé à la liste `admin.admin_users` (rôles viewer, admin, owner), e-mail confirmé obligatoire.
- Jetons Neon Auth vérifiés côté serveur (JWKS), requêtes SQL paramétrées, journal des actions.
- Aucun secret dans le code : `ADMIN_DATABASE_URL`, `CLIENT_DATABASE_URL`, `NEON_AUTH_JWKS_URL` vivent dans les variables d'environnement de l'hébergeur.
- Scans automatiques : gitleaks, `npm audit`, Dependabot.
