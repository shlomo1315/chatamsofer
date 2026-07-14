import { NextResponse } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'

// אבחון בירורי ההלוואות: האם הטוקן הונפק, האם יש הודעות, והאם הגיעו תשובות.
// מבדיל בין "המייל לא נשלח נכון" לבין "התשובה לא נקלטה".
export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireStaff(['admin'])
  if (!staff) return unauthorized()

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const [tokens, msgs, loans, dbg] = await Promise.all([
    db.from('reply_tokens')
      .select('token, kind, entity_table, entity_id, created_at, expires_at')
      .eq('kind', 'l')
      .order('created_at', { ascending: false })
      .limit(10),

    db.from('loan_messages')
      .select('id, loan_id, direction, body, sender_name, is_read, created_at')
      .order('created_at', { ascending: false })
      .limit(20),

    db.from('loans')
      .select('id, status, updated_at')
      .eq('status', 'inquiry')
      .limit(10),

    // המייל האחרון שנכנס עם plus-address. אם ריק — Resend לא ניתב אותו אלינו.
    db.from('app_settings').select('value, updated_at').eq('key', 'plus_address_debug').maybeSingle(),
  ])

  let lastPlus: unknown = null
  if (dbg.data?.value) {
    try { lastPlus = JSON.parse(String(dbg.data.value)) } catch { lastPlus = String(dbg.data.value) }
  }

  return NextResponse.json({
    // אם ריק — המייל נשלח בלי reply-to תקין, והתשובה לא תיתפס לעולם
    טוקנים_להלוואות: (tokens.data ?? []).map(t => ({
      טוקן: t.token,
      כתובת_המענה: `office+l${t.token}@chasamsofer.info`,
      הלוואה: t.entity_id,
      טבלה: t.entity_table,
      נוצר: t.created_at,
    })),
    tokensError: tokens.error?.message ?? null,

    הודעות: (msgs.data ?? []).map(m => ({
      כיוון: m.direction === 'staff' ? 'צוות → מבקש' : 'מבקש → צוות',
      טקסט: String(m.body).slice(0, 60),
      נשלח_על_ידי: m.sender_name,
      נקרא: m.is_read,
      מתי: m.created_at,
      הלוואה: m.loan_id,
    })),
    msgsError: msgs.error?.message ?? null,

    בקשות_בבירור: loans.data ?? [],

    // ⚠️ הבדיקה המכריעה: אם זה null, המייל של המשתמש לא הגיע ל-webhook בכלל
    // (Resend לא ניתב את office+l...), ולא מדובר בבאג בקוד שלנו.
    מייל_אחרון_עם_plus_address: lastPlus,
    מתי: dbg.data?.updated_at ?? null,

    הסבר: {
      'אם אין טוקנים': 'המייל נשלח בלי reply-to תקין — התשובה לא תוכל להיקלט',
      'אם יש טוקן אבל אין הודעה מהמבקש': 'התשובה לא הגיעה ל-webhook, או שהמשתמש שלח מייל חדש במקום להשיב',
    },
  })
}
