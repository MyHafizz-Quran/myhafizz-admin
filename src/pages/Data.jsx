import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DownloadSimple } from '@phosphor-icons/react';
import { api, num } from '../lib';
import { Card, CardHead, ErrorBox, Loading, PageHead, Segmented, Table, Td, cx } from '../ui';
import { ChartBox, Spark, C, fill, dayLabel } from '../chart';

// Garde les données affichées pendant le rechargement (pas de clignotement quand on change de période)
function useData(path, deps, { every } = {}) {
  const [s, set] = useState({ data: null, error: null });
  const run = useCallback(async () => {
    try { set({ data: await api(path), error: null }); } catch (error) { set((p) => ({ data: p.data, error: p.data ? null : error })); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); if (every) { const t = setInterval(run, every); return () => clearInterval(t); } }, [run]);
  return { ...s, reload: run };
}

function csv(name, rows) {
  if (!rows?.length) return;
  const keys = Object.keys(rows[0]);
  const esc = (v) => { const s = Array.isArray(v) ? v.join(' ') : v ?? ''; return /[",\n;]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : s; };
  const blob = new Blob(['\ufeff' + [keys.join(';'), ...rows.map((r) => keys.map((k) => esc(r[k])).join(';'))].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `myhafizz-${name}.csv`; a.click();
}
const Csv = ({ name, rows }) => (
  <button onClick={() => csv(name, rows)} disabled={!rows?.length} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[13px] font-extrabold text-ink-soft border-2 border-line bg-white hover:text-ink disabled:opacity-40">
    <DownloadSimple size={15} weight="bold" />CSV
  </button>
);

const delta = (cur, prev, unit = '%') => {
  if (cur == null || prev == null) return null;
  if (unit === 'pts') { const d = Math.round(cur - prev); return { up: d >= 0, txt: `${d >= 0 ? '+' : '−'}${Math.abs(d)} pts` }; }
  if (!prev) return cur ? { up: true, txt: 'nouveau' } : null;
  const d = Math.round(((cur - prev) / prev) * 100);
  return { up: d >= 0, txt: `${d >= 0 ? '+' : '−'}${Math.abs(d)} %` };
};
function Kpi({ label, value, d, spark, hint }) {
  return (
    <Card className="p-4">
      <div className="text-ink-soft text-[13px] font-bold">{label}</div>
      <div className="mt-1 text-[26px] leading-tight font-black text-ink">{value}</div>
      <div className={cx('text-[13px] font-extrabold', d ? (d.up ? 'text-[#2BA84A]' : 'text-danger') : 'text-ink-faint')}>{d ? `${d.txt} vs période précédente` : hint || 'pas encore de comparaison'}</div>
      {spark && <div className="mt-1.5"><Spark data={spark} /></div>}
    </Card>
  );
}

const PERIODS = [{ value: 7, label: '7 j' }, { value: 30, label: '30 j' }, { value: 90, label: '90 j' }, { value: 365, label: '1 an' }];
const TABS = [['vue', "Vue d'ensemble"], ['retention', 'Rétention'], ['apprentissage', 'Apprentissage'], ['jeux', 'Jeux'], ['notifs', 'Notifications'], ['direct', 'En direct']];
const Empty = ({ children = "Pas encore assez de données." }) => <p className="py-10 text-center text-sm font-bold text-ink-faint">{children}</p>;

export default function Data() {
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('v') || 'vue');
  const [days, setDays] = useState(30);
  const go = (t) => { setTab(t); history.replaceState(null, '', `?v=${t}`); };
  return (
    <>
      <PageHead title="Données" sub="Courbes et analyses de l'app, mises à jour en direct."
        right={tab !== 'direct' && tab !== 'retention' ? <Segmented value={days} onChange={setDays} options={PERIODS} /> : null} />
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => go(k)} className={cx('h-10 px-4 rounded-xl font-extrabold text-[14px] border-2',
            tab === k ? 'bg-lagon border-lagon text-white shadow-[0_4px_0_#007C80]' : 'bg-white border-line text-ink-soft hover:text-ink')}>{l}</button>
        ))}
      </div>
      {tab === 'vue' && <Overview days={days} />}
      {tab === 'retention' && <Retention />}
      {tab === 'apprentissage' && <Learning days={days} />}
      {tab === 'jeux' && <Games days={days} />}
      {tab === 'notifs' && <Notifs days={days} />}
      {tab === 'direct' && <Live />}
    </>
  );
}

