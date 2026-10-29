import { AlertCircle, ArrowRight, Check, Copy, LockKeyhole, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Ticket } from '../components/Ticket';
import { api, ApiError, type NewInquiry } from '../lib/api';
import { CATEGORIES, CATEGORY_LABEL, USER_TYPES, USER_TYPE_LABEL } from '../lib/constants';
import '../styles/public.css';

const EMPTY: NewInquiry = { userType: '', category: '', name: '', email: '', phone: '', message: '', website: '' };
const MESSAGE_MAX = 2000;

type Field = keyof Omit<NewInquiry, 'website'>;

// Mirrors the server rules (backend/src/lib/validation.js) so people get instant feedback.
// The server still validates everything; this is only for comfort.
function validate(v: NewInquiry): Partial<Record<Field, string>> {
  const e: Partial<Record<Field, string>> = {};
  if (!v.userType) e.userType = 'Choose who you are.';
  if (!v.category) e.category = 'Choose what your question is about.';
  if (v.name.trim().length < 2) e.name = 'Enter your full name.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = 'Enter a valid email address.';
  const digits = v.phone.replace(/\D/g, '');
  if (/[^0-9+\-\s().]/.test(v.phone) || digits.length < 7 || digits.length > 15) e.phone = 'Enter a valid phone number.';
  if (v.message.trim().length < 10) e.message = 'Tell us a little more (at least 10 characters).';
  if (v.message.length > MESSAGE_MAX) e.message = `Keep it under ${MESSAGE_MAX} characters.`;
  return e;
}

