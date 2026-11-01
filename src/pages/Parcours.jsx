import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { api, num, date } from '../lib';
import { Badge, Button, Card, CardHead, ErrorBox, Input, Label, Loading, Modal, PageHead, Segmented, Select, Table, Td, Textarea, useApi, useToast } from '../ui';
import { useMe, canWrite } from '../me';

const ST = { published: ['Publié', 'lagon'], review: ['À vérifier', 'gold'], hidden: ['Masqué', 'gray'] };
const StatusBadge = ({ s }) => <Badge tone={ST[s]?.[1] || 'gray'}>{ST[s]?.[0] || s}</Badge>;
const StatusSelect = ({ value, onChange, disabled }) => (
  <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
    <option value="published">Publié</option><option value="review">À vérifier</option><option value="hidden">Masqué</option>
  </Select>
);

export default function Parcours() {
  const [tab, setTab] = useState('tajwid');
  return (
    <>
      <PageHead title="Parcours" sub="Contenu du Tajwid, ligues hebdomadaires et Défi du jour. Les changements sont visibles tout de suite dans l'app."
        right={<Segmented value={tab} onChange={setTab} options={[{ value: 'tajwid', label: 'Tajwid' }, { value: 'ligues', label: 'Ligues' }, { value: 'defi', label: 'Défi du jour' }]} />} />
      {tab === 'tajwid' && <Tajwid />}
      {tab === 'ligues' && <Ligues />}
      {tab === 'defi' && <Defi />}
    </>
  );
}

