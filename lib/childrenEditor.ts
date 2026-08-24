// מקור האמת היחיד לעריכת רשימת הילדים בכרטסת המשפחה.
//
// שני מסלולי שמירה משתמשים במודול הזה: טופס העריכה המלא
// (app/admin/beneficiaries/BeneficiaryForm.tsx) והעריכה מתוך הכרטסת
// (app/api/admin/beneficiaries/[id]/children). כל כלל שנשמר רק באחד מהם
// נסחף — ולכן הכללים כאן, בלי React ועם בדיקות.

export const MAX_CHILDREN = 30

// 🔴 סוג מסמך הזיהוי נשמר במאגר תחת **שני** שמות שונים:
//   id_doc_type — 27,549 רשומות (השם הוותיק, כולל 279 בעלי דרכון)
//   doc_type    —    240 רשומות (השם החדש)
// קריאה מ-doc_type בלבד מפספסת 99% מהנתונים, וכתיבה שמשמיטה את
// id_doc_type מוחקת את סימוני הדרכון של כל מי שנרשם קודם.
// docTypeOf קוראת משניהם, ו-childrenPayload כותבת חזרה את המפתח שהיה.
export type DocType = 'id' | 'passport'

export interface EditableChild {
  name: string
  id_number: string
  // ⚠️ אופציונלי בכוונה: רוב הילדים נשמרו בלי אף אחד משני השדות.
  // כתיבת ברירת מחדל 'id' לכולם הייתה משנה אלפי רשומות בשמירה אחת
  // ומסמנת "שינוי" על ילד שאיש לא נגע בו.
  doc_type?: DocType
  // השם הוותיק — נשמר כדי לכתוב חזרה תחת אותו מפתח
  id_doc_type?: DocType
  gender: string
  birth_date: string
  marital_status: string
  // נשמרים עבור ילדים שנכנסו דרך תיק יולדת — לא לאבד אותם בעריכה
  birth_status?: 'pending' | 'approved'
  maternity_aid_id?: string
}

// הצורה שנשמרת ב-jsonb. שונה מ-EditableChild: ת"ז ריקה נשמרת כ-null.
export interface StoredChild {
  name: string
  id_number: string | null
  doc_type?: DocType
  id_doc_type?: DocType
  gender: string | null
  birth_date: string | null
  marital_status?: string
  birth_status?: 'pending' | 'approved'
  maternity_aid_id?: string
}

export function emptyChild(): EditableChild {
  return { name: '', id_number: '', doc_type: 'id', gender: '', birth_date: '', marital_status: '' }
}

// סוג מסמך הזיהוי בפועל, משני השמות. ברירת המחדל בממשק היא ת"ז, אך
// היעדר ערך *נשמר* כהיעדר — ראו ההערה למעלה.
export function docTypeOf(c: Pick<EditableChild, 'doc_type' | 'id_doc_type'>): DocType | undefined {
  return c.doc_type ?? c.id_doc_type
}

// ילד שנכנס דרך תיק יולדת. מחיקה שלו צריכה לשאול מה לעשות עם התיק עצמו,
// כי התיק הוא רשומה נפרדת בטבלת maternity_aids.
export function isLinkedToMaternity(child: Pick<EditableChild, 'birth_status' | 'maternity_aid_id'>): boolean {
  return !!(child.maternity_aid_id || child.birth_status)
}

export interface ResizeResult {
  children: EditableChild[]
  // כמה ילדים צריך למחוק כדי להגיע למספר המבוקש. גדול מ-0 ⇒ המסך חייב
  // לפתוח דיאלוג בחירה. הרשימה עצמה לא נגעה.
  needsRemoval: number
}

