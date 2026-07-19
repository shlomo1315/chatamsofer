// תוויות המייל המובנות — מקור אמת יחיד.
// ⚠️ אלה קיימות כ-fallback בלבד ואינן נשמרות ב-DB עד שנוצרת/נערכת תווית.
// כל קוד שכותב את mail_label_defs חייב להתחיל מהן (לא ממערך ריק), אחרת
// כתיבה ראשונה תמחק את כל התוויות המובנות מכל מסכי המייל.

export interface MailLabel { id: string; name: string; color: string }

export const DEFAULT_LABELS: MailLabel[] = [
  { id: 'label-loans',     name: 'הלוואות',      color: '#3b82f6' },
  { id: 'label-maternity', name: 'יולדות',       color: '#ec4899' },
  { id: 'label-widows',    name: 'אלמנות',       color: '#8b5cf6' },
  { id: 'label-decision',  name: 'הגורם המאשר',   color: '#0ea5e9' },
  { id: 'label-urgent',    name: 'דחוף',         color: '#ef4444' },
  { id: 'label-done',      name: 'טופל',         color: '#22c55e' },
]
