import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import '../styles/login.css';

// Shown on the live demo so evaluators can log in. Leave these unset in a real deployment.
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;

export default function LoginPage() {
  const { admin, checking, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!checking && admin) return <Navigate to={from} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="login">
      <div className="grain" />
      <div className="login-glow" aria-hidden="true" />

      <Link to="/" className="login-back">
        <ArrowLeft size={16} /> Inquiry form
      </Link>

      <main className="login-card">
        <div className="login-head">
          <span className="login-icon" aria-hidden="true">
            <KeyRound size={22} />
          </span>
          <h1>Admin sign in</h1>
          <p>See and manage every inquiry from parents, students and schools.</p>
        </div>

        <form onSubmit={onSubmit} noValidate className="login-form">
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!error}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                className="input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!error}
              />
              <button
                type="button"
                className="icon-btn password-toggle"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? 'Hide password' : 'Show password'}
                aria-pressed={show}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="form-error" role="alert">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary login-submit" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner" /> Signing in…
              </>
            ) : (
              <>
                Sign in <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {DEMO_EMAIL && DEMO_PASSWORD && (
          <div className="demo-box">
            <div>
              <strong>Evaluating this project?</strong>
              <span className="mono">
                {DEMO_EMAIL} · {DEMO_PASSWORD}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setEmail(DEMO_EMAIL);
                setPassword(DEMO_PASSWORD);
                setError('');
              }}
            >
              Fill in
            </button>
          </div>
        )}

        <p className="login-foot">
          <ShieldCheck size={15} /> Custom JWT auth · bcrypt-hashed passwords · httpOnly session cookie
        </p>
      </main>
    </div>
  );
}
