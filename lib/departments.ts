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

export interface Department {
  key: DepartmentKey
  label: string
  email: string
}

export const DEPARTMENTS: Record<DepartmentKey, Department> = {
  main:      { key: 'main',      label: 'משרד ראשי',        email: 'office@chasamsofer.info' },
  igud:      { key: 'igud',      label: 'איגוד הצאצאים',     email: 'igud@chasamsofer.info' },
  gemach:    { key: 'gemach',    label: 'גמ"ח',             email: 'g@chasamsofer.info' },
  maternity: { key: 'maternity', label: 'עזר יולדות',        email: 'y@chasamsofer.info' },
  widows:    { key: 'widows',    label: 'אלמנות ויתומים',    email: 'a@chasamsofer.info' },
  medical:   { key: 'medical',   label: 'אגף סיוע רפואי',    email: 'r@chasamsofer.info' },
  holidays:  { key: 'holidays',  label: 'עזר לחגים',         email: 'c@chasamsofer.info' },
}

// כתובת השולח האחידה לכל המיילים האוטומטיים
export const NOREPLY_FROM = 'noreply@chasamsofer.info'
export const BRAND_NAME = 'היכל החתם סופר'

// אפשרויות שליחה לפי מחלקה: כתובת תשובה + שם תצוגה הכולל את שם המחלקה
export function mailFor(key: DepartmentKey): { replyTo: string; fromName: string } {
  const dep = DEPARTMENTS[key] ?? DEPARTMENTS.main
  return { replyTo: dep.email, fromName: `${BRAND_NAME} · ${dep.label}` }
}
