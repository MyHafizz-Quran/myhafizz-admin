import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClockCounterClockwise } from '@phosphor-icons/react';
import { api, dateTime } from '../lib';
import { Card, Empty, ErrorBox, Loading, PageHead, Pager, Select, Table, Td, useApi } from '../ui';

const LABELS = {
  'user.ban': 'Compte suspendu', 'user.unban': 'Compte réactivé', 'user.delete': 'Compte supprimé', 'user.rename': 'Nom modifié',
  'user.logout_all': 'Sessions fermées', 'user.verify_email': 'Email confirmé', 'user.note': 'Note ajoutée', 'user.note_delete': 'Note supprimée',
  'users.export': 'Export CSV des utilisateurs', 'group.delete': 'Groupe supprimé', 'group.remove_member': 'Membre retiré', 'group.regenerate_code': "Code d'invitation changé",
  'challenge.create': 'Défi créé', 'challenge.update': 'Défi modifié', 'challenge.delete': 'Défi supprimé',
  'admin.add': 'Accès admin ajouté', 'admin.role': 'Rôle admin modifié', 'admin.remove': 'Accès admin retiré',
};
const FILTERS = [['', 'Toutes les actions'], ['user.', 'Utilisateurs'], ['group.', 'Groupes'], ['challenge.', 'Défis'], ['admin.', 'Équipe admin']];

function describe(r) {
  const d = r.details || {};
  const bits = [d.email, d.name, d.title, d.reason && `motif : ${d.reason}`, d.role, d.count != null && `${d.count} lignes`, d.sessions != null && `${d.sessions} session(s)`].filter(Boolean);
  return bits.join(' · ');
}

export default function Audit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, error, reload } = useApi(() => api(`/audit?${new URLSearchParams({ page, action })}`), [page, action]);
  return (
    <>
      <PageHead title="Journal" sub="Chaque action faite depuis l'admin, avec son auteur." />
      <Card>
        <div className="p-4"><Select value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>{FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
        {error ? <div className="p-4"><ErrorBox error={error} retry={reload} /></div> : !data ? <Loading /> : data.rows.length === 0 ? (
          <Empty icon={ClockCounterClockwise} title="Rien pour l'instant" text="Les actions de l'équipe s'afficheront ici." />
        ) : (
          <>
            <Table head={['Quand', 'Qui', 'Action', 'Détail']}>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap text-ink-soft">{dateTime(r.created_at)}</Td>
                  <Td className="text-[13px] font-bold">{r.actor_email}</Td>
                  <Td className="font-extrabold whitespace-nowrap">
                    {r.target_type === 'user' && r.target_id && r.action !== 'user.delete' ? <Link className="hover:underline" to={`/utilisateurs/${r.target_id}`}>{LABELS[r.action] || r.action}</Link>
                      : r.target_type === 'group' && r.action !== 'group.delete' ? <Link className="hover:underline" to={`/groupes/${r.target_id}`}>{LABELS[r.action] || r.action}</Link>
                      : LABELS[r.action] || r.action}
                  </Td>
                  <Td className="text-ink-soft text-[13px]">{describe(r) || '-'}</Td>
                </tr>
              ))}
            </Table>
            <Pager page={data.page} total={data.total} limit={data.limit} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
