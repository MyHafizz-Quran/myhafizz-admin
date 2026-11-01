// MyHafizz Admin : API (/api/*), exécutée en fonction Vercel (api/index.js).
// Variables d'environnement (Vercel > Settings > Environment Variables) :
// - ADMIN_DATABASE_URL   -> base Neon « MyHafizz Admin » (équipe admin, journal, notes)
// - CLIENT_DATABASE_URL  -> base Neon « MyHafizz Client » (lecture + modération)
// - NEON_AUTH_JWKS_URL   -> clés publiques du Neon Auth du projet admin
import { Hono } from 'hono';
import pg from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const adminDb = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000 });
const clientDb = new pg.Pool({ connectionString: process.env.CLIENT_DATABASE_URL, max: 3, idleTimeoutMillis: 10_000 });
// Une connexion inactive coupée par Neon ne doit pas faire tomber la fonction.
adminDb.on('error', (e) => console.warn('admin db', e.message));
clientDb.on('error', (e) => console.warn('client db', e.message));

const JWKS = createRemoteJWKSet(new URL(process.env.NEON_AUTH_JWKS_URL));
const ROLE_RANK = { viewer: 1, admin: 2, owner: 3 };

const app = new Hono();

// ---------- outils ----------
const q = (db, text, params = []) => db.query(text, params).then((r) => r.rows);
const one = async (db, text, params) => (await q(db, text, params))[0] || null;
const int = (v, d, max = 1e9) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, max) : d; };
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || '');

async function audit(c, action, targetType, targetId, details = {}) {
  const me = c.get('admin');
  await adminDb.query(
    'INSERT INTO admin.audit_log(actor_email, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5)',
    [me.email, action, targetType, targetId ? String(targetId) : null, details]
  );
}

app.onError((err, c) => {
  if (!err.status || err.status >= 500) console.error(err);
  return c.json({ error: err.expose ? err.message : 'Erreur serveur. Réessaie dans un instant.' }, err.status || 500);
});
const fail = (status, message) => Object.assign(new Error(message), { status, expose: true });

app.use('/api/*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  await next();
});

// ---------- authentification ----------
app.use('/api/*', async (c, next) => {
  const h = c.req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw fail(401, 'Connexion requise.');
  let payload;
  try {
    ({ payload } = await jwtVerify(token, JWKS));
  } catch {
    throw fail(401, 'Session expirée. Reconnecte-toi.');
  }
  const u = await one(adminDb, 'SELECT id, email, name, "emailVerified" FROM neon_auth."user" WHERE id = $1', [payload.sub]);
  if (!u) throw fail(401, 'Compte introuvable.');
  if (!u.emailVerified) throw fail(403, "Confirme d'abord ton adresse email.");
  // Seule la connexion Google est acceptée.
  const g = await one(adminDb, 'SELECT 1 FROM neon_auth.account WHERE "userId" = $1 AND "providerId" = $2', [u.id, 'google']);
  if (!g) throw fail(403, 'Connecte-toi avec Google.');
  const a = await one(adminDb, 'SELECT email, name, role FROM admin.admin_users WHERE email = lower($1)', [u.email]);
  if (!a) throw fail(403, "Ce compte n'a pas accès à l'administration.");
  adminDb.query('UPDATE admin.admin_users SET last_seen_at = now(), name = COALESCE(name, $2) WHERE email = $1', [a.email, u.name]).catch(() => {});
  c.set('admin', { ...a, name: a.name || u.name, authId: u.id });
  await next();
});

const need = (role) => async (c, next) => {
  if (ROLE_RANK[c.get('admin').role] < ROLE_RANK[role]) throw fail(403, "Ton rôle ne permet pas cette action.");
  await next();
};
// Toute écriture demande au moins le rôle admin.
app.use('/api/*', async (c, next) => {
  if (c.req.method !== 'GET' && ROLE_RANK[c.get('admin').role] < ROLE_RANK.admin) throw fail(403, 'Accès en lecture seule.');
  await next();
});

app.get('/api/me', (c) => c.json(c.get('admin')));

// ---------- tableau de bord ----------
app.get('/api/stats/overview', async (c) => {
  const s = await one(clientDb, `
    SELECT
      (SELECT count(*) FROM neon_auth."user")::int AS users,
      (SELECT count(*) FROM neon_auth."user" WHERE "createdAt" > now() - interval '7 days')::int AS users_new_7d,
      (SELECT count(*) FROM neon_auth."user" WHERE "createdAt" > now() - interval '30 days')::int AS users_new_30d,
      (SELECT count(*) FROM neon_auth."user" WHERE banned)::int AS users_banned,
      (SELECT count(DISTINCT user_id) FROM activity_days WHERE day = current_date)::int AS active_today,
      (SELECT count(DISTINCT user_id) FROM activity_days WHERE day > current_date - 7)::int AS active_7d,
      (SELECT count(DISTINCT user_id) FROM activity_days WHERE day > current_date - 30)::int AS active_30d,
      (SELECT COALESCE(sum(cardinality(memorized_verses)),0) FROM memorization_progress)::int AS verses_memorized,
      (SELECT count(*) FROM memorization_progress WHERE total_verses > 0 AND cardinality(memorized_verses) >= total_verses)::int AS surahs_completed,
      (SELECT count(*) FROM verse_reviews)::int AS reviews_cards,
      (SELECT count(*) FROM verse_reviews WHERE due_date <= current_date)::int AS reviews_due,
      (SELECT count(*) FROM verse_reviews WHERE last_reviewed > now() - interval '7 days')::int AS reviews_7d,
      (SELECT count(*) FROM hifz_plans)::int AS plans,
      (SELECT count(*) FROM study_groups)::int AS groups,
      (SELECT count(*) FROM study_groups WHERE kind='class')::int AS groups_class,
      (SELECT count(*) FROM study_groups WHERE kind='family')::int AS groups_family,
      (SELECT count(*) FROM study_groups WHERE kind='circle')::int AS groups_circle,
      (SELECT count(*) FROM khatmas)::int AS khatmas,
      (SELECT count(*) FROM challenges WHERE is_active)::int AS challenges_active,
      (SELECT count(*) FROM reading_lessons WHERE completed_at IS NOT NULL)::int AS reading_lessons_done,
      (SELECT count(*) FROM reading_sessions WHERE created_at > now() - interval '7 days')::int AS reading_sessions_7d,
      (SELECT count(*) FROM prayer_reminders)::int AS prayer_reminders
  `);
  return c.json(s);
});

