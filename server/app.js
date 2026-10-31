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
