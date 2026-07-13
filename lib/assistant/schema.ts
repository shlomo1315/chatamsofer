import type { SectionKey } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// רישום הטבלאות שהעוזר רשאי לקרוא.
//
// זה מקור האמת היחיד. כלי query_data גנרי שואל *דרך* הרישום הזה, ולכן:
//   • כדי לחשוף מחלקה חדשה לעוזר — מוסיפים כאן שורה אחת. זה הכל.
//   • טבלה שאינה כאן — העוזר לא יכול לגעת בה. גם אם יבקש במפורש.
//
// perm=null פירושו "פתוח לכל איש צוות מחובר" (למשל תיבת המייל, שאינה אגף).
// ─────────────────────────────────────────────────────────────────────────────

export interface TableSpec {
  /** שם הטבלה במסד */
  table: string
  /** שם בעברית — מה שהעוזר והמשתמש רואים */
  label: string
  /** הרשאת הצפייה הנדרשת. null = כל איש צוות מחובר. */
  perm: SectionKey | null
  /** תיאור לעוזר: מה יש בטבלה ומתי להשתמש בה */
  about: string
  /** העמודות שמותר להחזיר. הגנה מפני חשיפת שדות רגישים. */
  columns: string[]
  /** עמודת התאריך לסינון "בטווח X ימים" */
  dateCol?: string
  /** עמודות שאפשר לחפש בהן טקסט חופשי */
  searchCols?: string[]
  /** עמודת הסטטוס, אם יש */
  statusCol?: string
  /** קשר למשפחה — כדי לצרף שם בעלים לרשומה */
  joinBeneficiary?: boolean
  /**
   * מסלול המסך במערכת, עם {id} כמציין מקום.
   * מאפשר לעוזר לצרף לתשובה כפתור שמוביל ישירות לכרטסת.
   */
  route?: string
}

