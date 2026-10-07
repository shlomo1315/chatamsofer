import { NextResponse, type NextRequest } from 'next/server'
import { requireMailAccess, unauthorized, getServiceClient } from '@/lib/apiAuth'
import { canAccessGmailMessage, canAccessGmailThread, canUseGmailAccount } from '@/lib/mailAccess'
import { getGmailClientForToken, sendGmailMessage } from '@/lib/gmail'
// תזמון בלבד — Gmail API אינו תומך בו, ולכן מייל מתוזמן יוצא דרך Resend.
import { deliverMail } from '@/lib/sendMail'

export const dynamic = 'force-dynamic'

function isInsufficientScopesError(message: string): boolean {
  return /insufficient authentication scopes|Request had insufficient authentication scopes/i.test(message)
}

// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
// פעולות על הודעות — שליחה, סימון נקרא, תוויות, מחיקה.
//
// 🔴 כל פעולה נכתבת ל-Gmail *וגם* לאינדקס. כתיבה לאינדקס בלבד הייתה נמחקת
// בסנכרון הבא, שמושך את מצב האמת מ-Gmail — והמשתמש היה רואה את הסימון שלו
// נעלם בלי הסבר. Gmail הוא מקור האמת, והאינדקס משקף אותו.
//
// ⚠️ הסדר קבוע: קודם Gmail, ורק אחרי הצלחה — האינדקס. הפוך היה מייצר מצב
// שבו המסך מראה "נקרא" בעוד שבטלפון ההודעה עדיין מודגשת.
// ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€

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

interface Attachment { name: string; type: string; data: string }

interface Body {
  action: 'send' | 'reply' | 'mark-read' | 'mark-unread' | 'followup' | 'unfollowup' | 'trash' | 'archive' | 'star' | 'unstar'
  messageId?: string
  threadId?: string
  to?: string
  /** עותק / עותק מוסתר — רשימות מופרדות בפסיקים. */
  cc?: string
  bcc?: string
  subject?: string
  html?: string
  attachments?: Attachment[]
  /** התיבה שממנה לשלוח — לבחירת השולח כשיש כמה. */
  accountId?: string
  /** ISO 8601 — מועד שליחה עתידי. מפנה את השליחה ל-Resend (ראו case 'send'). */
  scheduledAt?: string
}

/** כותרת מקודדת ל-UTF-8 — נושא/שם קובץ בעברית מגיע כג'יבריש בלעדיה. */
const enc = (s: string) => `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`

/**
 * שליחה עם צירופים — multipart/mixed.
 *
 * ⚠️ נפרד מ-sendGmailMessage כי המבנה שונה לגמרי: הודעה עם צירופים חייבת
 * גבול (boundary) בין החלקים, וניסיון להוסיף צירוף להודעה פשוטה שובר את
 * ה-MIME בשקט — גמייל שולח, והנמען מקבל הודעה ריקה עם זבל.
 */
async function sendWithAttachments(
  gmail: ReturnType<typeof getGmailClientForToken>,
  o: { to: string; subject: string; html: string; from: string; threadId?: string; attachments: Attachment[]; cc?: string; bcc?: string },
) {
  // ⚠️ גבול אקראי מספיק כדי שלא יופיע בתוכן. הופעה מקרית שלו הייתה קוטעת
  // את ההודעה באמצע.
  const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  const parts: string[] = [
    `From: ${enc('היכל החתם סופר')} <${o.from}>`,
    `To: ${o.to}`,
    // עותק / עותק מוסתר. ⚠️ Gmail מסיר את כותרת ה-Bcc בשליחה, כך
    // שהנמענים האחרים אינם רואים אותה — וזו כל תכליתה.
    ...(o.cc ? [`Cc: ${o.cc}`] : []),
    ...(o.bcc ? [`Bcc: ${o.bcc}`] : []),
    `Reply-To: ${o.from}`,
    `Subject: ${enc(o.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(o.html, 'utf8').toString('base64'),
  ]

  for (const a of o.attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${a.type || 'application/octet-stream'}; name="${enc(a.name)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${enc(a.name)}"`,
      '',
      a.data,
    )
  }
  parts.push(`--${boundary}--`, '')

  const raw = Buffer.from(parts.join('\r\n'), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: o.threadId || undefined },
  })
}

