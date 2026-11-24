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

export const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

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
