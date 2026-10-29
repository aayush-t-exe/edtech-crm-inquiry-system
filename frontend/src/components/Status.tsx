import { STATUSES, STATUS_LABEL, type Status } from '../lib/constants';

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

// A native <select> dressed as a pill: keyboard, screen-reader and touch friendly for free.
export function StatusSelect({
  value,
  onChange,
  label,
  disabled,
}: {
  value: Status;
  onChange: (s: Status) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className={`status status-${value} status-select`} onClick={(e) => e.stopPropagation()}>
      <span className="status-dot" aria-hidden="true" />
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as Status)}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </span>
  );
}
