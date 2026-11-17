import { useState } from 'react';
import { ArrowRight, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import type { Run, Snapshot } from '../api';
import { uid } from '../api';
import { useUiText } from '../ui-text';

export function Relations({ snapshot, run, origin, busy, onSelect }: {
  snapshot: Snapshot; run: Run; origin?: string; busy: boolean; onSelect: (id: string) => void;
}) {
  const t = useUiText();
  const nodes = snapshot.board.sections.flatMap(section => [{ id: section.id, title: section.title }, ...section.cards]);
  const [editing, setEditing] = useState(''), [from, setFrom] = useState(origin || nodes[0]?.id || ''), [to, setTo] = useState(''), [label, setLabel] = useState(''), [deleting, setDeleting] = useState('');
  const relations = (snapshot.board.relations || []).filter(relation => !origin || relation.fromId === origin || relation.toId === origin);
  const reset = () => { setEditing(''); setFrom(origin || nodes[0]?.id || ''); setTo(''); setLabel(''); };
  const title = (id: string) => nodes.find(node => node.id === id)?.title || t('Sem título');
  if (nodes.length < 2 && !relations.length) return null;
  return <section className="relation-manager" aria-label={t('Conexões')}>
    <div className="panel-section-title"><h3><Link2 size={14}/> {t('Conexões')} <span>{relations.length}</span></h3></div>
    <p className="small muted">{t('Uma conexão aparece nas duas pontas. Abra a outra ideia para continuar.')}</p>
    {relations.map(relation => {
      const other = relation.fromId === origin ? relation.toId : relation.fromId;
      return <div className="relation-line linked-relation" key={relation.id}>
        <div className="relation-destination">
          {origin ? <><small>{t(relation.fromId === origin ? 'Aponta para' : 'Recebe conexão de')}</small><button className="relation-open" onClick={() => onSelect(other)}><Link2 size={13}/>{title(other)}</button></>
            : <div className="relation-endpoints"><button onClick={() => onSelect(relation.fromId)}>{title(relation.fromId)}</button><ArrowRight size={12}/><button onClick={() => onSelect(relation.toId)}>{title(relation.toId)}</button></div>}
          {relation.label && <p>{relation.label}</p>}
        </div>
        <button className="icon-button" aria-label={t('Editar conexão')} onClick={() => { setEditing(relation.id); setFrom(relation.fromId); setTo(relation.toId); setLabel(relation.label); }}><Pencil size={13}/></button>
        <button className="icon-button" aria-label={t(deleting === relation.id ? 'Confirmar exclusão da conexão' : 'Excluir conexão')} disabled={busy} onClick={async () => {
          if (deleting !== relation.id) { setDeleting(relation.id); return; }
          if (await run({ type: 'relation.delete', id: relation.id })) { setDeleting(''); if (editing === relation.id) reset(); }
        }}><Trash2 size={13}/></button>
      </div>;
    })}
    <details className="form-details" open={!!editing || undefined}>
      <summary>{t(editing ? 'Editar conexão' : 'Criar conexão')}</summary>
      <form onSubmit={async event => {
        event.preventDefault();
        if (await run({ type: 'relation.save', relation: { id: editing || uid('relation'), fromId: from, toId: to, label } })) reset();
      }}>
        <label className="field"><span>{t('De')}</span><select required value={from} onChange={event => setFrom(event.target.value)}><option value="">{t('Escolha uma área ou nota')}</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
        <label className="field"><span>{t('Para')}</span><select required value={to} onChange={event => setTo(event.target.value)}><option value="">{t('Escolha uma área ou nota')}</option>{nodes.filter(node => node.id !== from).map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label>
        <label className="field"><span>{t('O que conecta estas ideias?')}</span><input maxLength={500} value={label} onChange={event => setLabel(event.target.value)}/></label>
        <button type="submit" disabled={busy || !from || !to || from === to} className="secondary full"><Plus size={14}/>{t(editing ? 'Salvar conexão' : 'Criar conexão')}</button>
        {editing && <button type="button" className="text-button" onClick={reset}>{t('Cancelar edição')}</button>}
      </form>
    </details>
  </section>;
}
