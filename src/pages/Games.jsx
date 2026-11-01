import { useEffect, useRef, useState } from 'react';
import { Plus, PencilSimple, Trash, GameController, DownloadSimple, UploadSimple, MagnifyingGlass, Check } from '@phosphor-icons/react';
import { useMe, canWrite } from '../me';
import { api, date, num } from '../lib';
import { Badge, Button, Card, CardHead, Empty, ErrorBox, Input, Label, Loading, Modal, PageHead, Pager, Segmented, Select, Table, Td, Textarea, useApi, useToast } from '../ui';

export const CATS = { sira: 'Sira', prophetes: 'Prophètes', coran: 'Coran', compagnons: 'Compagnons', histoire: 'Histoire', croyance: 'Croyance', pratique: 'Pratique', hadith: 'Hadith', calendrier: 'Calendrier', hadith_vf: 'Hadith ou pas ?' };
const DIFF = { 1: 'Facile', 2: 'Moyen', 3: 'Difficile' };
const STATUS = { draft: ['Brouillon', 'gray'], review: ['À vérifier', 'gold'], published: ['Publiée', 'lagon'], disabled: ['Désactivée', 'danger'] };
const GAMES = { lettres: 'Lettres éclair', ilm: 'Al-Ilm', sourate: 'Quelle sourate ?', suite: 'La suite du verset', ordre: "Remets dans l'ordre", hadith: 'Hadith ou pas ?' };
const EMPTY = { category: 'sira', difficulty: 1, type: 'qcm', question: '', choices: ['', '', '', ''], answer: 0, explanation: '', source: '', note: '', status: 'draft' };

export default function Games() {
  const [tab, setTab] = useState('questions');
  return (
    <>
      <PageHead title="Jeux" sub="Questions et réglages appliqués à tous les joueurs, sans mise à jour de l'app."
        right={<Segmented value={tab} onChange={setTab} options={[{ value: 'questions', label: 'Questions Al-Ilm' }, { value: 'settings', label: 'Réglages des jeux' }]} />} />
      {tab === 'questions' ? <Questions /> : <Settings />}
    </>
  );
}