export const TABLES: TableSpec[] = [
  {
    table: 'beneficiaries',
    label: 'משפחות רשומות',
    perm: 'beneficiaries',
    about: 'כל המשפחות הרשומות באיגוד הצאצאים: פרטים אישיים, כתובת, ילדים, סטטוס אישור הרישום, שיוך לעץ הדורות.',
    columns: ['id', 'family_name', 'full_name', 'spouse_name', 'id_number', 'spouse_id_number', 'phone', 'email', 'city', 'address', 'marital_status', 'children_count', 'children', 'eligibility_status', 'rejection_reason', 'lineage_node_id', 'created_at'],
    dateCol: 'created_at',
    searchCols: ['family_name', 'full_name', 'spouse_name', 'city'],
    route: '/admin/beneficiaries/{id}',
    statusCol: 'eligibility_status',
  },
  {
    table: 'lineage_nodes',
    label: 'עץ הדורות',
    perm: 'lineage',
    about: 'שושלת החתם סופר. כל שורה היא אדם/ענף. generation = מספר הדור, parent_id = האב בעץ. משפחות משויכות דרך beneficiaries.lineage_node_id.',
    columns: ['id', 'name', 'generation', 'parent_id', 'notes'],
    searchCols: ['name'],
  },
  {
    table: 'maternity_aids',
    label: 'יולדות',
    perm: 'maternity',
    about: 'בקשות הבראה ליולדות: תאריך לידה, בית החלמה, כרטיס מזון, מוקד חלוקה, האם הגיעה לבית ההחלמה.',
    columns: ['id', 'birth_date', 'baby_name', 'baby_gender', 'recovery_home', 'recovery_arrived', 'recovery_nights', 'card_number', 'card_voucher_status', 'six_weeks_end', 'status', 'created_at'],
    dateCol: 'created_at',
    statusCol: 'status',
    joinBeneficiary: true,
    route: '/admin/maternity/{id}',
  },
  {
    table: 'loans',
    label: 'הלוואות',
    perm: 'loans',
    about: 'בקשות הלוואה מהגמ"ח: סכום מבוקש ומאושר, מספר תשלומים, מטרה, האם בוצעה.',
    columns: ['id', 'amount', 'approved_amount', 'installments', 'monthly_payment', 'purpose', 'disbursed_at', 'status', 'created_at'],
    dateCol: 'created_at',
    statusCol: 'status',
    joinBeneficiary: true,
    route: '/admin/loans/{id}',
  },
  {
    table: 'financial_aid_requests',
    label: 'סיוע רפואי',
    perm: 'financial_aid',
    about: 'בקשות סיוע רפואי: סיבת הבקשה, הסכום שאושר.',
    columns: ['id', 'reason', 'approved_amount', 'status', 'created_at'],
    dateCol: 'created_at',
    statusCol: 'status',
    joinBeneficiary: true,
    route: '/admin/financial-aid/{id}',
  },
  {
    table: 'widow_requests',
    label: 'אלמנות ויתומים',
    perm: 'widows',
    about: 'בקשות סיוע לאלמנות ויתומים.',
    columns: ['id', 'request_type', 'description', 'amount', 'status', 'created_at'],
    dateCol: 'created_at',
    statusCol: 'status',
    joinBeneficiary: true,
    route: '/admin/widows/{id}',
  },
  {
    table: 'card_centers',
    label: 'מוקדי חלוקת כרטיסים',
    perm: 'maternity',
    about: 'המוקדים שבהם היולדות אוספות את כרטיס המזון, כולל המלאי בכל מוקד.',
    columns: ['id', 'name', 'city', 'address', 'stock', 'is_active', 'phone'],
    searchCols: ['name', 'city'],
  },
  {
    table: 'recovery_homes',
    label: 'בתי החלמה',
    perm: 'maternity',
    about: 'רשימת בתי ההחלמה ליולדות.',
    columns: ['id', 'name', 'availability', 'report_email'],
    searchCols: ['name'],
  },
  {
    table: 'gratitude_letters',
    label: 'מכתבי ברכה לנדיב',
    perm: 'maternity',
    about: 'מכתבי הברכה שיולדות כתבו לנדיב שתמך בהן. source = מהיכן הגיע (טופס/מייל).',
    columns: ['id', 'body', 'source', 'created_at', 'maternity_aid_id'],
    dateCol: 'created_at',
  },
  {
    table: 'inbound_emails',
    label: 'דואר נכנס',
    perm: null,   // תיבת המייל אינה אגף — פתוחה לכל הצוות
    about: 'כל המיילים שהתקבלו במערכת, לפי תיבה (to_email). is_read = האם נקרא.',
    columns: ['id', 'subject', 'from_email', 'from_name', 'to_email', 'is_read', 'created_at'],
    dateCol: 'created_at',
    searchCols: ['subject', 'from_email'],
  },
  {
    table: 'sent_emails',
    label: 'דואר יוצא',
    perm: null,
    about: 'מיילים שהמערכת שלחה.',
    columns: ['id', 'subject', 'to_email', 'department', 'created_at'],
    dateCol: 'created_at',
    searchCols: ['subject', 'to_email'],
  },
  {
    table: 'campaigns',
    label: 'קמפיינים וניוזלטר',
    perm: 'newsletter',
    about: 'קמפייני דיוור: כמה נשלחו, כמה נפתחו, סטטוס.',
    columns: ['id', 'name', 'subject', 'status', 'sent_count', 'open_count', 'click_count', 'created_at'],
    dateCol: 'created_at',
    searchCols: ['name', 'subject'],
    statusCol: 'status',
  },
  {
    table: 'documents',
    label: 'מסמכים',
    perm: 'beneficiaries',
    about: 'מסמכים שהועלו על ידי המשפחות.',
    columns: ['id', 'doc_type', 'file_name', 'beneficiary_id', 'created_at'],
    dateCol: 'created_at',
  },
  {
    table: 'survey_responses',
    label: 'משוב בתי החלמה',
    perm: 'maternity',
    about: 'תשובות היולדות על טיב השירות בבית ההחלמה.',
    columns: ['id', 'scores', 'comment', 'created_at'],
    dateCol: 'created_at',
  },
]