function Tajwid() {
  const write = canWrite(useMe());
  const toast = useToast();
  const { data, error, loading, reload } = useApi(() => api('/tajwid'), []);
  const [unit, setUnit] = useState(1);
  const [edit, setEdit] = useState(null); // { kind: 'verse'|'rule'|'unit', row }
  const [ex, setEx] = useState(null);
  const [saving, setSaving] = useState(false);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  const u = data.units.find((x) => x.n === unit) || data.units[0];
  const st = data.stats.find((x) => x.unit === u.n);
  const save = async () => {
    setSaving(true);
    try {
      const path = edit.kind === 'verse' ? `/tajwid/verses/${edit.row.n}` : edit.kind === 'rule' ? `/tajwid/rules/${edit.row.id}` : `/tajwid/units/${edit.row.n}`;
      await api(path, { method: 'PUT', body: edit.row });
      toast('Enregistré : visible tout de suite dans l\'app.'); setEdit(null); reload();
    } catch (e) { toast(e.message, 'error'); } finally { setSaving(false); }
  };
  const openEx = async (r) => setEx({ rule: r, rows: await api(`/tajwid/rules/${r.id}/examples`) });
  const delEx = async (id) => {
    if (!confirm('Supprimer cet exemple ?')) return;
    try { await api(`/tajwid/examples/${id}`, { method: 'DELETE' }); setEx((x) => ({ ...x, rows: x.rows.filter((r) => r.id !== id) })); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const set = (k, v) => setEdit((e) => ({ ...e, row: { ...e.row, [k]: v } }));
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-4">
        {data.units.map((x) => (
          <button key={x.n} onClick={() => setUnit(x.n)} className={`h-9 px-3 rounded-xl text-[13px] font-extrabold border-2 ${x.n === u.n ? 'bg-lagon border-lagon text-white' : 'bg-white border-line text-ink-soft'}`}>{x.n === 0 ? 'Intro' : `Unité ${x.n}`}</button>
        ))}
      </div>
      <Card className="mb-4">
        <CardHead title={u.title} sub={`${u.sub || ''} · vers ${u.v_from} à ${u.v_to}`}
          right={<div className="flex items-center gap-3"><span className="text-[13px] font-bold text-ink-soft">{st ? `${num(st.players)} élèves · ${num(st.passed)} réussi · ${num(st.plays)} essais` : 'Pas encore joué'}</span>
            {write && <Button size="sm" variant="secondary" onClick={() => setEdit({ kind: 'unit', row: { ...u } })}><PencilSimple weight="bold" /></Button>}</div>} />
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHead title="Vers du poème" sub="Arabe, phonétique et traduction" />
          <Table head={['N°', 'Vers', 'Statut', '']}>
            {data.verses.filter((v) => v.unit === u.n).map((v) => (
              <tr key={v.n}><Td className="text-ink-soft">{v.n}</Td>
                <Td><p dir="rtl" className="text-[17px] leading-loose">{v.ar_a} … {v.ar_b}</p><p className="text-[13px] text-ink-soft">{v.fr}</p></Td>
                <Td><StatusBadge s={v.status} /></Td>
                <Td>{write && <Button size="sm" variant="ghost" onClick={() => setEdit({ kind: 'verse', row: { ...v } })}><PencilSimple weight="bold" /></Button>}</Td></tr>
            ))}
          </Table>
        </Card>
        <Card>
          <CardHead title="Règles" sub="Explication et exemples coraniques" />
          <Table head={['Règle', 'Exemples', 'Statut', '']}>
            {data.rules.filter((r) => r.unit === u.n).map((r) => (
              <tr key={r.id}><Td><p className="font-bold">{r.name} <span dir="rtl" className="text-ink-soft">{r.name_ar}</span></p><p className="text-[13px] text-ink-soft line-clamp-2">{r.body}</p></Td>
                <Td><button className="font-bold text-lagon-text hover:underline" onClick={() => openEx(r)}>{r.examples}</button></Td>
                <Td><StatusBadge s={r.status} /></Td>
                <Td>{write && <Button size="sm" variant="ghost" onClick={() => setEdit({ kind: 'rule', row: { ...r } })}><PencilSimple weight="bold" /></Button>}</Td></tr>
            ))}
          </Table>
          <p className="px-5 py-3 text-[13px] text-ink-soft">Les questions d'exercice du Tajwid se gèrent dans <Link to="/jeux" className="font-bold text-lagon-text">Jeux</Link>, catégorie Tajwid.</p>
        </Card>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} width={720}
        title={edit?.kind === 'verse' ? `Vers ${edit.row.n}` : edit?.kind === 'rule' ? `Règle : ${edit.row.name}` : `Unité ${edit?.row.n}`}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button loading={saving} onClick={save}>Enregistrer</Button></>}>
        {edit?.kind === 'verse' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><div><Label>1er hémistiche</Label><Input dir="rtl" className="w-full" value={edit.row.ar_a} onChange={(e) => set('ar_a', e.target.value)} /></div>
              <div><Label>2e hémistiche</Label><Input dir="rtl" className="w-full" value={edit.row.ar_b} onChange={(e) => set('ar_b', e.target.value)} /></div></div>
            <div><Label>Phonétique</Label><Input className="w-full" value={edit.row.translit} onChange={(e) => set('translit', e.target.value)} /></div>
            <div><Label>Traduction</Label><Textarea rows={3} className="w-full" value={edit.row.fr} onChange={(e) => set('fr', e.target.value)} /></div>
            <div><Label>Statut</Label><StatusSelect value={edit.row.status} onChange={(v) => set('status', v)} /></div>
          </div>)}
        {edit?.kind === 'rule' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><div><Label>Nom</Label><Input className="w-full" value={edit.row.name} onChange={(e) => set('name', e.target.value)} /></div>
              <div><Label>Nom arabe</Label><Input dir="rtl" className="w-full" value={edit.row.name_ar} onChange={(e) => set('name_ar', e.target.value)} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Étiquette</Label><Input className="w-full" value={edit.row.label} onChange={(e) => set('label', e.target.value)} /></div>
              <div><Label>Lettres concernées</Label><Input dir="rtl" className="w-full" value={edit.row.letters || ''} onChange={(e) => set('letters', e.target.value)} /></div></div>
            <div><Label>Explication</Label><Textarea rows={6} className="w-full" value={edit.row.body} onChange={(e) => set('body', e.target.value)} /></div>
            <div><Label>Statut</Label><StatusSelect value={edit.row.status} onChange={(v) => set('status', v)} /></div>
          </div>)}
        {edit?.kind === 'unit' && (
          <div className="space-y-3">
            <div><Label>Titre</Label><Input className="w-full" value={edit.row.title} onChange={(e) => set('title', e.target.value)} /></div>
            <div><Label>Titre arabe</Label><Input dir="rtl" className="w-full" value={edit.row.title_ar || ''} onChange={(e) => set('title_ar', e.target.value)} /></div>
            <div><Label>Sous-titre</Label><Input className="w-full" value={edit.row.sub || ''} onChange={(e) => set('sub', e.target.value)} /></div>
          </div>)}
      </Modal>

      <Modal open={!!ex} onClose={() => setEx(null)} width={760} title={`Exemples : ${ex?.rule.name || ''}`}>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-line">
          {ex?.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="text-[12px] font-bold text-ink-soft w-14 shrink-0">{r.surah}:{r.ayah}</span>
              <p dir="rtl" className="flex-1 text-[18px] leading-loose">{r.txt}</p>
              {write && <Button size="sm" variant="ghost" onClick={() => delEx(r.id)} aria-label="Supprimer"><Trash weight="bold" /></Button>}
            </div>
          ))}
          {ex && !ex.rows.length && <p className="py-6 text-center text-ink-soft">Aucun exemple.</p>}
        </div>
      </Modal>
    </>
  );
}

