import { useState } from 'react';
import { auth, frAuthError } from '../lib';

// Connexion admin : uniquement avec Google. L'accès est ensuite vérifié
// côté serveur (compte Google + email présent dans la liste de l'équipe).
export default function Login({ notice }) {
  const [err, setErr] = useState(notice || '');
  const [busy, setBusy] = useState(false);

  const google = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await auth.signIn.social({ provider: 'google', callbackURL: window.location.origin + '/' });
      if (r?.error) throw r.error;
    } catch (e) {
      setErr(frAuthError(e)); setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-lagon-bg flex items-center justify-center p-5">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <img src="/logo.svg" alt="" className="w-11 h-11" />
          <div><div className="font-black text-[22px] text-ink leading-none">MyHafizz</div><div className="text-[13px] font-extrabold text-lagon-text mt-1">Administration</div></div>
        </div>
        <div className="bg-white border-2 border-line rounded-2xl p-6">
          <h1 className="text-[22px] font-black text-ink">Connexion</h1>
          <p className="text-ink-soft font-semibold text-sm mt-1 mb-5">Accès réservé à l'équipe MyHafizz.</p>

          <button type="button" onClick={google} disabled={busy}
            className="w-full h-12 flex items-center justify-center gap-3 rounded-2xl border-2 border-line border-b-4 bg-white font-extrabold text-ink active:border-b-2 active:translate-y-[2px] disabled:opacity-60 transition">
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>
            </svg>
            {busy ? 'Redirection…' : 'Continuer avec Google'}
          </button>

          {err && <p className="mt-4 text-sm font-bold text-danger-dark bg-danger-tint rounded-xl px-3 py-2.5">{err}</p>}
        </div>
      </div>
    </div>
  );
}
