// Must match backend/src/lib/constants.js and the CHECK constraints in schema.sql.

export const USER_TYPES = ['parent', 'student', 'school'] as const;
export const CATEGORIES = ['scholarship', 'concert', 'admission', 'general'] as const;
export const STATUSES = ['new', 'contacted', 'in_progress', 'resolved', 'closed'] as const;

export type UserType = (typeof USER_TYPES)[number];
export type Category = (typeof CATEGORIES)[number];
export type Status = (typeof STATUSES)[number];

export const USER_TYPE_LABEL: Record<UserType, string> = {
  parent: 'Parent',
  student: 'Student',
  school: 'School',
};

export const CATEGORY_LABEL: Record<Category, string> = {
  scholarship: 'Scholarship',
  concert: 'Concert',
  admission: 'Admission',
  general: 'General Query',
};

export const STATUS_LABEL: Record<Status, string> = {
  new: 'New',
  contacted: 'Contacted',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STATUS_HINT: Record<Status, string> = {
  new: 'Nobody has replied yet',
  contacted: 'First reply sent',
  in_progress: 'Being worked on',
  resolved: 'Question answered',
  closed: 'No further action',
};
