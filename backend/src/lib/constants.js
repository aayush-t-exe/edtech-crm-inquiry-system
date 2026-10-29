// Single source of truth for the allowed values. These match the CHECK constraints in schema.sql.

export const USER_TYPES = ['parent', 'student', 'school'];
export const CATEGORIES = ['scholarship', 'concert', 'admission', 'general'];
export const STATUSES = ['new', 'contacted', 'in_progress', 'resolved', 'closed'];

export const LABELS = {
  parent: 'Parent',
  student: 'Student',
  school: 'School',
  scholarship: 'Scholarship',
  concert: 'Concert',
  admission: 'Admission',
  general: 'General Query',
  new: 'New',
  contacted: 'Contacted',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export function formatRef(refNo) {
  return `INQ-${String(refNo).padStart(5, '0')}`;
}
