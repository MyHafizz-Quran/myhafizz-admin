import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Lightning, BookOpenText, ArrowsClockwise, UsersThree, BookBookmark, Trophy, Bell, Prohibit, Student } from '@phosphor-icons/react';
import { api, num } from '../lib';
import { Bars, Card, CardHead, ErrorBox, Loading, PageHead, Segmented, Stat, Table, Td, useApi } from '../ui';
import { SURAHS } from '../surahs';

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const ov = useApi(() => api('/stats/overview'), []);
  const ts = useApi(() => api(`/stats/timeseries?days=${days}`), [days]);
  const su = useApi(() => api('/stats/surahs'), []);

  if (ov.error) return <ErrorBox error={ov.error} retry={ov.reload} />;
  const s = ov.data;
  return (
    <>
      <PageHead title="Tableau de bord" sub="L'activité de l'app MyHafizz en un coup d'œil." />
      {!s ? <Loading /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat icon={Users} label="Utilisateurs" value={num(s.users)} hint={`+${num(s.users_new_7d)} cette semaine · +${num(s.users_new_30d)} en 30 j`} />
            <Stat icon={Lightning} label="Actifs" value={num(s.active_7d)} hint={`${num(s.active_today)} aujourd'hui · ${num(s.active_30d)} en 30 j`} />
            <Stat icon={BookOpenText} label="Versets mémorisés" value={num(s.verses_memorized)} hint={`${num(s.surahs_completed)} sourates complètes`} />
            <Stat icon={ArrowsClockwise} label="Révisions (7 j)" value={num(s.reviews_7d)} hint={`${num(s.reviews_due)} en attente sur ${num(s.reviews_cards)} cartes`} />
          </div>

          <Card className="mt-6">
            <CardHead title="Évolution" sub="Inscriptions, utilisateurs actifs et révisions par jour."
              right={<Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 j' }, { value: 30, label: '30 j' }, { value: 90, label: '90 j' }]} />} />
            <div className="px-5 pb-5">
              {!ts.data ? <Loading /> : (
                <div className="grid md:grid-cols-3 gap-6">
                  <div><p className="font-extrabold text-ink text-sm mb-1">Inscriptions</p><Bars data={ts.data} field="signups" label="inscriptions" /></div>
                  <div><p className="font-extrabold text-ink text-sm mb-1">Actifs</p><Bars data={ts.data} field="active" label="actifs" /></div>
                  <div><p className="font-extrabold text-ink text-sm mb-1">Révisions</p><Bars data={ts.data} field="reviews" label="révisions" /></div>
                </div>
              )}
            </div>
          </Card>

          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6 mt-6">
            <Card>
              <CardHead title="Sourates les plus travaillées" />
              {!su.data ? <Loading /> : su.data.length === 0 ? <p className="px-5 pb-5 text-sm text-ink-soft">Aucune donnée pour l'instant.</p> : (
                <Table head={['Sourate', { label: 'Élèves', right: true }, { label: 'Versets', right: true }, { label: 'Complètes', right: true }]}>
                  {su.data.map((r) => (
                    <tr key={r.surah_number}>
                      <Td><span className="text-ink-faint font-bold mr-2">{r.surah_number}</span><span className="font-bold">{SURAHS[r.surah_number - 1] || '-'}</span></Td>
                      <Td className="text-right font-bold">{num(r.learners)}</Td>
                      <Td className="text-right">{num(r.verses)}</Td>
                      <Td className="text-right">{num(r.completed)}</Td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <div className="grid grid-cols-2 gap-4 content-start">
              <Link to="/groupes"><Stat icon={UsersThree} label="Groupes" value={num(s.groups)} hint={`${s.groups_class} classes · ${s.groups_family} familles · ${s.groups_circle} cercles`} /></Link>
              <Stat icon={BookBookmark} label="Khatmas" value={num(s.khatmas)} />
              <Link to="/defis"><Stat icon={Trophy} label="Défis actifs" value={num(s.challenges_active)} /></Link>
              <Stat icon={Student} label="Leçons de lecture" value={num(s.reading_lessons_done)} hint={`${num(s.reading_sessions_7d)} séances en 7 j`} />
              <Link to="/rappels"><Stat icon={Bell} label="Rappels prière" value={num(s.prayer_reminders)} /></Link>
              <Link to="/utilisateurs?filter=banned"><Stat icon={Prohibit} label="Suspendus" value={num(s.users_banned)} hint={`${num(s.plans)} plans de hifz créés`} /></Link>
            </div>
          </div>
        </>
      )}
    </>
  );
}
