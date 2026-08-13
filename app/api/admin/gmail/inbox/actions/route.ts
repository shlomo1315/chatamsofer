import { NextResponse, type NextRequest } from 'next/server'
import { requireStaff, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { getGmailClientForToken, sendGmailMessage } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// פעולות על הודעות — שליחה, סימון נקרא, תוויות, מחיקה.
//
// 🔴 כל פעולה נכתבת ל-Gmail *וגם* לאינדקס. כתיבה לאינדקס בלבד הייתה נמחקת
// בסנכרון הבא, שמושך את מצב האמת מ-Gmail — והמשתמש היה רואה את הסימון שלו
// נעלם בלי הסבר. Gmail הוא מקור האמת, והאינדקס משקף אותו.
//
// ⚠️ הסדר קבוע: קודם Gmail, ורק אחרי הצלחה — האינדקס. הפוך היה מייצר מצב
// שבו המסך מראה "נקרא" בעוד שבטלפון ההודעה עדיין מודגשת.
// ─────────────────────────────────────────────────────────────────────────────

/** התווית שמסמנת "לטיפול בהמשך" — נוצרת ב-Gmail בפעם הראשונה. */
const FOLLOWUP_LABEL = 'לטיפול'

async function accountFor(
  db: NonNullable<ReturnType<typeof getServiceClient>>,
  messageId?: string,
): Promise<{ id: string; email: string; refresh_token: string } | null> {
  if (messageId) {
    const { data: msg } = await db.from('gmail_messages')
      .select('account_id').eq('gmail_message_id', messageId).maybeSingle()
    const accId = (msg as { account_id?: string } | null)?.account_id
    if (accId) {
      const { data } = await db.from('gmail_accounts')
        .select('id, email, refresh_token').eq('id', accId).maybeSingle()
      if (data) return data as { id: string; email: string; refresh_token: string }
    }
  }
  const { data } = await db.from('gmail_accounts')
    .select('id, email, refresh_token').eq('is_active', true).limit(1).maybeSingle()
  return (data as { id: string; email: string; refresh_token: string } | null) ?? null
}

/** מוצא או יוצר תווית ב-Gmail ומחזיר את המזהה שלה. */
async function labelId(gmail: ReturnType<typeof getGmailClientForToken>, name: string): Promise<string | null> {
  try {
    const list = await gmail.users.labels.list({ userId: 'me' })
    const found = (list.data?.labels ?? []).find((l: { name?: string | null }) => l.name === name)
    if (found?.id) return String(found.id)
    const created = await gmail.users.labels.create({
      userId: 'me',
      requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
    })
    return created.data?.id ? String(created.data.id) : null
  } catch (e) {
    console.error('[inbox/actions] תווית נכשלה:', e instanceof Error ? e.message : e)
    return null
  }
}

interface Body {
  action: 'send' | 'reply' | 'mark-read' | 'mark-unread' | 'followup' | 'unfollowup' | 'trash' | 'archive'
  messageId?: string
  threadId?: string
  to?: string
  subject?: string
  html?: string
  /** התיבה שממנה לשלוח — לבחירת השולח כשיש כמה. */
  accountId?: string
}

export async function POST(request: NextRequest) {
  const staff = await requireStaff()
  if (!staff) return unauthorized()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: Body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  // ⚠️ תיבת השליחה נבחרת לפי ההודעה שעליה פועלים, ולא תמיד הראשונה: תשובה
  // מתיבת עזר יולדות שנשלחה מהמשרד הראשי מגיעה למשפחה מהכתובת הלא נכונה.
  const acc = body.accountId
    ? await (async () => {
        const { data } = await db.from('gmail_accounts')
          .select('id, email, refresh_token').eq('id', body.accountId).maybeSingle()
        return data as { id: string; email: string; refresh_token: string } | null
      })()
    : await accountFor(db, body.messageId)

  if (!acc) return NextResponse.json({ error: 'אין תיבת Gmail פעילה' }, { status: 404 })
  const gmail = getGmailClientForToken(acc.refresh_token)

  try {
    switch (body.action) {
      // ── שליחה ותשובה ──
      case 'send':
      case 'reply': {
        const to = String(body.to ?? '').trim()
        if (!to) return NextResponse.json({ error: 'חסרה כתובת נמען' }, { status: 400 })
        const subject = String(body.subject ?? '').trim() || '(ללא נושא)'
        const html = String(body.html ?? '')
        if (!html.replace(/<[^>]*>/g, '').trim()) {
          return NextResponse.json({ error: 'ההודעה ריקה' }, { status: 400 })
        }
        // ⚠️ threadId בתשובה בלבד: בהודעה חדשה הוא היה משרשר אותה לשיחה
        // אקראית, וההודעה הייתה נעלמת בתוך שרשור שאינו קשור אליה.
        await sendGmailMessage(gmail, {
          to, subject, html,
          threadId: body.action === 'reply' ? body.threadId : undefined,
          from: acc.email,
          replyTo: acc.email,
        })
        console.log(`[inbox/actions] נשלח מ-${acc.email} אל ${to}`)
        return NextResponse.json({ ok: true })
      }

      // ── מצב קריאה ──
      case 'mark-read':
      case 'mark-unread': {
        if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
        const unread = body.action === 'mark-unread'
        await gmail.users.messages.modify({
          userId: 'me', id: body.messageId,
          requestBody: unread ? { addLabelIds: ['UNREAD'] } : { removeLabelIds: ['UNREAD'] },
        })
        await db.from('gmail_messages')
          .update({ is_unread: unread }).eq('gmail_message_id', body.messageId)
        return NextResponse.json({ ok: true })
      }

      // ── לטיפול בהמשך ──
      case 'followup':
      case 'unfollowup': {
        if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
        const id = await labelId(gmail, FOLLOWUP_LABEL)
        if (!id) return NextResponse.json({ error: 'יצירת התווית נכשלה' }, { status: 500 })
        const add = body.action === 'followup'
        await gmail.users.messages.modify({
          userId: 'me', id: body.messageId,
          requestBody: add ? { addLabelIds: [id] } : { removeLabelIds: [id] },
        })
        // ⚠️ התווית נשמרת גם באינדקס כדי שהסינון במסך יעבוד בלי לפנות
        // ל-Gmail בכל טעינה.
        const { data: cur } = await db.from('gmail_messages')
          .select('labels').eq('gmail_message_id', body.messageId).maybeSingle()
        const labels = ((cur as { labels?: string[] } | null)?.labels ?? []).filter(l => l !== FOLLOWUP_LABEL)
        if (add) labels.push(FOLLOWUP_LABEL)
        await db.from('gmail_messages').update({ labels }).eq('gmail_message_id', body.messageId)
        return NextResponse.json({ ok: true })
      }

      // ── מחיקה / ארכוב ──
      case 'trash':
      case 'archive': {
        if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
        if (body.action === 'trash') {
          await gmail.users.messages.trash({ userId: 'me', id: body.messageId })
          // ⚠️ מחיקה רכה באינדקס: השיוך לכרטסת והתיעוד שנבנו על ההודעה
          // נשארים. מחיקה קשה הייתה מוחקת עבודה אנושית.
          await db.from('gmail_messages')
            .update({ deleted_at: new Date().toISOString() }).eq('gmail_message_id', body.messageId)
        } else {
          await gmail.users.messages.modify({
            userId: 'me', id: body.messageId, requestBody: { removeLabelIds: ['INBOX'] },
          })
          const { data: cur } = await db.from('gmail_messages')
            .select('labels').eq('gmail_message_id', body.messageId).maybeSingle()
          const labels = ((cur as { labels?: string[] } | null)?.labels ?? []).filter(l => l !== 'INBOX')
          await db.from('gmail_messages').update({ labels }).eq('gmail_message_id', body.messageId)
        }
        return NextResponse.json({ ok: true })
      }

      default:
        return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[inbox/actions] ${body.action} נכשל:`, msg)
    return NextResponse.json({ error: `הפעולה נכשלה: ${msg}` }, { status: 500 })
  }
}
