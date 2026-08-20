import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { getWorkspaceGmailClient, isWorkspaceConfigured } from '@/lib/googleWorkspace'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// יצירת תווית ב-Gmail ושיוכה למיילים של התיבה.
//
// 🔴 זה שונה מ-apply-label הישן. שם התווית היא *פנימית* — רשומה ב-app_settings
// שצובעת את הרשימה בממשק שלנו בלבד, ולא נוגעת ב-Gmail כלל. המנהל לחץ,
// ראה שדבר לא קרה בתיבה, והסיק שהכפתור שבור.
//
// כאן התווית נוצרת בתיבת היעד האמיתית (g@chasamsofer.info) דרך ה-API,
// ומודבקת על ההודעות שכבר יובאו לשם.
//
// ⚠️ labelId ריק = יצירת תווית חדשה בשם labelName. אחרת מדביקים תווית קיימת.
//
// ⚠️ אין middleware בפרויקט — כל ראוט מגן על עצמו.
// ─────────────────────────────────────────────────────────────────────────────

/** Gmail מגביל modify לאצווה של 1,000 מזהים. */
const BATCH = 1000

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()

  let body: { accountId?: string; labelId?: string; labelName?: string }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const accountId = String(body.accountId ?? '').trim()
  const labelId = String(body.labelId ?? '').trim()
  const labelName = String(body.labelName ?? '').trim()
  if (!accountId) return NextResponse.json({ error: 'חסר מזהה תיבה' }, { status: 400 })
  if (!labelId && !labelName) {
    return NextResponse.json({ error: 'יש לבחור תווית קיימת או להקליד שם לתווית חדשה' }, { status: 400 })
  }

  const db = admin()
  const { data: acc } = await db
    .from('gmail_accounts')
    .select('id, label, department, import_target_email')
    .eq('id', accountId)
    .maybeSingle()
  if (!acc) return NextResponse.json({ error: 'התיבה לא נמצאה' }, { status: 404 })

  if (!isWorkspaceConfigured()) {
    return NextResponse.json({ error: 'חיבור Google Workspace אינו מוגדר בשרת' }, { status: 400 })
  }

  const target = String(acc.import_target_email ?? '').trim()
    || DEPARTMENTS[acc.department as DepartmentKey]?.email
  if (!target) {
    return NextResponse.json({ error: 'לא הוגדרה כתובת יעד לייבוא עבור תיבה זו' }, { status: 400 })
  }

  // המיילים של התיבה שכבר יובאו ל-Gmail. רק להם יש gmail_message_id בתיבת
  // היעד, ורק אותם אפשר לתייג שם.
  //
  // ⚠️ .eq('gmail_account_id') ולא לפי מחלקה: שלוש תיבות חולקות את מחלקת
  // gemach, וסינון לפי מחלקה היה מתייג גם את מיילי התיבות האחרות.
  const { data: rows } = await db
    .from('inbound_emails')
    .select('gmail_message_id')
    .eq('gmail_account_id', accountId)
    .not('gmail_message_id', 'is', null)
    .not('imported_to_gmail_at', 'is', null)

  const ids = [...new Set((rows ?? []).map(r => String(r.gmail_message_id)).filter(Boolean))]

  try {
    const gmail = getWorkspaceGmailClient(target)

    // תווית קיימת, או יצירת חדשה בשם שהוקלד.
    let finalLabelId = labelId
    let finalLabelName = labelName
    if (!finalLabelId) {
      const list = await gmail.users.labels.list({ userId: 'me' })
      // ⚠️ בדיקת קיום לפני יצירה: Gmail מחזיר 409 על שם כפול, והמנהל היה
      // מקבל שגיאה במקום פשוט לקבל את התווית הקיימת.
      const existing = (list.data.labels ?? []).find((l: { id?: string|null; name?: string|null; type?: string|null }) => l.name === labelName)
      if (existing?.id) {
        finalLabelId = String(existing.id)
      } else {
        const created = await gmail.users.labels.create({
          userId: 'me',
          requestBody: { name: labelName, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
        })
        finalLabelId = String(created.data.id)
      }
    } else {
      const list = await gmail.users.labels.list({ userId: 'me' })
      finalLabelName = String((list.data.labels ?? []).find((l: { id?: string|null; name?: string|null; type?: string|null }) => l.id === finalLabelId)?.name ?? '')
    }

    // ⚠️ ההודעות מתויגות באצוות: batchModify מוגבל ל-1,000 מזהים לבקשה.
    let tagged = 0
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH)
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: chunk, addLabelIds: [finalLabelId] },
      })
      tagged += chunk.length
    }

    return NextResponse.json({
      ok: true,
      tagged,
      target,
      labelName: finalLabelName || labelName,
      // ⚠️ 0 הודעות אינו כישלון: התווית נוצרה ומוכנה לייבוא הבא. הלקוח
      // מבחין בין השניים בהודעה למשתמש.
      created: !labelId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[assign-gmail-label] נכשל:', msg)
    return NextResponse.json({ error: `הפעולה מול Gmail נכשלה: ${msg}` }, { status: 502 })
  }
}
