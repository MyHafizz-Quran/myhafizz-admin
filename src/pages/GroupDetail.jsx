import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Trash, ArrowsClockwise, UserMinus } from '@phosphor-icons/react';
import { useMe, canWrite } from '../me';
import { api, ago, date, num, GROUP_KIND, MEMBER_ROLE } from '../lib';
import { Badge, Button, Card, CardHead, ErrorBox, Input, Label, Loading, Modal, Table, Td, useApi, useToast } from '../ui';
import { SURAHS } from '../surahs';

export default function GroupDetail() {
  const { id } = useParams();
  const write = canWrite(useMe());
  const nav = useNavigate();
  const toast = useToast();
  const { data, error, reload } = useApi(() => api(`/groups/${id}`), [id]);
  const [modal, setModal] = useState(null);
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn, msg, after) => {
    setBusy(true);
    try { await fn(); toast(msg); setModal(null); after ? after() : reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const { group: g, members, assignments, khatmas } = data;

  return (
    <>
      <Link to="/groupes" className="inline-flex items-center gap-1.5 text-sm font-extrabold text-lagon-text mb-4 hover:underline"><ArrowLeft weight="bold" />Groupes</Link>
      <Card className="p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2"><h1 className="text-[24px] font-black text-ink">{g.name}</h1><Badge tone="lagon">{GROUP_KIND[g.kind]}</Badge></div>
          <p className="text-ink-soft font-semibold mt-1">Créé le {date(g.created_at)} par {g.owner_name || g.owner_email || 'compte supprimé'}</p>
          <p className="text-[13px] text-ink-soft mt-1">Code d'invitation : <span className="font-black text-ink tracking-wider">{g.invite_code}</span></p>
        </div>
        {write && <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={busy && modal === null} onClick={() => run(() => api(`/groups/${id}/regenerate-code`, { method: 'POST' }), "Nouveau code d'invitation créé.")}><ArrowsClockwise weight="bold" />Nouveau code</Button>
          <Button size="sm" variant="dangerSoft" onClick={() => { setConfirm(''); setModal('delete'); }}><Trash weight="bold" />Supprimer</Button>
        </div>}
      </Card>

      <Card className="mt-6">
        <CardHead title="Membres" sub={`${members.length} personne${members.length > 1 ? 's' : ''}`} />
        <Table head={['Membre', 'Rôle', { label: 'Versets', right: true }, 'Dernière activité', 'Arrivé le', '']}>
          {members.map((m) => (
            <tr key={m.user_id}>
              <Td><Link to={`/utilisateurs/${m.user_id}`} className="hover:underline"><div className="font-extrabold">{m.display_name || m.name || '-'}</div><div className="text-[13px] text-ink-soft">{m.email}</div></Link></Td>
              <Td>{MEMBER_ROLE[m.role] || m.role}</Td>
              <Td className="text-right font-bold">{num(m.verses)}</Td>
              <Td className="text-ink-soft">{ago(m.last_active)}</Td>
              <Td className="text-ink-soft">{date(m.joined_at)}</Td>
              <Td className="text-right">{write && m.user_id !== g.owner_id && (
                <Button size="sm" variant="ghost" onClick={() => setModal({ member: m })}><UserMinus weight="bold" />Retirer</Button>
              )}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHead title="Leçons données" sub="Les 50 dernières" />
          {assignments.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-soft">Aucune leçon.</p> : (
            <Table head={['Leçon', 'Pour le', { label: 'Faites', right: true }, { label: 'Validées', right: true }]}>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <Td><div className="font-bold">{a.title}</div><div className="text-[13px] text-ink-soft">{SURAHS[a.surah_number - 1]} {a.from_verse}-{a.to_verse}</div></Td>
                  <Td className="text-ink-soft whitespace-nowrap">{date(a.due_date)}</Td>
                  <Td className="text-right">{a.done}</Td>
                  <Td className="text-right font-bold">{a.validated}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <CardHead title="Khatmas" />
          {khatmas.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-soft">Aucune khatma.</p> : (
            <div className="px-5 pb-5 space-y-4">
              {khatmas.map((k) => (
                <div key={k.id}>
                  <div className="flex justify-between text-[14px]"><span className="font-extrabold">{k.title}</span><span className="text-ink-soft font-bold">{k.parts_done}/30 juz lus · {k.parts_taken} réservés</span></div>
                  <div className="h-2.5 rounded-full bg-[#EEEEEE] overflow-hidden mt-2"><div className="h-full bg-lagon" style={{ width: `${(k.parts_done / 30) * 100}%` }} /></div>
                  {k.target_date && <p className="text-[12px] text-ink-soft font-bold mt-1">Objectif : {date(k.target_date)}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Modal open={modal === 'delete'} onClose={() => setModal(null)} title="Supprimer le groupe"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
          <Button variant="danger" loading={busy} disabled={confirm.trim() !== g.name.trim()} onClick={() => run(() => api(`/groups/${id}`, { method: 'DELETE' }), 'Groupe supprimé.', () => nav('/groupes'))}>Supprimer</Button></>}>
        <p className="text-sm text-ink-soft mb-4">Les membres, leçons et khatmas de ce groupe seront effacés. Les comptes des membres ne sont pas touchés.</p>
        <Label>Tape <span className="text-danger-dark">{g.name}</span> pour confirmer</Label>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Modal>

      <Modal open={!!modal?.member} onClose={() => setModal(null)} title="Retirer du groupe"
        footer={<><Button variant="secondary" onClick={() => setModal(null)}>Annuler</Button>
          <Button variant="danger" loading={busy} onClick={() => run(() => api(`/groups/${id}/members/${modal.member.user_id}`, { method: 'DELETE' }), 'Membre retiré.')}>Retirer</Button></>}>
        <p className="text-sm text-ink-soft">{modal?.member?.display_name || modal?.member?.email} quittera « {g.name} ». Il pourra revenir avec le code d'invitation, sauf si tu en crées un nouveau.</p>
      </Modal>
    </>
  );
}