// 🔴 שינוי מספר הילדים לעולם אינו מוחק בעצמו.
// קודם כאן היה prev.slice(0, n) — משפחה עם 5 ילדים שעודכנה ל-3 איבדה
// בשקט את שני האחרונים על כל פרטיהם. הפחתה רק *מדווחת* כמה עודפים,
// והבחירה מי נמחק היא של המשתמש.
export function resizeChildren(current: EditableChild[], requested: number): ResizeResult {
  const n = Number.isFinite(requested) ? Math.max(0, Math.min(MAX_CHILDREN, Math.trunc(requested))) : 0

  if (n > current.length) {
    const next = current.slice()
    while (next.length < n) next.push(emptyChild())
    return { children: next, needsRemoval: 0 }
  }

  return { children: current, needsRemoval: current.length - n }
}

// מחיקה לפי בחירה מפורשת של המשתמש — לא לפי מיקום ברשימה.
export function removeChildrenAt(current: EditableChild[], indexes: number[]): EditableChild[] {
  const drop = new Set(indexes)
  return current.filter((_, i) => !drop.has(i))
}

// ⚠️ children ו-children_count חייבים להישמר יחד, תמיד. כשאחד עודכן והשני
// לא, הכרטסת הציגה "5 ילדים" מעל טבלה של 3. הפונקציה הזו היא הדרך
// היחידה לבנות את העדכון.
export function childrenPayload(children: EditableChild[]): { children: StoredChild[]; children_count: number } {
  const stored: StoredChild[] = children.map(c => {
    // ת"ז ישראלית נשמרת ספרות בלבד; דרכון נשמר כפי שהוקלד.
    const raw = c.id_number?.trim() ?? ''
    // ⚠️ docTypeOf ולא c.doc_type: דרכון שנשמר תחת id_doc_type היה עובר
    // כאן ניקוי ספרות, ומספר דרכון עם אותיות היה נהרס.
    const id = raw ? (docTypeOf(c) === 'passport' ? raw : raw.replace(/\D/g, '') || null) : null
    const out: StoredChild = {
      name: c.name?.trim() ?? '',
      id_number: id,
      gender: c.gender?.trim() || null,
      birth_date: c.birth_date?.trim() || null,
    }
    // ⚠️ נכתב חזרה תחת אותו מפתח שהיה ברשומה. ילד ותיק שנשמר תחת
    // id_doc_type יישמר תחת id_doc_type — כתיבה ל-doc_type בלבד הייתה
    // מוחקת את סימון הדרכון של 279 ילדים.
    if (c.doc_type) out.doc_type = c.doc_type
    if (c.id_doc_type) out.id_doc_type = c.id_doc_type
    if (c.marital_status?.trim()) out.marital_status = c.marital_status.trim()
    // שדות היולדת נשמרים כמות שהם — נרמול שזורק אותם מנתק את הילד מהתיק
    if (c.birth_status) out.birth_status = c.birth_status
    if (c.maternity_aid_id) out.maternity_aid_id = c.maternity_aid_id
    return out
  })
  return { children: stored, children_count: stored.length }
}

export interface ChildrenDiff {
  hasChanges: boolean
  // מספר השינויים להצגה על כפתור השמירה: ילד שנערך נספר פעם אחת,
  // כמה שדות שלא שונו בו.
  changeCount: number
  edited: number[]
  added: number
  removed: number
}

// מפתח השוואה — רווחים בקצוות אינם שינוי אמיתי, אחרת הכפתור מהבהב
// בלי שהמשתמש נגע בכלום.
function comparable(c: EditableChild): string {
  return JSON.stringify(childrenPayload([c]).children[0])
}

export function diffChildren(original: EditableChild[], current: EditableChild[]): ChildrenDiff {
  const shared = Math.min(original.length, current.length)
  const edited: number[] = []
  for (let i = 0; i < shared; i++) {
    if (comparable(original[i]) !== comparable(current[i])) edited.push(i)
  }
  const added = Math.max(0, current.length - original.length)
  const removed = Math.max(0, original.length - current.length)
  const changeCount = edited.length + added + removed
  return { hasChanges: changeCount > 0, changeCount, edited, added, removed }
}
