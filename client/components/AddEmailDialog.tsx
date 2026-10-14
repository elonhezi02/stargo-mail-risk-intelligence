import { useEffect, useRef, useState, type FormEvent } from 'react';
import { X, Upload, FileText, ArrowRight, LoaderCircle, AlertCircle } from 'lucide-react';
import { MAX_FILE_BYTES, MAX_TEXT_CHARS } from '../../shared/contracts';
import { api } from '../api';

export function AddEmailDialog({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      opener?.focus();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'file' && file && file.size > MAX_FILE_BYTES) {
      setError('Files must be 5 MB or smaller.');
      return;
    }
    setBusy(true);
    try {
      let result: { id: string };
      if (mode === 'text')
        result = await api('/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
      else {
        const body = new FormData();
        body.append('file', file!);
        result = await api('/uploads', { method: 'POST', body });
      }
      onAdded(result.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className="add-dialog"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      aria-labelledby="add-title"
    >
      <form onSubmit={submit}>
        <div className="dialog-heading">
          <div className="dialog-symbol">
            <FileText size={23} />
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close add email"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        <h2 id="add-title">Add to your inbox</h2>
        <p className="muted">A new message. The same evidence-led review.</p>
        <div className="segmented" aria-label="Input method">
          <button
            type="button"
            aria-pressed={mode === 'text'}
            onClick={() => {
              setMode('text');
              setError('');
            }}
            disabled={busy}
          >
            Paste email
          </button>
          <button
            type="button"
            aria-pressed={mode === 'file'}
            onClick={() => {
              setMode('file');
              setError('');
            }}
            disabled={busy}
          >
            Upload a file
          </button>
        </div>
        {mode === 'text' ? (
          <>
            <label className="field-label" htmlFor="email-text">
              Email content
            </label>
            <textarea
              id="email-text"
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                'From: name@company.com\nTo: review@arcline.com\nSubject: A message to review\n\nPaste the email here…'
              }
              rows={9}
              maxLength={MAX_TEXT_CHARS}
              disabled={busy}
              required
            />
            <div className="field-help">
              <span>Include headers when available.</span>
              <span>{text.length.toLocaleString()} / 12,000</span>
            </div>
          </>
        ) : (
          <div className="file-field">
            <Upload size={30} />
            <label htmlFor="email-file">Choose an email or document</label>
            <p>TXT, PDF or EML · up to 5 MB</p>
            <input
              id="email-file"
              type="file"
              accept=".txt,.pdf,.eml"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError('');
              }}
              disabled={busy}
              required
            />
            <small>
              Text PDFs only. Scanned documents need OCR.
              <br />
              Up to 12,000 characters of readable content.
            </small>
          </div>
        )}
        {error && (
          <div className="error-notice" role="alert">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}
        <div className="dialog-footer">
          <span>Processed locally. No cloud API.</span>
          <button
            className="primary-button"
            type="submit"
            disabled={busy || (mode === 'text' ? !text.trim() : !file)}
          >
            {busy ? <LoaderCircle size={16} className="spin" /> : <ArrowRight size={16} />}
            {busy ? 'Adding…' : 'Add email'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