export function tableByName(name: string): TableSpec | undefined {
  return TABLES.find(t => t.table === name)
}

// ─────────────────────────────────────────────────────────────────────────────
// מילון הסטטוסים. בלעדיו העוזר מציג "pending"/"active" גולמי, ומה גרוע יותר —
// אינו יודע ש-active ביולדות פירושו "מאושרת", ולכן סופר לא נכון.
// ─────────────────────────────────────────────────────────────────────────────
export const STATUS_HE: Record<string, Record<string, string>> = {
  beneficiaries: {
    pending: 'ממתין לאישור',
    approved: 'מאושר',
    rejected: 'נדחה',
    review: 'בבדיקה',
    docs_pending: 'ממתין להשלמת מסמכים',
  },
  maternity_aids: {
    pending: 'ממתינה לאישור',
    active: 'מאושרת (פעילה)',
    completed: 'הסתיימה',
    cancelled: 'בוטלה',
  },
  loans: {
    pending: 'ממתינה לאישור',
    approved: 'אושרה (טרם בוצעה)',
    active: 'פעילה (בהחזר)',
    completed: 'הושלמה',
    rejected: 'נדחתה',
    defaulted: 'בפיגור',
  },
  financial_aid_requests: {
    pending: 'ממתינה לאישור',
    approved: 'אושרה',
    rejected: 'נדחתה',
  },
  widow_requests: {
    pending: 'ממתינה לאישור',
    approved: 'אושרה',
    rejected: 'נדחתה',
  },
  campaigns: {
    draft: 'טיוטה',
    scheduled: 'מתוזמן',
    sending: 'בשליחה',
    sent: 'נשלח',
    paused: 'מושהה',
  },
}

/** מילון הסטטוסים כטקסט להנחיה — כדי שהעוזר יתרגם נכון ולא ימציא. */
export function statusGuide(tables: TableSpec[]): string {
  const lines: string[] = []
  for (const t of tables) {
    const map = STATUS_HE[t.table]
    if (!map) continue
    const pairs = Object.entries(map).map(([k, v]) => `${k}=${v}`).join(' · ')
    lines.push(`  ${t.table}: ${pairs}`)
  }
  return lines.join('\n')
}

/** תיאור הטבלאות שהמשתמש רשאי לראות — נשלח למודל כדי שידע מה זמין לו. */
export function schemaFor(canView: (p: SectionKey) => boolean, isAdmin: boolean): string {
  const allowed = TABLES.filter(t => t.perm === null || isAdmin || canView(t.perm))
  if (!allowed.length) return '(אין לך הרשאות צפייה לאף נתון)'

  const tables = allowed.map(t => {
    const parts = [`• ${t.table} (${t.label}) — ${t.about}`]
    parts.push(`  עמודות: ${t.columns.join(', ')}`)
    if (t.statusCol) {
      const map = STATUS_HE[t.table]
      const vals = map ? ` (${Object.keys(map).join(' / ')})` : ''
      parts.push(`  עמודת סטטוס: ${t.statusCol}${vals}`)
    }
    if (t.searchCols?.length) parts.push(`  חיפוש טקסט ב: ${t.searchCols.join(', ')}`)
    return parts.join('\n')
  }).join('\n\n')

  const guide = statusGuide(allowed)
  if (!guide) return tables

  return `${tables}

## מילון הסטטוסים — תרגם תמיד לעברית, אל תציג ערך גולמי
${guide}

⚠️ שים לב: ביולדות ובהלוואות, "active" פירושו **מאושרת/פעילה** — לא "ממתינה".
"ממתינה לאישור" הוא תמיד pending בלבד.`
}
