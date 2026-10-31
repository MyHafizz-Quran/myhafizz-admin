import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MagnifyingGlass, DownloadSimple, Users as UsersIcon } from '@phosphor-icons/react';
import { api, ago, date, num } from '../lib';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Input, Loading, PageHead, Pager, Select, Table, Td, useApi, useToast } from '../ui';

const FILTERS = [
  ['all', 'Tous'], ['active', 'Actifs (7 j)'], ['new', 'Nouveaux (7 j)'], ['inactive', 'Inactifs (30 j)'], ['unverified', 'Email non confirmé'], ['banned', 'Suspendus'],
];
const SORTS = [['recent', 'Plus récents'], ['active', 'Dernière activité'], ['verses', 'Versets mémorisés'], ['name', 'Nom (A-Z)']];

export default function Users() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const filter = sp.get('filter') || 'all';
  const sort = sp.get('sort') || 'recent';
  const page = +(sp.get('page') || 1);
  const query = sp.get('q') || '';
  const [text, setText] = useState(query);
  const [exporting, setExporting] = useState(false);

  const update = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); if (k !== 'page') n.delete('page'); setSp(n, { replace: true }); };
  useEffect(() => { const t = setTimeout(() => text !== query && update('q', text.trim()), 300); return () => clearTimeout(t); }); // recherche différée

  const { data, error, loading, reload } = useApi(() => api(`/users?${new URLSearchParams({ q: query, filter, sort, page })}`), [query, filter, sort, page]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await api('/users/export.csv', { raw: true });
      const url = URL.createObjectURL(await res.blob());
      Object.assign(document.createElement('a'), { href: url, download: 'myhafizz-utilisateurs.csv' }).click();
      URL.revokeObjectURL(url);
    } catch (e) { toast(e.message, 'error'); } finally { setExporting(false); }
  };

  return (
    <>
      <PageHead title="Utilisateurs" sub={data ? `${num(data.total)} compte${data.total > 1 ? 's' : ''}` : ' '}
        right={<Button variant="secondary" onClick={exportCsv} loading={exporting}><DownloadSimple weight="bold" size={18} />Exporter CSV</Button>} />
      <Card>
        <div className="flex flex-wrap gap-3 p-4">
          <div className="relative flex-1 min-w-[220px]">
            <MagnifyingGlass size={18} weight="bold" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input className="pl-10" placeholder="Rechercher un nom ou un email" value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <Select value={filter} onChange={(e) => update('filter', e.target.value === 'all' ? '' : e.target.value)}>
            {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => update('sort', e.target.value === 'recent' ? '' : e.target.value)}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </div>
        {error ? <div className="p-4"><ErrorBox error={error} retry={reload} /></div> : loading && !data ? <Loading /> : data.rows.length === 0 ? (
          <Empty icon={UsersIcon} title="Aucun utilisateur" text="Change la recherche ou le filtre." />
        ) : (
          <>
            <Table head={['Utilisateur', 'Inscrit le', 'Dernière activité', { label: 'Versets', right: true }, { label: 'Groupes', right: true }, 'Statut']}>
              {data.rows.map((u) => (
                <tr key={u.id} onClick={() => nav(`/utilisateurs/${u.id}`)} className="cursor-pointer hover:bg-lagon-bg">
                  <Td>
                    <div className="flex items-center gap-3 min-w-[220px]">
                      <Avatar name={u.name || u.email} src={u.avatar_url || u.image} />
                      <div className="min-w-0"><div className="font-extrabold truncate">{u.name || 'Sans nom'}</div><div className="text-[13px] text-ink-soft truncate">{u.email}</div></div>
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-ink-soft">{date(u.created_at)}</Td>
                  <Td className="whitespace-nowrap text-ink-soft">{ago(u.last_active)}</Td>
                  <Td className="text-right font-bold">{num(u.verses)}</Td>
                  <Td className="text-right">{u.groups}</Td>
                  <Td>
                    <div className="flex gap-1.5">
                      {u.banned ? <Badge tone="danger">Suspendu</Badge> : !u.email_verified ? <Badge tone="gold">Non confirmé</Badge> : <Badge tone="lagon">Actif</Badge>}
                      {u.providers?.includes('google') && <Badge>Google</Badge>}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            <Pager page={data.page} total={data.total} limit={data.limit} onPage={(p) => update('page', String(p))} />
          </>
        )}
      </Card>
    </>
  );
}
