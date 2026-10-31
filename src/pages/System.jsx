import { api, bytes, num } from '../lib';
import { Card, CardHead, ErrorBox, Loading, PageHead, Stat, Table, Td, useApi } from '../ui';

function Tables({ rows }) {
  return (
    <Table head={['Table', { label: 'Lignes (estim.)', right: true }, { label: 'Taille', right: true }]}>
      {rows.map((t) => (
        <tr key={t.name}><Td className="font-bold text-[13px]">{t.name}</Td><Td className="text-right">{Number(t.approx_rows) < 0 ? '-' : num(t.approx_rows)}</Td><Td className="text-right text-ink-soft">{bytes(Number(t.bytes))}</Td></tr>
      ))}
    </Table>
  );
}

export default function System() {
  const { data, error, reload } = useApi(() => api('/system'), []);
  if (error) return <ErrorBox error={error} retry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <PageHead title="Système" sub="Les deux bases Neon : la base client (l'app) et la base admin (cet espace)." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Base client" value={bytes(data.client.bytes)} hint="Projet « MyHafizz Client »" />
        <Stat label="Base admin" value={bytes(data.admin.bytes)} hint="Projet « MyHafizz Admin »" />
        <Stat label="Tables client" value={data.client.tables.length} />
        <Stat label="Moteur" value={data.client.version.replace('PostgreSQL', 'Postgres')} />
      </div>
      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <Card><CardHead title="Base client" sub="Lecture et modération depuis l'admin" /><Tables rows={data.client.tables} /></Card>
        <Card><CardHead title="Base admin" sub="Équipe, journal et notes internes" /><Tables rows={data.admin.tables} /></Card>
      </div>
    </>
  );
}