const TIERS = ['Bronze', 'Argent', 'Or', 'Saphir', 'Rubis', 'Émeraude', 'Diamant'];
function Ligues() {
  const [week, setWeek] = useState('');
  const { data, error, loading, reload } = useApi(() => api(`/leagues${week ? `?week=${week}` : ''}`), [week]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  const groups = {};
  data.members.forEach((m) => { const k = `${m.tier}-${m.grp}`; (groups[k] ||= { tier: m.tier, grp: m.grp, rows: [] }).rows.push(m); });
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {data.tiers.length ? data.tiers.map((t) => <Card key={t.tier} className="p-4"><div className="text-[13px] font-bold text-ink-soft">{TIERS[t.tier] || `Niveau ${t.tier}`}</div><div className="text-[24px] font-black">{num(t.n)}</div></Card>)
          : <Card className="p-4 col-span-full text-ink-soft font-bold">Aucun joueur en ligue pour l'instant : la première semaine commence dès qu'un élève gagne des points.</Card>}
      </div>
      {!!data.weeks.length && (
        <div className="flex items-center gap-3 mb-4"><Label>Semaine</Label>
          <Select value={week || data.week || ''} onChange={(e) => setWeek(e.target.value)}>
            {data.weeks.map((w) => <option key={w.week} value={w.week}>{date(w.week)} · {w.players} joueurs{w.closed_at ? ' · terminée' : ' · en cours'}</option>)}
          </Select></div>)}
      <div className="grid lg:grid-cols-2 gap-4">
        {Object.values(groups).map((g) => (
          <Card key={`${g.tier}-${g.grp}`}>
            <CardHead title={`${TIERS[g.tier] || `Niveau ${g.tier}`} · groupe ${g.grp}`} sub={`${g.rows.length} joueurs`} />
            <Table head={['#', 'Joueur', { label: 'Points', right: true }, 'Résultat']}>
              {g.rows.map((m, i) => <tr key={m.user_id}><Td className="text-ink-soft">{i + 1}</Td><Td><Link to={`/utilisateurs/${m.user_id}`} className="font-bold hover:text-lagon">{m.full_name || m.username || 'Sans nom'}</Link></Td>
                <Td className="text-right font-bold">{num(m.points)}</Td><Td>{m.result === 'up' ? <Badge tone="lagon">Monte</Badge> : m.result === 'down' ? <Badge tone="danger">Descend</Badge> : m.result ? <Badge>Reste</Badge> : '-'}</Td></tr>)}
            </Table>
          </Card>
        ))}
      </div>
      <p className="text-[13px] text-ink-soft mt-4">Les règles de montée et descente se règlent dans <Link to="/jeux" className="font-bold text-lagon-text">Jeux › Réglages › Ligue</Link>.</p>
    </>
  );
}

function Defi() {
  const { data, error, loading, reload } = useApi(() => api('/defi?days=60'), []);
  const [day, setDay] = useState(null);
  const det = useApi(() => (day ? api(`/defi/${day}`) : Promise.resolve(null)), [day]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (loading && !data) return <Loading />;
  return (
    <div className="grid lg:grid-cols-[1fr_1.2fr] gap-4 items-start">
      <Card>
        <CardHead title="60 derniers jours" sub="Clic sur un jour pour le détail" />
        <Table head={['Jour', { label: 'Joueurs', right: true }, { label: 'Score moyen', right: true }, { label: 'Temps moyen', right: true }]}>
          {data.map((r) => (
            <tr key={r.day} onClick={() => setDay(r.day)} className={`cursor-pointer ${day === r.day ? 'bg-lagon-tint' : 'hover:bg-[#F7F7F7]'}`}>
              <Td className="font-bold">{date(r.day)}</Td><Td className="text-right">{num(r.players)}</Td>
              <Td className="text-right">{r.avg_score == null ? '-' : `${r.avg_score} / ${r.questions}`}</Td><Td className="text-right">{r.avg_secs == null ? '-' : `${r.avg_secs} s`}</Td></tr>
          ))}
        </Table>
        {!data.length && <p className="py-8 text-center text-ink-soft font-bold">Aucun défi encore.</p>}
      </Card>
      <Card>
        <CardHead title={day ? `Défi du ${date(day)}` : 'Détail'} sub={day ? 'Réussite par question et classement' : 'Choisis un jour à gauche'} />
        {day && (det.loading || !det.data) ? <Loading /> : det.data && (
          <>
            <Table head={['Question', { label: 'Réussite', right: true }]}>
              {det.data.items.map((it, i) => <tr key={i}><Td><span className="text-ink-soft mr-2">{i + 1}.</span>{it.q}<span className="block text-[12px] text-ink-faint">{it.key}</span></Td>
                <Td className="text-right font-bold">{it.n ? `${Math.round((it.ok / it.n) * 100)} %` : '-'}</Td></tr>)}
            </Table>
            <Table head={['#', 'Joueur', { label: 'Score', right: true }, { label: 'Temps', right: true }]}>
              {det.data.results.map((r, i) => <tr key={r.user_id}><Td className="text-ink-soft">{i + 1}</Td><Td><Link to={`/utilisateurs/${r.user_id}`} className="font-bold hover:text-lagon">{r.full_name || r.username || 'Sans nom'}</Link></Td>
                <Td className="text-right font-bold">{r.score} / {r.total}</Td><Td className="text-right">{Math.round(r.ms / 1000)} s</Td></tr>)}
            </Table>
          </>
        )}
      </Card>
    </div>
  );
}
