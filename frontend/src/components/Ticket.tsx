import { Award, GraduationCap, HelpCircle, Music } from 'lucide-react';
import { CATEGORY_LABEL, USER_TYPE_LABEL, type Category, type UserType } from '../lib/constants';

export const CATEGORY_ICON = {
  scholarship: Award,
  concert: Music,
  admission: GraduationCap,
  general: HelpCircle,
} satisfies Record<Category, unknown>;

type Props = {
  userType: UserType | '';
  category: Category | '';
  name: string;
  contact: string;
  message: string;
  refNo?: string;
  date?: string;
  stamped?: boolean;
  className?: string;
};

// The page's signature element: a live preview of the inquiry as a ticket. It fills in as the
// visitor types, then gets stamped with the real reference number from the database.
export function Ticket({ userType, category, name, contact, message, refNo, date, stamped, className = '' }: Props) {
  const Icon = category ? CATEGORY_ICON[category] : HelpCircle;
  const today = date ?? new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className={`ticket ${stamped ? 'is-stamped' : ''} ${category ? `cat-${category}` : ''} ${className}`} aria-hidden="true">
      <div className="ticket-stub">
        <span className="ticket-stub-icon">
          <Icon size={22} strokeWidth={2.2} />
        </span>
        <span className="ticket-stub-label">Inquiry</span>
      </div>

      <div className="ticket-body">
        <div className="ticket-row ticket-head">
          <span className={`ticket-ref mono ${refNo ? 'is-real' : ''}`}>{refNo ?? 'INQ-·····'}</span>
          <span className="ticket-date mono">{today}</span>
        </div>

        <div className="ticket-grid">
          <div>
            <span className="ticket-key">From</span>
            <span className={`ticket-val ${name ? '' : 'is-empty'}`}>{name || 'Your name'}</span>
          </div>
          <div>
            <span className="ticket-key">As a</span>
            <span className={`ticket-val ${userType ? '' : 'is-empty'}`}>{userType ? USER_TYPE_LABEL[userType] : '—'}</span>
          </div>
          <div className="ticket-span">
            <span className="ticket-key">About</span>
            <span className={`ticket-val ticket-cat ${category ? '' : 'is-empty'}`}>
              {category ? CATEGORY_LABEL[category] : 'Pick a category'}
            </span>
          </div>
        </div>

        <p className={`ticket-msg ${message ? '' : 'is-empty'}`}>{message || 'Your question will appear here as you type it.'}</p>

        <div className="ticket-row ticket-foot">
          <span className={`ticket-contact mono ${contact ? '' : 'is-empty'}`}>{contact || 'phone · email'}</span>
          <span className="ticket-barcode" />
        </div>
      </div>

      <div className="ticket-stamp">
        <span>Received</span>
        <small className="mono">{refNo}</small>
      </div>
    </div>
  );
}