function Overview({ days }) {
  const ov = useData(`/data/overview?days=${days}`, [days]);
  const ac = useData(`/data/active?days=${days}`, [days]);
  const fu = useData(`/data/funnel?days=${days}`, [days]);
  const hr = useData(`/data/hours?days=${days}`, [days]);
  if (ov.error) return <ErrorBox error={ov.error} retry={ov.reload} />;
  const o = ov.data;
  return (
    <>
      {!o ? <Loading /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi label="Actifs aujourd'hui" value={num(o.active_today)} d={delta(o.active_today, o.active_today_prev)} spark={o.spark.map((x) => x.active)} />
          <Kpi label={`Inscriptions (${days} j)`} value={num(o.signups)} d={delta(o.signups, o.signups_prev)} spark={o.spark.map((x) => x.signups)} />
          <Kpi label="Rétention J7" value={o.retention_d7 == null ? '-' : `${o.retention_d7} %`} d={delta(o.retention_d7, o.retention_d7_prev, 'pts')} hint="calculée après 2 semaines d'inscriptions" />
          <Kpi label="Jours actifs par élève" value={o.days_per_user ?? '-'} d={delta(+o.days_per_user, +o.days_per_user_prev)} hint={`sur ${days} jours`} />
        </div>
      )}
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4 mt-4">
        <Card>
          <CardHead title="Utilisateurs actifs" sub="Par jour, sur 7 jours et sur 30 jours glissants" right={<Csv name="actifs" rows={ac.data} />} />
          <div className="px-5 pb-5">{!ac.data ? <Loading /> : (
            <ChartBox labels={ac.data.map((r) => dayLabel(r.day))} datasets={[
              { label: '30 jours', data: ac.data.map((r) => r.mau), borderColor: C.g },
              { label: '7 jours', data: ac.data.map((r) => r.wau), borderColor: C.ps },
              { label: 'Jour', data: ac.data.map((r) => r.dau), borderColor: C.p, backgroundColor: fill, fill: true, borderWidth: 3 },
            ]} />)}</div>
        </Card>
        <Card>
          <CardHead title="Parcours d'inscription" sub={`Inscrits des ${days} derniers jours`} />
          <div className="px-5 pb-5">{!fu.data ? <Loading /> : <Funnel f={fu.data} />}</div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHead title="Heures d'activité" sub="Révisions, jeux, leçons et Tafsir, à l'heure GMT" />
        <div className="px-5 pb-5">{!hr.data ? <Loading /> : (
          <ChartBox height={200} legend={false} labels={hr.data.map((r) => `${r.h}h`)} datasets={[{ label: 'Actions', data: hr.data.map((r) => r.n), borderColor: C.p, backgroundColor: fill, fill: true, borderWidth: 3, tension: 0.45 }]} />)}</div>
      </Card>
    </>
  );
}

function Funnel({ f }) {
  const steps = [['Inscription', f.signups], ['E-mail confirmé', f.verified], ['Onboarding terminé', f.onboarded], ['1re séance', f.first_session], ['Revenu après 7 j', f.eligible_d7 ? f.returned_d7 : null]];
  const max = Math.max(1, f.signups);
  let worst = null;
  for (let i = 1; i < steps.length - 1; i++) { const a = steps[i - 1][1], b = steps[i][1]; if (a && b != null) { const loss = 1 - b / a; if (!worst || loss > worst.loss) worst = { i, loss }; } }
  if (!f.signups) return <Empty>Aucune inscription sur la période.</Empty>;
  return (
    <div className="space-y-2.5">
      {steps.map(([l, v], i) => (
        <div key={l}>
          <div className="flex justify-between text-[13.5px] font-extrabold"><span>{l}</span><span>{v == null ? <span className="text-ink-faint">dans 7 j</span> : `${num(v)} · ${Math.round((v / max) * 100)} %`}</span></div>
          <div className="h-6 rounded-lg bg-[#F1F1F1] mt-1 overflow-hidden"><div className="h-full rounded-lg bg-lagon transition-all duration-500" style={{ width: `${((v || 0) / max) * 100}%` }} /></div>
          {worst?.i === i && worst.loss > 0.15 && <p className="text-[12px] font-extrabold text-danger mt-1">−{Math.round(worst.loss * 100)} % à cette étape : c'est ici que l'on perd le plus.</p>}
        </div>
      ))}
    </div>
  );
}

