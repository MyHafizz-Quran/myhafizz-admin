import { useState } from 'react';
import { UserPlus, Trash } from '@phosphor-icons/react';
import { useMe } from '../me';
import { api, ago, ROLE_LABEL } from '../lib';
import { Badge, Button, Card, ErrorBox, Input, Label, Loading, Modal, PageHead, Select, Table, Td, useApi, useToast } from '../ui';

const ROLE_HELP = {
  owner: "Tout, y compris gérer l'équipe admin.",
  admin: "Tout sauf gérer l'équipe : modération, défis, groupes.",
  viewer: 'Consulte les chiffres et les fiches, sans rien modifier.',
};

export default function Team() {
  const me = useMe();
  const owner = me.role === 'owner';
  const toast = useToast();
  const { data, error, reload } = useApi(() => api('/admins'), []);
  const [add, setAdd] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn, msg) => {
    setBusy(true);
    try { await fn(); toast(msg); setAdd(null); setDel(null); reload(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Équipe admin" sub="Les personnes autorisées à entrer ici. Base de données admin, séparée de l'app."
        right={owner && <Button onClick={() => setAdd({ email: '', name: '', role: 'admin' })}><UserPlus weight="bold" />Ajouter</Button>} />
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {Object.entries(ROLE_HELP).map(([r, t]) => <Card key={r} className="p-4"><div className="font-extrabold text-ink">{ROLE_LABEL[r]}</div><p className="text-[13px] text-ink-soft mt-1">{t}</p></Card>)}
      </div>
      <Card>
        {error ? <div className="p-4"><ErrorBox error={error} retry={reload} /></div> : !data ? <Loading /> : (
          <Table head={['Personne', 'Rôle', 'Compte', 'Dernière visite', 'Ajouté par', '']}>
            {data.map((a) => (
              <tr key={a.email}>
                <Td><div className="font-extrabold">{a.name || '-'}</div><div className="text-[13px] text-ink-soft">{a.email}</div></Td>
                <Td>{owner && a.email !== me.email ? (
                  <Select className="h-9" value={a.role} onChange={(e) => run(() => api(`/admins/${encodeURIComponent(a.email)}`, { method: 'PATCH', body: { role: e.target.value } }), 'Rôle modifié.')}>
                    {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                  </Select>
                ) : <Badge tone={a.role === 'owner' ? 'lagon' : 'gray'}>{ROLE_LABEL[a.role]}</Badge>}</Td>
                <Td>{a.has_account ? (a.email_verified ? <Badge tone="lagon">Activé</Badge> : <Badge tone="gold">Email à confirmer</Badge>) : <Badge>Invitation en attente</Badge>}</Td>
                <Td className="text-ink-soft">{a.last_seen_at ? ago(a.last_seen_at) : 'jamais'}</Td>
                <Td className="text-ink-soft text-[13px]">{a.added_by}</Td>
                <Td className="text-right">{owner && a.email !== me.email && <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => setDel(a)}><Trash weight="bold" /></Button>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {!owner && <p className="text-sm text-ink-soft font-semibold mt-4">Seul un propriétaire peut ajouter ou retirer des personnes.</p>}

      <Modal open={!!add} onClose={() => setAdd(null)} title="Donner accès à l'admin"
        footer={<><Button variant="secondary" onClick={() => setAdd(null)}>Annuler</Button><Button loading={busy} onClick={() => run(() => api('/admins', { method: 'POST', body: add }), 'Accès ajouté.')}>Ajouter</Button></>}>
        {add && <div className="space-y-4">
          <div><Label>Email</Label><Input type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} autoFocus /></div>
          <div><Label hint="facultatif">Nom</Label><Input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></div>
          <div><Label>Rôle</Label><Select className="w-full" value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })}>
            {Object.keys(ROLE_LABEL).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>
            <p className="text-[13px] text-ink-soft mt-1.5">{ROLE_HELP[add.role]}</p></div>
          <p className="text-[13px] text-ink-soft bg-lagon-bg rounded-xl p-3">Envoie-lui l'adresse de l'admin. Il choisit « Activer mon accès » avec cet email, puis confirme avec le code reçu.</p>
        </div>}
      </Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title="Retirer l'accès"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={() => run(() => api(`/admins/${encodeURIComponent(del.email)}`, { method: 'DELETE' }), 'Accès retiré.')}>Retirer</Button></>}>
        <p className="text-sm text-ink-soft">{del?.email} ne pourra plus ouvrir l'admin.</p>
      </Modal>
    </>
  );
}
