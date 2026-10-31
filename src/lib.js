import { createAuthClient } from '@neondatabase/auth';

// Neon Auth du projet « MyHafizz Admin » (séparé de l'auth client).
export const AUTH_URL = import.meta.env.VITE_ADMIN_AUTH_URL;
export const auth = createAuthClient(AUTH_URL);

let cached = { token: null, exp: 0 };
export async function getToken(force = false) {
  if (!force && cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  // Le SDK Neon garde le JWT dans session.token (rafraîchi automatiquement).
  const res = await auth.getSession(force ? { query: { disableCookieCache: true } } : undefined).catch(() => null);
  const token = res?.data?.session?.token || null;
  if (token) {
    try { cached = { token, exp: JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000 }; }
    catch { cached = { token, exp: Date.now() + 5 * 60_000 }; }
  } else cached = { token: null, exp: 0 };
  return token;
}
export const clearToken = () => { cached = { token: null, exp: 0 }; };

export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

export async function api(path, { method = 'GET', body, raw } = {}) {
  const run = async (force) => {
    const token = await getToken(force);
    return fetch('/api' + path, {
      method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  };
  let res = await run(false);
  if (res.status === 401) res = await run(true);
  if (raw) { if (!res.ok) throw new ApiError('Échec du téléchargement', res.status); return res; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Erreur inattendue', res.status);
  return data;
}

// ---- formats ----
const nf = new Intl.NumberFormat('fr-FR');
export const num = (n) => nf.format(n ?? 0);
export const date = (d) => (d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
export const dateTime = (d) => (d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
export function ago(d) {
  if (!d) return 'jamais';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 0) return date(d);
  if (s < 3600) return `il y a ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  const days = Math.floor(s / 86400);
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  return date(d);
}
export const bytes = (b) => (b < 1024 ? `${b} o` : b < 1048576 ? `${(b / 1024).toFixed(0)} Ko` : `${(b / 1048576).toFixed(1)} Mo`);

export const GROUP_KIND = { class: 'Classe', family: 'Famille', circle: 'Cercle' };
export const ROLE_LABEL = { owner: 'Propriétaire', admin: 'Admin', viewer: 'Lecture seule' };
export const MEMBER_ROLE = { teacher: 'Maître', student: 'Élève', parent: 'Parent', child: 'Enfant', member: 'Membre' };
export const PRAYERS = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

export function frAuthError(err) {
  const code = err?.code || '';
  const m = (err?.message || '').toLowerCase();
  if (code === 'INVALID_EMAIL_OR_PASSWORD' || m.includes('invalid email or password')) return 'Email ou mot de passe incorrect.';
  if (code === 'EMAIL_NOT_VERIFIED' || m.includes('not verified')) return 'EMAIL_NOT_VERIFIED';
  if (code === 'USER_ALREADY_EXISTS' || m.includes('already exists')) return 'Un compte existe déjà avec cet email. Connecte-toi.';
  if (m.includes('password') && m.includes('short')) return 'Mot de passe trop court (8 caractères minimum).';
  if (m.includes('otp') || m.includes('invalid code')) return 'Code incorrect ou expiré.';
  if (m.includes('too many')) return 'Trop de tentatives. Patiente une minute.';
  return err?.message || 'Une erreur est survenue.';
}
