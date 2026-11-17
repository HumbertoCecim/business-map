import { useUiText } from '../ui-text';
import { useEffect, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
import type { ProposalPreview } from '../api';
import { CanonicalValue, canonicalLabel } from './CanonicalDiff';

export function ProposalReview({ proposalId, load, confirm, reject, onDone, approvalAvailable = true }: {
  proposalId: string; load: (id: string) => Promise<ProposalPreview>;
  confirm: (preview: ProposalPreview) => Promise<void>; reject: (preview: ProposalPreview) => Promise<void>;
  onDone?: () => void;
  approvalAvailable?: boolean;
}) {
  const t = useUiText();
  const [preview, setPreview] = useState<ProposalPreview | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let cancelled = false; setPreview(null); setError('');
    load(proposalId).then(value => { if (!cancelled) setPreview(value); }).catch(reason => { if (!cancelled) setError(String(reason.message || reason)); });
    return () => { cancelled = true; };
  }, [proposalId, load]);
  const act = async (action: 'apply' | 'reject') => {
    if (!preview || busy) return; setBusy(true); setError('');
    try { await (action === 'apply' ? confirm(preview) : reject(preview)); onDone?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  return <section className="proposal-review" aria-label={t("Revisão da proposta")}>
    {error && <p className="notice warning" role="alert">{error}</p>}
    {!preview ? <p className="muted">{error ? t("Atualize o mapa para tentar novamente.") : <><LoaderCircle size={15} className="spin"/> {t("Preparando comparação…")}</>}</p> : <>
      <span className="eyebrow">{t("LOTE COMPLETO ·")} {preview.proposal.commands.length} {t("ALTERAÇÕES")}</span>
      <div className="assistant-description"><span className="eyebrow">{t("TEXTO DO ASSISTENTE")}</span><h2>{preview.proposal.title}</h2><span className="eyebrow">{t("JUSTIFICATIVA DO ASSISTENTE")}</span><p className="review-rationale">{preview.proposal.rationale}</p></div>
      <p className="small muted">{t("Versão do mapa:")} {preview.before.revision}</p>
      {preview.stale && <p role="alert" className="notice warning">{t("O mapa mudou desde esta proposta. Peça uma nova proposta baseada na versão atual.")}</p>}
      {!approvalAvailable && <p className="notice warning">{t("Esta conexão permite consultar o mapa. A confirmação exige uma conexão autorizada do ChatGPT.")}</p>}
      <Removals preview={preview}/>
      <h3 className="canonical-heading">{t("Comparação calculada pelo servidor")}</h3><p className="small muted">{t("Revise o antes e depois abaixo: estas são as alterações que a confirmação aplica.")}</p>
      <div className="change-list">{preview.changes.map((change, index) => <article className={`change ${isRemoval(change.before, change.after) ? 'is-removal' : ''}`} key={`${change.path}-${index}`}>
        <h3>{isRemoval(change.before, change.after) && <span className="removal-badge">{t("REMOÇÃO")}</span>}{t(canonicalLabel(change.path))}</h3><div className="diff-columns"><div><span className="eyebrow">{t("ANTES")}</span><div className="canonical-value"><CanonicalValue value={change.before} board={preview.before} field={change.path.split('/').at(-1)}/></div></div><div><span className="eyebrow">{t("DEPOIS")}</span><div className="canonical-value"><CanonicalValue value={change.after} board={preview.after || preview.before} field={change.path.split('/').at(-1)}/></div></div></div><details className="canonical-technical"><summary>{t("Detalhes técnicos")}</summary><pre>{JSON.stringify({ campo: change.path, antes: change.before, depois: change.after }, null, 2)}</pre></details>
      </article>)}</div>
      <p className="small muted">{t("A confirmação aplica todas as alterações deste lote em uma única transação.")}</p>
      <div className="review-actions"><button className="primary" disabled={busy || !approvalAvailable || preview.stale || !preview.after || preview.proposal.status !== 'pending'} onClick={() => act('apply')}><Check size={14}/> {t("Confirmar lote inteiro")}</button><button className="secondary" disabled={busy || !approvalAvailable || preview.proposal.status !== 'pending'} onClick={() => act('reject')}><X size={14}/> {t("Rejeitar")}</button></div>
    </>}
  </section>;
}
export function display(value: unknown) { return value === undefined || value === null ? '—' : typeof value === 'string' ? value : JSON.stringify(value, null, 2); }
function isRemoval(before: unknown, after: unknown) {
  if (before === undefined || before === null || before === '') return false;
  if (after === undefined || after === null || after === '') return true;
  if (Array.isArray(before) && Array.isArray(after)) {
    const id = (value: unknown) => value && typeof value === 'object' && 'id' in value ? value.id : value;
    const remaining = new Set(after.map(id)); return before.some(value => !remaining.has(id(value)));
  }
  return false;
}
function Removals({ preview }: { preview: ProposalPreview }) {
  const t = useUiText();
  if (!preview.after) return null;
  const before = preview.before, after = preview.after;
  const groups = [
    { label: t("Área"), before: before.sections, after: after.sections },
    { label: t("Nota"), before: before.sections.flatMap(section => section.cards), after: after.sections.flatMap(section => section.cards) },
    { label: t("Conexão"), before: before.relations || [], after: after.relations || [] },
    { label: t("Fonte"), before: before.sources || [], after: after.sources || [] },
    { label: t("Memória"), before: before.memories, after: after.memories },
  ];
  const removed = groups.flatMap(group => {
    const remaining = new Set(group.after.map(item => item.id));
    return group.before.filter(item => !remaining.has(item.id)).map(item => ({ id: `${group.label}:${item.id}`, label: group.label, title: 'title' in item ? item.title : 'label' in item ? item.label : 'text' in item ? item.text : '' }));
  });
  if (!removed.length) return null;
  return <section className="removal-warning" aria-label={t("Remoções propostas")}><strong>{removed.length === 1 ? t("1 item será excluído deste mapa.") : `${removed.length} ${t("itens serão excluídos deste mapa.")}`}</strong><p>{t("A confirmação do lote também aplica estas exclusões.")}</p><details open><summary>{t("Conferir itens removidos")}</summary><ul>{removed.map(item => <li key={item.id}><strong>{item.label}</strong> · {item.title}</li>)}</ul></details></section>;
}
