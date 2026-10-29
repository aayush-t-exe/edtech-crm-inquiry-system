const TZ = 'Asia/Kolkata';

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string) {
  return `${formatDate(iso)}, ${formatTime(iso)}`;
}

// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date.
export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return formatDate(iso);
}

// "+919876543210" -> "+91 98765 43210"; other formats are shown as stored.
export function formatPhone(phone: string) {
  const m = phone.match(/^\+91(\d{5})(\d{5})$/);
  if (m) return `+91 ${m[1]} ${m[2]}`;
  const local = phone.match(/^(\d{5})(\d{5})$/);
  if (local) return `${local[1]} ${local[2]}`;
  return phone;
}

// wa.me needs the full international number without "+". Bare 10-digit numbers are assumed Indian.
export function whatsappLink(phone: string, text?: string) {
  const digits = phone.replace(/\D/g, '');
  const intl = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function initials(name: string) {
  const parts = name
    .replace(/\(.*\)/, '')
    .trim()
    .split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
