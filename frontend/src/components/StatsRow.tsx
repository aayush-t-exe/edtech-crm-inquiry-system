import { ArrowDownRight, ArrowUpRight, Inbox, Minus, Sparkles } from 'lucide-react';
import type { Stats } from '../lib/api';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../lib/constants';

type Props = {
  stats: Stats | null;
  activeCategory?: string;
  onCategory: (c: Category) => void;
  onShowNew: () => void;
};

const CAT_COLOR: Record<Category, string> = {
  scholarship: 'var(--teal)',
  concert: 'var(--coral)',
  admission: 'var(--navy)',
  general: '#8a97a3',
};

export function StatsRow({ stats, activeCategory, onCategory, onShowNew }: Props) {
  if (!stats) {
    return (
      <div className="stats" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="stat-card">
            <span className="skeleton" style={{ width: '45%', height: 12 }} />
            <span className="skeleton" style={{ width: '35%', height: 34, marginTop: 10 }} />
            <span className="skeleton" style={{ width: '70%', height: 12, marginTop: 12 }} />
          </div>
        ))}
      </div>
    );
  }

  const max = Math.max(1, ...stats.daily.map((d) => d.n));
  const delta = stats.last7Days - stats.previous7Days;
  const pct = stats.previous7Days ? Math.round((delta / stats.previous7Days) * 100) : null;
  const Trend = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;

  return (
    <div className="stats">
      <div className="stat-card">
        <span className="stat-label">
          <Inbox size={15} /> Total inquiries
        </span>
        <span className="stat-value">{stats.total.toLocaleString('en-IN')}</span>
        <div className="spark" role="img" aria-label={`Inquiries per day, last 14 days: ${stats.daily.map((d) => d.n).join(', ')}`}>
          {stats.daily.map((d, i) => (
            <span
              key={d.day}
              className={i === stats.daily.length - 1 ? 'today' : ''}
              style={{ height: `${Math.max(6, (d.n / max) * 100)}%`, animationDelay: `${i * 25}ms` }}
              title={`${d.day}: ${d.n}`}
            />
          ))}
        </div>
        <span className="stat-foot">Last 14 days</span>
      </div>

      <button type="button" className="stat-card stat-new" onClick={onShowNew}>
        <span className="stat-label">
          <Sparkles size={15} /> Waiting for a reply
        </span>
        <span className="stat-value">{stats.new.toLocaleString('en-IN')}</span>
        <span className="stat-foot">{stats.new === 0 ? 'All caught up' : 'Status "New" · click to show them'}</span>
      </button>

      <div className="stat-card">
        <span className="stat-label">This week</span>
        <span className="stat-value">{stats.last7Days.toLocaleString('en-IN')}</span>
        <span className={`trend ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`}>
          <Trend size={15} />
          {pct === null ? `${stats.previous7Days} the week before` : `${Math.abs(pct)}% vs previous 7 days`}
        </span>
      </div>

      <div className="stat-card stat-breakdown">
        <span className="stat-label">By category</span>
        <div className="breakdown-bar" aria-hidden="true">
          {CATEGORIES.map((c) =>
            stats.byCategory[c] ? (
              <span
                key={c}
                style={{ flexGrow: stats.byCategory[c], background: CAT_COLOR[c] }}
                title={`${CATEGORY_LABEL[c]}: ${stats.byCategory[c]}`}
              />
            ) : null,
          )}
        </div>
        <ul className="legend">
          {CATEGORIES.map((c) => (
            <li key={c}>
              <button
                type="button"
                className={activeCategory === c ? 'active' : ''}
                onClick={() => onCategory(c)}
                aria-pressed={activeCategory === c}
              >
                <span className="legend-dot" style={{ background: CAT_COLOR[c] }} />
                {CATEGORY_LABEL[c]}
                <span className="legend-n mono">{stats.byCategory[c]}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
