import type { Category, Status, UserType } from './constants';

// All requests go to /api on the same origin. The login cookie (httpOnly) rides along
// automatically, so the dashboard never stores the JWT itself (the token in the login
// response body is there for API clients like curl/Postman).

export class ApiError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// Lets the app react to an expired session from anywhere (see AuthProvider).
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your internet connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized?.();
    throw new ApiError(res.status, data.error || `Request failed (${res.status}).`, data.fields);
  }
  return data as T;
}

export type Admin = { id: string; email: string; name: string };

export type Inquiry = {
  id: string;
  ref: string;
  userType: UserType;
  category: Category;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
};

export type InquiryEvent = {
  id: string;
  kind: 'status_change' | 'note';
  fromStatus: Status | null;
  toStatus: Status | null;
  note: string | null;
  adminName: string | null;
  createdAt: string;
};

export type InquiryPage = { items: Inquiry[]; total: number; page: number; pageSize: number; totalPages: number };

export type Stats = {
  total: number;
  new: number;
  last7Days: number;
  previous7Days: number;
  byCategory: Record<Category, number>;
  byUserType: Record<UserType, number>;
  byStatus: Record<Status, number>;
  daily: { day: string; n: number }[];
};

export type NewInquiry = {
  userType: UserType | '';
  category: Category | '';
  name: string;
  email: string;
  phone: string;
  message: string;
  website: string; // honeypot, always empty for humans
};

export type Filters = {
  q?: string;
  category?: string;
  userType?: string;
  status?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export function filtersToQuery(f: Filters) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== null) params.set(k, String(v));
  return params.toString();
}

export const api = {
  submitInquiry: (body: NewInquiry) =>
    request<{ inquiry: { ref: string; createdAt: string } }>('/inquiries', { method: 'POST', body: JSON.stringify(body) }),

  login: (email: string, password: string) =>
    request<{ admin: Admin; expiresAt: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<{ admin: Admin }>('/auth/me'),

  listInquiries: (f: Filters) => request<InquiryPage>(`/admin/inquiries?${filtersToQuery(f)}`),
  stats: () => request<Stats>('/admin/inquiries/stats'),
  getInquiry: (id: string) => request<{ inquiry: Inquiry; events: InquiryEvent[] }>(`/admin/inquiries/${id}`),
  updateStatus: (id: string, status: Status) =>
    request<{ inquiry: Inquiry; events: InquiryEvent[] }>(`/admin/inquiries/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  addNote: (id: string, note: string) =>
    request<{ events: InquiryEvent[] }>(`/admin/inquiries/${id}/notes`, { method: 'POST', body: JSON.stringify({ note }) }),

  async exportCsv(f: Filters) {
    const { page: _p, pageSize: _s, ...rest } = f;
    const res = await fetch(`/api/admin/inquiries/export.csv?${filtersToQuery(rest)}`, { credentials: 'same-origin' });
    if (res.status === 401) onUnauthorized?.();
    if (!res.ok) throw new ApiError(res.status, 'Export failed. Please try again.');
    const blob = await res.blob();
    const name = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'inquiries.csv';
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); // revoking immediately can cancel the download in some browsers
  },
};
