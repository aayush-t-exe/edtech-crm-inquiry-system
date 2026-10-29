import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, LogOut, RefreshCw, Search, SearchX, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { InquiryDrawer } from '../components/InquiryDrawer';
import { StatsRow } from '../components/StatsRow';
import { StatusSelect } from '../components/Status';
import { CATEGORY_ICON } from '../components/Ticket';
import { api, ApiError, type Filters, type Inquiry, type InquiryPage, type Stats } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  STATUSES,
  STATUS_LABEL,
  USER_TYPES,
  USER_TYPE_LABEL,
  type Category,
  type Status,
} from '../lib/constants';
import { formatDate, formatPhone, formatTime, initials } from '../lib/format';
import '../styles/admin.css';

const FILTER_KEYS = ['q', 'category', 'userType', 'status', 'from', 'to', 'sort', 'page', 'pageSize'] as const;

export default function DashboardPage() {
  const { admin, logout } = useAuth();
  const [params, setParams] = useSearchParams();

  // Filters live in the URL, so a filtered view can be bookmarked, shared or reloaded.
  const filters: Filters = useMemo(() => {
    const f: Filters = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) (f as Record<string, string | number>)[k] = k === 'page' || k === 'pageSize' ? Number(v) : v;
    }
    return f;
  }, [params]);
  const selectedId = params.get('inquiry');

  const updateParams = useCallback(
    (patch: Record<string, string | number | undefined | null>, { resetPage = true } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage && !('page' in patch)) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // ----- search box: typed instantly, sent to the URL/API after a short pause -----
  const [search, setSearch] = useState(filters.q ?? '');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? '') !== search.trim()) updateParams({ q: search.trim() });
    }, 300);
    return () => clearTimeout(t);
  }, [search, filters.q, updateParams]);

  // Press "/" anywhere to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // ----- data -----
  const [data, setData] = useState<InquiryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const requestId = useRef(0);

  const queryKey = JSON.stringify(filters);
  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const page = await api.listInquiries({ pageSize: 20, ...JSON.parse(queryKey) });
      if (id === requestId.current) setData(page); // ignore slow responses for old filters
    } catch (err) {
      if (id === requestId.current) setError(err instanceof ApiError ? err.message : 'Could not load inquiries.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [queryKey]);

  const loadStats = useCallback(() => {
    api
      .stats()
      .then(setStats)
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // A bookmarked ?page=9 after rows were filtered away: jump to the last real page.
  useEffect(() => {
    if (data && data.page > data.totalPages) updateParams({ page: data.totalPages > 1 ? data.totalPages : null });
  }, [data, updateParams]);

  function refresh() {
    load();
    loadStats();
  }

  // ----- actions -----
  async function changeStatus(row: Inquiry, status: Status) {
    const previous = row.status;
    setData((d) => d && { ...d, items: d.items.map((i) => (i.id === row.id ? { ...i, status } : i)) }); // optimistic
    try {
      await api.updateStatus(row.id, status);
      toast.success(`${row.ref} marked as ${STATUS_LABEL[status]}`);
      loadStats();
    } catch (err) {
      setData((d) => d && { ...d, items: d.items.map((i) => (i.id === row.id ? { ...i, status: previous } : i)) });
      toast.error(err instanceof ApiError ? err.message : 'Could not update the status.');
    }
  }

  const onDrawerChanged = useCallback(
    (updated: Inquiry) => {
      setData((d) => d && { ...d, items: d.items.map((i) => (i.id === updated.id ? updated : i)) });
      loadStats();
    },
    [loadStats],
  );
  const closeDrawer = useCallback(() => updateParams({ inquiry: null }, { resetPage: false }), [updateParams]);

  const [exporting, setExporting] = useState(false);
  async function exportCsv() {
    setExporting(true);
    try {
      await api.exportCsv(filters);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  const activeFilterCount = ['q', 'category', 'userType', 'status', 'from', 'to'].filter((k) => filters[k as keyof Filters]).length;
  function clearFilters() {
    setSearch('');
    updateParams({ q: null, category: null, userType: null, status: null, from: null, to: null });
  }

  const sort = filters.sort ?? 'newest';
  const toggleDateSort = () => updateParams({ sort: sort === 'newest' ? 'oldest' : null });
  const toggleNameSort = () => updateParams({ sort: sort === 'name' ? null : 'name' });

  const page = data?.page ?? 1;
  const pageSize = data?.pageSize ?? 20;
  const firstRow = data && data.total ? (page - 1) * pageSize + 1 : 0;
  const lastRow = data ? Math.min(page * pageSize, data.total) : 0;

  return (
    <div className="admin">
      {/* While the detail panel is open, the page behind it can't be focused or clicked. */}
      <div className="admin-page" inert={!!selectedId}>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand brand-admin">
              <span className="brand-mark" aria-hidden="true">
                <svg viewBox="0 0 64 64" width="28" height="28">
                  <rect width="64" height="64" rx="16" fill="#FAF7F0" />
                  <path
                    d="M18 22h28a4 4 0 0 1 4 4v4a4 4 0 0 0 0 8v4a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4v-4a4 4 0 0 0 0-8v-4a4 4 0 0 1 4-4z"
                    fill="#21338B"
                  />
                  <circle cx="46" cy="16" r="5" fill="#FFA500" />
                </svg>
              </span>
              <span>Inquiry Desk</span>
              <span className="brand-tag">Admin</span>
            </div>
            <div className="topbar-right">
              <span className="whoami" title={admin?.email}>
                <span className="avatar avatar-sm" aria-hidden="true">
                  {initials(admin?.name ?? 'A')}
                </span>
                <span className="whoami-text">
                  <strong>{admin?.name}</strong>
                  <small>{admin?.email}</small>
                </span>
              </span>
              <button type="button" className="btn btn-sm topbar-btn" onClick={logout}>
                <LogOut size={15} /> <span className="hide-sm">Log out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="admin-main">
          <div className="page-head">
            <div>
              <h1>Inquiries</h1>
              <p>Every question sent through the website form, newest first.</p>
            </div>
            <div className="page-actions">
              <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} aria-label="Refresh">
                <RefreshCw size={15} className={loading ? 'spin' : ''} /> <span className="hide-sm">Refresh</span>
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={exportCsv} disabled={exporting || !data?.total}>
                {exporting ? <span className="spinner" /> : <Download size={15} />} Export CSV
              </button>
            </div>
          </div>

          <StatsRow
            stats={stats}
            activeCategory={filters.category}
            onCategory={(c: Category) => updateParams({ category: filters.category === c ? null : c })}
            onShowNew={() => updateParams({ status: filters.status === 'new' ? null : 'new' })}
          />

          <section className="panel" aria-label="Inquiries table">
            <div className="filters" role="search">
              <div className="search">
                <Search size={17} aria-hidden="true" />
                <input
                  ref={searchRef}
                  type="search"
                  className="input"
                  placeholder="Search name, phone or INQ number"
                  maxLength={100}
                  aria-label="Search by name, phone number or reference number"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSearch('');
                  }}
                />
                {search ? (
                  <button
                    type="button"
                    className="icon-btn icon-btn-sm search-clear"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                  >
                    <X size={15} />
                  </button>
                ) : (
                  <kbd aria-hidden="true">/</kbd>
                )}
              </div>

              <FilterSelect
                label="Category"
                value={filters.category}
                onChange={(v) => updateParams({ category: v })}
                options={CATEGORIES.map((c) => [c, CATEGORY_LABEL[c]])}
                allLabel="All categories"
              />
              <FilterSelect
                label="User type"
                value={filters.userType}
                onChange={(v) => updateParams({ userType: v })}
                options={USER_TYPES.map((t) => [t, USER_TYPE_LABEL[t]])}
                allLabel="All user types"
              />
              <FilterSelect
                label="Status"
                value={filters.status}
                onChange={(v) => updateParams({ status: v })}
                options={STATUSES.map((s) => [s, STATUS_LABEL[s]])}
                allLabel="All statuses"
              />
              <div className="date-range">
                <label className="sr-only" htmlFor="from">
                  From date
                </label>
                <input
                  id="from"
                  type="date"
                  className="input input-date"
                  value={filters.from ?? ''}
                  max={filters.to}
                  onChange={(e) => updateParams({ from: e.target.value })}
                  title="From date"
                />
                <span aria-hidden="true">–</span>
                <label className="sr-only" htmlFor="to">
                  To date
                </label>
                <input
                  id="to"
                  type="date"
                  className="input input-date"
                  value={filters.to ?? ''}
                  min={filters.from}
                  onChange={(e) => updateParams({ to: e.target.value })}
                  title="To date"
                />
              </div>
              {activeFilterCount > 0 && (
                <button type="button" className="btn btn-sm clear-btn" onClick={clearFilters}>
                  <X size={14} /> Clear {activeFilterCount > 1 ? `${activeFilterCount} filters` : 'filter'}
                </button>
              )}
            </div>

            <div className={`table-wrap ${loading && data ? 'is-refreshing' : ''}`}>
              <div className="loading-bar" aria-hidden="true" />
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Ref</th>
                    <th scope="col" aria-sort={sort === 'name' ? 'ascending' : 'none'}>
                      <button type="button" className="th-sort" onClick={toggleNameSort}>
                        Name {sort === 'name' && <ArrowDown size={13} />}
                      </button>
                    </th>
                    <th scope="col">Phone</th>
                    <th scope="col">Email</th>
                    <th scope="col">User type</th>
                    <th scope="col">Category</th>
                    <th scope="col" aria-sort={sort === 'newest' ? 'descending' : sort === 'oldest' ? 'ascending' : 'none'}>
                      <button type="button" className="th-sort" onClick={toggleDateSort}>
                        Date {sort === 'oldest' ? <ArrowUp size={13} /> : sort === 'newest' ? <ArrowDown size={13} /> : null}
                      </button>
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {!data &&
                    loading &&
                    Array.from({ length: 8 }, (_, i) => (
                      <tr key={i} className="row-skeleton">
                        {Array.from({ length: 8 }, (_, j) => (
                          <td key={j}>
                            <span className="skeleton" style={{ height: 14, width: `${50 + ((i * 7 + j * 13) % 45)}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))}

                  {data?.items.map((row, i) => {
                    const CatIcon = CATEGORY_ICON[row.category];
                    return (
                      <tr
                        key={row.id}
                        className={`row ${row.status === 'new' ? 'is-new' : ''} ${selectedId === row.id ? 'is-selected' : ''}`}
                        style={{ animationDelay: `${Math.min(i, 12) * 18}ms` }}
                        onClick={() => updateParams({ inquiry: row.id }, { resetPage: false })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            updateParams({ inquiry: row.id }, { resetPage: false });
                          }
                        }}
                        tabIndex={0}
                        aria-label={`Open inquiry ${row.ref} from ${row.name}`}
                      >
                        <td data-label="Ref" className="cell-ref mono">
                          {row.ref}
                        </td>
                        <td data-label="Name" className="cell-name">
                          <div className="name-wrap">
                            <span className="avatar" aria-hidden="true">
                              {initials(row.name)}
                            </span>
                            <span className="name-text" title={row.name}>
                              {row.name}
                            </span>
                          </div>
                        </td>
                        <td data-label="Phone" className="cell-phone mono">
                          {formatPhone(row.phone)}
                        </td>
                        <td data-label="Email" className="cell-email">
                          {row.email}
                        </td>
                        <td data-label="User type" className="cell-type">
                          <span className="chip">{USER_TYPE_LABEL[row.userType]}</span>
                        </td>
                        <td data-label="Category" className="cell-cat">
                          <span className={`chip chip-cat cat-${row.category}`}>
                            <CatIcon size={13} /> {CATEGORY_LABEL[row.category]}
                          </span>
                        </td>
                        <td data-label="Date" className="cell-date">
                          <span>{formatDate(row.createdAt)}</span>
                          <small>{formatTime(row.createdAt)}</small>
                        </td>
                        <td data-label="Status" className="cell-status">
                          <StatusSelect value={row.status} onChange={(s) => changeStatus(row, s)} label={`Status of ${row.ref}`} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {data && data.items.length === 0 && (
                <div className="empty">
                  <SearchX size={34} strokeWidth={1.6} />
                  <h3>{activeFilterCount ? 'No inquiries match these filters' : 'No inquiries yet'}</h3>
                  <p>
                    {activeFilterCount
                      ? 'Try a different search or clear the filters.'
                      : 'When someone sends the public form, it will show up here.'}
                  </p>
                  {activeFilterCount > 0 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {error && (
                <div className="empty empty-error" role="alert">
                  <h3>{error}</h3>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
                    <RefreshCw size={14} /> Try again
                  </button>
                </div>
              )}
            </div>

            {data && data.total > 0 && (
              <footer className="pager">
                <span className="pager-info" aria-live="polite">
                  Showing{' '}
                  <strong>
                    {firstRow}–{lastRow}
                  </strong>{' '}
                  of <strong>{data.total}</strong>
                </span>
                <div className="pager-controls">
                  <label className="pager-size">
                    <span className="hide-sm">Rows</span>
                    <select
                      className="select select-sm"
                      value={pageSize}
                      onChange={(e) => updateParams({ pageSize: Number(e.target.value) === 20 ? null : e.target.value })}
                      aria-label="Rows per page"
                    >
                      {[10, 20, 50, 100].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="icon-btn icon-btn-bordered"
                    disabled={page <= 1}
                    onClick={() => updateParams({ page: page - 1 > 1 ? page - 1 : null })}
                    aria-label="Previous page"
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span className="mono pager-page">
                    {page} / {data.totalPages}
                  </span>
                  <button
                    type="button"
                    className="icon-btn icon-btn-bordered"
                    disabled={page >= data.totalPages}
                    onClick={() => updateParams({ page: page + 1 })}
                    aria-label="Next page"
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </footer>
            )}
          </section>
        </main>
      </div>

      <InquiryDrawer id={selectedId} onClose={closeDrawer} onChanged={onDrawerChanged} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  options: [string, string][];
  allLabel: string;
}) {
  return (
    <select
      className={`select select-filter ${value ? 'is-active' : ''}`}
      aria-label={`Filter by ${label.toLowerCase()}`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{allLabel}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}