app.get('/api/stats/timeseries', async (c) => {
  const days = int(c.req.query('days'), 30, 180);
  const rows = await q(clientDb, `
    WITH d AS (SELECT generate_series(current_date - ($1::int - 1), current_date, interval '1 day')::date AS day)
    SELECT to_char(d.day,'YYYY-MM-DD') AS day,
      (SELECT count(*) FROM neon_auth."user" u WHERE u."createdAt"::date = d.day)::int AS signups,
      (SELECT count(DISTINCT user_id) FROM activity_days a WHERE a.day = d.day)::int AS active,
      (SELECT count(*) FROM verse_reviews v WHERE v.last_reviewed::date = d.day)::int AS reviews
    FROM d ORDER BY d.day`, [days]);
  return c.json(rows);
});

app.get('/api/stats/surahs', async (c) => {
  const rows = await q(clientDb, `
    SELECT surah_number, count(DISTINCT user_id)::int AS learners,
      sum(cardinality(memorized_verses))::int AS verses,
      count(*) FILTER (WHERE total_verses > 0 AND cardinality(memorized_verses) >= total_verses)::int AS completed
    FROM memorization_progress GROUP BY surah_number ORDER BY learners DESC, verses DESC LIMIT 15`);
  return c.json(rows);
});

// ---------- utilisateurs ----------
const USER_SORTS = {
  recent: 'u."createdAt" DESC',
  active: 'last_active DESC NULLS LAST',
  verses: 'verses DESC',
  name: 'lower(COALESCE(u.name, u.email)) ASC',
};

