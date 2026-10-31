import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Prohibit, CheckCircle, SignOut, Trash, PencilSimple, EnvelopeSimple, NotePencil } from '@phosphor-icons/react';
import { useMe, canWrite } from '../me';
import { api, ago, date, dateTime, num, GROUP_KIND, MEMBER_ROLE, PRAYERS } from '../lib';
import { Avatar, Badge, Button, Card, CardHead, ErrorBox, Input, Label, Loading, Modal, Select, Stat, Table, Td, Textarea, useApi, useToast } from '../ui';
import { SURAHS } from '../surahs';

function Heatmap({ activity }) {
  const map = Object.fromEntries(activity.map((a) => [a.day, a.actions]));
  const days = [];
  for (let i = 90; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().slice(0, 10)); }
  const max = Math.max(1, ...activity.map((a) => a.actions));
  return (
    <div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 w-fit">
        {days.map((d) => {
          const v = map[d] || 0;
          const o = v ? 0.3 + 0.7 * (v / max) : 1;
          return <div key={d} title={`${new Date(d).toLocaleDateString('fr-FR')} : ${v} action${v > 1 ? 's' : ''}`} className="w-3.5 h-3.5 rounded-[4px]" style={{ background: v ? '#00A3A8' : '#EEEEEE', opacity: o }} />;
        })}
      </div>
      <p className="text-[12px] font-bold text-ink-soft mt-2">{activity.length} jour{activity.length > 1 ? 's' : ''} actif{activity.length > 1 ? 's' : ''} sur les 90 derniers</p>
    </div>
  );
}

const ua = (s) => {
  if (!s) return 'Appareil inconnu';
  const os = /iPhone|iPad/.test(s) ? 'iPhone / iPad' : /Android/.test(s) ? 'Android' : /Mac OS/.test(s) ? 'Mac' : /Windows/.test(s) ? 'Windows' : /Linux/.test(s) ? 'Linux' : 'Autre';
  const br = /Edg\//.test(s) ? 'Edge' : /Chrome\//.test(s) ? 'Chrome' : /Firefox\//.test(s) ? 'Firefox' : /Safari\//.test(s) ? 'Safari' : '';
  return br ? `${br} · ${os}` : os;
};

