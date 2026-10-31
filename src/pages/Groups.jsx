import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass, UsersThree } from '@phosphor-icons/react';
import { api, date, GROUP_KIND } from '../lib';
import { Badge, Card, Empty, ErrorBox, Input, Loading, PageHead, Segmented, Table, Td, useApi } from '../ui';

export default function Groups() {
  const [kind, setKind] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const nav = useNavigate();
  const { data, error, reload } = useApi(() => api(`/groups?${new URLSearchParams({ q: query, kind })}`), [query, kind]);

  return (
    <>
      <PageHead title="Groupes" sub="Classes (maître et élèves), familles et cercles." />
      <Card>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <form className="relative flex-1 min-w-[220px]" onSubmit={(e) => { e.preventDefault(); setQuery(text.trim()); }}>
            <MagnifyingGlass size={18} weight="bold" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input className="pl-10" placeholder="Nom du groupe ou email du créateur" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => setQuery(text.trim())} />
          </form>
          <Segmented value={kind} onChange={setKind} options={[{ value: '', label: 'Tous' }, { value: 'class', label: 'Classes' }, { value: 'family', label: 'Familles' }, { value: 'circle', label: 'Cercles' }]} />
        </div>
        {error ? <div className="p-4"><ErrorBox error={error} retry={reload} /></div> : !data ? <Loading /> : data.length === 0 ? (
          <Empty icon={UsersThree} title="Aucun groupe" text="Les groupes créés dans l'app apparaîtront ici." />
        ) : (
          <Table head={['Groupe', 'Type', 'Créateur', { label: 'Membres', right: true }, { label: 'Leçons', right: true }, { label: 'Khatmas', right: true }, 'Créé le']}>
            {data.map((g) => (
              <tr key={g.id} className="cursor-pointer hover:bg-lagon-bg" onClick={() => nav(`/groupes/${g.id}`)}>
                <Td className="font-extrabold">{g.name}</Td>
                <Td><Badge tone={g.kind === 'class' ? 'lagon' : 'gray'}>{GROUP_KIND[g.kind]}</Badge></Td>
                <Td><div className="font-bold">{g.owner_name || '-'}</div><div className="text-[13px] text-ink-soft">{g.owner_email}</div></Td>
                <Td className="text-right font-bold">{g.members}</Td>
                <Td className="text-right">{g.assignments}</Td>
                <Td className="text-right">{g.khatmas}</Td>
                <Td className="text-ink-soft whitespace-nowrap">{date(g.created_at)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
