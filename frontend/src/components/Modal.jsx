import { useEffect } from 'react';

/** Modal genérico: fecha com ESC ou clique fora. */
export default function Modal({ onClose, children, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className={`modal ${className}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ImageModal({ src, alt, onClose }) {
  return (
    <div className="modal-backdrop image-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <EscListener onClose={onClose} />
      <button className="image-close" onClick={onClose} aria-label="Fechar">
        ×
      </button>
      <img className="image-full" src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function EscListener({ onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return null;
}

export function ConfirmModal({ title, children, confirmLabel = 'Confirmar', busy, onConfirm, onCancel }) {
  return (
    <Modal onClose={busy ? () => {} : onCancel}>
      <h3>{title}</h3>
      <div className="modal-body">{children}</div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
          {busy ? 'Aguarde…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
