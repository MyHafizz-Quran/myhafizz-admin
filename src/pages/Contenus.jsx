import { useState } from 'react';
import { api } from '../lib';
import { SURAHS } from '../surahs';
import { Badge, Button, Card, ErrorBox, Input, Label, Loading, Modal, PageHead, Segmented, Select, Table, Td, Textarea, useApi, useToast } from '../ui';

const ST = { draft: ['Brouillon', 'gray'], review: ['À vérifier', 'gold'], published: ['Publié', 'lagon'], disabled: ['Masqué', 'danger'] };
const StatusBadge = ({ s }) => <Badge tone={ST[s]?.[1] || 'gray'}>{ST[s]?.[0] || s}</Badge>;

export default function Contenus() {
  const [tab, setTab] = useState('names');
  return (
    <div>
      <PageHead title="Contenus" sub="Les 99 noms d'Allah et le lexique mot à mot. Seul ce qui est publié apparaît dans l'app."
        right={<Segmented value={tab} onChange={setTab} options={[{ value: 'names', label: "99 noms d'Allah" }, { value: 'lex', label: 'Lexique mot à mot' }]} />} />
      {tab === 'names' ? <Names /> : <Lexicon />}
    </div>
  );
}

function Names() {
  const { data, error, loading, reload } = useApi(() => api('/names'));
  const [edit, setEdit] = useState(null);
  const toast = useToast();
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const pub = data.filter((x) => x.status === 'published').length;
  return (
    <Card>
      <div className="px-5 py-4 font-bold text-ink-soft">{pub} publiés sur {data.length}</div>
      <Table head={['N°', 'Nom', 'Sens', 'Verset', 'Invocation', 'Statut', '']}>
        {data.map((x) => (
          <tr key={x.n}>
            <Td className="font-black">{x.n}</Td>
            <Td><div dir="rtl" className="text-[20px] leading-[1.6]" style={{ fontFamily: 'Amiri, serif' }}>{x.ar}</div><div className="font-extrabold">{x.translit}</div></Td>
            <Td className="max-w-[320px]"><div className="font-bold">{x.meaning}</div><div className="text-[13px] text-ink-soft">{x.explanation}</div></Td>
            <Td>{x.verse_ref || '—'}</Td>
            <Td className="text-[13px]">{x.invocation_src || '—'}</Td>
            <Td><StatusBadge s={x.status} /></Td>
            <Td><Button size="sm" variant="secondary" onClick={() => setEdit({ ...x })}>Modifier</Button></Td>
          </tr>
        ))}
      </Table>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit ? `Nom n° ${edit.n}` : ''} width={620}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button onClick={async () => {
          try { await api(`/names/${edit.n}`, { method: 'PUT', body: edit }); toast('Enregistré'); setEdit(null); reload(); } catch (e) { toast(e.message, 'error'); }
        }}>Enregistrer</Button></>}>
        {edit && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Arabe</Label><Input dir="rtl" value={edit.ar} onChange={(e) => setEdit({ ...edit, ar: e.target.value })} /></div>
              <div><Label>Phonétique</Label><Input value={edit.translit} onChange={(e) => setEdit({ ...edit, translit: e.target.value })} /></div>
            </div>
            <div><Label>Sens (court)</Label><Input value={edit.meaning} onChange={(e) => setEdit({ ...edit, meaning: e.target.value })} /></div>
            <div><Label>Explication</Label><Textarea rows={3} value={edit.explanation} onChange={(e) => setEdit({ ...edit, explanation: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label hint="ex. 59:23">Verset</Label><Input value={edit.verse_ref || ''} onChange={(e) => setEdit({ ...edit, verse_ref: e.target.value })} /></div>
              <div className="col-span-2"><Label>Statut</Label><Select className="w-full" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</Select></div>
            </div>
            <div><Label>Verset en arabe</Label><Textarea dir="rtl" rows={2} value={edit.verse_ar || ''} onChange={(e) => setEdit({ ...edit, verse_ar: e.target.value })} /></div>
            <div><Label>Verset en français</Label><Textarea rows={2} value={edit.verse_fr || ''} onChange={(e) => setEdit({ ...edit, verse_fr: e.target.value })} /></div>
            <div><Label hint="laisser vide s'il n'y en a pas d'authentique">Invocation</Label><Textarea rows={3} value={edit.invocation || ''} onChange={(e) => setEdit({ ...edit, invocation: e.target.value })} /></div>
            <div><Label>Source de l'invocation</Label><Input value={edit.invocation_src || ''} onChange={(e) => setEdit({ ...edit, invocation_src: e.target.value })} /></div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Lexicon() {
  const sum = useApi(() => api('/lexicon/summary'));
  const [surah, setSurah] = useState(1);
  const words = useApi(() => api(`/lexicon/${surah}`), [surah]);
  const [draft, setDraft] = useState({});
  const toast = useToast();
  if (sum.loading) return <Loading />;
  if (sum.error) return <ErrorBox error={sum.error} retry={sum.reload} />;
  const k = (w) => `${w.ayah}:${w.pos}`;
  const save = async (w, status) => {
    try {
      const fr = draft[k(w)] ?? w.fr ?? '';
      await api(`/lexicon/${w.surah}/${w.ayah}/${w.pos}`, { method: 'PATCH', body: { fr, ...(status ? { status } : {}) } });
      setDraft((d) => { const n = { ...d }; delete n[k(w)]; return n; });
      words.reload(); sum.reload();
    } catch (e) { toast(e.message, 'error'); }
  };
  const cur = sum.data.find((x) => x.surah === surah);
  return (
    <Card>
      <div className="px-5 py-4 flex flex-wrap items-center gap-3">
        <Select value={surah} onChange={(e) => setSurah(Number(e.target.value))}>
          {sum.data.map((x) => <option key={x.surah} value={x.surah}>{x.surah}. {SURAHS[x.surah - 1]} · {x.published}/{x.words} publiés</option>)}
        </Select>
        {cur && <span className="font-bold text-ink-soft">{cur.fr} sens écrits, {cur.published} publiés sur {cur.words} mots</span>}
        <div className="flex-1" />
        <Button size="sm" onClick={async () => { try { const r = await api(`/lexicon/${surah}/publish`, { method: 'POST' }); toast(`${r.count} mots publiés`); words.reload(); sum.reload(); } catch (e) { toast(e.message, 'error'); } }}>Publier tous les sens écrits</Button>
      </div>
      <p className="px-5 pb-3 text-[13px] font-semibold text-ink-soft">L'anglais (Quran.com) s'affiche dans l'app tant que le français d'un mot n'est pas publié.</p>
      {words.loading ? <Loading /> : words.error ? <ErrorBox error={words.error} retry={words.reload} /> : (
        <Table head={['Verset', 'Mot', 'Anglais', 'Français', 'Statut', '']}>
          {words.data.map((w) => (
            <tr key={k(w)}>
              <Td className="font-bold whitespace-nowrap">{w.ayah}:{w.pos}</Td>
              <Td><span dir="rtl" className="text-[20px]" style={{ fontFamily: 'Amiri, serif' }}>{w.ar}</span></Td>
              <Td className="text-[13px] text-ink-soft">{w.en}</Td>
              <Td className="min-w-[220px]"><Input value={draft[k(w)] ?? w.fr ?? ''} placeholder="Sens en français" onChange={(e) => setDraft({ ...draft, [k(w)]: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') save(w); }} /></Td>
              <Td><StatusBadge s={w.status} /></Td>
              <Td className="whitespace-nowrap">
                {draft[k(w)] !== undefined && <Button size="sm" variant="secondary" onClick={() => save(w)}>Enregistrer</Button>}{' '}
                {w.status !== 'published' ? <Button size="sm" onClick={() => save(w, 'published')}>Publier</Button> : <Button size="sm" variant="secondary" onClick={() => save(w, 'review')}>Retirer</Button>}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}
