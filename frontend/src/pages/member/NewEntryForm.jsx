import { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { compressImage } from '../../utils.js';

const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

function PhotoInput({ label, file, currentUrl, required, onChange }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview || currentUrl;

  return (
    <div className="photo-input">
      <span className="photo-input-label">
        {label}
        {required ? ' *' : ''}
      </span>
      <button type="button" className={`photo-drop ${file ? 'has-file' : ''}`} onClick={() => inputRef.current?.click()}>
        {shown ? (
          <img src={shown} alt={`Prévia ${label}`} />
        ) : (
          <span>
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
              <path
                fill="currentColor"
                d="M9 3 7.17 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Zm3 15a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
              />
            </svg>
            <br />
            Tirar foto ou escolher
          </span>
        )}
      </button>
      {currentUrl && <span className="photo-input-hint">{file ? 'Nova foto selecionada' : 'Toque para trocar'}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onChange(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/**
 * Formulário de lançamento.
 * - Sem `entry`: cria um novo (fotos obrigatórias).
 * - Com `entry`: edita (fotos opcionais; só troca as que forem escolhidas).
 */
export default function NewEntryForm({ entry, onCreated, onSaved, onCancel }) {
  const editing = Boolean(entry);
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [qtyDone, setQtyDone] = useState(editing ? String(entry.qty_done) : '');
  const [qtyBanned, setQtyBanned] = useState(editing ? String(entry.qty_banned) : '');
  const [description, setDescription] = useState(editing ? entry.description || '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isInt = (v) => /^\d+$/.test(String(v).trim());

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!editing && (!before || !after)) return setError('Envie as duas fotos: ANTES e DEPOIS.');
    if (!isInt(qtyDone) || !isInt(qtyBanned)) {
      return setError('As quantidades devem ser números inteiros (0 ou mais).');
    }

    setBusy(true);
    try {
      // A hospedagem aceita no máx. ~4,5 MB por envio: comprime mais até as fotos caberem.
      let b = null;
      let a = null;
      const total = () => (b?.size || 0) + (a?.size || 0);
      for (const [dim, quality] of [[1920, 0.85], [1600, 0.75], [1280, 0.65]]) {
        [b, a] = await Promise.all([
          before && compressImage(before, dim, quality),
          after && compressImage(after, dim, quality),
        ]);
        if (total() <= MAX_TOTAL_BYTES) break;
      }
      if (total() > MAX_TOTAL_BYTES) {
        throw new Error('As fotos são grandes demais. Tente tirar as fotos em resolução menor ou em JPG.');
      }

      const form = new FormData();
      if (b) form.append('foto_antes', b);
      if (a) form.append('foto_depois', a);
      form.append('qty_done', String(qtyDone).trim());
      form.append('qty_banned', String(qtyBanned).trim());
      form.append('description', description);

      if (editing) {
        const d = await api(`/entries/${entry.id}`, { method: 'PATCH', form });
        onSaved?.(d.entry);
        return;
      }

      const d = await api('/entries', { method: 'POST', form });
      setBefore(null);
      setAfter(null);
      setQtyDone('');
      setQtyBanned('');
      setDescription('');
      setSuccess('Lançamento enviado! Aguarde a avaliação do admin.');
      onCreated?.(d.entry);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const idp = editing ? `e${entry.id}-` : '';

  return (
    <form className={editing ? '' : 'card'} onSubmit={onSubmit}>
      <h2>{editing ? 'Editar lançamento' : 'Novo lançamento'}</h2>
      {editing && entry.status === 'REPROVADO' && (
        <p className="notice-small">Ao salvar, o lançamento volta para <strong>pendente</strong> e o admin avalia de novo.</p>
      )}
      <div className="photo-inputs">
        <PhotoInput label="ANTES" file={before} currentUrl={entry?.before_url} required={!editing} onChange={setBefore} />
        <PhotoInput label="DEPOIS" file={after} currentUrl={entry?.after_url} required={!editing} onChange={setAfter} />
      </div>

      <div className="grid-2">
        <div>
          <label htmlFor={`${idp}qtyDone`}>Quantidade feita *</label>
          <input
            id={`${idp}qtyDone`}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={qtyDone}
            onChange={(e) => setQtyDone(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`${idp}qtyBanned`}>Quantidade banida *</label>
          <input
            id={`${idp}qtyBanned`}
            type="number"
            inputMode="numeric"
            min="0"
            step="1"
            value={qtyBanned}
            onChange={(e) => setQtyBanned(e.target.value)}
            required
          />
        </div>
      </div>

      <label htmlFor={`${idp}description`}>Descrição / observação</label>
      <textarea
        id={`${idp}description`}
        rows={3}
        maxLength={2000}
        placeholder="Opcional"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
      {editing ? (
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Enviando fotos…' : 'Enviar lançamento'}
        </button>
      )}
    </form>
  );
}