function Questions() {
  const write = canWrite(useMe());
  const toast = useToast();
  const [f, setF] = useState({ category: '', difficulty: '', status: '', search: '', page: 1 });
  const [search, setSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setF((x) => ({ ...x, search, page: 1 })), 300); return () => clearTimeout(t); }, [search]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '')).toString();
  const { data, error, reload } = useApi(() => api(`/games/questions?${qs}`), [qs]);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const file = useRef();

  const save = async () => {
    setBusy(true);
    try {
      await api(edit.id ? `/games/questions/${edit.id}` : '/games/questions', { method: edit.id ? 'PUT' : 'POST', body: edit });
      toast(edit.status === 'published' ? 'Question publiée : elle apparaît déjà dans le jeu.' : 'Question enregistrée.'); setEdit(null); reload();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const setStatus = async (row, status) => {
    try { await api(`/games/questions/${row.id}/status`, { method: 'PATCH', body: { status } }); reload(); } catch (e) { toast(e.message, 'error'); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/games/questions/${del.id}`, { method: 'DELETE' }); toast('Question supprimée.'); setDel(null); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const exportJson = async () => {
    try {
      const rows = await api('/games/questions/export.json');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
      a.download = 'myhafizz-questions.json'; a.click();
    } catch (e) { toast(e.message, 'error'); }
  };
  const importJson = async (e) => {
    const fl = e.target.files?.[0]; e.target.value = '';
    if (!fl) return;
    try {
      const list = JSON.parse(await fl.text());
      const r = await api('/games/questions/import', { method: 'POST', body: list });
      toast(`${r.imported} question(s) importée(s) en « À vérifier »${r.errors.length ? `, ${r.errors.length} refusée(s) : ${r.errors[0]}` : ''}.`, r.errors.length ? 'error' : undefined);
      reload();
    } catch (err) { toast(err.message || 'Fichier JSON illisible.', 'error'); }
  };
  const c = data?.counts || {};
  const total = Object.values(c).reduce((a, b) => a + b, 0);

  return (
    <>
      <Card className="mb-4">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="font-extrabold text-ink mr-auto">{num(total)} questions <span className="text-ink-soft font-bold">· {num(c.published)} publiées · {num(c.review)} à vérifier · {num(c.draft)} brouillons · {num(c.disabled)} désactivées</span></div>
          <Button variant="secondary" onClick={exportJson}><DownloadSimple weight="bold" />Exporter</Button>
          {write && <><Button variant="secondary" onClick={() => file.current.click()}><UploadSimple weight="bold" />Importer (JSON)</Button>
            <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={importJson} />
            <Button onClick={() => setEdit({ ...EMPTY, choices: ['', '', '', ''] })}><Plus weight="bold" />Nouvelle question</Button></>}
        </div>
        <div className="px-4 pb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]"><MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" /><Input className="pl-9 w-full" placeholder="Rechercher une question ou un identifiant" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, page: 1 })}><option value="">Toutes catégories</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select value={f.difficulty} onChange={(e) => setF({ ...f, difficulty: e.target.value, page: 1 })}><option value="">Toutes difficultés</option>{Object.entries(DIFF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          <Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, page: 1 })}><option value="">Tous statuts</option>{Object.entries(STATUS).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}</Select>
        </div>
      </Card>
      <Card>
        {error ? <div className="p-4"><ErrorBox error={error} retry={reload} /></div> : !data ? <Loading /> : data.rows.length === 0 ? (
          <Empty icon={GameController} title="Aucune question" text="Aucune question ne correspond à ces filtres." />
        ) : (<>
          <Table head={['Question', 'Catégorie', 'Difficulté', 'Statut', { label: 'Réussite', right: true }, 'Modifiée', '']}>
            {data.rows.map((r) => (
              <tr key={r.id}>
                <Td><div className="font-bold max-w-[520px]">{r.question}</div><div className="text-[12px] text-ink-soft">{r.id} · réponse : {r.choices[r.answer]}</div></Td>
                <Td className="whitespace-nowrap">{CATS[r.category]}</Td>
                <Td className="whitespace-nowrap">{DIFF[r.difficulty]}</Td>
                <Td>{write ? (
                  <Select className="h-8 text-[13px]" value={r.status} onChange={(e) => setStatus(r, e.target.value)}>{Object.entries(STATUS).map(([k, [v]]) => <option key={k} value={k}>{v}</option>)}</Select>
                ) : <Badge tone={STATUS[r.status][1]}>{STATUS[r.status][0]}</Badge>}</Td>
                <Td className="text-right whitespace-nowrap">{r.plays ? `${Math.round((r.correct / r.plays) * 100)} %` : '-'}<div className="text-[12px] text-ink-soft">{r.plays ? `${num(r.plays)} réponses` : ''}</div></Td>
                <Td className="text-ink-soft whitespace-nowrap text-[13px]">{date(r.updated_at)}<div>{r.updated_by === 'import' ? 'import initial' : r.updated_by}</div></Td>
                <Td className="text-right whitespace-nowrap">{write && <>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...r, choices: [...r.choices] })}><PencilSimple weight="bold" /></Button>
                  <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => setDel(r)}><Trash weight="bold" /></Button>
                </>}</Td>
              </tr>
            ))}
          </Table>
          <Pager page={data.page} total={data.total} limit={data.limit} onPage={(page) => setF({ ...f, page })} />
        </>)}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Modifier la question ${edit.id}` : 'Nouvelle question'} width={960}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button loading={busy} onClick={save}>Enregistrer</Button></>}>
        {edit && <QuestionForm edit={edit} setEdit={setEdit} />}
      </Modal>
      <Modal open={!!del} onClose={() => setDel(null)} title="Supprimer la question"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={remove}>Supprimer</Button></>}>
        <p className="text-sm text-ink-soft">« {del?.question} » sera supprimée définitivement avec ses statistiques. Pour la retirer du jeu sans la perdre, passe-la plutôt en « Désactivée ».</p>
      </Modal>
    </>
  );
}

