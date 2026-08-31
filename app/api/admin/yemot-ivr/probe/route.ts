import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { buildExtIni, extIniPath } from '@/lib/yemotExtIni'
import { syncExtensionToYemot } from '@/lib/yemot'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// בדיקת החיבור לימות — קריאה ואימות בלי לגעת בשלוחה פעילה.
//
// 🔴 נבנה כי שמות הפרמטרים ב-ext.ini נלקחו מהתיעוד ולא מהרצה בפועל.
// "אמור לעבוד" אינו בדיקה, ושלוחה שנוצרת עם שם פרמטר שגוי עובדת
// חלקית בלי שום שגיאה — התקלה הכי קשה לאבחון.
//
// ⚠️ GET קורא בלבד. POST כותב לשלוחת בדיקה שהמנהל נוקב בה במפורש,
// ולעולם לא לשלוחה קיימת בלי שיבקש.
//
// 🔒 מנהל בלבד.
// ─────────────────────────────────────────────────────────────────────────────

const API = 'https://www.call2all.co.il/ym/api'

/** קריאת תיקייה בימות — מה קיים שם באמת. */
async function listDir(token: string, path: string) {
  const url = `${API}/GetIVR2Dir?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = await res.json().catch(() => null)
  return { status: res.status, json }
}

export async function GET(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const token = process.env.YEMOT_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, error: 'YEMOT_TOKEN אינו מוגדר בשרת' })
  }

  const path = request.nextUrl.searchParams.get('path') ?? 'ivr2:/'
  const dir = await listDir(token, path)

  return NextResponse.json({
    ok: true,
    path,
    // ⚠️ מוחזר הגוף הגולמי: הבדיקה כולה נועדה לראות מה ימות באמת
    // מחזירה, וסיכום מעובד היה מסתיר בדיוק את מה שאני מחפש.
    raw: dir.json,
    httpStatus: dir.status,
  })
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const token = process.env.YEMOT_TOKEN
  if (!token) {
    return NextResponse.json({ ok: false, error: 'YEMOT_TOKEN אינו מוגדר בשרת' })
  }

  const body = await request.json().catch(() => ({})) as {
    folder?: string
    type?: string
    extra?: Record<string, string>
    confirm?: boolean
  }

  // 🔴 שער האישור: כתיבה לשלוחה בימות משנה מה שמתקשרים שומעים.
  if (!body.confirm) {
    return NextResponse.json({ error: 'נדרש אישור מפורש' }, { status: 400 })
  }

  const folder = String(body.folder ?? '').trim()
  const path = extIniPath(folder)
  if (!path) return NextResponse.json({ error: 'מספר שלוחה לא תקין' }, { status: 400 })

  const ini = buildExtIni({ type: String(body.type ?? ''), extra: body.extra })
  if (!ini) return NextResponse.json({ error: 'סוג שלוחה לא מוכר' }, { status: 400 })

  // ⚠️ מה היה שם *לפני* — כדי שאפשר יהיה לדעת אם דרסנו משהו.
  const before = await listDir(token, `ivr2:/${folder.replace(/^\/+/, '')}`)

  const sync = await syncExtensionToYemot(path, ini)
  const after = await listDir(token, `ivr2:/${folder.replace(/^\/+/, '')}`)

  return NextResponse.json({
    ok: sync.ok,
    error: sync.error,
    path,
    // 🔴 התוכן שנשלח — כדי להשוות מול מה שימות קלטה בפועל.
    iniSent: ini,
    before: before.json,
    after: after.json,
  })
}