export async function POST(request: NextRequest) {
  // 🔴 'edit' — כל הפעולות כאן משנות (שליחה, אשפה, ארכיון, סימון).
  const staff = await requireMailAccess('edit')
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
  // 🔴 הרשאת תיבה (ביקורת אבטחה 05.10) — קודם כל פעולה עברה על כל הודעה
  // בכל תיבה, ושליחה יצאה מכל חשבון שנבחר בגוף הבקשה.
  //   · פעולה על הודעה / שרשור ⇒ ההודעה חייבת להיות בתיבה מורשית.
  //   · שליחה חדשה (בלי הקשר) ⇒ החשבון עצמו חייב להיות מורשה.
  if (body.messageId && !(await canAccessGmailMessage(db, staff, body.messageId))) {
    return NextResponse.json({ error: 'אין הרשאה לתיבה הזו' }, { status: 403 })
  }
  if (body.threadId && !(await canAccessGmailThread(db, staff, body.threadId))) {
    return NextResponse.json({ error: 'אין הרשאה לתיבה הזו' }, { status: 403 })
  }
  // 🔴 חשבון שנבחר במפורש נבדק *תמיד* (ביקורת אבטחה 07.10): קודם, בקשה עם
  // messageId של הודעה מורשית + accountId של תיבה אחרת עברה את בדיקת
  // ההודעה בלבד — ונשלחה מהתיבה האחרת.
  if ((body.accountId || (!body.messageId && !body.threadId)) && !(await canUseGmailAccount(db, staff, acc.id))) {
    return NextResponse.json({ error: 'אין הרשאה לשלוח מהתיבה הזו' }, { status: 403 })
  }

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
        const atts = Array.isArray(body.attachments) ? body.attachments : []
        const cc = String(body.cc ?? '').trim() || undefined
        const bcc = String(body.bcc ?? '').trim() || undefined

        // 🔴 שליחה מתוזמנת עוברת ב-Resend, לא ב-Gmail API.
        //
        // ⚠️ ל-Gmail API אין תזמון כלל — הודעה שנשלחת דרכו יוצאת מיד.
        // בלי ההסתעפות הזו "תזמן שליחה" היה מבטיח מועד עתידי ושולח כאן
        // ועכשיו, וזה השקר הגרוע ביותר שממשק יכול לספר.
        //
        // ⚠️ הסף (30 שניות) זהה לזה שבלקוח וב-/api/admin/gmail/send:
        // מועד שחלף נדחה במפורש במקום להישלח מיד בהפתעה.
        const schedRaw = body.scheduledAt ? String(body.scheduledAt) : ''
        if (schedRaw) {
          const t = new Date(schedRaw).getTime()
          if (!Number.isFinite(t) || t <= Date.now() + 30_000) {
            return NextResponse.json({ error: 'מועד השליחה חייב להיות עתידי' }, { status: 400 })
          }
          const mailAtts = atts
            .filter((a: { name?: string; data?: string }) => a?.data && a?.name)
            .map((a: { name: string; type?: string; data: string }) => ({
              filename: a.name,
              mimeType: a.type || 'application/octet-stream',
              contentB64: a.data,
            }))
          const r = await deliverMail(to, subject, html, mailAtts.length ? mailAtts : undefined, {
            replyTo: acc.email,
            fromEmail: acc.email,
            fromName: acc.email,
            sentBy: staff.email ?? undefined,
            scheduledAt: new Date(t).toISOString(),
          })
          if (!r.ok) return NextResponse.json({ error: r.error ?? 'התזמון נכשל' }, { status: 500 })
          console.log(`[inbox/actions] תוזמן מ-${acc.email} אל ${to} ל-${new Date(t).toISOString()}`)
          return NextResponse.json({ ok: true, scheduled: true })
        }

        if (atts.length) {
          await sendWithAttachments(gmail, {
            to, subject, html, from: acc.email, cc, bcc,
            threadId: body.action === 'reply' ? body.threadId : undefined,
            attachments: atts,
          })
        } else {
          await sendGmailMessage(gmail, {
            to, subject, html, cc, bcc,
            threadId: body.action === 'reply' ? body.threadId : undefined,
            from: acc.email,
            replyTo: acc.email,
          })
        }
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
      // ── מסומן בכוכב ──
      // ⚠️ STARRED היא תווית מערכת של Gmail — אין ליצור אותה (בניגוד
      // ל"לטיפול" שהיא תווית שלנו), ולכן אין כאן קריאה ל-labelId.
      case 'star':
      case 'unstar': {
        if (!body.messageId) return NextResponse.json({ error: 'חסר מזהה הודעה' }, { status: 400 })
        const add = body.action === 'star'
        await gmail.users.messages.modify({
          userId: 'me', id: body.messageId,
          requestBody: add ? { addLabelIds: ['STARRED'] } : { removeLabelIds: ['STARRED'] },
        })
        // ⚠️ נשמר גם באינדקס, אחרת הסינון לפי "מסומן בכוכב" היה מחייב
        // פנייה ל-Gmail בכל טעינה.
        const { data: curS } = await db.from('gmail_messages')
          .select('labels').eq('gmail_message_id', body.messageId).maybeSingle()
        const nextLabels = ((curS as { labels?: string[] } | null)?.labels ?? []).filter(l => l !== 'STARRED')
        if (add) nextLabels.push('STARRED')
        await db.from('gmail_messages').update({ labels: nextLabels }).eq('gmail_message_id', body.messageId)
        return NextResponse.json({ ok: true })
      }

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
    if (isInsufficientScopesError(msg)) {
      return NextResponse.json({
        error: 'חסרות הרשאות Gmail לתיבה זו. יש לחבר מחדש את התיבה במסך הגדרות > חיבור תיבה.',
        code: 'gmail_insufficient_scopes',
      }, { status: 403 })
    }
    return NextResponse.json({ error: `הפעולה נכשלה: ${msg}` }, { status: 500 })
  }
}