function Retention() {
  const r = useData('/data/retention', []);
  if (r.error) return <ErrorBox error={r.error} retry={r.reload} />;
  if (!r.data) return <Loading />;
  const shade = (v) => v == null ? { background: '#F4F6F7' } : { background: `rgba(0,163,168,${(v / 100 * 0.85 + 0.08).toFixed(2)})`, color: v > 55 ? '#fff' : C.ink };
  const ks = ['J0', 'J1', 'J3', 'J7', 'J14', 'J30'];
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHead title="Rétention par semaine d'inscription" sub="Part des inscrits encore actifs, semaine après semaine" right={<Csv name="retention" rows={r.data.cohorts} />} />
        <div className="px-5 pb-5 overflow-x-auto">{!r.data.cohorts.length ? <Empty /> : (
          <table className="w-full text-[12.5px] font-extrabold border-separate" style={{ borderSpacing: 3 }}>
            <thead><tr className="text-ink-soft"><th className="text-left font-bold">Semaine</th><th className="font-bold">Inscrits</th>{[0, 1, 2, 3, 4, 5, 6].map((k) => <th key={k} className="font-bold">S{k}</th>)}</tr></thead>
            <tbody>{r.data.cohorts.map((c) => (
              <tr key={c.week}><td className="text-ink-soft whitespace-nowrap">{dayLabel(c.week)}</td><td className="text-center">{c.size}</td>
                {c.weeks.map((v, k) => <td key={k} className="text-center rounded-md py-2 px-1" style={shade(v)}>{v == null ? '' : `${v} %`}</td>)}</tr>
            ))}</tbody>
          </table>)}</div>
      </Card>
      <Card>
        <CardHead title="Courbe de rétention" sub="Inscrits ce mois comparés au mois dernier" />
        <div className="px-5 pb-5">
          <ChartBox labels={ks} datasets={[
            { label: 'Mois dernier', data: r.data.curve_prev.map((x) => x.pct), borderColor: C.g, pointRadius: 3, pointBackgroundColor: C.g, spanGaps: true },
            { label: 'Ce mois', data: r.data.curve.map((x) => x.pct), borderColor: C.p, borderWidth: 3, pointRadius: 3.5, pointBackgroundColor: C.p, spanGaps: true },
          ]} options={{ scales: { x: { grid: { display: false } }, y: { grid: { color: C.line }, min: 0, max: 100, ticks: { callback: (v) => `${v} %` } } } }} />
        </div>
      </Card>
    </div>
  );
}

function Learning({ days }) {
  const l = useData(`/data/learning?days=${days}`, [days]);
  const [track, setTrack] = useState('arabe');
  const co = useData(`/data/courses?track=${track}`, [track]);
  if (l.error) return <ErrorBox error={l.error} retry={l.reload} />;
  const s = l.data?.strength;
  const tot = s ? s.solid + s.medium + s.weak : 0;
  return (
    <>
      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-4">
        <Card>
          <CardHead title="Versets mémorisés et révisions" sub="Cumul des versets en mémoire, révisions faites et dues par jour" right={<Csv name="apprentissage" rows={l.data?.rows} />} />
          <div className="px-5 pb-5">{!l.data ? <Loading /> : (
            <ChartBox type="bar" labels={l.data.rows.map((r) => dayLabel(r.day))} datasets={[
              { type: 'line', label: 'Versets en mémoire (cumul)', data: l.data.rows.map((r) => r.memorized), borderColor: C.p, borderWidth: 3, yAxisID: 'y1' },
              { label: 'Révisions faites', data: l.data.rows.map((r) => r.reviewed), backgroundColor: C.t, hoverBackgroundColor: C.t },
              { label: 'Révisions dues', data: l.data.rows.map((r) => r.due), backgroundColor: C.g2, hoverBackgroundColor: C.g2 },
            ]} options={{ scales: { x: { grid: { display: false } }, y: { grid: { color: C.line }, beginAtZero: true, ticks: { precision: 0 } }, y1: { position: 'right', grid: { display: false }, beginAtZero: true, ticks: { precision: 0 } } } }} />)}</div>
        </Card>
        <Card>
          <CardHead title="Solidité de la mémoire" sub="Tous les versets suivis en révision" />
          <div className="px-5 pb-5">{!s ? <Loading /> : !tot ? <Empty /> : (
            <div className="space-y-3">
              {[['Bien ancrés (21 j et plus)', s.solid, C.p], ['À consolider (4 à 20 j)', s.medium, '#7FD1D3'], ['Fragiles (moins de 4 j)', s.weak, '#F2B530']].map(([lab, v, col]) => (
                <div key={lab}><div className="flex justify-between text-[13.5px] font-extrabold"><span>{lab}</span><span>{num(v)} · {Math.round((v / tot) * 100)} %</span></div>
                  <div className="h-3 rounded-full bg-[#F1F1F1] mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(v / tot) * 100}%`, background: col }} /></div></div>
              ))}
            </div>)}</div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHead title="Où les élèves s'arrêtent" sub="Nombre d'élèves arrivés à chaque étape et nombre qui l'ont réussie"
          right={<Segmented value={track} onChange={setTrack} options={[{ value: 'arabe', label: "Lire l'arabe" }, { value: 'tajwid', label: 'Tajwid' }, { value: 'tafsir', label: 'Tafsir' }]} />} />
        <div className="px-5 pb-5">{!co.data ? <Loading /> : !co.data.length ? <Empty /> : (
          <ChartBox type="bar" labels={co.data.map((r) => (track === 'tafsir' ? `S. ${r.unit}` : `Unité ${r.unit}`))} datasets={[
            { label: 'Élèves arrivés', data: co.data.map((r) => r.reached), backgroundColor: C.g2, hoverBackgroundColor: C.g2 },
            { label: track === 'tafsir' ? 'Versets étudiés' : 'Réussie', data: co.data.map((r) => r.passed), backgroundColor: C.p, hoverBackgroundColor: C.p },
          ]} />)}</div>
      </Card>
    </>
  );
}

