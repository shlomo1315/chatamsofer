// כלי אבחון (אנשי צוות בלבד) — מציג את מצב הדומיינים ב-Resend ואת כל רשומות ה-DNS
// (SPF / DKIM / DMARC / MX) והסטטוס שלהן, כדי לדעת מדוע מיילים נכנסים לספאם או ששליחה
// נכשלת ("domain not verified"). קריאה בלבד.
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return NextResponse.json({ error: 'אין הרשאה' }, { status: 401 })

  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'RESEND_API_KEY אינו מוגדר' }, { status: 500 })

  try {
    const resend = new Resend(key)
    const list = await resend.domains.list()
    // מבנה התגובה עשוי להיות { data: { data: [...] } } או { data: [...] } — מנרמלים
    const raw = (list as Any)?.data
    const domainsList: Any[] = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : [])

    // לכל דומיין — שליפת הפרטים המלאים כולל רשומות ה-DNS והסטטוס שלהן
    const domains = await Promise.all(domainsList.map(async (d: Any) => {
      try {
        const full = await resend.domains.get(d.id)
        const rec = (full as Any)?.data ?? {}
        const records = (rec.records ?? []).map((r: Any) => ({
          type: r.type,            // TXT / MX / CNAME
          name: r.name,            // שם הרשומה (למשל send, resend._domainkey, _dmarc)
          value: r.value,          // הערך שצריך להיות מוגדר ב-DNS
          status: r.status,        // verified / pending / not_started
          record: r.record,        // ייעוד הרשומה (SPF / DKIM / DMARC)
          priority: r.priority ?? null,
          ttl: r.ttl ?? null,
        }))
        // סיכום: אילו רשומות אינן מאומתות
        const unverified = records.filter((r: Any) => r.status && r.status !== 'verified')
        return {
          name: d.name,
          region: d.region ?? rec.region ?? null,
          status: rec.status ?? d.status,           // סטטוס הדומיין הכולל
          allVerified: unverified.length === 0 && records.length > 0,
          unverifiedCount: unverified.length,
          records,
        }
      } catch (e) {
        return { name: d.name, status: d.status, error: e instanceof Error ? e.message : String(e), records: [] }
      }
    }))

    return NextResponse.json({
      ok: true,
      keyPrefix: key.slice(0, 6) + '…',
      hint: 'סטטוס "verified" בכל הרשומות = הדומיין מאומת. רשומה חסרה/pending — יש להוסיף/לתקן אותה ב-DNS של הדומיין לפי העמודה value. חשוב במיוחד: SPF, DKIM, ורשומת DMARC (_dmarc).',
      domainCount: domains.length,
      domains,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 })
  }
}
