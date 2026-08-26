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
  // ⚠️ תיבה אוטומטית שאיש אינו עונה בה (אישורי רישום, קישורים אישיים).
  // המיילים הנכנסים אליה אינם משימה, ולכן אינם נספרים ב"לא נקראו" — לא
  // בתיבה עצמה ולא בסכום "כל המחלקות". בלי זה 1,913 הודעות אוטומטיות
  // ניפחו את המונה ל-2,909 והסתירו את המיילים שבאמת ממתינים למענה.
  // התיבה עצמה נשארת נגישה לצפייה; רק המונה מושתק.
  noReply?: boolean
}

export const DEPARTMENTS: Record<DepartmentKey, Department> = {
  main:      { key: 'main',      label: 'משרד ראשי',        email: 'office@chasamsofer.info', color: '#64748b' },
  igud:      { key: 'igud',      label: 'איגוד הצאצאים',     email: 'igud@chasamsofer.info',   color: '#6366f1', noReply: true },
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
export function mailFor(key: DepartmentKey, labelOverride?: string): { fromEmail: string; replyTo: string; fromName: string; department: DepartmentKey } {
  const dep = DEPARTMENTS[key] ?? DEPARTMENTS.main
  // ⚠️ labelOverride — כשהפנייה אינה בשם המחלקה אלא בשם *הנושא*.
  //
  // מיילים על סדר היוחסין יצאו בשם "עזר יולדות", כי הם נשלחו מהתיבה שממנה
  // נשלחו גם מכתבי היולדות. הנמען קיבל בקשה לאשר את שרשרת הדורות שלו ממחלקה
  // שאין לה שום קשר לנושא, והתשובות שלו נחתו בתיבה הלא נכונה.
  //
  // התיבה נשארת ככתובת השולח והמענה — היא זו שמנוטרת — ורק שם התצוגה מספר
  // לנמען על מה מדובר.
  return { fromEmail: dep.email, replyTo: dep.email, fromName: `${BRAND_NAME} · ${labelOverride ?? dep.label}`, department: dep.key }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 mailFor לעיל מכיר רק את המחלקות הקבועות: `DEPARTMENTS[key] ?? main`.
// תיבה שהמנהל הוסיף מהממשק (custom_m) אינה שם, ולכן **נפלה ל-main** —
// והמענה האוטומטי יצא מ-office@ במקום מהתיבה שאליה נכתב המייל.
//
// זה היה הבאג האמיתי: המענה כן נשלח וההגדרות כן נשמרו, אבל השולח היה
// שגוי. מבחוץ זה נראה בדיוק כמו "המענה המותאם לא עובד".
//
// ⚠️ אסינכרונית כי התיבות המותאמות שמורות במסד. כל קורא בזרימת המייל
// הנכנס חייב להשתמש בה; שליחה יזומה ממחלקה קבועה יכולה להישאר על
// mailFor הסינכרונית.
// ─────────────────────────────────────────────────────────────────────────────
export async function mailForAsync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  key: DepartmentKey | string,
  labelOverride?: string,
): Promise<{ fromEmail: string; replyTo: string; fromName: string; department: DepartmentKey }> {
  const k = String(key)
  // מחלקה קבועה — הנתיב הרגיל, בלי פנייה למסד.
  if (DEPARTMENTS[k as DepartmentKey]) return mailFor(k as DepartmentKey, labelOverride)

  if (k.startsWith('custom_') && db) {
    try {
      const { loadCustomMailboxes } = await import('./customMailboxes')
      const hit = (await loadCustomMailboxes(db)).find(m => m.key === k)
      if (hit) {
        return {
          fromEmail: hit.email,
          replyTo: hit.email,
          fromName: `${BRAND_NAME} · ${labelOverride ?? hit.label}`,
          department: k as DepartmentKey,
        }
      }
    } catch { /* נופל לברירת המחדל למטה */ }
  }

  // ⚠️ נפילה ל-main רק כשהתיבה באמת לא נמצאה — ועם לוג. הנפילה השקטה
  // היא שהסתירה את הבאג הזה.
  console.warn('[mailForAsync] תיבה לא מזוהה, נשלח מהמשרד הראשי:', k)
  return mailFor('main' as DepartmentKey, labelOverride)
}

/** שם התצוגה לפניות על סדר היוחסין — הנושא ולא המחלקה. */
export const LINEAGE_MAIL_LABEL = 'תיקוני יוחסין'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 departmentByEmail לעיל מכיר רק את המחלקות הקבועות בקוד. תיבה שנוספה
// מהממשק לא הייתה מזוהה — המייל הנכנס אליה לא שויך לתיבה, ולא נשלח לה
// מענה אוטומטי. הגרסה הזו בודקת גם את התיבות המותאמות.
//
// ⚠️ אסינכרונית כי היא קוראת מהמסד. הקוראים שמריצים בזרימת המייל
// הנכנס חייבים להשתמש בה; השאר יכולים להישאר על הגרסה הסינכרונית.
// ─────────────────────────────────────────────────────────────────────────────
export async function departmentByEmailAsync(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  email?: string | null,
): Promise<Department | null> {
  const fixed = departmentByEmail(email)
  if (fixed) return fixed
  if (!email || !db) return null
  try {
    const { loadCustomMailboxes, asDepartment } = await import('./customMailboxes')
    const e = email.toLowerCase().trim()
    const custom = await loadCustomMailboxes(db)
    const hit = custom.find(m => m.email === e)
    return hit ? asDepartment(hit) : null
  } catch {
    return null
  }
}
