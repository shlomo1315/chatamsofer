// הודעה מרוכזת למשפחות בסטטוס "בדיקה מעמיקה": התגלתה תקלה בסדר הדורות,
// ויש להסדיר אותו מחדש דרך קישור אישי (lineage-review, mode='order').
//
// כאן רק החלוקה הטהורה (מי מקבל, מי בלי מייל, מי כבר קיבל), כדי שתיבדק בלי
// מסד. השליחה עצמה ב-/api/admin/beneficiaries/lineage-fault-notice.

/** הפעולה שנרשמת ב-activity_log לכל משפחה שקיבלה. משמשת גם למניעת כפילויות. */
export const LINEAGE_FAULT_ACTION = 'lineage_fault_notice_sent'

/** כמה מיילים בכל קריאה, כדי שבקשה אחת לא תחרוג מזמן ההמתנה של השרת. */
export const LINEAGE_FAULT_BATCH = 40

export type FaultRow = {
  id: string
  full_name: string | null
  family_name: string | null
  spouse_name: string | null
  email: string | null
  lineage_node_id: string | null
}

export type FaultPlan = {
  toSend: (FaultRow & { email: string; lineage_node_id: string })[]
  noEmail: FaultRow[]
  noLineage: FaultRow[]
  alreadySent: FaultRow[]
}

// ─── נוסח המייל (ניתן לעריכה במסך, נשמר ב-app_settings) ──────────────────────

/** המפתח ב-app_settings שבו נשמר הנוסח הערוך. השליחה קוראת רק ממנו. */
export const LINEAGE_FAULT_TEMPLATE_KEY = 'lineage_fault_notice_template'

/** שדה אוטומטי: מוחלף בשם של כל משפחה (בנושא ובגוף). */
export const NAME_TOKEN = '{{שם המשפחה}}'

export type LineageFaultTemplate = {
  subject: string
  /** הכותרת בראש המייל */
  title: string
  /** גוף המייל, HTML מהעורך. מנוקה בשרת לפני כל תצוגה ושליחה. */
  bodyHtml: string
  /** טקסט הכפתור. הקישור האישי של הכפתור אוטומטי ולא ניתן לעריכה. */
  buttonLabel: string
  /** הערה קטנה מתחת לכפתור. מותר להשאיר ריקה. */
  note: string
}

// ⚠️ המשפט על מענק החנוכה נאכף רק כשבחלוקת חנוכה מסומן "חסימת משפחות בבדיקה
// מעמיקה" (blockDeepReview ב-holidayDistRules). בלי הסימון הזה המשפט לא נכון.
export const DEFAULT_LINEAGE_FAULT_TEMPLATE: LineageFaultTemplate = {
  subject: 'תקלה בסדר הדורות: נא להסדיר מחדש · איגוד צאצאי החתם סופר',
  title: 'הסדרה מחדש של סדר הדורות',
  bodyHtml: [
    `<p style="margin:0 0 14px;color:#0f172a;font-size:18px;font-weight:800;line-height:normal;">לכבוד משפחת ${NAME_TOKEN},</p>`,
    '<p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.8;">בבדיקת המאגר התגלתה תקלה ב<strong>סדר הדורות</strong> הרשום אצלכם במערכת.</p>',
    '<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.8;">יש להסדיר מחדש את סדר הדורות דרך הקישור שלהלן. בקישור יופיעו פרטיכם ושרשרת הדורות כפי שהיא רשומה כעת, ותוכלו לסדר אותה מחדש.</p>',
    '<p style="margin:0 0 18px;padding:12px 14px;background-color:#fef3c7;border-right:4px solid #d97706;border-radius:8px;color:#78350f;font-size:15px;font-weight:800;line-height:1.7;">כל עוד סדר הדורות לא יוסדר מחדש, לא תהיה אפשרות לקבל את הכרטיס של מענק חג החנוכה.</p>',
  ].join(''),
  buttonLabel: 'להסדרת סדר הדורות',
  note: 'הקישור אישי ותקף 30 יום. לאחר ההסדרה יועבר לאישור המזכירות.',
}

const MAX_LEN = { subject: 200, title: 120, bodyHtml: 100_000, buttonLabel: 60, note: 400 } as const

/** מנרמל נוסח שהגיע מהמסך או מהמסד. שדה חובה ריק חוזר לברירת המחדל. */
export function normalizeLineageFaultTemplate(raw: unknown): LineageFaultTemplate {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const str = (k: keyof LineageFaultTemplate, oneLine: boolean) => {
    let v = typeof r[k] === 'string' ? (r[k] as string) : ''
    // שורה אחת בנושא ובכותרת: מעבר שורה בנושא שובר את כותרות המייל.
    if (oneLine) v = v.replace(/[\r\n]+/g, ' ')
    return v.trim().slice(0, MAX_LEN[k])
  }
  const req = (k: keyof LineageFaultTemplate, oneLine = true) => str(k, oneLine) || DEFAULT_LINEAGE_FAULT_TEMPLATE[k]
  return {
    subject: req('subject'),
    title: req('title'),
    bodyHtml: req('bodyHtml', false),
    buttonLabel: req('buttonLabel'),
    note: typeof r.note === 'string' ? str('note', false) : DEFAULT_LINEAGE_FAULT_TEMPLATE.note,
  }
}

export const isValidEmail =(s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

/** אותו שם נמען כמו בשליחה האישית (send-lineage-link). */
export function recipientNameOf(row: Pick<FaultRow, 'family_name' | 'spouse_name' | 'full_name'>): string {
  return [row.family_name, row.spouse_name || row.full_name].filter(Boolean).join(' ') || 'משפחה יקרה'
}

export function planLineageFaultNotice(rows: FaultRow[], sentIds: Set<string>): FaultPlan {
  const plan: FaultPlan = { toSend: [], noEmail: [], noLineage: [], alreadySent: [] }
  for (const row of rows) {
    if (sentIds.has(row.id)) { plan.alreadySent.push(row); continue }
    const email = (row.email ?? '').trim()
    if (!email || !isValidEmail(email)) { plan.noEmail.push(row); continue }
    // ⚠️ בלי שיוך לעץ אין שורש לקישור, והדף הציבורי לא יציג שרשרת.
    if (!row.lineage_node_id) { plan.noLineage.push(row); continue }
    plan.toSend.push({ ...row, email, lineage_node_id: row.lineage_node_id })
  }
  return plan
}
