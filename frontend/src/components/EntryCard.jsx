import { useState } from 'react';
import { api } from '../api.js';
import { formatDateTime } from '../utils.js';
import StatusBadge from './StatusBadge.jsx';
import { ImageModal } from './Modal.jsx';

/**
 * Card de lançamento: fotos lado a lado, números, descrição e feedback.
 * - showMember: mostra o nome do membro (visão do admin)
 * - reviewable: mostra o painel de aprovar/reprovar (só admin)
 * - highlightNew: marca "Novo" quando o membro ainda não viu a avaliação
 */
export default function EntryCard({ entry, showMember, reviewable, highlightNew, onReviewed }) {
  const [zoom, setZoom] = useState(null);
  const isNew = highlightNew && !entry.member_seen && entry.status !== 'PENDENTE';

  return (
    <article className={`entry entry-${entry.status.toLowerCase()} ${isNew ? 'entry-new' : ''}`}>
      <header className="entry-head">
        <div className="entry-meta">
          {showMember && <strong className="entry-member">{entry.user_name}</strong>}
          <span className="muted">{formatDateTime(entry.created_at)}</span>
        </div>
        <div className="entry-tags">
          {isNew && <span className="tag-new">Novo</span>}
          <StatusBadge status={entry.status} />
        </div>
      </header>

      <div className="photos">
        <figure>
          <button className="photo-btn" onClick={() => setZoom({ src: entry.before_url, alt: 'Foto antes' })}>
            <img src={entry.before_url} alt="Foto antes" loading="lazy" />
          </button>
          <figcaption>ANTES</figcaption>
        </figure>
        <figure>
          <button className="photo-btn" onClick={() => setZoom({ src: entry.after_url, alt: 'Foto depois' })}>
            <img src={entry.after_url} alt="Foto depois" loading="lazy" />
          </button>
          <figcaption>DEPOIS</figcaption>
        </figure>
      </div>

      <div className="entry-numbers">
        <span>
          Feitas: <strong>{entry.qty_done}</strong>
        </span>
        <span>
          Banidas: <strong>{entry.qty_banned}</strong>
        </span>
      </div>

      {entry.description && <p className="entry-desc">{entry.description}</p>}

      {entry.status !== 'PENDENTE' && (
        <div className={`feedback feedback-${entry.status.toLowerCase()}`}>
          <div className="feedback-head">
            <strong>{entry.status === 'REPROVADO' ? 'Motivo da reprovação' : 'Feedback do admin'}</strong>
            <span className="muted">
              {formatDateTime(entry.reviewed_at)}
              {entry.reviewed_by_name ? ` · ${entry.reviewed_by_name}` : ''}
            </span>
          </div>
          <p>{entry.admin_comment || <em className="muted">Sem comentário.</em>}</p>
        </div>
      )}

      {reviewable && <ReviewPanel entry={entry} onReviewed={onReviewed} />}

      {zoom && <ImageModal src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
    </article>
  );
}

function ReviewPanel({ entry, onReviewed }) {
  const isPending = entry.status === 'PENDENTE';
  const [open, setOpen] = useState(isPending);
  const [comment, setComment] = useState(isPending ? '' : entry.admin_comment || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(status) {
    setError('');
    if (status === 'REPROVADO' && !comment.trim()) {
      setError('Escreva o motivo da reprovação.');
      return;
    }
    setBusy(true);
    try {
      const d = await api(`/entries/${entry.id}/review`, {
        method: 'PATCH',
        body: { status, comment },
      });
      onReviewed?.(d.entry);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm review-toggle" onClick={() => setOpen(true)}>
        Reavaliar
      </button>
    );
  }

  return (
    <div className="review">
      <label htmlFor={`c-${entry.id}`}>Comentário / feedback</label>
      <textarea
        id={`c-${entry.id}`}
        rows={2}
        maxLength={2000}
        placeholder="Obrigatório ao reprovar. Opcional ao aprovar."
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <div className="review-actions">
        {!isPending && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
            Cancelar
          </button>
        )}
        <button className="btn btn-danger" disabled={busy} onClick={() => submit('REPROVADO')}>
          Reprovar
        </button>
        <button className="btn btn-success" disabled={busy} onClick={() => submit('APROVADO')}>
          Aprovar
        </button>
      </div>
    </div>
  );
}
