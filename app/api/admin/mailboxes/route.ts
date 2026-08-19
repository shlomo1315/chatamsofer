import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ניהול התיבות המחוברות — מה מוצג בלשונית מייל ומה רק מסונכרן לארכיון.
//
// 🔴 ההבחנה: תיבות הדומיין (@chasamsofer.info) הן תיבות עבודה — שם קוראים
// ועונים. תיבות ה-Gmail הישנות נמשכות רק כדי לשמר היסטוריה, והן הציפו את
// הדואר הנכנס באלפי הודעות ישנות שהסתירו את מה שבאמת ממתין לטיפול.
//
// ⚠️ sync_only אינו מפסיק את הסנכרון — הוא רק מוציא את התיבה מהתצוגה.
// המיילים ממשיכים להיאסף, ומגיעים אליהם דרך התווית שהוגדרה לתיבה.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET() {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data, error } = await db.from('gmail_accounts')
    .select('id, email, label, department, label_id, sync_only, is_active, total_synced, last_sync_at')
    .order('sync_only').order('email')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // התוויות הקיימות — לבורר "לאיזו תווית לסנכרן".
  const { data: labelRow } = await db.from('app_settings')
    .select('value').eq('key', 'mail_label_defs').maybeSingle()
  let labels: { id: string; name: string; color?: string }[] = []
  try {
    const raw = (labelRow as { value?: string } | null)?.value
    if (raw) labels = JSON.parse(raw)
  } catch { labels = [] }

  return NextResponse.json({ mailboxes: data ?? [], labels })
}

export async function PATCH(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: { id?: string; sync_only?: boolean; label_id?: string | null; newLabelName?: string; newLabelColor?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })

  let labelId = body.label_id === null ? null : (body.label_id ? String(body.label_id) : undefined)

  // יצירת תווית חדשה מתוך המסך — כדי שלא צריך לצאת ולחזור.
  if (body.newLabelName?.trim()) {
    const { data: cur } = await db.from('app_settings')
      .select('value').eq('key', 'mail_label_defs').maybeSingle()
    let labels: { id: string; name: string; color?: string }[] = []
    try {
      const raw = (cur as { value?: string } | null)?.value
      if (raw) labels = JSON.parse(raw)
    } catch { labels = [] }

    // ⚠️ מזהה יציב ולא רץ: התוויות נשמרות באינדקס לפי מזהה, ומזהה
    // שמשתנה היה מנתק את כל השיוכים הקיימים.
    const fresh = {
      id: `label-${Date.now().toString(36)}`,
      name: body.newLabelName.trim(),
      color: body.newLabelColor || '#6366f1',
    }
    labels.push(fresh)
    // 🔴 JSON.stringify חובה — app_settings.value היא עמודת text, ושמירת
    // אובייקט גולמי נכשלת בשקט ומאחסנת "[object Object]".
    await db.from('app_settings').upsert({
      key: 'mail_label_defs',
      value: JSON.stringify(labels),
      updated_at: new Date().toISOString(),
    })
    labelId = fresh.id
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.sync_only === 'boolean') patch.sync_only = body.sync_only
  if (labelId !== undefined) patch.label_id = labelId
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'אין מה לעדכן' }, { status: 400 })

  const { error } = await db.from('gmail_accounts').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, label_id: labelId })
}