app.get('/api/users', async (c) => {
  const search = (c.req.query('q') || '').trim();
  const filter = c.req.query('filter') || 'all';
  const sort = USER_SORTS[c.req.query('sort')] || USER_SORTS.recent;
  const limit = int(c.req.query('limit'), 25, 100);
  const page = int(c.req.query('page'), 1, 100000) || 1;
  const where = [];
  const params = [];
  if (search) { params.push(`%${search}%`); where.push(`(u.email ILIKE $${params.length} OR u.name ILIKE $${params.length} OR p.full_name ILIKE $${params.length})`); }
  if (filter === 'banned') where.push('u.banned');
  if (filter === 'new') where.push(`u."createdAt" > now() - interval '7 days'`);
  if (filter === 'active') where.push(`EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = u.id AND a.day > current_date - 7)`);
  if (filter === 'inactive') where.push(`NOT EXISTS (SELECT 1 FROM activity_days a WHERE a.user_id = u.id AND a.day > current_date - 30)`);
  if (filter === 'unverified') where.push(`NOT u."emailVerified"`);
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const base = `FROM neon_auth."user" u LEFT JOIN profiles p ON p.id = u.id ${w}`;
  const total = (await one(clientDb, `SELECT count(*)::int AS n ${base}`, params)).n;
  params.push(limit, (page - 1) * limit);
  const rows = await q(clientDb, `
    SELECT u.id, u.email, COALESCE(p.full_name, u.name) AS name, u.image, p.avatar_url, u."createdAt" AS created_at,
      u."emailVerified" AS email_verified, u.banned, u."banReason" AS ban_reason,
      (SELECT max(day) FROM activity_days a WHERE a.user_id = u.id) AS last_active,
      (SELECT COALESCE(sum(cardinality(memorized_verses)),0) FROM memorization_progress m WHERE m.user_id = u.id)::int AS verses,
      (SELECT count(*) FROM group_members g WHERE g.user_id = u.id)::int AS groups,
      (SELECT string_agg(DISTINCT "providerId", ',') FROM neon_auth.account ac WHERE ac."userId" = u.id) AS providers
    ${base} ORDER BY ${sort} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return c.json({ total, page, limit, rows });
});

app.get('/api/users/export.csv', async (c) => {
  const rows = await q(clientDb, `
    SELECT u.id, u.email, COALESCE(p.full_name, u.name) AS name, u."createdAt" AS created_at, u."emailVerified" AS email_verified, u.banned,
      (SELECT max(day) FROM activity_days a WHERE a.user_id = u.id) AS last_active,
      (SELECT COALESCE(sum(cardinality(memorized_verses)),0) FROM memorization_progress m WHERE m.user_id = u.id)::int AS verses
    FROM neon_auth."user" u LEFT JOIN profiles p ON p.id = u.id ORDER BY u."createdAt" DESC`);
  const cols = ['id', 'email', 'name', 'created_at', 'email_verified', 'banned', 'last_active', 'verses'];
  const esc = (v) => { if (v == null) return ''; const s = v instanceof Date ? v.toISOString() : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((k) => esc(r[k])).join(','))].join('\n');
  await audit(c, 'users.export', 'user', null, { count: rows.length });
  return new Response('\ufeff' + csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="myhafizz-utilisateurs.csv"', 'cache-control': 'no-store' } });
});

async function loadUser(id) {
  if (!isUuid(id)) throw fail(404, 'Utilisateur introuvable.');
  const u = await one(clientDb, `SELECT u.*, p.full_name, p.avatar_url FROM neon_auth."user" u LEFT JOIN profiles p ON p.id = u.id WHERE u.id = $1`, [id]);
  if (!u) throw fail(404, 'Utilisateur introuvable.');
  return u;
}

app.get('/api/users/:id', async (c) => {
  const id = c.req.param('id');
  const u = await loadUser(id);
  const [plan, progress, reviews, activity, groups, reading, sessions, accounts, reminders, notes] = await Promise.all([
    one(clientDb, 'SELECT * FROM hifz_plans WHERE user_id = $1', [id]),
    q(clientDb, `SELECT surah_number, total_verses, cardinality(memorized_verses)::int AS memorized, status, last_reviewed, updated_at FROM memorization_progress WHERE user_id = $1 ORDER BY surah_number`, [id]),
    one(clientDb, `SELECT count(*)::int AS cards, count(*) FILTER (WHERE due_date <= current_date)::int AS due, COALESCE(sum(lapses),0)::int AS lapses, COALESCE(sum(reps),0)::int AS reps, count(*) FILTER (WHERE ease < 2.0)::int AS fragile, max(last_reviewed) AS last FROM verse_reviews WHERE user_id = $1`, [id]),
    q(clientDb, `SELECT to_char(day,'YYYY-MM-DD') AS day, actions FROM activity_days WHERE user_id = $1 AND day > current_date - 91 ORDER BY day`, [id]),
    q(clientDb, `SELECT g.id, g.name, g.kind, m.role, m.joined_at, (g.owner_id = $1) AS is_owner FROM group_members m JOIN study_groups g ON g.id = m.group_id WHERE m.user_id = $1 ORDER BY m.joined_at DESC`, [id]),
    one(clientDb, `SELECT count(*) FILTER (WHERE completed_at IS NOT NULL)::int AS lessons_done, COALESCE(sum(xp),0)::int AS xp FROM reading_lessons WHERE user_id = $1`, [id]),
    q(clientDb, `SELECT id, "createdAt" AS created_at, "expiresAt" AS expires_at, "userAgent" AS user_agent, "ipAddress" AS ip FROM neon_auth.session WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 10`, [id]),
    q(clientDb, `SELECT "providerId" AS provider, "createdAt" AS created_at FROM neon_auth.account WHERE "userId" = $1`, [id]),
    q(clientDb, `SELECT tz, prayers, offset_min, created_at FROM prayer_reminders WHERE user_id = $1`, [id]),
    q(adminDb, `SELECT id, author_email, body, created_at FROM admin.user_notes WHERE user_id = $1 ORDER BY created_at DESC`, [id]),
  ]);
  return c.json({
    user: {
      id: u.id, email: u.email, name: u.full_name || u.name, auth_name: u.name, avatar: u.avatar_url || u.image,
      created_at: u.createdAt, updated_at: u.updatedAt, email_verified: u.emailVerified, role: u.role,
      banned: u.banned, ban_reason: u.banReason, ban_expires: u.banExpires,
    },
    plan, progress, reviews, activity, groups, reading, sessions, accounts, reminders, notes,
  });
});

app.patch('/api/users/:id', async (c) => {
  const id = c.req.param('id');
  await loadUser(id);
  const { name } = await c.req.json();
  const clean = String(name || '').trim().slice(0, 80);
  if (!clean) throw fail(400, 'Le nom ne peut pas être vide.');
  await clientDb.query('UPDATE neon_auth."user" SET name = $2, "updatedAt" = now() WHERE id = $1', [id, clean]);
  await clientDb.query('INSERT INTO profiles(id, full_name, updated_at) VALUES ($1,$2,now()) ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()', [id, clean]);
  await audit(c, 'user.rename', 'user', id, { name: clean });
  return c.json({ ok: true });
});

app.post('/api/users/:id/ban', async (c) => {
  const id = c.req.param('id');
  const u = await loadUser(id);
  const { reason, days } = await c.req.json().catch(() => ({}));
  const d = int(days, 0, 3650);
  await clientDb.query(`UPDATE neon_auth."user" SET banned = true, "banReason" = $2, "banExpires" = CASE WHEN $3::int > 0 THEN now() + make_interval(days => $3::int) END, "updatedAt" = now() WHERE id = $1`, [id, reason || null, d]);
  await clientDb.query('DELETE FROM neon_auth.session WHERE "userId" = $1', [id]);
  await audit(c, 'user.ban', 'user', id, { email: u.email, reason: reason || null, days: d || null });
  return c.json({ ok: true });
});

app.post('/api/users/:id/unban', async (c) => {
  const id = c.req.param('id');
  const u = await loadUser(id);
  await clientDb.query('UPDATE neon_auth."user" SET banned = false, "banReason" = NULL, "banExpires" = NULL, "updatedAt" = now() WHERE id = $1', [id]);
  await audit(c, 'user.unban', 'user', id, { email: u.email });
  return c.json({ ok: true });
});

app.post('/api/users/:id/verify-email', async (c) => {
  const id = c.req.param('id');
  const u = await loadUser(id);
  await clientDb.query('UPDATE neon_auth."user" SET "emailVerified" = true, "updatedAt" = now() WHERE id = $1', [id]);
  await audit(c, 'user.verify_email', 'user', id, { email: u.email });
  return c.json({ ok: true });
});

app.post('/api/users/:id/logout', async (c) => {
  const id = c.req.param('id');
  const u = await loadUser(id);
  const r = await clientDb.query('DELETE FROM neon_auth.session WHERE "userId" = $1', [id]);
  await audit(c, 'user.logout_all', 'user', id, { email: u.email, sessions: r.rowCount });
  return c.json({ ok: true, sessions: r.rowCount });
});

app.post('/api/users/:id/notes', async (c) => {
  const id = c.req.param('id');
  await loadUser(id);
  const { body } = await c.req.json();
  const text = String(body || '').trim().slice(0, 2000);
  if (!text) throw fail(400, 'La note est vide.');
  const row = await one(adminDb, 'INSERT INTO admin.user_notes(user_id, author_email, body) VALUES ($1,$2,$3) RETURNING *', [id, c.get('admin').email, text]);
  await audit(c, 'user.note', 'user', id, {});
  return c.json(row);
});

app.delete('/api/users/:id/notes/:noteId', async (c) => {
  const r = await adminDb.query('DELETE FROM admin.user_notes WHERE id = $1 AND user_id = $2', [int(c.req.param('noteId'), 0), c.req.param('id')]);
  if (!r.rowCount) throw fail(404, 'Note introuvable.');
  await audit(c, 'user.note_delete', 'user', c.req.param('id'), {});
  return c.json({ ok: true });
});

app.delete('/api/users/:id', async (c) => {
  const id = c.req.param('id');
  const u = await loadUser(id);
  const { confirm } = await c.req.json().catch(() => ({}));
  if (String(confirm || '').toLowerCase() !== u.email.toLowerCase()) throw fail(400, "Tape l'email exact de l'utilisateur pour confirmer.");
  const cx = await clientDb.connect();
  try {
    await cx.query('BEGIN');
    await cx.query('DELETE FROM activity_days WHERE user_id = $1', [id]);
    await cx.query('DELETE FROM prayer_reminders WHERE user_id = $1', [id]);
    await cx.query('DELETE FROM study_profiles WHERE lower(user_email) = lower($1)', [u.email]);
    await cx.query('DELETE FROM study_matches WHERE lower(requester_email) = lower($1) OR lower(target_email) = lower($1)', [u.email]);
    await cx.query('DELETE FROM neon_auth."user" WHERE id = $1', [id]); // le reste suit en cascade
    await cx.query('COMMIT');
  } catch (e) { await cx.query('ROLLBACK'); throw e; } finally { cx.release(); }
  await adminDb.query('DELETE FROM admin.user_notes WHERE user_id = $1', [id]);
  await audit(c, 'user.delete', 'user', id, { email: u.email, name: u.full_name || u.name });
  return c.json({ ok: true });
});

// ---------- groupes ----------
app.get('/api/groups', async (c) => {
  const search = (c.req.query('q') || '').trim();
  const kind = c.req.query('kind');
  const params = []; const where = [];
  if (search) { params.push(`%${search}%`); where.push(`(g.name ILIKE $${params.length} OR o.email ILIKE $${params.length})`); }
  if (['class', 'family', 'circle'].includes(kind)) { params.push(kind); where.push(`g.kind = $${params.length}`); }
  const rows = await q(clientDb, `
    SELECT g.id, g.name, g.kind, g.invite_code, g.created_at, o.id AS owner_id, o.email AS owner_email, COALESCE(p.full_name, o.name) AS owner_name,
      (SELECT count(*) FROM group_members m WHERE m.group_id = g.id)::int AS members,
      (SELECT count(*) FROM group_assignments a WHERE a.group_id = g.id)::int AS assignments,
      (SELECT count(*) FROM khatmas k WHERE k.group_id = g.id)::int AS khatmas
    FROM study_groups g LEFT JOIN neon_auth."user" o ON o.id = g.owner_id LEFT JOIN profiles p ON p.id = o.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY g.created_at DESC LIMIT 200`, params);
  return c.json(rows);
});

app.get('/api/groups/:id', async (c) => {
  const id = c.req.param('id');
  if (!isUuid(id)) throw fail(404, 'Groupe introuvable.');
  const g = await one(clientDb, `SELECT g.*, o.email AS owner_email, COALESCE(p.full_name, o.name) AS owner_name FROM study_groups g LEFT JOIN neon_auth."user" o ON o.id = g.owner_id LEFT JOIN profiles p ON p.id = o.id WHERE g.id = $1`, [id]);
  if (!g) throw fail(404, 'Groupe introuvable.');
  const [members, assignments, khatmas] = await Promise.all([
    q(clientDb, `SELECT m.user_id, m.role, m.display_name, m.joined_at, u.email, COALESCE(p.full_name, u.name) AS name,
        (SELECT max(day) FROM activity_days a WHERE a.user_id = m.user_id) AS last_active,
        (SELECT COALESCE(sum(cardinality(memorized_verses)),0) FROM memorization_progress mp WHERE mp.user_id = m.user_id)::int AS verses
      FROM group_members m LEFT JOIN neon_auth."user" u ON u.id = m.user_id LEFT JOIN profiles p ON p.id = m.user_id WHERE m.group_id = $1 ORDER BY m.joined_at`, [id]),
    q(clientDb, `SELECT a.*, (SELECT count(*) FROM assignment_status s WHERE s.assignment_id = a.id AND s.status = 'done')::int AS done,
        (SELECT count(*) FROM assignment_status s WHERE s.assignment_id = a.id AND s.status = 'validated')::int AS validated
      FROM group_assignments a WHERE a.group_id = $1 ORDER BY a.created_at DESC LIMIT 50`, [id]),
    q(clientDb, `SELECT k.*, (SELECT count(*) FROM khatma_parts kp WHERE kp.khatma_id = k.id AND kp.status = 'done')::int AS parts_done,
        (SELECT count(*) FROM khatma_parts kp WHERE kp.khatma_id = k.id)::int AS parts_taken
      FROM khatmas k WHERE k.group_id = $1 ORDER BY k.created_at DESC`, [id]),
  ]);
  return c.json({ group: g, members, assignments, khatmas });
});

app.delete('/api/groups/:id/members/:userId', async (c) => {
  const { id, userId } = c.req.param();
  const r = await clientDb.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [id, userId]);
  if (!r.rowCount) throw fail(404, 'Membre introuvable.');
  await audit(c, 'group.remove_member', 'group', id, { user_id: userId });
  return c.json({ ok: true });
});

app.post('/api/groups/:id/regenerate-code', async (c) => {
  const id = c.req.param('id');
  const code = Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  const r = await clientDb.query('UPDATE study_groups SET invite_code = $2 WHERE id = $1', [id, code]);
  if (!r.rowCount) throw fail(404, 'Groupe introuvable.');
  await audit(c, 'group.regenerate_code', 'group', id, {});
  return c.json({ invite_code: code });
});

app.delete('/api/groups/:id', async (c) => {
  const id = c.req.param('id');
  const g = await one(clientDb, 'SELECT name FROM study_groups WHERE id = $1', [isUuid(id) ? id : null]);
  if (!g) throw fail(404, 'Groupe introuvable.');
  await clientDb.query('DELETE FROM study_groups WHERE id = $1', [id]);
  await audit(c, 'group.delete', 'group', id, { name: g.name });
  return c.json({ ok: true });
});

// ---------- défis (lus par l'app client) ----------
function challengeInput(b) {
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) throw fail(400, 'Donne un titre au défi.');
  const surah = b.surah_number ? int(b.surah_number, null, 114) : null;
  if (b.surah_number && (!surah || surah < 1)) throw fail(400, 'Numéro de sourate entre 1 et 114.');
  return [title, String(b.description || '').trim().slice(0, 1000) || null, surah, b.target_verses ? int(b.target_verses, null, 6236) : null,
    b.deadline || null, String(b.badge_emoji || '').trim().slice(0, 8) || null, String(b.badge_name || '').trim().slice(0, 60) || null, b.is_active !== false];
}
app.get('/api/challenges', async (c) => {
  const rows = await q(clientDb, `SELECT ch.*, (SELECT count(*) FROM challenge_participants p WHERE p.challenge_id = ch.id)::int AS participants,
      (SELECT count(*) FROM challenge_participants p WHERE p.challenge_id = ch.id AND p.completed)::int AS finishers
    FROM challenges ch ORDER BY ch.is_active DESC, ch.created_at DESC`);
  return c.json(rows);
});
app.post('/api/challenges', async (c) => {
  const v = challengeInput(await c.req.json());
  const row = await one(clientDb, `INSERT INTO challenges(title, description, surah_number, target_verses, deadline, badge_emoji, badge_name, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, v);
  await audit(c, 'challenge.create', 'challenge', row.id, { title: row.title });
  return c.json(row);
});
app.put('/api/challenges/:id', async (c) => {
  const id = c.req.param('id');
  const v = challengeInput(await c.req.json());
  const row = await one(clientDb, `UPDATE challenges SET title=$2, description=$3, surah_number=$4, target_verses=$5, deadline=$6, badge_emoji=$7, badge_name=$8, is_active=$9 WHERE id=$1 RETURNING *`, [id, ...v]);
  if (!row) throw fail(404, 'Défi introuvable.');
  await audit(c, 'challenge.update', 'challenge', id, { title: row.title, is_active: row.is_active });
  return c.json(row);
});
app.delete('/api/challenges/:id', async (c) => {
  const id = c.req.param('id');
  const row = await one(clientDb, 'DELETE FROM challenges WHERE id = $1 RETURNING title', [isUuid(id) ? id : null]);
  if (!row) throw fail(404, 'Défi introuvable.');
  await audit(c, 'challenge.delete', 'challenge', id, { title: row.title });
  return c.json({ ok: true });
});

// ---------- jeux : banque de questions Al-Ilm et réglages (lus par l'app client) ----------
const GQ_CATS = ['sira', 'prophetes', 'coran', 'compagnons', 'histoire', 'croyance', 'pratique', 'hadith', 'calendrier', 'hadith_vf', 'tafsir'];
const GQ_STATUS = ['draft', 'review', 'published', 'disabled'];
function questionInput(b) {
  const category = String(b.category || '');
  if (!GQ_CATS.includes(category)) throw fail(400, 'Catégorie inconnue.');
  const difficulty = int(b.difficulty, 0, 3);
  if (difficulty < 1) throw fail(400, 'Difficulté entre 1 et 3.');
  const type = b.type === 'vrai_faux' ? 'vrai_faux' : 'qcm';
  const question = String(b.question || '').trim().slice(0, 500);
  if (!question) throw fail(400, 'Écris la question.');
  let choices = Array.isArray(b.choices) ? b.choices.map((x) => String(x || '').trim().slice(0, 200)) : [];
  if (type === 'vrai_faux') choices = b.category === 'hadith_vf' ? ['Hadith authentique', 'Pas un hadith'] : ['Vrai', 'Faux'];
  if (category === 'tafsir') choices = choices.filter(Boolean);
  if (type === 'qcm' && category === 'tafsir' && (choices.length < 3 || choices.length > 4)) throw fail(400, 'Mets 3 ou 4 choix.');
  if (type === 'qcm' && category !== 'tafsir' && (choices.length !== 4 || choices.some((x) => !x))) throw fail(400, 'Remplis les 4 choix.');
  if (new Set(choices).size !== choices.length) throw fail(400, 'Deux choix sont identiques.');
  const answer = int(b.answer, -1, choices.length - 1);
  if (answer < 0) throw fail(400, 'Coche la bonne réponse.');
  const status = GQ_STATUS.includes(b.status) ? b.status : 'draft';
  const explanation = String(b.explanation || '').trim().slice(0, 1500);
  const source = String(b.source || '').trim().slice(0, 300);
  if (status === 'published' && (!explanation || !source)) throw fail(400, 'Une question publiée doit avoir une explication et une source.');
  let surah = null, ayah = null;
  if (category === 'tafsir') {
    surah = int(b.surah, 0, 114); ayah = int(b.ayah, 0, 286);
    if (surah < 1 || ayah < 1) throw fail(400, 'Indique la sourate et le verset de la question.');
  }
  return [category, difficulty, type, question, JSON.stringify(choices), answer, explanation, source, String(b.note || '').trim().slice(0, 500), status, surah, ayah];
}
app.get('/api/games/questions', async (c) => {
  const { category, difficulty, status, search } = c.req.query();
  const where = [], p = [];
  if (GQ_CATS.includes(category)) { p.push(category); where.push(`category = $${p.length}`); }
  if (['1', '2', '3'].includes(difficulty)) { p.push(+difficulty); where.push(`difficulty = $${p.length}`); }
  if (GQ_STATUS.includes(status)) { p.push(status); where.push(`status = $${p.length}`); }
  if (search) { p.push(`%${String(search).slice(0, 80)}%`); where.push(`(question ILIKE $${p.length} OR id ILIKE $${p.length})`); }
  const page = int(c.req.query('page'), 1, 1000) || 1, limit = 50;
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, tot, counts] = await Promise.all([
    q(clientDb, `SELECT * FROM game_questions ${w} ORDER BY updated_at DESC, id LIMIT ${limit} OFFSET ${(page - 1) * limit}`, p),
    one(clientDb, `SELECT count(*)::int AS n FROM game_questions ${w}`, p),
    q(clientDb, `SELECT status, count(*)::int AS n FROM game_questions GROUP BY 1`),
  ]);
  return c.json({ rows, total: tot.n, page, limit, counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) });
});
app.post('/api/games/questions', async (c) => {
  const b = await c.req.json();
  const v = questionInput(b);
  const n = await one(clientDb, `SELECT count(*)::int + 1 AS n FROM game_questions WHERE category = $1`, [v[0]]);
  const id = `${v[0].slice(0, 4)}-${String(n.n).padStart(3, '0')}-${Date.now().toString(36).slice(-4)}`;
  const row = await one(clientDb, `INSERT INTO game_questions(id, category, difficulty, type, question, choices, answer, explanation, source, note, status, updated_by, surah, ayah)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [id, ...v.slice(0, 10), c.get('admin').email, v[10], v[11]]);
  await audit(c, 'question.create', 'question', id, { status: row.status });
  return c.json(row);
});
app.put('/api/games/questions/:id', async (c) => {
  const id = c.req.param('id');
  const v = questionInput(await c.req.json());
  const row = await one(clientDb, `UPDATE game_questions SET category=$2, difficulty=$3, type=$4, question=$5, choices=$6, answer=$7, explanation=$8, source=$9, note=$10, status=$11,
    updated_at=now(), updated_by=$12, surah=$13, ayah=$14 WHERE id=$1 RETURNING *`, [id, ...v.slice(0, 10), c.get('admin').email, v[10], v[11]]);
  if (!row) throw fail(404, 'Question introuvable.');
  await audit(c, 'question.update', 'question', id, { status: row.status });
  return c.json(row);
});
app.patch('/api/games/questions/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status } = await c.req.json();
  if (!GQ_STATUS.includes(status)) throw fail(400, 'Statut inconnu.');
  const row = await one(clientDb, `UPDATE game_questions SET status=$2, updated_at=now(), updated_by=$3 WHERE id=$1 AND ($2 <> 'published' OR (explanation <> '' AND source <> '')) RETURNING id, status`, [id, status, c.get('admin').email]);
  if (!row) throw fail(400, 'Impossible : question introuvable, ou explication/source manquante.');
  await audit(c, 'question.status', 'question', id, { status });
  return c.json(row);
});
app.delete('/api/games/questions/:id', async (c) => {
  const id = c.req.param('id');
  const row = await one(clientDb, 'DELETE FROM game_questions WHERE id = $1 RETURNING question', [id]);
  if (!row) throw fail(404, 'Question introuvable.');
  await audit(c, 'question.delete', 'question', id, { question: row.question.slice(0, 80) });
  return c.json({ ok: true });
});
app.get('/api/games/questions/export.json', async (c) => {
  const rows = await q(clientDb, 'SELECT id, category, difficulty, type, question, choices, answer, explanation, source, note, status, surah, ayah FROM game_questions ORDER BY id');
  c.header('Content-Disposition', 'attachment; filename="myhafizz-questions.json"');
  return c.json(rows);
});
app.post('/api/games/questions/import', async (c) => {
  const list = await c.req.json();
  if (!Array.isArray(list) || list.length > 2000) throw fail(400, 'Fichier JSON invalide (tableau de 2000 questions maximum).');
  let n = 0;
  const errors = [];
  for (const [k, b] of list.entries()) {
    try {
      const v = questionInput({ status: 'review', ...b });
      const id = String(b.id || '').trim().slice(0, 40) || `imp-${Date.now().toString(36)}-${k}`;
      await clientDb.query(`INSERT INTO game_questions(id, category, difficulty, type, question, choices, answer, explanation, source, note, status, updated_by, surah, ayah)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (id) DO UPDATE SET category=EXCLUDED.category, difficulty=EXCLUDED.difficulty, type=EXCLUDED.type,
        question=EXCLUDED.question, choices=EXCLUDED.choices, answer=EXCLUDED.answer, explanation=EXCLUDED.explanation, source=EXCLUDED.source, note=EXCLUDED.note,
        status=EXCLUDED.status, updated_at=now(), updated_by=EXCLUDED.updated_by, surah=EXCLUDED.surah, ayah=EXCLUDED.ayah`, [id, ...v.slice(0, 10), c.get('admin').email, v[10], v[11]]);
      n++;
    } catch (e) { if (errors.length < 20) errors.push(`#${k + 1} : ${e.message}`); }
  }
  await audit(c, 'question.import', 'question', null, { imported: n, errors: errors.length });
  return c.json({ imported: n, errors });
});
const GAME_KEYS = ['suite', 'sourate', 'ordre', 'lettres', 'ilm', 'hadith'];
app.get('/api/games/settings', async (c) => {
  const [rows, plays, duels, khatmas, defi, ligues] = await Promise.all([
    q(clientDb, 'SELECT key, value, updated_at, updated_by FROM game_settings'),
    one(clientDb, `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'done')::int AS termines,
      count(*) FILTER (WHERE status = 'done' AND quit_by IS NOT NULL)::int AS abandons, count(*) FILTER (WHERE status IN ('declined','expired'))::int AS refuses,
      count(DISTINCT u)::int AS joueurs FROM live_duels, LATERAL unnest(ARRAY[challenger, opponent]) u WHERE created_at > now() - interval '30 days'`),
    one(clientDb, `SELECT count(*)::int AS total, count(*) FILTER (WHERE status = 'done')::int AS terminees, count(*) FILTER (WHERE status = 'active')::int AS en_cours,
      count(DISTINCT group_id)::int AS groupes FROM team_khatmas WHERE created_at > now() - interval '30 days'`),
    one(clientDb, `SELECT count(*) FILTER (WHERE day = (now() AT TIME ZONE 'UTC')::date AND finished_at IS NOT NULL)::int AS aujourdhui,
      count(*) FILTER (WHERE finished_at IS NOT NULL)::int AS total, count(DISTINCT user_id)::int AS joueurs,
      round(avg(score * 100.0 / NULLIF(total, 0)))::int AS reussite FROM daily_results WHERE day > (now() AT TIME ZONE 'UTC')::date - 30`),
    q(clientDb, `SELECT tier, count(*)::int AS joueurs, count(DISTINCT grp)::int AS groupes FROM league_members WHERE week = date_trunc('week', now() AT TIME ZONE 'UTC')::date GROUP BY tier ORDER BY tier`),
    q(clientDb, `SELECT game, count(*)::int AS parties, count(DISTINCT user_id)::int AS joueurs, round(avg(score::numeric * 100 / NULLIF(total, 0)))::int AS reussite
      FROM game_sessions WHERE created_at > now() - interval '30 days' GROUP BY 1`),
  ]);
  return c.json({ settings: Object.fromEntries(rows.map((r) => [r.key, r.value])), updated: rows, plays, duels, khatmas, defi, ligues });
});
app.get('/api/tournaments', async (c) => {
  const rows = await q(clientDb, `SELECT t.id, t.title, t.starts_at, t.size, t.status, t.round, t.rounds, g.name AS group_name,
      (SELECT count(*)::int FROM tournament_players p WHERE p.tournament_id = t.id) AS players,
      (SELECT username FROM profiles WHERE id = t.champion) AS champion
    FROM tournaments t LEFT JOIN study_groups g ON g.id = t.group_id ORDER BY (t.status IN ('open','running')) DESC, t.starts_at DESC LIMIT 40`);
  return c.json({ rows });
});
app.post('/api/tournaments', async (c) => {
  const b = await c.req.json();
  const title = String(b.title || '').trim().slice(0, 60) || 'Tournoi';
  const at = new Date(b.starts_at);
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 10 * 60e3) return c.json({ error: "Choisis une date au moins 10 minutes à l'avance." }, 400);
  const size = Number(b.size) === 8 ? 8 : 16;
  const row = await one(clientDb, `INSERT INTO tournaments (title, starts_at, size) VALUES ($1, $2, $3) RETURNING id, title, starts_at, size`, [title, at.toISOString(), size]);
  await audit(c, 'tournament.create', 'tournament', row.id, { title, starts_at: row.starts_at, size });
  return c.json(row);
});
app.post('/api/tournaments/:id/cancel', async (c) => {
  const id = c.req.param('id');
  const row = await one(clientDb, `UPDATE tournaments SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status = 'open' RETURNING id, title`, [id]);
  if (!row) return c.json({ error: 'Seul un tournoi pas encore commencé peut être annulé.' }, 400);
  await q(clientDb, `INSERT INTO notifications (user_id, kind, ref, data, push) SELECT user_id, 'tournoi_cancel', $1, jsonb_build_object('title', $2::text), false FROM tournament_players WHERE tournament_id = $1`, [id, row.title]);
  await audit(c, 'tournament.cancel', 'tournament', id, { title: row.title });
  return c.json({ ok: true });
});
app.put('/api/games/settings', async (c) => {
  const b = await c.req.json();
  const games = Object.fromEntries(GAME_KEYS.map((k) => [k, b.games?.[k] !== false]));
  const rate = (v, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(0.9, Math.max(0, n)) : d; };
  const robot = { 1: rate(b.robot?.[1], 0.3), 2: rate(b.robot?.[2], 0.15), 3: rate(b.robot?.[3], 0.05) };
  const r = b.rules || {};
  const rules = {
    questions: Math.max(3, int(r.questions, 5, 20)), ilm_questions: Math.max(3, int(r.ilm_questions, 10, 20)),
    unlock_pct: Math.max(50, int(r.unlock_pct, 80, 100)), xp_correct: int(r.xp_correct, 10, 100), xp_perfect: int(r.xp_perfect, 20, 500),
    streak_bonus: rate(r.streak_bonus, 0.1), streak_max: Math.min(5, Math.max(1, Number(r.streak_max) || 2)), flash_seconds: Math.max(2, int(r.flash_seconds, 3, 15)),
  };
  const d = b.duel || {};
  const duel = { enabled: d.enabled !== false, questions: Math.max(3, int(d.questions, 7, 15)), secs: Math.max(5, int(d.secs, 15, 60)), secs_ordre: Math.max(10, int(d.secs_ordre, 25, 90)),
    invite_secs: Math.max(20, int(d.invite_secs, 60, 300)), win: int(d.win, 30, 500), draw: int(d.draw, 5, 500), loss: int(d.loss, 10, 500), quit: int(d.quit, 20, 500), daily_limit: Math.max(1, int(d.daily_limit, 30, 200)) };
  const kb = b.khatma || {};
  const dayList = [...new Set((Array.isArray(kb.days) ? kb.days : String(kb.days || '').split(/[\s,;]+/)).map((x) => int(x, 0, 30)).filter((x) => x >= 1))].sort((a, b) => a - b).slice(0, 4);
  const khatma = { enabled: kb.enabled !== false, days: dayList.length ? dayList : [3, 7, 14], bonus: int(kb.bonus, 50, 1000), pct: Math.max(50, int(kb.pct, 80, 100)) };
  const df = b.defi || {};
  const defi = { enabled: df.enabled !== false, questions: Math.max(3, int(df.questions, 5, 10)), per_good: int(df.per_good, 5, 100), streak_step: int(df.streak_step, 2, 50), streak_max: int(df.streak_max, 20, 500) };
  const tn = b.tournoi || {};
  const tournoi = { enabled: tn.enabled !== false, win: int(tn.win, 200, 2000), final: int(tn.final, 100, 2000), semi: int(tn.semi, 50, 2000), wait_secs: Math.max(20, int(tn.wait_secs, 60, 300)), gap_secs: Math.max(20, int(tn.gap_secs, 60, 600)) };
  const lg = b.ligue || {};
  const ligue = { enabled: lg.enabled !== false, size: Math.max(10, int(lg.size, 30, 50)), up: Math.max(1, int(lg.up, 7, 20)), down: int(lg.down, 5, 20), learn_day: int(lg.learn_day, 20, 200),
    start: /^\d{4}-\d{2}-\d{2}$/.test(String(lg.start || '')) ? lg.start : '2026-11-02' };
  const lv = b.live || {};
  const yt = (u) => { const v = String(u || '').trim().slice(0, 300); return !v || /^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//.test(v) ? v : ''; };
  const live = { enabled: lv.enabled !== false, mecque: yt(lv.mecque), medine: yt(lv.medine) };
  const who = c.get('admin').email;
  for (const [key, value] of Object.entries({ games, robot, rules, duel, khatma, defi, ligue, tournoi, live })) {
    await clientDb.query(`INSERT INTO game_settings(key, value, updated_at, updated_by) VALUES ($1,$2,now(),$3)
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=now(), updated_by=EXCLUDED.updated_by`, [key, value, who]);
  }
  await audit(c, 'games.settings', 'games', null, { games, robot, rules, duel, khatma, defi, ligue, tournoi, live });
  return c.json({ games, robot, rules, duel, khatma, defi, ligue, tournoi, live });
});

// ---------- rappels et notifications ----------
app.get('/api/notifications', async (c) => {
  const [totals, prayers, tz] = await Promise.all([
    one(clientDb, `SELECT (SELECT count(*) FROM prayer_reminders)::int AS reminders, (SELECT count(DISTINCT user_id) FROM prayer_reminders)::int AS reminder_users,
      (SELECT count(*) FROM push_subscriptions)::int AS push_subs, (SELECT round(avg(offset_min)) FROM prayer_reminders)::int AS avg_offset,
      (SELECT max(updated_at) FROM prayer_reminders) AS last_update`),
    q(clientDb, `SELECT p AS prayer, count(*)::int AS n FROM prayer_reminders, unnest(prayers) AS p GROUP BY p ORDER BY n DESC`),
    q(clientDb, `SELECT COALESCE(tz,'?') AS tz, count(*)::int AS n FROM prayer_reminders GROUP BY 1 ORDER BY n DESC LIMIT 12`),
  ]);
  return c.json({ totals, prayers, tz });
});

// ---------- équipe admin (base admin) ----------
app.get('/api/admins', async (c) => {
  const rows = await q(adminDb, `SELECT a.*, (u.id IS NOT NULL) AS has_account, u."emailVerified" AS email_verified
    FROM admin.admin_users a LEFT JOIN neon_auth."user" u ON lower(u.email) = a.email ORDER BY (a.role='owner') DESC, a.created_at`);
  return c.json(rows);
});
app.post('/api/admins', need('owner'), async (c) => {
  const b = await c.req.json();
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw fail(400, 'Adresse email invalide.');
  const role = ['owner', 'admin', 'viewer'].includes(b.role) ? b.role : 'admin';
  const row = await one(adminDb, `INSERT INTO admin.admin_users(email, name, role, added_by) VALUES ($1,$2,$3,$4) ON CONFLICT (email) DO NOTHING RETURNING *`, [email, String(b.name || '').trim() || null, role, c.get('admin').email]);
  if (!row) throw fail(409, 'Cette adresse a déjà accès.');
  await audit(c, 'admin.add', 'admin', email, { role });
  return c.json(row);
});
app.patch('/api/admins/:email', need('owner'), async (c) => {
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  const { role } = await c.req.json();
  if (!['owner', 'admin', 'viewer'].includes(role)) throw fail(400, 'Rôle invalide.');
  if (email === c.get('admin').email && role !== 'owner') throw fail(400, 'Tu ne peux pas retirer ton propre rôle de propriétaire.');
  const r = await adminDb.query('UPDATE admin.admin_users SET role = $2 WHERE email = $1', [email, role]);
  if (!r.rowCount) throw fail(404, 'Admin introuvable.');
  await audit(c, 'admin.role', 'admin', email, { role });
  return c.json({ ok: true });
});
app.delete('/api/admins/:email', need('owner'), async (c) => {
  const email = decodeURIComponent(c.req.param('email')).toLowerCase();
  if (email === c.get('admin').email) throw fail(400, 'Tu ne peux pas retirer ton propre accès.');
  const r = await adminDb.query('DELETE FROM admin.admin_users WHERE email = $1', [email]);
  if (!r.rowCount) throw fail(404, 'Admin introuvable.');
  await audit(c, 'admin.remove', 'admin', email, {});
  return c.json({ ok: true });
});

// ---------- journal ----------
app.get('/api/audit', async (c) => {
  const limit = int(c.req.query('limit'), 50, 200);
  const page = int(c.req.query('page'), 1, 100000) || 1;
  const params = []; const where = [];
  const action = c.req.query('action');
  if (action) { params.push(action + '%'); where.push(`action LIKE $${params.length}`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = (await one(adminDb, `SELECT count(*)::int AS n FROM admin.audit_log ${w}`, params)).n;
  params.push(limit, (page - 1) * limit);
  const rows = await q(adminDb, `SELECT * FROM admin.audit_log ${w} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return c.json({ total, page, limit, rows });
});

// ---------- système ----------
app.get('/api/system', async (c) => {
  const tables = `SELECT n.nspname || '.' || c.relname AS name, c.reltuples::bigint AS approx_rows, pg_total_relation_size(c.oid)::bigint AS bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind = 'r' AND n.nspname IN ('public','neon_auth','admin') ORDER BY bytes DESC`;
  const [cSize, aSize, cTables, aTables, cVer] = await Promise.all([
    one(clientDb, 'SELECT pg_database_size(current_database())::bigint AS bytes'),
    one(adminDb, 'SELECT pg_database_size(current_database())::bigint AS bytes'),
    q(clientDb, tables), q(adminDb, tables),
    one(clientDb, 'SELECT version() AS v'),
  ]);
  return c.json({
    client: { bytes: Number(cSize.bytes), tables: cTables, version: cVer.v.split(' on ')[0] },
    admin: { bytes: Number(aSize.bytes), tables: aTables },
    branch: process.env.NEON_BRANCH || null,
  });
});

app.all('/api/*', () => { throw fail(404, 'Route inconnue.'); });

export default app;
