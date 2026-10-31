import { useState } from 'react';
import { auth, frAuthError } from '../lib';
import { Button, Input, Label } from '../ui';

// Connexion admin : email + mot de passe, adresse confirmée par code reçu par email.
export default function Login({ onDone, notice }) {
  const [mode, setMode] = useState('signin'); // signin | signup | verify | forgot | reset
  const [f, setF] = useState({ name: '', email: '', password: '', code: '' });
  const [err, setErr] = useState(notice || '');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const go = async (fn) => {
    setErr(''); setInfo(''); setBusy(true);
    try { await fn(); } catch (e) { setErr(frAuthError(e)); } finally { setBusy(false); }
  };
  const check = (res) => { if (res?.error) throw res.error; return res; };
  const toVerify = () => { setMode('verify'); setInfo(`Un code à 6 chiffres a été envoyé à ${f.email}.`); };

  const submit = (e) => {
    e.preventDefault();
    const email = f.email.trim().toLowerCase();
    if (mode === 'signin') return go(async () => {
      const r = await auth.signIn.email({ email, password: f.password });
      if (r?.error && frAuthError(r.error) === 'EMAIL_NOT_VERIFIED') return toVerify();
      check(r); onDone();
    });
    if (mode === 'signup') return go(async () => {
      if (f.password.length < 8) throw new Error('Mot de passe trop court (8 caractères minimum).');
      check(await auth.signUp.email({ email, password: f.password, name: f.name.trim() || email.split('@')[0] }));
      toVerify();
    });
    if (mode === 'verify') return go(async () => {
      check(await auth.emailOtp.verifyEmail({ email, otp: f.code.trim() }));
      const s = await auth.getSession();
      if (!s?.data?.session) check(await auth.signIn.email({ email, password: f.password }));
      onDone();
    });
    if (mode === 'forgot') return go(async () => {
      check(await auth.emailOtp.sendVerificationOtp({ email, type: 'forget-password' }));
      setMode('reset'); setInfo(`Code envoyé à ${email}. Choisis ensuite un nouveau mot de passe.`);
    });
    if (mode === 'reset') return go(async () => {
      if (f.password.length < 8) throw new Error('Mot de passe trop court (8 caractères minimum).');
      check(await auth.emailOtp.resetPassword({ email, otp: f.code.trim(), password: f.password }));
      setMode('signin'); setInfo('Mot de passe changé. Connecte-toi.'); setF({ ...f, code: '' });
    });
  };

  const resend = () => go(async () => {
    check(await auth.emailOtp.sendVerificationOtp({ email: f.email.trim().toLowerCase(), type: 'email-verification' }));
    setInfo('Nouveau code envoyé.');
  });

  const titles = {
    signin: ['Connexion', "Accès réservé à l'équipe MyHafizz."],
    signup: ['Activer mon accès', "Ton email doit déjà être autorisé par le propriétaire."],
    verify: ['Confirme ton email', 'Saisis le code reçu par email.'],
    forgot: ['Mot de passe oublié', 'On t’envoie un code par email.'],
    reset: ['Nouveau mot de passe', 'Saisis le code reçu et ton nouveau mot de passe.'],
  };

  return (
    <div className="min-h-screen bg-lagon-bg flex items-center justify-center p-5">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <img src="/logo.svg" alt="" className="w-11 h-11" />
          <div><div className="font-black text-[22px] text-ink leading-none">MyHafizz</div><div className="text-[13px] font-extrabold text-lagon-text mt-1">Administration</div></div>
        </div>
        <form onSubmit={submit} className="bg-white border-2 border-line rounded-2xl p-6">
          <h1 className="text-[22px] font-black text-ink">{titles[mode][0]}</h1>
          <p className="text-ink-soft font-semibold text-sm mt-1 mb-5">{titles[mode][1]}</p>

          <div className="space-y-4">
            {mode === 'signup' && <div><Label>Nom</Label><Input value={f.name} onChange={set('name')} placeholder="Ton prénom" autoComplete="name" /></div>}
            {['signin', 'signup', 'forgot'].includes(mode) && (
              <div><Label>Email</Label><Input type="email" required value={f.email} onChange={set('email')} placeholder="toi@exemple.com" autoComplete="email" /></div>
            )}
            {['verify', 'reset'].includes(mode) && (
              <div><Label>Code</Label><Input inputMode="numeric" required maxLength={6} value={f.code} onChange={set('code')} placeholder="123456" autoComplete="one-time-code" className="tracking-[0.4em] text-center text-lg" /></div>
            )}
            {['signin', 'signup', 'reset'].includes(mode) && (
              <div><Label hint={mode !== 'signin' ? '8 caractères minimum' : undefined}>{mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}</Label>
                <Input type="password" required value={f.password} onChange={set('password')} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} /></div>
            )}
          </div>

          {err && <p className="mt-4 text-sm font-bold text-danger-dark bg-danger-tint rounded-xl px-3 py-2.5">{err}</p>}
          {info && !err && <p className="mt-4 text-sm font-bold text-lagon-text bg-lagon-tint rounded-xl px-3 py-2.5">{info}</p>}

          <Button type="submit" loading={busy} className="w-full mt-5">
            {{ signin: 'Se connecter', signup: 'Créer mon accès', verify: 'Valider', forgot: 'Envoyer le code', reset: 'Changer le mot de passe' }[mode]}
          </Button>

          <div className="mt-5 text-center text-sm font-bold space-y-2">
            {mode === 'signin' && <>
              <button type="button" className="text-lagon-text hover:underline" onClick={() => { setMode('forgot'); setErr(''); setInfo(''); }}>Mot de passe oublié ?</button>
              <p className="text-ink-soft">Première fois ? <button type="button" className="text-lagon-text hover:underline" onClick={() => { setMode('signup'); setErr(''); setInfo(''); }}>Activer mon accès</button></p>
            </>}
            {mode === 'verify' && <button type="button" className="text-lagon-text hover:underline" onClick={resend}>Renvoyer le code</button>}
            {mode !== 'signin' && <p><button type="button" className="text-ink-soft hover:underline" onClick={() => { setMode('signin'); setErr(''); setInfo(''); }}>Retour à la connexion</button></p>}
          </div>
        </form>
      </div>
    </div>
  );
}
