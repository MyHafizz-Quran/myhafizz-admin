-- Base « MyHafizz Admin » (projet Neon séparé de la base client).
-- Données propres à l'administration : comptes autorisés, journal, notes internes.

CREATE SCHEMA IF NOT EXISTS admin;

-- Qui a le droit d'entrer dans l'admin (liste blanche par email).
CREATE TABLE IF NOT EXISTS admin.admin_users (
  email       TEXT PRIMARY KEY CHECK (email = lower(email)),
  name        TEXT,
  role        TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner','admin','viewer')),
  added_by    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ
);

-- Journal de toutes les actions faites depuis l'admin.
CREATE TABLE IF NOT EXISTS admin.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_email TEXT NOT NULL,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_log_created_idx ON admin.audit_log (created_at DESC);

-- Notes internes sur un utilisateur client (jamais visibles côté app).
CREATE TABLE IF NOT EXISTS admin.user_notes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  author_email TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_notes_user_idx ON admin.user_notes (user_id, created_at DESC);

-- Premier compte propriétaire.
INSERT INTO admin.admin_users (email, name, role, added_by)
VALUES ('syllacloud@gmail.com', 'Farouck', 'owner', 'installation')
ON CONFLICT (email) DO NOTHING;
