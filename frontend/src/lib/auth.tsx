import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, setUnauthorizedHandler, type Admin } from './api';

type AuthState = {
  admin: Admin | null;
  checking: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [checking, setChecking] = useState(true);
  const navigate = useNavigate();

  // On load, ask the backend whether our cookie is still a valid session.
  useEffect(() => {
    api
      .me()
      .then((r) => setAdmin(r.admin))
      .catch(() => setAdmin(null))
      .finally(() => setChecking(false));
  }, []);

  // Any 401 from a protected call means the token expired or was revoked.
  const adminRef = useRef(admin);
  adminRef.current = admin;
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (!adminRef.current) return;
      setAdmin(null);
      toast.error('Your session has ended. Please log in again.', { id: 'session-ended' });
      navigate('/admin/login', { replace: true });
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api.login(email, password);
    setAdmin(r.admin);
  }, []);

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setAdmin(null);
    navigate('/admin/login', { replace: true });
  }, [navigate]);

  const value = useMemo(() => ({ admin, checking, login, logout }), [admin, checking, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