export default function UserDetail() {
  const { id } = useParams();
  const me = useMe();
  const nav = useNavigate();
  const toast = useToast();
  const write = canWrite(me);
  const { data, error, reload } = useApi(() => api(`/users/${id}`), [id]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); setModal(null); reload(); }
    catch (e) { toast(e.message, 'error'); }
    finally { setBusy(false); }
  };

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const { user: u, plan, progress, reviews, activity, groups, reading, sessions, accounts, reminders, notes } = data;
  const verses = progress.reduce((s, p) => s + p.memorized, 0);
  const complete = progress.filter((p) => p.total_verses && p.memorized >= p.total_verses).length;

  return (
    <>
      <Link to="/utilisateurs" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-lagon-text mb-4 hover:underline"><ArrowLeft weight="bold" />Utilisateurs</Link>

      <Card className="p-5 flex flex-wrap items-center gap-5">
        <Avatar name={u.name || u.email} src={u.avatar} size={64} />
        <div className="flex-1 min-w-[220px]">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-black text-ink">{u.name || 'Sans nom'}</h1>
            {u.banned ? <Badge tone="danger">Suspendu</Badge> : <Badge tone="lagon">Actif</Badge>}
            {!u.email_verified && <Badge tone="gold">Email non confirmé</Badge>}
          </div>
          <p className="text-ink-soft font-semibold mt-0.5">{u.email}</p>
          <p className="text-[13px] text-ink-soft mt-1">Inscrit le {date(u.created_at)} · connexion via {accounts.map((a) => (a.provider === 'credential' ? 'email' : a.provider)).join(', ') || '-'}</p>
          {u.banned && u.ban_reason && <p className="text-[13px] font-bold text-danger-dark mt-1">Motif : {u.ban_reason}{u.ban_expires ? ` (jusqu'au ${date(u.ban_expires)})` : ''}</p>}
        </div>
        {write && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setForm({ name: u.name || '' }); setModal('rename'); }}><PencilSimple weight="bold" />Renommer</Button>
            {!u.email_verified && <Button size="sm" variant="secondary" loading={busy} onClick={() => act(() => api(`/users/${id}/verify-email`, { method: 'POST' }), 'Email marqué comme confirmé.')}><EnvelopeSimple weight="bold" />Confirmer l'email</Button>}
            <Button size="sm" variant="secondary" onClick={() => setModal('logout')}><SignOut weight="bold" />Déconnecter</Button>
            {u.banned
              ? <Button size="sm" variant="secondary" loading={busy} onClick={() => act(() => api(`/users/${id}/unban`, { method: 'POST' }), 'Compte réactivé.')}><CheckCircle weight="bold" />Réactiver</Button>
              : <Button size="sm" variant="dangerSoft" onClick={() => { setForm({ reason: '', days: '0' }); setModal('ban'); }}><Prohibit weight="bold" />Suspendre</Button>}
            <Button size="sm" variant="dangerSoft" onClick={() => { setForm({ confirm: '' }); setModal('delete'); }}><Trash weight="bold" />Supprimer</Button>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <Stat label="Versets mémorisés" value={num(verses)} hint={`${complete} sourate${complete > 1 ? 's' : ''} complète${complete > 1 ? 's' : ''}`} />
        <Stat label="Cartes de révision" value={num(reviews.cards)} hint={`${num(reviews.due)} à revoir · ${num(reviews.fragile)} fragiles`} />
        <Stat label="Lecture de l'arabe" value={`${reading.lessons_done} leçon${reading.lessons_done > 1 ? 's' : ''}`} hint={`${num(reading.xp)} XP`} />
        <Stat label="Dernière révision" value={reviews.last ? ago(reviews.last) : '-'} hint={`${num(reviews.reps)} répétitions · ${num(reviews.lapses)} oublis`} />
      </div>

      <div className="grid lg:grid-cols-[1.5fr_1fr] gap-6 mt-6">
        <div className="space-y-6 min-w-0">
          <Card><CardHead title="Activité" sub="90 derniers jours" /><div className="px-5 pb-5 overflow-x-auto"><Heatmap activity={activity} /></div></Card>

          <Card>
            <CardHead title="Progression par sourate" sub={`${progress.length} sourate${progress.length > 1 ? 's' : ''} commencée${progress.length > 1 ? 's' : ''}`} />
            {progress.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-soft">Aucune sourate commencée.</p> : (
              <Table head={['Sourate', 'Progression', 'Dernière révision']}>
                {progress.map((p) => {
                  const pct = p.total_verses ? Math.min(100, Math.round((p.memorized / p.total_verses) * 100)) : 0;
                  return (
                    <tr key={p.surah_number}>
                      <Td className="whitespace-nowrap"><span className="text-ink-faint font-bold mr-2">{p.surah_number}</span><span className="font-bold">{SURAHS[p.surah_number - 1]}</span></Td>
                      <Td className="min-w-[180px]">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-2.5 rounded-full bg-[#EEEEEE] overflow-hidden"><div className="h-full bg-lagon rounded-full" style={{ width: `${pct}%` }} /></div>
                          <span className="text-[13px] font-bold text-ink-soft w-16 text-right">{p.memorized}/{p.total_verses}</span>
                        </div>
                      </Td>
                      <Td className="text-ink-soft whitespace-nowrap">{ago(p.last_reviewed)}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>

          <Card>
            <CardHead title="Sessions" sub="Appareils connectés récemment" right={write && sessions.length > 0 && <Button size="sm" variant="secondary" onClick={() => setModal('logout')}>Tout déconnecter</Button>} />
            {sessions.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-soft">Aucune session ouverte.</p> : (
              <Table head={['Appareil', 'Ouverte', 'Expire']}>
                {sessions.map((s) => (
                  <tr key={s.id}><Td className="font-bold">{ua(s.user_agent)}</Td><Td className="text-ink-soft">{dateTime(s.created_at)}</Td><Td className="text-ink-soft">{date(s.expires_at)}</Td></tr>
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card>
            <CardHead title="Plan de hifz" />
            <div className="px-5 pb-5 text-[14px]">
              {!plan ? <p className="text-ink-soft">Pas encore de plan.</p> : (
                <dl className="grid grid-cols-2 gap-y-2.5">
                  <dt className="text-ink-soft font-bold">Objectif</dt><dd className="font-bold">{plan.goal_label || '-'}</dd>
                  <dt className="text-ink-soft font-bold">Échéance</dt><dd className="font-bold">{date(plan.goal_date)}</dd>
                  <dt className="text-ink-soft font-bold">Départ</dt><dd className="font-bold">{SURAHS[plan.start_surah - 1] || '-'}</dd>
                  <dt className="text-ink-soft font-bold">Sens</dt><dd className="font-bold">{plan.direction === 'backward' ? 'De la fin vers le début' : plan.direction === 'forward' ? 'Du début vers la fin' : plan.direction || '-'}</dd>
                  <dt className="text-ink-soft font-bold">Nouveaux / jour</dt><dd className="font-bold">{plan.daily_new} versets</dd>
                  <dt className="text-ink-soft font-bold">Manzil / jour</dt><dd className="font-bold">{plan.manzil_daily}</dd>
                </dl>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Groupes" />
            <div className="px-5 pb-5 space-y-2">
              {groups.length === 0 ? <p className="text-sm text-ink-soft">Dans aucun groupe.</p> : groups.map((g) => (
                <Link key={g.id} to={`/groupes/${g.id}`} className="flex items-center justify-between gap-3 p-3 rounded-xl border-2 border-line hover:bg-lagon-bg">
                  <div className="min-w-0"><div className="font-extrabold truncate">{g.name}</div><div className="text-[13px] text-ink-soft">{GROUP_KIND[g.kind]} · {MEMBER_ROLE[g.role] || g.role}</div></div>
                  {g.is_owner && <Badge tone="lagon">Créateur</Badge>}
                </Link>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Rappels après la prière" />
            <div className="px-5 pb-5 text-sm">
              {reminders.length === 0 ? <p className="text-ink-soft">Aucun rappel activé.</p> : reminders.map((r, i) => (
                <p key={i} className="font-bold">{(r.prayers || []).map((p) => PRAYERS[p] || p).join(', ')} <span className="text-ink-soft font-semibold">· {r.offset_min} min après · {r.tz}</span></p>
              ))}
            </div>
          </Card>

          <Card>
            <CardHead title="Notes internes" sub="Visibles uniquement par l'équipe admin" right={write && <Button size="sm" variant="secondary" onClick={() => { setForm({ body: '' }); setModal('note'); }}><NotePencil weight="bold" />Ajouter</Button>} />
            <div className="px-5 pb-5 space-y-3">
              {notes.length === 0 ? <p className="text-sm text-ink-soft">Aucune note.</p> : notes.map((n) => (
                <div key={n.id} className="p-3 rounded-xl bg-[#F7F7F7]">
                  <p className="text-[14px] whitespace-pre-wrap">{n.body}</p>
                  <div className="flex items-center justify-between mt-2 text-[12px] font-bold text-ink-soft">
                    <span>{n.author_email} · {dateTime(n.created_at)}</span>
                    {write && <button className="text-danger hover:underline" onClick={() => act(() => api(`/users/${id}/notes/${n.id}`, { method: 'DELETE' }), 'Note supprimée.')}>Supprimer</button>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={modal === 'rename'} onClose={() => setModal(null)} title="Renommer"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button><Button loading={busy} onClick={() => act(() => api(`/users/${id}`, { method: 'PATCH', body: { name: form.name } }), 'Nom mis à jour.')}>Enregistrer</Button></>}>
        <Label>Nom affiché dans l'app</Label><Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      </Modal>

      <Modal open={modal === 'ban'} onClose={() => setModal(null)} title="Suspendre le compte"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={() => act(() => api(`/users/${id}/ban`, { method: 'POST', body: form }), 'Compte suspendu.')}>Suspendre</Button></>}>
        <p className="text-sm text-ink-soft mb-4">{u.email} sera déconnecté de tous ses appareils et ne pourra plus se reconnecter. Ses données sont conservées.</p>
        <div className="space-y-4">
          <div><Label hint="facultatif">Motif</Label><Input value={form.reason || ''} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex. : comportement inapproprié dans un groupe" /></div>
          <div><Label>Durée</Label>
            <Select className="w-full" value={form.days} onChange={(e) => setForm({ ...form, days: e.target.value })}>
              <option value="0">Jusqu'à réactivation</option><option value="1">1 jour</option><option value="7">7 jours</option><option value="30">30 jours</option>
            </Select></div>
        </div>
      </Modal>

      <Modal open={modal === 'logout'} onClose={() => setModal(null)} title="Déconnecter partout"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button><Button loading={busy} onClick={() => act(() => api(`/users/${id}/logout`, { method: 'POST' }), 'Sessions fermées.')}>Déconnecter</Button></>}>
        <p className="text-sm text-ink-soft">Toutes les sessions de {u.email} seront fermées. Il devra se reconnecter (ses données ne changent pas).</p>
      </Modal>

      <Modal open={modal === 'note'} onClose={() => setModal(null)} title="Note interne"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button><Button loading={busy} onClick={() => act(() => api(`/users/${id}/notes`, { method: 'POST', body: { body: form.body } }), 'Note ajoutée.')}>Ajouter</Button></>}>
        <Textarea rows={4} value={form.body || ''} onChange={(e) => setForm({ ...form, body: e.target.value })} autoFocus placeholder="Ex. : a écrit au support le 12/11 pour un souci de synchronisation." />
      </Modal>

      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Supprimer définitivement"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
          <Button variant="danger" loading={busy} disabled={(form.confirm || '').toLowerCase() !== u.email.toLowerCase()}
            onClick={async () => { setBusy(true); try { await api(`/users/${id}`, { method: 'DELETE', body: { confirm: form.confirm } }); toast('Compte supprimé.'); nav('/utilisateurs'); } catch (e) { toast(e.message, 'error'); setBusy(false); } }}>Supprimer</Button></>}>
        <p className="text-sm text-ink-soft mb-4">Le compte et toutes ses données (progression, révisions, groupes créés, khatmas, rappels) seront effacés. C'est irréversible.</p>
        <Label>Tape <span className="text-danger-dark">{u.email}</span> pour confirmer</Label>
        <Input value={form.confirm || ''} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
      </Modal>
    </>
  );
}