export function InquiryPage() {
  const [values, setValues] = useState<NewInquiry>(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState<{ ref: string; createdAt: string } | null>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const clientErrors = validate(values);
  const errorFor = (f: Field) => serverErrors[f] ?? (touched[f] ? clientErrors[f] : undefined);

  const set = (f: keyof NewInquiry) => (e: { target: { value: string } }) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    if (serverErrors[f as Field]) setServerErrors((s) => ({ ...s, [f]: undefined }));
  };
  const blur = (f: Field) => () => setTouched((t) => ({ ...t, [f]: true }));

  useEffect(() => {
    if (result) successRef.current?.focus();
  }, [result]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const errs = validate(values);
    if (Object.keys(errs).length) {
      setTouched({ userType: true, category: true, name: true, email: true, phone: true, message: true });
      // Move focus to the first problem so keyboard and screen-reader users land on it.
      const first = (['userType', 'category', 'name', 'email', 'phone', 'message'] as Field[]).find((f) => errs[f]);
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const { inquiry } = await api.submitInquiry(values);
      setResult(inquiry);
    } catch (err) {
      if (err instanceof ApiError && err.fields) setServerErrors(err.fields as Partial<Record<Field, string>>);
      setFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setValues(EMPTY);
    setTouched({});
    setServerErrors({});
    setResult(null);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[name="userType"]')?.focus());
  }

  async function copyRef() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.ref);
      toast.success(`Copied ${result.ref}`);
    } catch {
      toast.error('Could not copy. Please note the number down.');
    }
  }

  const contact = [values.phone.trim(), values.email.trim()].filter(Boolean).join(' · ');
  const ticket = (
    <Ticket
      userType={values.userType}
      category={values.category}
      name={values.name.trim()}
      contact={contact}
      message={values.message.trim()}
      refNo={result?.ref}
      stamped={!!result}
    />
  );

  return (
    <div className="public">
      <header className="public-nav">
        <Link to="/" className="brand" aria-label="Inquiry Desk home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="30" height="30">
              <rect width="64" height="64" rx="16" fill="#FAF7F0" />
              <path
                d="M18 22h28a4 4 0 0 1 4 4v4a4 4 0 0 0 0 8v4a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4v-4a4 4 0 0 0 0-8v-4a4 4 0 0 1 4-4z"
                fill="#21338B"
              />
              <circle cx="46" cy="16" r="5" fill="#FFA500" />
            </svg>
          </span>
          <span>Inquiry Desk</span>
        </Link>
        <Link to="/admin/login" className="nav-admin">
          <LockKeyhole size={15} /> Admin
        </Link>
      </header>

      <main className="public-grid">
        <section className="intro" aria-labelledby="intro-title">
          <div className="grain" />
          <div className="intro-glow" aria-hidden="true" />
          <div className="intro-inner">
            <p className="eyebrow">For parents, students and schools</p>
            <h1 id="intro-title">
              Ask us about admissions, scholarships or <em>concerts.</em>
            </h1>
            <p className="intro-lede">
              One short form. You get a reference number straight away, and your question lands on our team's desk.
            </p>

            <div className="intro-ticket">{ticket}</div>

            <ol className="steps">
              <li>
                <span className="mono">01</span> Send your question
              </li>
              <li>
                <span className="mono">02</span> Get a reference number
              </li>
              <li>
                <span className="mono">03</span> We reply by phone or email
              </li>
            </ol>
          </div>
        </section>

        <section className="form-side" aria-label="Inquiry form">
          {result ? (
            <div className="success" ref={successRef} tabIndex={-1} aria-live="polite">
              <span className="success-check" aria-hidden="true">
                <Check size={26} strokeWidth={3} />
              </span>
              <h2>Thanks, {values.name.trim().split(' ')[0]}. We've got it.</h2>
              <p className="success-sub">Keep this reference number. Quote it if you call or email us about this question.</p>
              <button type="button" className="ref-chip" onClick={copyRef} aria-label={`Copy reference number ${result.ref}`}>
                <span className="mono">{result.ref}</span>
                <Copy size={16} />
              </button>
              <div className="success-ticket">{ticket}</div>
              <ul className="next">
                <li>Our team sees your inquiry on their dashboard now.</li>
                <li>
                  We'll reach you on <strong>{values.phone.trim()}</strong> or <strong>{values.email.trim()}</strong>.
                </li>
              </ul>
              <button type="button" className="btn btn-ghost" onClick={reset}>
                <RotateCcw size={16} /> Send another inquiry
              </button>
            </div>
          ) : (
            <form ref={formRef} className="inquiry-form" onSubmit={onSubmit} noValidate>
              <div className="form-head">
                <h2>Send an inquiry</h2>
                <p>All fields are required.</p>
              </div>

              <div className="row-2">
                <div className="field">
                  <label htmlFor="userType">I am a</label>
                  <select
                    id="userType"
                    name="userType"
                    className="select"
                    required
                    value={values.userType}
                    onChange={set('userType')}
                    onBlur={blur('userType')}
                    aria-invalid={!!errorFor('userType')}
                    aria-describedby={errorFor('userType') ? 'userType-error' : undefined}
                  >
                    <option value="" disabled>
                      Select user type
                    </option>
                    {USER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {USER_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </select>
                  <FieldError id="userType-error" message={errorFor('userType')} />
                </div>

                <div className="field">
                  <label htmlFor="category">My question is about</label>
                  <select
                    id="category"
                    name="category"
                    className="select"
                    required
                    value={values.category}
                    onChange={set('category')}
                    onBlur={blur('category')}
                    aria-invalid={!!errorFor('category')}
                    aria-describedby={errorFor('category') ? 'category-error' : undefined}
                  >
                    <option value="" disabled>
                      Select category
                    </option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  <FieldError id="category-error" message={errorFor('category')} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="name">Full name</label>
                <input
                  id="name"
                  name="name"
                  className="input"
                  autoComplete="name"
                  placeholder="e.g. Riya Sharma"
                  maxLength={100}
                  value={values.name}
                  onChange={set('name')}
                  onBlur={blur('name')}
                  aria-invalid={!!errorFor('name')}
                  aria-describedby={errorFor('name') ? 'name-error' : undefined}
                />
                <FieldError id="name-error" message={errorFor('name')} />
              </div>

              <div className="row-2">
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    className="input"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    maxLength={254}
                    value={values.email}
                    onChange={set('email')}
                    onBlur={blur('email')}
                    aria-invalid={!!errorFor('email')}
                    aria-describedby={errorFor('email') ? 'email-error' : undefined}
                  />
                  <FieldError id="email-error" message={errorFor('email')} />
                </div>
                <div className="field">
                  <label htmlFor="phone">Phone number</label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    className="input"
                    autoComplete="tel"
                    inputMode="tel"
                    placeholder="+91 98765 43210"
                    maxLength={20}
                    value={values.phone}
                    onChange={set('phone')}
                    onBlur={blur('phone')}
                    aria-invalid={!!errorFor('phone')}
                    aria-describedby={errorFor('phone') ? 'phone-error' : undefined}
                  />
                  <FieldError id="phone-error" message={errorFor('phone')} />
                </div>
              </div>

              <div className="field">
                <label htmlFor="message">Your message</label>
                <textarea
                  id="message"
                  name="message"
                  className="textarea"
                  rows={5}
                  placeholder="e.g. What is the admission process for Class 11 Science? Is there an entrance test?"
                  value={values.message}
                  onChange={set('message')}
                  onBlur={blur('message')}
                  aria-invalid={!!errorFor('message')}
                  aria-describedby={`message-count${errorFor('message') ? ' message-error' : ''}`}
                />
                <div className="field-foot">
                  <FieldError id="message-error" message={errorFor('message')} />
                  <span id="message-count" className={`count mono ${values.message.length > MESSAGE_MAX ? 'over' : ''}`}>
                    {values.message.length}/{MESSAGE_MAX}
                  </span>
                </div>
              </div>

              {/* Honeypot: hidden from people and screen readers; bots tend to fill it. */}
              <div className="hp" aria-hidden="true">
                <label htmlFor="website">Website</label>
                <input id="website" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
              </div>

              {formError && (
                <div className="form-error" role="alert">
                  <AlertCircle size={18} /> {formError}
                </div>
              )}

              <button type="submit" className="btn btn-primary btn-submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <span className="spinner" /> Sending…
                  </>
                ) : (
                  <>
                    Send inquiry <ArrowRight size={18} />
                  </>
                )}
              </button>
              <p className="privacy">We only use these details to answer your question.</p>
            </form>
          )}
        </section>
      </main>

      <footer className="public-foot">
        <span>EdTech CRM &amp; Inquiry System · built by Aayush Thakur for the K12 Hunar full-stack assessment</span>
        <Link to="/admin/login">Admin login</Link>
      </footer>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="field-error" role="alert">
      <AlertCircle size={14} /> {message}
    </span>
  );
}