function QuestionForm({ edit, setEdit }) {
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const choices = edit.type === 'vrai_faux' ? (edit.category === 'hadith_vf' ? ['Hadith authentique', 'Pas un hadith'] : ['Vrai', 'Faux']) : edit.choices.length === 4 ? edit.choices : ['', '', '', ''];
  return (
    <div className="grid grid-cols-[1fr_300px] gap-6">
      <div className="space-y-4">
        <div><Label>Question</Label><Textarea rows={2} value={edit.question} onChange={set('question')} autoFocus /></div>
        <div className="grid grid-cols-3 gap-4">
          <div><Label>Catégorie</Label><Select className="w-full" value={edit.category} onChange={set('category')}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
          <div><Label>Difficulté</Label><Select className="w-full" value={edit.difficulty} onChange={(e) => setEdit({ ...edit, difficulty: +e.target.value })}>{Object.entries(DIFF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></div>
          <div><Label>Type</Label><Select className="w-full" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value, answer: 0, choices: e.target.value === 'vrai_faux' ? ['Vrai', 'Faux'] : ['', '', '', ''] })}><option value="qcm">QCM (4 choix)</option><option value="vrai_faux">Vrai ou faux</option></Select></div>
        </div>
        <div>
          <Label hint="coche la bonne réponse">Réponses</Label>
          <div className="space-y-2">{choices.map((ch, k) => (
            <div key={k} className="flex items-center gap-2">
              <button type="button" onClick={() => setEdit({ ...edit, answer: k })} aria-label="Bonne réponse"
                className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center shrink-0 ${edit.answer === k ? 'bg-lagon border-lagon text-white' : 'border-line text-ink-soft'}`}>{edit.answer === k ? <Check weight="bold" /> : 'ABCD'[k]}</button>
              <Input className="flex-1" value={ch} disabled={edit.type === 'vrai_faux'} onChange={(e) => { const c = [...choices]; c[k] = e.target.value; setEdit({ ...edit, choices: c }); }} />
            </div>
          ))}</div>
        </div>
        <div><Label hint="obligatoire pour publier">Explication montrée après la réponse</Label><Textarea rows={3} value={edit.explanation} onChange={set('explanation')} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label hint="obligatoire pour publier">Source</Label><Input className="w-full" value={edit.source} onChange={set('source')} placeholder="Ar-Rahiq al-Makhtum" /></div>
          <div><Label hint="facultatif">Note (divergence d'avis…)</Label><Input className="w-full" value={edit.note} onChange={set('note')} /></div>
        </div>
        <div><Label>Statut</Label><Segmented value={edit.status} onChange={(status) => setEdit({ ...edit, status })} options={Object.entries(STATUS).map(([value, [label]]) => ({ value, label }))} /></div>
      </div>
      <div>
        <Label>Aperçu mobile</Label>
        <div className="rounded-[28px] border-2 border-line bg-[#EFF9F9] p-4 text-[13px]">
          <div className="text-[11px] font-extrabold text-ink-soft">{edit.category === 'hadith_vf' ? 'Hadith ou pas ?' : `Al-Ilm · ${CATS[edit.category]}`}</div>
          <div className="font-black text-[15px] text-ink mt-1 mb-3 leading-snug">{edit.question || 'La question apparaîtra ici'}</div>
          <div className="space-y-2">{choices.map((ch, k) => (
            <div key={k} className={`rounded-xl border-2 border-b-4 px-2.5 py-2 font-extrabold flex gap-2 ${edit.answer === k ? 'border-lagon bg-lagon-tint text-lagon-text' : 'border-line bg-white'}`}><span>{edit.type === 'vrai_faux' ? (k ? 'F' : 'V') : 'ABCD'[k]}</span>{ch || '…'}</div>
          ))}</div>
          <div className="mt-3 rounded-xl bg-white border-2 border-line p-2.5">
            <div className="font-extrabold text-ink">Réponse : {choices[edit.answer] || '…'}</div>
            <div className="text-ink-soft mt-0.5">{edit.explanation || "L'explication s'affiche après chaque réponse."}</div>
            {edit.source && <div className="text-[11px] font-bold text-ink-soft mt-1">Source : {edit.source}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const write = canWrite(useMe());
  const toast = useToast();
  const { data, error, reload } = useApi(() => api('/games/settings'), []);
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setS(structuredClone(data.settings)); }, [data]);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!s) return <Loading />;
  const rule = (k) => (e) => setS({ ...s, rules: { ...s.rules, [k]: e.target.value } });
  const save = async () => {
    setBusy(true);
    try { await api('/games/settings', { method: 'PUT', body: s }); toast('Réglages appliqués à tous les joueurs.'); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const plays = Object.fromEntries((data.plays || []).map((p) => [p.game, p]));
  const R = ({ k, label, hint, ...p }) => <div><Label hint={hint}>{label}</Label><Input type="number" className="w-full" value={s.rules[k] ?? ''} onChange={rule(k)} disabled={!write} {...p} /></div>;
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardHead title="Jeux actifs" sub="Un jeu désactivé disparaît de l'écran Jouer." />
        <div className="px-4 pb-4 space-y-2">
          {Object.entries(GAMES).map(([k, label]) => (
            <label key={k} className="flex items-center gap-3 rounded-xl border-2 border-line px-3 py-2.5">
              <input type="checkbox" className="w-5 h-5 accent-[#00A3A8]" disabled={!write} checked={s.games?.[k] !== false} onChange={(e) => setS({ ...s, games: { ...s.games, [k]: e.target.checked } })} />
              <span className="font-extrabold flex-1">{label}</span>
              <span className="text-[13px] text-ink-soft">{plays[k] ? `${num(plays[k].parties)} parties · ${num(plays[k].joueurs)} joueurs · ${plays[k].reussite} % (30 j)` : 'aucune partie (30 j)'}</span>
            </label>
          ))}
        </div>
      </Card>
      <Card>
        <CardHead title="Robot adversaire" sub="Part de mauvaises réponses du robot, selon la difficulté choisie." />
        <div className="px-4 pb-4 grid grid-cols-3 gap-4">
          {[['1', 'Facile'], ['2', 'Moyen'], ['3', 'Hafiz expert']].map(([k, label]) => (
            <div key={k}><Label hint="% d'erreurs">{label}</Label><Input type="number" min="0" max="90" className="w-full" disabled={!write}
              value={Math.round((s.robot?.[k] ?? 0) * 100)} onChange={(e) => setS({ ...s, robot: { ...s.robot, [k]: Number(e.target.value) / 100 } })} /></div>
          ))}
        </div>
      </Card>
      <Card className="col-span-2">
        <CardHead title="Duels en direct" sub={`Invitation par nom d'utilisateur, les deux joueurs en même temps, questions de tous les jeux mélangées. 30 derniers jours : ${num(data.duels?.total || 0)} défis, ${num(data.duels?.termines || 0)} joués, ${num(data.duels?.abandons || 0)} abandons, ${num(data.duels?.refuses || 0)} refusés ou sans réponse, ${num(data.duels?.joueurs || 0)} joueurs.`} />
        <div className="px-4 pb-4 grid grid-cols-4 gap-4 items-end">
          <label className="flex items-center gap-3 rounded-xl border-2 border-line px-3 h-11">
            <input type="checkbox" className="w-5 h-5 accent-[#00A3A8]" disabled={!write} checked={s.duel?.enabled !== false} onChange={(e) => setS({ ...s, duel: { ...s.duel, enabled: e.target.checked } })} />
            <span className="font-extrabold">Duels activés</span>
          </label>
          {[['questions', 'Questions par duel', '3 à 15', 7], ['secs', 'Temps par question', 'secondes', 15], ['secs_ordre', 'Temps « Remets dans l\'ordre »', 'secondes', 25], ['invite_secs', 'Délai pour accepter', 'secondes', 60],
            ['win', 'Victoire', 'points gagnés', 30], ['draw', 'Égalité', 'points gagnés', 5], ['loss', 'Défaite', 'points retirés', 10], ['quit', 'Abandon', 'points retirés', 20], ['daily_limit', 'Défis lancés par jour', 'par joueur', 30]].map(([k, label, hint, d]) => (
            <div key={k}><Label hint={hint}>{label}</Label><Input type="number" min="1" className="w-full" disabled={!write} value={s.duel?.[k] ?? d} onChange={(e) => setS({ ...s, duel: { ...s.duel, [k]: e.target.value } })} /></div>
          ))}
        </div>
      </Card>
      <Card className="col-span-2">
        <CardHead title="Khatma d'équipe" sub={`Jeu coopératif dans les groupes et binômes. 30 derniers jours : ${num(data.khatmas?.total || 0)} khatmas, ${num(data.khatmas?.terminees || 0)} terminées, ${num(data.khatmas?.en_cours || 0)} en cours, ${num(data.khatmas?.groupes || 0)} groupes.`} />
        <div className="px-4 pb-4 grid grid-cols-4 gap-4 items-end">
          <label className="flex items-center gap-3 rounded-xl border-2 border-line px-3 h-11">
            <input type="checkbox" className="w-5 h-5 accent-[#00A3A8]" disabled={!write} checked={s.khatma?.enabled !== false} onChange={(e) => setS({ ...s, khatma: { ...s.khatma, enabled: e.target.checked } })} />
            <span className="font-extrabold">Khatma d'équipe activée</span>
          </label>
          <div><Label hint="jours, séparés par des virgules">Durées proposées</Label><Input className="w-full" disabled={!write} value={Array.isArray(s.khatma?.days) ? s.khatma.days.join(', ') : s.khatma?.days ?? '3, 7, 14'} onChange={(e) => setS({ ...s, khatma: { ...s.khatma, days: e.target.value } })} /></div>
          <div><Label hint="points pour chaque membre">Bonus de fin</Label><Input type="number" min="0" className="w-full" disabled={!write} value={s.khatma?.bonus ?? 50} onChange={(e) => setS({ ...s, khatma: { ...s.khatma, bonus: e.target.value } })} /></div>
          <div><Label hint="% pour valider une sourate">Seuil de validation</Label><Input type="number" min="50" max="100" className="w-full" disabled={!write} value={s.khatma?.pct ?? 80} onChange={(e) => setS({ ...s, khatma: { ...s.khatma, pct: e.target.value } })} /></div>
        </div>
      </Card>
      <Card className="col-span-2">
        <CardHead title="Défi du jour" sub={`Mêmes questions pour tous, un essai par jour, classement du jour. Aujourd'hui : ${num(data.defi?.aujourdhui || 0)} joueurs. 30 derniers jours : ${num(data.defi?.total || 0)} défis relevés par ${num(data.defi?.joueurs || 0)} joueurs, ${data.defi?.reussite ?? 0} % de bonnes réponses.`} />
        <div className="px-4 pb-4 grid grid-cols-5 gap-4 items-end">
          <label className="flex items-center gap-3 rounded-xl border-2 border-line px-3 h-11">
            <input type="checkbox" className="w-5 h-5 accent-[#00A3A8]" disabled={!write} checked={s.defi?.enabled !== false} onChange={(e) => setS({ ...s, defi: { ...s.defi, enabled: e.target.checked } })} />
            <span className="font-extrabold">Défi activé</span>
          </label>
          {[['questions', 'Questions', '3 à 10, dès le lendemain', 5], ['per_good', 'Par bonne réponse', 'points', 5], ['streak_step', 'Par jour de série', 'points', 2], ['streak_max', 'Bonus de série max', 'points', 20]].map(([k, label, hint, d]) => (
            <div key={k}><Label hint={hint}>{label}</Label><Input type="number" min="0" className="w-full" disabled={!write} value={s.defi?.[k] ?? d} onChange={(e) => setS({ ...s, defi: { ...s.defi, [k]: e.target.value } })} /></div>
          ))}
        </div>
      </Card>
      <Card className="col-span-2">
        <CardHead title="Règles" sub="Nombre de questions, déblocage des niveaux, points et chrono." />
        <div className="px-4 pb-4 grid grid-cols-4 gap-4">
          {R({ k: "questions", label: "Questions par partie", hint: "3 à 20", min: "3", max: "20" })}
          {R({ k: "ilm_questions", label: "Questions Al-Ilm", hint: "3 à 20", min: "3", max: "20" })}
          {R({ k: "unlock_pct", label: "Réussite pour débloquer", hint: "%", min: "50", max: "100" })}
          {R({ k: "flash_seconds", label: "Chrono « Éclair »", hint: "secondes", min: "2", max: "15" })}
          {R({ k: "xp_correct", label: "Points par bonne réponse", min: "0" })}
          {R({ k: "xp_perfect", label: "Bonus sans faute", min: "0" })}
          {R({ k: "streak_bonus", label: "Bonus de série par jour", hint: "ex. 0.1 = +10 %", step: "0.05", min: "0" })}
          {R({ k: "streak_max", label: "Multiplicateur maximum", hint: "ex. 2", step: "0.5", min: "1", max: "5" })}
        </div>
        {write && <div className="px-4 pb-4 flex justify-end"><Button loading={busy} onClick={save}>Appliquer à tous</Button></div>}
      </Card>
    </div>
  );
}
