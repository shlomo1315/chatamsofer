// קטלוג השלוחות של המרכזיה: מקור אחד למסך הניהול (מפת השיחה, המקשים ומקורות הנוסחים).
// שלוחות ה-webhook עצמן מוגדרות ב-tree.ts (SYSTEM_EXTS), והטיפול בשיחה ב-index.ts.
import { SYSTEM_EXTS } from './tree'
import type { TelephonySystemId } from './types'

/** מקור הנוסחים הניתנים לעריכה (נתיב ה-API שלהם). שלוחה בלי מקור = הנוסח כתוב בקוד. */
export type MessageSource = 'menu' | 'holiday' | 'maternity' | 'bookfair'
export const SOURCE_API: Record<MessageSource, string> = {
  menu: '/api/admin/yemot-menu',
  holiday: '/api/admin/yemot-holiday',
  maternity: '/api/admin/yemot-maternity',
  bookfair: '/api/admin/yemot-book-fair',
}

export type ExtInfo = {
  sys: TelephonySystemId
  ext: string
  name: string
  how: string
  what: string
  source?: MessageSource
  keys: [key: string, text: string][]
}

export const SYSTEM_LABELS: Record<TelephonySystemId, string> = {
  main: 'מערכת ראשית', yerid: 'יריד ספרים', distributors: 'מפיצים',
}

const INFO: Omit<ExtInfo, 'name'>[] = [
  { sys: 'main', ext: 'menu', how: 'כל שיחה נכנסת', what: 'ברכה ותפריט: 1 חגים, 2 יולדות, 9 הודעה כללית', source: 'menu',
    keys: [['1', 'חלוקות חגים'], ['2', 'יולדות'], ['9', 'הודעה כללית ואז ניתוק'], ['שגוי', 'חזרה על התפריט']] },
  { sys: 'main', ext: 'holidays', how: 'תפריט ראשי · 1', what: 'זכאות, המוקד שנבחר, חיבור כרטיס, רישום', source: 'holiday',
    keys: [['1', 'בדיקת זכאות'], ['2', 'שמיעת המוקד שנבחר'], ['3', 'חיבור כרטיס נדרים'], ['4', 'בחירת מוקד (לא מוכרז בתפריט)']] },
  { sys: 'main', ext: 'maternity', how: 'תפריט ראשי · 2', what: 'זיהוי לפי טלפון, כרטיס 16 ספרות, אישור, מוקד', source: 'maternity',
    keys: [['1', 'אישור מספר הכרטיס'], ['2', 'תיקון מספר הכרטיס']] },
  { sys: 'main', ext: 'otp', how: 'שיחה יוצאת', what: 'מקריאה קוד אימות לנרשם', keys: [] },
  { sys: 'main', ext: 'kvitel', how: 'שלוחה ישירה', what: 'קליטת קוויטלאך בהקלדה', keys: [] },
  { sys: 'main', ext: 'center-load', how: 'שלוחה ישירה', what: 'טעינת כרטיסי מוקדים', keys: [] },
  { sys: 'yerid', ext: 'menu', how: 'כל שיחה נכנסת', what: 'מכירה בטלפון: הזמנה חדשה, קיימת, שירות לקוחות', source: 'bookfair',
    keys: [['1', 'הזמנה חדשה'], ['2', 'הזמנה קיימת'], ['3', 'שירות לקוחות']] },
  { sys: 'yerid', ext: 'credits', how: 'שלוחה ישירה', what: 'זיכויים', keys: [] },
  { sys: 'distributors', ext: 'menu', how: 'כל שיחה נכנסת', what: 'מפיץ מזוהה: תפריט של 8 מקשים. לא מזוהה: הילולא או נציג', keys: [] },
]

export const EXTS: ExtInfo[] = INFO.map((i) => ({
  ...i, name: SYSTEM_EXTS[i.sys].find((e) => e.ext === i.ext)?.label ?? i.ext,
}))

export const extId = (e: { sys: string; ext: string }) => `${e.sys}/${e.ext}`
export const findExt = (id: string) => EXTS.find((e) => extId(e) === id)

export type MapNode = { nm: string; tp?: string; k?: string; ext?: string; step?: boolean; kids?: MapNode[] }
export const MAP: Record<TelephonySystemId, { root: MapNode; direct: string[] }> = {
  main: {
    root: { nm: 'תפריט ראשי', tp: 'כל שיחה נכנסת', ext: 'main/menu', kids: [
      { k: '1', nm: 'חלוקות חגים', ext: 'main/holidays', kids: [
        { k: '1', nm: 'בדיקת זכאות', step: true }, { k: '2', nm: 'שמיעת המוקד שנבחר', step: true },
        { k: '3', nm: 'חיבור כרטיס נדרים', step: true }, { k: '4', nm: 'בחירת מוקד', step: true },
        { nm: 'רישום לחלוקה הפתוחה', tp: 'הקשת ת״ז', step: true },
      ] },
      { k: '2', nm: 'יולדות', ext: 'main/maternity', kids: [
        { nm: 'זיהוי לפי הטלפון', step: true }, { nm: 'חיבור כרטיס 16 ספרות', step: true },
      ] },
      { k: '9', nm: 'הודעה כללית', tp: 'ואז ניתוק', step: true },
    ] },
    direct: ['main/otp', 'main/kvitel', 'main/center-load'],
  },
  yerid: {
    root: { nm: 'תפריט מכירה', tp: 'כל שיחה נכנסת', ext: 'yerid/menu', kids: [
      { k: '1', nm: 'הזמנה חדשה', step: true }, { k: '2', nm: 'הזמנה קיימת', step: true }, { k: '3', nm: 'שירות לקוחות', step: true },
    ] },
    direct: ['yerid/credits'],
  },
  distributors: {
    root: { nm: 'תפריט מפיצים', tp: 'כל שיחה נכנסת', ext: 'distributors/menu', kids: [
      { nm: 'מפיץ מזוהה', tp: '8 מקשים', step: true },
      { nm: 'מספר לא מזוהה', step: true, kids: [{ k: '1', nm: 'הילולא', step: true }, { k: '2', nm: 'נציג', step: true }] },
    ] },
    direct: [],
  },
}