const GAMES = { suite: 'Suite du verset', sourate: 'Quelle sourate', ordre: 'Remets dans l\'ordre', lettres: 'Lettres éclair', hadith: 'Hadith ou pas', ilm: 'Al-Ilm', duel: 'Duel', defi: 'Défi du jour', noms: '99 noms', tafsir: 'Tafsir', tajwid: 'Tajwid', khatma: "Khatma d'équipe" };
function Games({ days }) {
  const g = useData(`/data/games?days=${days}`, [days]);
  if (g.error) return <ErrorBox error={g.error} retry={g.reload} />;
  if (!g.data) return <Loading />;
  const d = g.data;
  const cats = d.byCat.filter((c) => c.plays > 0);
  return (
    <>
      <Card>
        <CardHead title="Parties par jour" sub="Jeux solo, duels terminés et Défi du jour" right={<Csv name="parties" rows={d.series} />} />
        <div className="px-5 pb-5"><ChartBox labels={d.series.map((r) => dayLabel(r.day))} datasets={[
          { label: 'Solo', data: d.series.map((r) => r.solo), borderColor: C.p, backgroundColor: fill, fill: true, borderWidth: 3 },
          { label: 'Duels', data: d.series.map((r) => r.duels), borderColor: C.ps },
          { label: 'Défi du jour', data: d.series.map((r) => r.defi), borderColor: C.g },
        ]} /></div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHead title="Par jeu" sub={`${days} derniers jours`} />
          {!d.byGame.length ? <Empty /> : (
            <Table head={['Jeu', { label: 'Parties', right: true }, { label: 'Joueurs', right: true }, { label: 'Bonnes réponses', right: true }]}>
              {d.byGame.map((r) => <tr key={r.game}><Td className="font-bold">{GAMES[r.game] || r.game}</Td><Td className="text-right font-bold">{num(r.plays)}</Td><Td className="text-right">{num(r.players)}</Td><Td className="text-right">{r.accuracy == null ? '-' : `${r.accuracy} %`}</Td></tr>)}
            </Table>)}
        </Card>
        <Card>
          <CardHead title="Bonnes réponses par catégorie" sub="Toutes périodes, pour repérer les catégories trop dures" />
          <div className="px-5 pb-5">{!cats.length ? <Empty /> : (
            <ChartBox type="bar" height={220} legend={false} labels={cats.map((c) => c.category)} datasets={[{ label: 'Bonnes réponses', data: cats.map((c) => +c.accuracy), backgroundColor: C.p, hoverBackgroundColor: C.p }]}
              options={{ scales: { x: { grid: { display: false } }, y: { grid: { color: C.line }, min: 0, max: 100, ticks: { callback: (v) => `${v} %` } } } }} />)}</div>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHead title="Questions les plus ratées" sub="Jouées au moins 5 fois. Clic pour ouvrir la question dans Jeux." right={<Csv name="questions-ratees" rows={d.missed} />} />
        {!d.missed.length ? <Empty>Les questions apparaîtront ici après 5 parties chacune.</Empty> : (
          <Table head={['Question', 'Catégorie', { label: 'Jouée', right: true }, { label: 'Erreurs', right: true }]}>
            {d.missed.map((r) => <tr key={r.id}><Td><Link className="font-bold hover:text-lagon" to={`/jeux?q=${r.id}`}>{r.question}</Link></Td><Td className="text-ink-soft">{r.category}</Td><Td className="text-right">{num(r.plays)}</Td><Td className="text-right font-black text-danger">{r.error_rate} %</Td></tr>)}
          </Table>)}
      </Card>
    </>
  );
}

