// מחלקות הארגון — כתובת "דואר לתשובה" (Reply-To) לכל מחלקה.
// כל המיילים האוטומטיים נשלחים מ-noreply@chasamsofer.info, אך תשובת הנמען
// מנותבת לכתובת המחלקה הרלוונטית כדי שהפנייה תגיע לגורם הנכון.

export type DepartmentKey =
  | 'main'          // משרד ראשי
  | 'igud'          // איגוד הצאצאים (רישום)
  | 'gemach'        // גמ"ח הלוואות
  | 'maternity'     // עזר יולדות
  | 'widows'        // אלמנות ויתומים
  | 'medical'       // אגף סיוע רפואי
  | 'holidays'      // עזר לחגים
  | 'yerid'         // יריד (תיבת דואר נוספת)
  | 'inbox8'        // תיבה 8
  | 'inbox9'        // תיבה 9
  | 'inbox10'       // תיבה 10

export interface Department {
  key: DepartmentKey
  label: string
  email: string
  color: string   // צבע התווית להצגה בתיבת המייל המאוחדת
  mailboxOnly?: boolean  // תיבת דואר בלבד — לא מחלקה ארגונית שניתן לשייך אליה איש צוות
}

export const DEPARTMENTS: Record<DepartmentKey, Department> = {
  main:      { key: 'main',      label: 'משרד ראשי',        email: 'office@chasamsofer.info', color: '#64748b' },
  igud:      { key: 'igud',      label: 'איגוד הצאצאים',     email: 'igud@chasamsofer.info',   color: '#6366f1' },
  gemach:    { key: 'gemach',    label: 'גמ"ח',             email: 'g@chasamsofer.info',      color: '#10b981' },
  maternity: { key: 'maternity', label: 'עזר יולדות',        email: 'y@chasamsofer.info',      color: '#ec4899' },
  widows:    { key: 'widows',    label: 'אלמנות ויתומים',    email: 'a@chasamsofer.info',      color: '#8b5cf6' },
  medical:   { key: 'medical',   label: 'אגף סיוע רפואי',    email: 'r@chasamsofer.info',      color: '#ef4444' },
  holidays:  { key: 'holidays',  label: 'עזר לחגים',         email: 'c@chasamsofer.info',      color: '#f59e0b' },
  yerid:     { key: 'yerid',     label: 'יריד',             email: 'yerid@chasamsofer.info',  color: '#0ea5e9', mailboxOnly: true },
  inbox8:    { key: 'inbox8',    label: 'תיבה 8',           email: '8@chasamsofer.info',      color: '#14b8a6', mailboxOnly: true },
  inbox9:    { key: 'inbox9',    label: 'תיבה 9',           email: '9@chasamsofer.info',      color: '#a855f7', mailboxOnly: true },
  inbox10:   { key: 'inbox10',   label: 'תיבה 10',          email: '10@chasamsofer.info',     color: '#f97316', mailboxOnly: true },
}

// איתור מחלקה לפי כתובת מייל (נכנס: to; יוצא: from). מחזיר null אם לא נמצא.
export function departmentByEmail(email?: string | null): Department | null {
  if (!email) return null
  const e = email.toLowerCase().trim()
  return Object.values(DEPARTMENTS).find(d => d.email.toLowerCase() === e) ?? null
}

// כתובת השולח האחידה לכל המיילים האוטומטיים
export const NOREPLY_FROM = 'noreply@chasamsofer.info'
export const BRAND_NAME = 'היכל החתם סופר'

// אפשרויות שליחה לפי מחלקה: המייל נשלח מכתובת המחלקה (fromEmail),
// תשובות חוזרות לאותה כתובת, ושם התצוגה כולל את שם המחלקה.
export function mailFor(key: DepartmentKey): { fromEmail: string; replyTo: string; fromName: string; department: DepartmentKey } {
  const dep = DEPARTMENTS[key] ?? DEPARTMENTS.main
  return { fromEmail: dep.email, replyTo: dep.email, fromName: `${BRAND_NAME} · ${dep.label}`, department: dep.key }
}
