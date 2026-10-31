import { StrictMode, useCallback, useEffect, useState } from 'react';
import { MeCtx } from './me';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ChartBar, Users, UsersThree, Trophy, Bell, ShieldCheck, ClockCounterClockwise, Database, SignOut, List, X } from '@phosphor-icons/react';
import './index.css';
import { api, auth, clearToken, ROLE_LABEL, ApiError } from './lib';
import { Button, Loading, ToastProvider, cx } from './ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/Users';
import UserDetail from './pages/UserDetail';
import Groups from './pages/Groups';
import GroupDetail from './pages/GroupDetail';
import Challenges from './pages/Challenges';
import Notifications from './pages/Notifications';
import Team from './pages/Team';
import Audit from './pages/Audit';
import System from './pages/System';


const NAV = [
  { to: '/', label: 'Tableau de bord', icon: ChartBar, end: true },
  { to: '/utilisateurs', label: 'Utilisateurs', icon: Users },
  { to: '/groupes', label: 'Groupes', icon: UsersThree },
  { to: '/defis', label: 'Défis', icon: Trophy },
  { to: '/rappels', label: 'Rappels', icon: Bell },
  { sep: true },
  { to: '/equipe', label: 'Équipe admin', icon: ShieldCheck },
  { to: '/journal', label: 'Journal', icon: ClockCounterClockwise },
  { to: '/systeme', label: 'Système', icon: Database },
];

function Shell({ me, onSignOut }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const side = (
    <aside className="w-[248px] shrink-0 bg-white border-r-2 border-line h-full flex flex-col">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b-2 border-line">
        <img src="/logo.svg" alt="" className="w-8 h-8" />
        <div><div className="font-black text-ink leading-none">MyHafizz</div><div className="text-[12px] font-extrabold text-lagon-text mt-0.5">Administration</div></div>
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {NAV.map((n, i) => n.sep ? <div key={i} className="h-px bg-line my-3 mx-2" /> : (
          <NavLink key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => cx('flex items-center gap-3 h-11 px-3 rounded-xl font-extrabold text-[15px] border-2',
              isActive ? 'bg-lagon-tint text-lagon-text border-lagon/40' : 'text-ink-soft border-transparent hover:bg-[#F7F7F7] hover:text-ink')}>
            {({ isActive }) => <><n.icon size={22} weight={isActive ? 'fill' : 'bold'} />{n.label}</>}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t-2 border-line">
        <div className="px-2 pb-3">
          <div className="font-extrabold text-ink text-sm truncate">{me.name || me.email}</div>
          <div className="text-[12px] font-bold text-ink-soft truncate">{me.email} · {ROLE_LABEL[me.role]}</div>
        </div>
        <Button variant="secondary" size="sm" className="w-full" onClick={onSignOut}><SignOut weight="bold" />Se déconnecter</Button>
      </div>
    </aside>
  );
  return (
    <div className="h-screen flex bg-lagon-bg">
      <div className="hidden lg:block">{side}</div>
      {open && <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)}><div className="h-full w-fit" onClick={(e) => e.stopPropagation()}>{side}</div></div>}
      <main className="flex-1 overflow-y-auto">
        <div className="lg:hidden sticky top-0 z-30 bg-white border-b-2 border-line h-14 flex items-center gap-3 px-4">
          <button onClick={() => setOpen(!open)} className="p-1.5 -ml-1.5 rounded-lg text-ink" aria-label="Menu">{open ? <X size={24} weight="bold" /> : <List size={24} weight="bold" />}</button>
          <img src="/logo.svg" alt="" className="w-7 h-7" /><span className="font-black text-ink">Admin</span>
        </div>
        <div className="max-w-[1180px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/utilisateurs" element={<UsersPage />} />
            <Route path="/utilisateurs/:id" element={<UserDetail />} />
            <Route path="/groupes" element={<Groups />} />
            <Route path="/groupes/:id" element={<GroupDetail />} />
            <Route path="/defis" element={<Challenges />} />
            <Route path="/rappels" element={<Notifications />} />
            <Route path="/equipe" element={<Team />} />
            <Route path="/journal" element={<Audit />} />
            <Route path="/systeme" element={<System />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  const [state, setState] = useState({ phase: 'loading' }); // loading | out | denied | in
  const load = useCallback(async () => {
    setState({ phase: 'loading' });
    const s = await auth.getSession().catch(() => null);
    if (!s?.data?.session) return setState({ phase: 'out' });
    try { setState({ phase: 'in', me: await api('/me') }); }
    catch (e) { setState(e instanceof ApiError && e.status === 403 ? { phase: 'denied', message: e.message, email: s.data.user?.email } : { phase: 'out', notice: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const signOut = async () => { await auth.signOut().catch(() => {}); clearToken(); setState({ phase: 'out' }); };

  if (state.phase === 'loading') return <div className="min-h-screen bg-lagon-bg"><Loading /></div>;
  if (state.phase === 'out') return <Login onDone={load} notice={state.notice} />;
  if (state.phase === 'denied') return (
    <div className="min-h-screen bg-lagon-bg flex items-center justify-center p-5">
      <div className="bg-white border-2 border-line rounded-2xl p-6 max-w-[420px] text-center">
        <ShieldCheck size={40} weight="bold" className="mx-auto text-ink-faint" />
        <h1 className="font-black text-ink text-xl mt-3">Accès refusé</h1>
        <p className="text-ink-soft font-semibold mt-2">{state.message}</p>
        {state.email && <p className="text-sm text-ink-soft mt-1">Compte : {state.email}</p>}
        <Button variant="secondary" className="mt-5" onClick={signOut}>Changer de compte</Button>
      </div>
    </div>
  );
  return <MeCtx.Provider value={state.me}><Shell me={state.me} onSignOut={signOut} /></MeCtx.Provider>;
}

createRoot(document.getElementById('root')).render(
  <StrictMode><BrowserRouter><ToastProvider><App /></ToastProvider></BrowserRouter></StrictMode>
);
