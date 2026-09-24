import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { logActivity } from '@/lib/activityLog'
import { getPaymentSettings, savePaymentSettings } from '@/lib/payments/settings'
import { getPaymentProvider } from '@/lib/payments'

// הגדרות ספק הסליקה של היריד.
//
// 🔴 קוד ה-API לעולם אינו חוזר ללקוח — רק דגל שמציין אם הוזן. אותו
// דפוס כמו מסכי נדרים קארד.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  // ⚠️ edit ולא view: אלה פרטי גבייה.
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()

  const s = await getPaymentSettings()
  const provider = await getPaymentProvider()

  return NextResponse.json({
    provider: s.provider ?? '',
    mosadId: s.mosadId ?? '',
    hasApiValid: Boolean(s.apiValid),
    testMode: s.testMode !== false,   // ברירת מחדל: מצב בדיקה
    category: s.category ?? '',
    // 🔴 מה *באמת* פעיל כרגע, ולא מה שהוזן. השניים נפרדים: ספק
    // שהוזן חלקית נופל למדומה, והמסך חייב לומר את זה.
    activeProvider: provider.name,
  })
}

export async function POST(request: NextRequest) {
  const staff = await requirePermission('book_fair', 'edit')
  if (!staff) return forbidden()

  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה שגויה' }, { status: 400 }) }

  // ── בדיקת חיבור ──
  // ⚠️ לפני השמירה ובלי לשמור: מאפשר לבדוק פרטים בלי להחליף את
  // ההגדרה הפעילה בפרטים שגויים.
  if (body.test) {
    const provider = await getPaymentProvider()
    if (provider.name === 'mock') {
      return NextResponse.json({
        ok: false,
        message: 'הספק הפעיל הוא המדומה. שמרו פרטי ספק אמיתי וכבו את מצב הבדיקה.',
      })
    }
    const r = await provider.testConnection()
    return NextResponse.json(r)
  }

  const patch: Record<string, unknown> = {}

  if (body.provider !== undefined) {
    const p = String(body.provider).trim().toLowerCase()
    if (p && p !== 'mock' && p !== 'nedarim') {
      return NextResponse.json({ error: 'ספק לא מוכר' }, { status: 400 })
    }
    patch.provider = p
  }

  if (body.mosadId !== undefined) {
    const m = String(body.mosadId).trim()
    if (m && !/^\d{4,9}$/.test(m)) {
      return NextResponse.json({ error: 'קוד מוסד חייב להיות 4-9 ספרות' }, { status: 400 })
    }
    patch.mosadId = m
  }

  // ⚠️ ריק = אל תשנה. כך שמירת שדה אחר אינה מוחקת את הקוד הקיים,
  // והמשתמש אינו צריך להקליד אותו מחדש בכל עריכה.
  if (body.apiValid !== undefined) {
    const v = String(body.apiValid).trim()
    if (v) patch.apiValid = v
  }

  if (body.testMode !== undefined) {
    patch.testMode = body.testMode === true
  }

  if (body.category !== undefined) {
    patch.category = String(body.category).trim().slice(0, 500)
  }

  if (!Object.keys(patch).length) {
    return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })
  }

  const ok = await savePaymentSettings(patch)
  if (!ok) return NextResponse.json({ error: 'שמירת ההגדרות נכשלה' }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId, action: 'update', entityType: 'app_settings',
    entityId: 'payments_provider',
    // 🔴 הקוד עצמו לעולם אינו נרשם ביומן — רק העובדה שהשתנה.
    details: {
      provider: patch.provider,
      mosadId: patch.mosadId,
      apiValidChanged: patch.apiValid !== undefined,
      testMode: patch.testMode,
    },
  })

  const provider = await getPaymentProvider()
  return NextResponse.json({ ok: true, activeProvider: provider.name })
}
