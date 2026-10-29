import { Check, Copy, Mail, MessageCircle, Phone, Send, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, ApiError, type Inquiry, type InquiryEvent } from '../lib/api';
import { CATEGORY_LABEL, STATUSES, STATUS_HINT, STATUS_LABEL, USER_TYPE_LABEL, type Status } from '../lib/constants';
import { formatDateTime, formatPhone, initials, timeAgo, whatsappLink } from '../lib/format';
import { StatusPill } from './Status';
import { CATEGORY_ICON } from './Ticket';

type Props = {
  id: string | null;
  onClose: () => void;
  onChanged: (inquiry: Inquiry) => void;
};

export function InquiryDrawer({ id, onClose, onChanged }: Props) {
  const [inquiry, setInquiry] = useState<Inquiry | null>(null);
  const [events, setEvents] = useState<InquiryEvent[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Status | null>(null);
  const [note, setNote] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const currentId = useRef(id);
  currentId.current = id;
  const open = !!id;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setInquiry(null);
    setError('');
    setNote('');
    api
      .getInquiry(id)
      .then((r) => {
        if (cancelled) return;
        setInquiry(r.inquiry);
        setEvents(r.events);
      })
      .catch((err) => !cancelled && setError(err instanceof ApiError ? err.message : 'Could not load this inquiry.'));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Esc closes; focus moves into the panel on open and back to the page on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  async function changeStatus(status: Status) {
    if (!inquiry || status === inquiry.status) return;
    setSaving(status);
    try {
      const r = await api.updateStatus(inquiry.id, status);
      onChanged(r.inquiry);
      if (currentId.current !== r.inquiry.id) return; // admin already opened another inquiry
      setInquiry(r.inquiry);
      setEvents(r.events);
      toast.success(`${r.inquiry.ref} marked as ${STATUS_LABEL[status]}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update the status.');
    } finally {
      setSaving(null);
    }
  }

  async function addNote(e?: FormEvent) {
    e?.preventDefault();
    if (!inquiry || !note.trim() || noteSaving) return;
    const forId = inquiry.id;
    setNoteSaving(true);
    try {
      const r = await api.addNote(forId, note.trim());
      if (currentId.current !== forId) return;
      setEvents(r.events);
      setNote('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the note.');
    } finally {
      setNoteSaving(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error('Copy failed');
    }
  }

  const CatIcon = inquiry ? CATEGORY_ICON[inquiry.category] : null;
  const firstName =
    inquiry?.name
      .replace(/\(.*\)/, '')
      .trim()
      .split(/\s+/)[0] ?? '';
  const replyText = inquiry
    ? `Hello ${firstName}, this is regarding your ${CATEGORY_LABEL[inquiry.category].toLowerCase()} inquiry (${inquiry.ref}).`
    : '';

  return (
    <div className={`drawer-root ${open ? 'is-open' : ''}`} inert={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <aside
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={inquiry ? `Inquiry ${inquiry.ref} from ${inquiry.name}` : 'Inquiry details'}
        tabIndex={-1}
      >
        <header className="drawer-head">
          <span className="mono drawer-ref">{inquiry?.ref ?? '········'}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details">
            <X size={20} />
          </button>
        </header>

        {error && <p className="drawer-error">{error}</p>}

        {!inquiry && !error && open && (
          <div className="drawer-body">
            <span className="skeleton" style={{ width: '60%', height: 30 }} />
            <span className="skeleton" style={{ width: '40%', height: 16 }} />
            <span className="skeleton" style={{ width: '100%', height: 110 }} />
            <span className="skeleton" style={{ width: '100%', height: 70 }} />
          </div>
        )}

        {inquiry && CatIcon && (
          <div className="drawer-body">
            <section className="person">
              <span className="avatar avatar-lg" aria-hidden="true">
                {initials(inquiry.name)}
              </span>
              <div>
                <h2>{inquiry.name}</h2>
                <div className="chips">
                  <span className="chip">{USER_TYPE_LABEL[inquiry.userType]}</span>
                  <span className={`chip chip-cat cat-${inquiry.category}`}>
                    <CatIcon size={13} /> {CATEGORY_LABEL[inquiry.category]}
                  </span>
                  <StatusPill status={inquiry.status} />
                </div>
              </div>
            </section>

            <section className="contact-grid" aria-label="Contact details">
              <div className="contact-item">
                <Phone size={15} />
                <a href={`tel:${inquiry.phone}`} className="mono">
                  {formatPhone(inquiry.phone)}
                </a>
                <button
                  type="button"
                  className="icon-btn icon-btn-sm"
                  onClick={() => copy(inquiry.phone, 'Phone number')}
                  aria-label="Copy phone number"
                >
                  <Copy size={14} />
                </button>
              </div>
              <div className="contact-item">
                <Mail size={15} />
                <a href={`mailto:${inquiry.email}`}>{inquiry.email}</a>
                <button type="button" className="icon-btn icon-btn-sm" onClick={() => copy(inquiry.email, 'Email')} aria-label="Copy email">
                  <Copy size={14} />
                </button>
              </div>
            </section>

            <div className="quick-actions">
              <a className="btn btn-ghost btn-sm" href={`tel:${inquiry.phone}`}>
                <Phone size={15} /> Call
              </a>
              <a className="btn btn-ghost btn-sm btn-wa" href={whatsappLink(inquiry.phone, replyText)} target="_blank" rel="noreferrer">
                <MessageCircle size={15} /> WhatsApp
              </a>
              <a
                className="btn btn-ghost btn-sm"
                href={`mailto:${inquiry.email}?subject=${encodeURIComponent(`Re: your inquiry ${inquiry.ref}`)}&body=${encodeURIComponent(replyText + '\n\n')}`}
              >
                <Mail size={15} /> Email
              </a>
            </div>

            <section>
              <h3 className="drawer-h">Message</h3>
              <blockquote className="message">{inquiry.message}</blockquote>
              <p className="received">
                Received {formatDateTime(inquiry.createdAt)} · {timeAgo(inquiry.createdAt)}
              </p>
            </section>

            <section>
              <h3 className="drawer-h">Status</h3>
              <div className="status-steps" role="radiogroup" aria-label="Status">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={inquiry.status === s}
                    className={`status-step status-${s} ${inquiry.status === s ? 'active' : ''}`}
                    onClick={() => changeStatus(s)}
                    disabled={!!saving}
                    title={STATUS_HINT[s]}
                  >
                    {saving === s ? <span className="spinner" /> : inquiry.status === s ? <Check size={14} strokeWidth={3} /> : null}
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="drawer-h">Activity</h3>
              <ol className="timeline">
                <li>
                  <span className="tl-dot tl-dot-start" />
                  <div>
                    <p>Inquiry received from the website form</p>
                    <time>{formatDateTime(inquiry.createdAt)}</time>
                  </div>
                </li>
                {events.map((e) => (
                  <li key={e.id} className={e.kind === 'note' ? 'tl-note' : ''}>
                    <span className="tl-dot" />
                    <div>
                      {e.kind === 'status_change' ? (
                        <p>
                          <strong>{e.adminName ?? 'An admin'}</strong> moved it from {STATUS_LABEL[e.fromStatus!]} to{' '}
                          <strong>{STATUS_LABEL[e.toStatus!]}</strong>
                        </p>
                      ) : (
                        <>
                          <p>
                            <strong>{e.adminName ?? 'An admin'}</strong> added a note
                          </p>
                          <p className="note-text">{e.note}</p>
                        </>
                      )}
                      <time>{formatDateTime(e.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>

              <form className="note-form" onSubmit={addNote}>
                <label htmlFor="note" className="sr-only">
                  Add an internal note
                </label>
                <textarea
                  id="note"
                  className="textarea"
                  rows={2}
                  maxLength={1000}
                  placeholder="Add an internal note, e.g. 'Called back, sending the fee PDF on WhatsApp'"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addNote();
                  }}
                />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!note.trim() || noteSaving}>
                  {noteSaving ? <span className="spinner" /> : <Send size={14} />} Add note
                </button>
              </form>
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
