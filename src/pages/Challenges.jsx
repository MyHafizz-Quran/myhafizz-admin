import { useState } from 'react';
import { Plus, Trophy, PencilSimple, Trash } from '@phosphor-icons/react';
import { useMe, canWrite } from '../me';
import { api, date } from '../lib';
import { Badge, Button, Card, Empty, ErrorBox, Input, Label, Loading, Modal, PageHead, Select, Table, Td, Textarea, useApi, useToast } from '../ui';
import { SURAHS, AYAHS } from '../surahs';

const EMPTY = { title: '', description: '', surah_number: '', target_verses: '', deadline: '', badge_emoji: '', badge_name: '', is_active: true };

export default function Challenges() {
  const write = canWrite(useMe());
  const toast = useToast();
  const { data, error, reload } = useApi(() => api('/challenges'), []);
  const [edit, setEdit] = useState(null);
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...edit, deadline: edit.deadline || null };
      await api(edit.id ? `/challenges/${edit.id}` : '/challenges', { method: edit.id ? 'PUT' : 'POST', body });
      toast(edit.id ? 'Défi mis à jour.' : 'Défi publié dans l’app.'); setEdit(null); reload();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true);
    try { await api(`/challenges/${del.id}`, { method: 'DELETE' }); toast('Défi supprimé.'); setDel(null); reload(); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  const toggle = async (c) => {
    try { await api(`/challenges/${c.id}`, { method: 'PUT', body: { ...c, deadline: c.deadline?.slice(0, 10) || null, is_active: !c.is_active } }); reload(); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <>
      <PageHead title="Défis" sub="Les défis actifs apparaissent dans la page Défis de l'app."
        right={write && <Button onClick={() => setEdit({ ...EMPTY })}><Plus weight="bold" />Nouveau défi</Button>} />
      <Card>
        {error ? <div className="p-4"><ErrorBox error={error} retry={reload} /></div> : !data ? <Loading /> : data.length === 0 ? (
          <Empty icon={Trophy} title="Aucun défi" text="Crée un premier défi, par exemple « Mémoriser Al-Mulk avant Ramadan »." />
        ) : (
          <Table head={['Défi', 'Sourate', 'Échéance', { label: 'Participants', right: true }, { label: 'Réussis', right: true }, 'Statut', '']}>
            {data.map((c) => (
              <tr key={c.id}>
                <Td><div className="font-extrabold">{c.title}</div>{c.badge_name && <div className="text-[13px] text-ink-soft">Badge : {c.badge_name}</div>}</Td>
                <Td className="whitespace-nowrap">{c.surah_number ? `${SURAHS[c.surah_number - 1]}${c.target_verses ? ` · ${c.target_verses} v.` : ''}` : '-'}</Td>
                <Td className="text-ink-soft whitespace-nowrap">{date(c.deadline)}</Td>
                <Td className="text-right font-bold">{c.participants}</Td>
                <Td className="text-right">{c.finishers}</Td>
                <Td>{write ? <button onClick={() => toggle(c)}>{c.is_active ? <Badge tone="lagon">Actif</Badge> : <Badge>En pause</Badge>}</button> : c.is_active ? <Badge tone="lagon">Actif</Badge> : <Badge>En pause</Badge>}</Td>
                <Td className="text-right whitespace-nowrap">{write && <>
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...c, deadline: c.deadline?.slice(0, 10) || '', surah_number: c.surah_number || '', target_verses: c.target_verses || '' })}><PencilSimple weight="bold" /></Button>
                  <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-tint" onClick={() => setDel(c)}><Trash weight="bold" /></Button>
                </>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Modifier le défi' : 'Nouveau défi'} width={560}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Annuler</Button><Button loading={busy} onClick={save}>{edit?.id ? 'Enregistrer' : 'Publier'}</Button></>}>
        {edit && <div className="space-y-4">
          <div><Label>Titre</Label><Input value={edit.title} onChange={set('title')} placeholder="Mémoriser Al-Mulk" autoFocus /></div>
          <div><Label hint="facultatif">Description</Label><Textarea rows={3} value={edit.description || ''} onChange={set('description')} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label hint="facultatif">Sourate</Label>
              <Select className="w-full" value={edit.surah_number} onChange={(e) => setEdit({ ...edit, surah_number: e.target.value, target_verses: e.target.value ? AYAHS[e.target.value - 1] : '' })}>
                <option value="">Aucune</option>{SURAHS.map((s, i) => <option key={i} value={i + 1}>{i + 1}. {s}</option>)}
              </Select></div>
            <div><Label>Versets à mémoriser</Label><Input type="number" min="1" value={edit.target_verses} onChange={set('target_verses')} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label hint="facultatif">Date limite</Label><Input type="date" value={edit.deadline} onChange={set('deadline')} /></div>
            <div><Label hint="facultatif">Nom du badge</Label><Input value={edit.badge_name || ''} onChange={set('badge_name')} placeholder="Gardien d'Al-Mulk" /></div>
          </div>
          <label className="flex items-center gap-3 font-bold text-[14px]"><input type="checkbox" className="w-5 h-5 accent-[#00A3A8]" checked={edit.is_active} onChange={set('is_active')} />Visible dans l'app</label>
        </div>}
      </Modal>

      <Modal open={!!del} onClose={() => setDel(null)} title="Supprimer le défi"
        footer={<><Button variant="secondary" onClick={() => setDel(null)}>Annuler</Button><Button variant="danger" loading={busy} onClick={remove}>Supprimer</Button></>}>
        <p className="text-sm text-ink-soft">« {del?.title} » et la progression de ses {del?.participants} participant(s) seront effacés. Pour le cacher sans rien perdre, mets-le plutôt en pause.</p>
      </Modal>
    </>
  );
}
