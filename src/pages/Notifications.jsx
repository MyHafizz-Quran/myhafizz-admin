import { Bell } from '@phosphor-icons/react';
import { api, ago, num, PRAYERS } from '../lib';
import { Card, CardHead, Empty, ErrorBox, Loading, PageHead, Stat, useApi } from '../ui';

export default function Notifications() {
  const { data, error, reload } = useApi(() => api('/notifications'), []);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  const { totals: t, prayers, tz } = data;
  const max = Math.max(1, ...prayers.map((p) => p.n));
  const maxTz = Math.max(1, ...tz.map((p) => p.n));
  return (
    <>
      <PageHead title="Rappels" sub="Les rappels après la prière activés par les utilisateurs." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Appareils inscrits" value={num(t.reminders)} />
        <Stat label="Utilisateurs" value={num(t.reminder_users)} />
        <Stat label="Délai moyen" value={t.avg_offset != null ? `${t.avg_offset} min` : '-'} hint="après l'heure de la prière" />
        <Stat label="Dernier réglage" value={t.last_update ? ago(t.last_update) : '-'} />
      </div>
      {t.reminders === 0 ? <Card className="mt-6"><Empty icon={Bell} title="Aucun rappel pour l'instant" text="Ils apparaîtront quand des utilisateurs les activeront dans Réglages." /></Card> : (
        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          <Card><CardHead title="Par prière" />
            <div className="px-5 pb-5 space-y-3">
              {prayers.map((p) => (
                <div key={p.prayer} className="flex items-center gap-3">
                  <span className="w-20 font-extrabold text-[14px]">{PRAYERS[p.prayer] || p.prayer}</span>
                  <div className="flex-1 h-3 rounded-full bg-[#EEEEEE] overflow-hidden"><div className="h-full bg-lagon rounded-full" style={{ width: `${(p.n / max) * 100}%` }} /></div>
                  <span className="w-10 text-right font-bold text-ink-soft text-[14px]">{p.n}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card><CardHead title="Par fuseau horaire" />
            <div className="px-5 pb-5 space-y-3">
              {tz.map((p) => (
                <div key={p.tz} className="flex items-center gap-3">
                  <span className="w-40 font-extrabold text-[14px] truncate">{p.tz}</span>
                  <div className="flex-1 h-3 rounded-full bg-[#EEEEEE] overflow-hidden"><div className="h-full bg-lagon rounded-full" style={{ width: `${(p.n / maxTz) * 100}%` }} /></div>
                  <span className="w-10 text-right font-bold text-ink-soft text-[14px]">{p.n}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
