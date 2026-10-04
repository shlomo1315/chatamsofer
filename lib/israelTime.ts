// ─────────────────────────────────────────────────────────────────────────────
// הצגת תאריך ושעה בשעון ישראל.
//
// 🔴 למה זה קיים: toLocaleString('he-IL') לבדו מציג את השעון של *המכונה
// שמרנדרת* — בשרת זה UTC. הזמנה שנכנסה ב-23:18 הופיעה במסך כ-20:18,
// ושעת תשלום שהושוותה לדוח של נדרים לא התאימה לשום דבר.
//
// ⚠️ 'he-IL' אינו קובע אזור זמן, רק את צורת הכתיבה. חייבים timeZone
// מפורש — וזו בדיוק הטעות שקשה לראות, כי בדפדפן של משתמש ישראלי זה
// *כן* נראה נכון, והפער מופיע רק ברינדור בשרת.
// ─────────────────────────────────────────────────────────────────────────────

const TZ = 'Asia/Jerusalem'

type DateInput = string | number | Date | null | undefined

/** ⚠️ תאריך פגום מחזיר מחרוזת ריקה ואינו זורק — ראו invalid-date-render-crash. */
function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** תאריך ושעה: "4.10.2026, 23:18" */
export function ilDateTime(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return d.toLocaleString('he-IL', {
    timeZone: TZ,
    day: 'numeric', month: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** תאריך בלבד: "4.10.2026" */
export function ilDate(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return d.toLocaleDateString('he-IL', {
    timeZone: TZ, day: 'numeric', month: 'numeric', year: 'numeric',
  })
}

/** שעה בלבד: "23:18" */
export function ilTime(v: DateInput): string {
  const d = toDate(v)
  if (!d) return ''
  return d.toLocaleTimeString('he-IL', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit',
  })
}
