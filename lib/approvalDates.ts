// תאריך אישור לידה: סינון לפי טווח וספירה יומית. לוגיקה טהורה כדי שאפשר לבדוק.

const TZ = 'Asia/Jerusalem'
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** מפתח יום YYYY-MM-DD לפי שעון ישראל. null כשאין תאריך תקין. */
export function dayKey(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : dayFmt.format(d)
}

/** האם יום האישור בתוך הטווח (שני הקצוות כלולים; קצה ריק = ללא הגבלה). */
export function inApprovalRange(approvedAt: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true
  const k = dayKey(approvedAt)
  if (!k) return false
  return (!from || k >= from) && (!to || k <= to)
}

/** כמה אושרו בכל יום, מהחדש לישן. */
export function countByApprovalDay(rows: { approved_at?: string | null }[]): { day: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = dayKey(r.approved_at)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => b.day.localeCompare(a.day))
}
