import { NextResponse, type NextRequest } from 'next/server'
import { requireNonMailStaff, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getGmailClientForToken } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// הפעלה/חידוש של Gmail watch — המנוי שגורם לגוגל לדחוף התראות.
//
// 🔴 המנוי פג אחרי 7 ימים. זו אינה הערת שוליים: בלי חידוש, הסנכרון המיידי
// נדם בשקט בדיוק שבוע אחרי ההפעלה — בלי שגיאה, בלי התראה, ובלי שאיש ישים
// לב עד שמישהו יתלונן שמייל לא הגיע. לכן המסך מציג את מועד התפוגה, ולכן
// יש כאן חידוש שאפשר להריץ שוב ושוב בבטחה.
//
// POST   — הפעלה/חידוש.
// DELETE — עצירה (חזרה לסנכרון ידני בלבד).
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const staff = await requireNonMailStaff()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const topic = process.env.GMAIL_PUBSUB_TOPIC
  if (!topic) {
    return NextResponse.json({
      error: 'לא הוגדר GMAIL_PUBSUB_TOPIC. יש להגדיר את ה-topic בהגדרות השרת לפני הפעלת הסנכרון המיידי.',
    }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const accountId = String((body as { account_id?: string })?.account_id ?? '')

  let q = db.from('gmail_accounts').select('id, email, refresh_token').eq('is_active', true)
  if (accountId) q = q.eq('id', accountId)
  const { data } = await q
  const accounts = (data ?? []) as { id: string; email: string; refresh_token: string }[]
  if (!accounts.length) return NextResponse.json({ error: 'לא נמצא חשבון פעיל' }, { status: 404 })

  const results: { email: string; ok: boolean; expiration?: string; error?: string }[] = []

  for (const acc of accounts) {
    try {
      const gmail = getGmailClientForToken(acc.refresh_token)
      const res = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: topic,
          // ⚠️ INBOX *וגם* SENT, ולא כל התיבה: בלי סינון, כל שינוי תווית
          // בכל הודעה בארכיון מייצר התראה — עומס עצום בלי תועלת.
          //
          // 🔴 SENT חובה. קודם היה INBOX בלבד, ולכן מייל יוצא לא הפעיל
          // Push כלל ולא הופיע במערכת עד סנכרון ידני — תיבה שלמה נשארה
          // עם 0 הודעות "נשלחו" בעוד המשתמש שלח מתוך Gmail.
          labelIds: ['INBOX', 'SENT'],
          labelFilterBehavior: 'INCLUDE',
        },
      })

      // גוגל מחזיר את התפוגה כמילישניות מאז 1970, כמחרוזת.
      const expMs = res.data?.expiration ? Number(res.data.expiration) : null
      const expiration = expMs && Number.isFinite(expMs) ? new Date(expMs).toISOString() : null

      await db.from('gmail_accounts').update({
        watch_started_at: new Date().toISOString(),
        watch_expires_at: expiration,
        // ⚠️ ה-historyId שגוגל מחזיר כאן הוא נקודת ההתחלה של המנוי. אם
        // החשבון מעולם לא סונכרן, הוא הסמן ההגיוני להתחיל ממנו.
        ...(res.data?.historyId ? { last_history_id: String(res.data.historyId) } : {}),
        last_error: null,
      }).eq('id', acc.id)

      results.push({ email: acc.email, ok: true, expiration: expiration ?? undefined })
      console.log(`[watch] הופעל עבור ${acc.email} · פג ב-${expiration ?? 'לא ידוע'}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[watch] נכשל עבור ${acc.email}:`, msg)
      results.push({ email: acc.email, ok: false, error: msg })
    }
  }

  const failed = results.filter(r => !r.ok)
  return NextResponse.json({
    ok: failed.length === 0,
    results,
    // ⚠️ נאמר במפורש: מנוי שלא חודש נדם בלי סימן, ולכן המסך חייב להציג מתי.
    note: 'המנוי פג אחרי 7 ימים ויש לחדשו. המערכת מחדשת אוטומטית, אך כדאי לוודא במסך.',
  }, { status: failed.length && failed.length === results.length ? 502 : 200 })
}

export async function DELETE() {
  const staff = await requireNonMailStaff()
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data } = await db.from('gmail_accounts')
    .select('id, email, refresh_token').eq('is_active', true)

  for (const acc of (data ?? []) as { id: string; email: string; refresh_token: string }[]) {
    try {
      await getGmailClientForToken(acc.refresh_token).users.stop({ userId: 'me' })
    } catch (e) {
      // ⚠️ מנוי שכבר אינו קיים אינו שגיאה — ממשיכים לנקות את המצב המקומי.
      console.warn(`[watch] עצירה נכשלה עבור ${acc.email}:`, e instanceof Error ? e.message : e)
    }
    await db.from('gmail_accounts')
      .update({ watch_started_at: null, watch_expires_at: null }).eq('id', acc.id)
  }

  return NextResponse.json({ ok: true })
}
