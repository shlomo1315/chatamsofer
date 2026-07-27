import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { requireStaff, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון חד-פעמי: מה Resend מחזיר ב-list וב-get של מיילים נכנסים — במיוחד האם
// received_for (הנמען האמיתי) קיים בפועל ב-runtime, ומהו הפורמט. זה מכריע
// אם אפשר לתקן רטרואקטיבית את הניתוב מ-Resend. קריאה בלבד, מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const key = process.env.RESEND_API_KEY
  if (!key) return NextResponse.json({ error: 'חסר RESEND_API_KEY' }, { status: 500 })
  const resend = new Resend(key)

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listed: any = await (resend.emails as any).receiving.list({ limit: 3 })
    const items = listed?.data?.data ?? listed?.data ?? []
    const first = Array.isArray(items) ? items[0] : null

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let full: any = null
    if (first?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const got: any = await (resend.emails as any).receiving.get(first.id)
      full = got?.data ?? got
    }

    return NextResponse.json({
      listError: listed?.error ?? null,
      listCount: Array.isArray(items) ? items.length : 0,
      // המפתחות בפריט list — לראות אם received_for שם
      listItemKeys: first ? Object.keys(first) : [],
      listItemSample: first ? {
        id: first.id, message_id: first.message_id, to: first.to,
        received_for: first.received_for ?? '(אין)',
        created_at: first.created_at,
      } : null,
      // המפתחות ב-get — לראות received_for + headers
      getKeys: full ? Object.keys(full) : [],
      getSample: full ? {
        id: full.id, message_id: full.message_id, to: full.to,
        received_for: full.received_for ?? '(אין)',
        hasHeaders: !!full.headers,
      } : null,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