const KINDS = { priere: 'Après la prière', verset: 'Verset du jour', hadith: 'Hadith du jour', nom: 'Nom du jour', bravo: 'Bravo', hebdo: 'Bilan hebdo', tafsir: 'Tafsir', arabe: "Lire l'arabe", tajwid: 'Tajwid', dates: 'Dates', relance: 'Relances', duel: 'Duels', khatma: 'Khatma', tournoi: 'Tournois', ligue: 'Ligue', kahf: 'Al-Kahf', autre: 'Autres' };
function Notifs({ days }) {
  const n = useData(`/data/notifs?days=${days}`, [days]);
  if (n.error) return <ErrorBox error={n.error} retry={n.reload} />;
  if (!n.data) return <Loading />;
  const d = n.data;
  const sent = d.byKind.reduce((a, r) => a + r.sent, 0), opened = d.byKind.reduce((a, r) => a + r.opened, 0);
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Envoyées" value={num(sent)} hint={`sur ${days} jours`} />
        <Kpi label="Ouvertes" value={num(opened)} hint={sent ? `${Math.round((opened / sent) * 100)} % d'ouverture` : 'aucun envoi'} />
        <Kpi label="Abonnés" value={num(d.subs)} hint="téléphones avec notifications" />
        <Kpi label="Via Firebase" value={num(d.fcm)} hint={d.subs ? `${Math.round((d.fcm / d.subs) * 100)} % des abonnés` : '-'} />
      </div>
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHead title="Par type" sub="Envoyées et ouvertes" right={<Csv name="notifications" rows={d.byKind} />} />
          <div className="px-5 pb-5">{!d.byKind.length ? <Empty>Les statistiques commencent le 01/11/2026.</Empty> : (
            <ChartBox type="bar" labels={d.byKind.map((r) => KINDS[r.kind] || r.kind)} datasets={[
              { label: 'Envoyées', data: d.byKind.map((r) => r.sent), backgroundColor: C.g2, hoverBackgroundColor: C.g2 },
              { label: 'Ouvertes', data: d.byKind.map((r) => r.opened), backgroundColor: C.p, hoverBackgroundColor: C.p },
            ]} />)}</div>
        </Card>
        <Card>
          <CardHead title="Par jour" />
          <div className="px-5 pb-5"><ChartBox labels={d.series.map((r) => dayLabel(r.day))} datasets={[
            { label: 'Envoyées', data: d.series.map((r) => r.sent), borderColor: C.g },
            { label: 'Ouvertes', data: d.series.map((r) => r.opened), borderColor: C.p, backgroundColor: fill, fill: true, borderWidth: 3 },
          ]} /></div>
        </Card>
      </div>
    </>
  );
}

function Live() {
  const l = useData('/data/live', [], { every: 10000 });
  if (l.error) return <ErrorBox error={l.error} retry={l.reload} />;
  if (!l.data) return <Loading />;
  const d = l.data;
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4"><div className="flex items-center gap-2 text-ink-soft text-[13px] font-bold"><span className="w-2.5 h-2.5 rounded-full bg-[#2BA84A] animate-pulse" />En ligne maintenant</div><div className="mt-1 text-[26px] font-black">{num(d.online)}</div><div className="text-[13px] text-ink-soft">mis à jour toutes les 10 s</div></Card>
        <Kpi label="Vus dans les 15 min" value={num(d.online_15m)} hint="app ouverte récemment" />
        <Kpi label="Duels en cours" value={num(d.duels_playing)} hint={`${num(d.duels_invited)} invitation(s) en attente`} />
        <Kpi label="Actifs aujourd'hui" value={num(d.active_today)} hint="au moins une action" />
      </div>
      <Card className="mt-4">
        <CardHead title="Derniers vus" sub="15 dernières minutes" />
        {!d.recent.length ? <Empty>Personne pour l'instant.</Empty> : (
          <Table head={['Élève', { label: 'Vu', right: true }]}>
            {d.recent.map((r) => <tr key={r.user_id}><Td><Link className="font-bold hover:text-lagon" to={`/utilisateurs/${r.user_id}`}>{r.full_name || r.username || 'Sans nom'}</Link>{r.username && <span className="text-ink-faint ml-2">@{r.username}</span>}</Td>
              <Td className="text-right text-ink-soft">{Math.max(0, Math.round((Date.now() - new Date(r.seen_at)) / 60000))} min</Td></tr>)}
          </Table>)}
      </Card>
    </>
  );
}
