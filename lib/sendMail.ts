import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { NOREPLY_FROM, BRAND_NAME, DEPARTMENTS, departmentByEmail } from './departments'
import { storagePath } from './docUrl'

export interface MailAttachment { filename: string; mimeType: string; contentB64: string }
export interface MailOptions {
  replyTo?: string
  fromName?: string
  fromEmail?: string   // כתובת השולח (ברירת מחדל: noreply). מחלקות שולחות מכתובתן.
  department?: string  // מחלקה לתיוג בתיבת "דואר יוצא" (ברירת מחדל: לפי כתובת השולח/תשובה)
  sentBy?: string      // מי שלח (משתמש מערכת); ריק = מייל אוטומטי
  skipLog?: boolean    // דלג על תיעוד ב-sent_emails (כשהקורא מתעד בעצמו)
  scheduledAt?: string // ISO 8601 — תזמון שליחה דרך Resend (אם מוגדר, המייל יישלח במועד זה)
  tracking?: boolean   // מעקב פתיחות/קליקים (דיוור בלבד; מיילים תפעוליים ללא מעקב)
  // מייל תפעולי חד-פעמי (קוד אימות): ללא מעקב וללא כותרות הסרה מרשימת תפוצה.
  // ⚠️ שני אלה פוגעים דווקא במייל שחייב להגיע: פיקסל המעקב וקישורי ההפניה
  // יוצאים מדומיין המעקב של Resend — שרשתות מסוננות (NetFree/רימון), שדרכן
  // גולש כל הקהל שלנו, חוסמות; ו-List-Unsubscribe הוא סימן של דיוור המוני
  // ומוריד את ציון המסירה של הודעה שאינה דיוור כלל.
  transactional?: boolean
  unsubscribeUrl?: string // קישור הסרה — מפעיל One-Click unsubscribe (חובה בדיוור המוני)
  inReplyTo?: string   // שרשור: Message-ID של ההודעה שאליה זו תשובה
  references?: string  // שרשור: שרשרת ה-Message-IDs הקודמים בשיחה (מופרדים ברווח)
  // ⚠️ עדיפות בניתוב דרך Workspace (ראו GMAIL ROUTING למטה):
  //   'high'   — קוד אימות. רשאי לנצל את מלוא המכסה של החשבון.
  //   'normal' — ברירת המחדל לכל מייל תפעולי אחר. נעצר מוקדם יותר, כדי
  //              שגל אישורים לא יחסל את המכסה ויותיר את הקודים בלי מקום.
  //   'never'  — דיוור המוני. לעולם לא דרך Workspace.
  gmailPriority?: 'high' | 'normal' | 'never'
}

// ─── GMAIL ROUTING ──────────────────────────────────────────────────────────
// ⚠️ [תקלת מסירה 05/08/2026] Resend קיבל 100% מהשליחות בלי שגיאה אחת, אבל
// הודעות ל-@gmail.com נתקעו ב-"Sent" ולא נמסרו. ההוכחה הייתה בלוח של Resend:
// באותה שנייה בדיוק הודעות לדומיינים אחרים הגיעו ל-"Delivered". כלומר הדומיין,
// ה-DNS ו-Resend תקינים — Gmail לבדו מקצה מסירה במשורה אחרי קפיצת נפח חדה.
//
// לכן נמעני Gmail יוצאים דרך חשבון ה-Google Workspace של הארגון. זה עובד כאן
// כי הדומיין מחזיק MX של smtp.google.com, רשומת google._domainkey ו-SPF ראשי
// עם include:_spf.google.com — מייל מהחשבון עובר SPF ו-DKIM מיושרים מול Gmail.
//
// ⚠️ המסלול יכול רק להוסיף מסירות ולעולם לא לגרוע: כל כשל — תקרה, חשבון שאינו
// מחובר, שגיאת API — נופל אוטומטית ל-Resend, שהוא ההתנהגות שהייתה קודם.
//
// ⚠️ כל הדואר התפעולי עובר כאן, לא רק קודי האימות. בשלב מוקדם המסלול הוגבל
// לקודים בלבד — היה חשבון שליחה אחד, והמכסה שלו נגמרה תוך שעה. עם מאגר
// חשבונות (כל אחד ~1,900 ליום, והשליחה עוברת לבא בתור) הקיבולת גדלה, ואין
// סיבה להשאיר את שאר הדואר במסלול שנחנק.
//
// ⚠️ שתי מדרגות מכסה נשמרות: קוד אימות רשאי לנצל את מלוא המכסה של החשבון,
// ומייל תפעולי אחר נעצר מוקדם יותר. כך גל של אישורי הרשמה אינו יכול לחסל
// את המכסה ולהותיר את קוד האימות — היחיד שחוסם אדם מלהשלים הרשמה — בלי מקום.
// אישור שמתעכב מעצבן; קוד שלא מגיע עוצר את התהליך כולו.
//
// ⚠️ דיוור המוני לעולם אינו עובר כאן: חשבון Workspace אינו כלי דיוור, ושליחת
// ניוזלטר דרכו תמצה את המכסה ותסכן את החשבון עצמו. הזיהוי לפי unsubscribeUrl,
// שקיים בדיוור בלבד.
const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com'])
// ⚠️ תשובות מופנות תמיד לתיבה המאוישת של המשרד. השולח בפועל הוא חשבון שליחה
// ייעודי שאיש אינו קורא בו, ובלי Reply-To תשובה של נמען נעלמת.
const REPLY_TO_FALLBACK = DEPARTMENTS.main.email
// תקרה רכה *לכל חשבון*, מתחת לתקרת Workspace האמיתית (כ-2,000).
//
// ⚠️ המרווח שנשאר קטן (כ-100), וזה מכוון: חשבונות השליחה ייעודיים ולא יוצא
// מהם דואר אחר, ולכן אין מה לשמור עבורו. אם בכל זאת ייחצה הגבול האמיתי של
// Google — השליחה נכשלת, עוברת לחשבון הבא במאגר, ואם אין כזה נופלת ל-Resend.
// כלומר חריגה עולה בהאטה ולא באובדן הודעה.
export const GMAIL_CAP_HIGH = 1900
// מייל תפעולי שאינו קוד אימות נעצר כאן — ההפרש שמור לקודים.
export const GMAIL_CAP_NORMAL = 1600

function isGmailAddress(email: string): boolean {
  const at = email.lastIndexOf('@')
  return at >= 0 && GMAIL_DOMAINS.has(email.slice(at + 1).trim().toLowerCase())
}

// התאריך לפי שעון ישראל, כדי שהמונה יתאפס בחצות המקומית ולא באמצע יום העבודה.
function todayKey(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// מונה יומי *לכל חשבון בנפרד* — כי גם התקרה של Google היא לכל חשבון בנפרד.
export function gmailCounterKey(email: string): string {
  return `gmail_daily_send:${todayKey()}:${email.trim().toLowerCase()}`
}

// הבהרת "מייל אוטומטי" שנוספת לכל הודעה שיוצאת מחשבון שליחה ייעודי.
//
// ⚠️ נדרשת דווקא כאן: השולח בפועל הוא חשבון כמו c1@ שאיש אינו קורא בו, והנמען
// רואה אותו בשורת "מאת". בלי הבהרה מפורשת הוא משיב לשם בתום לב — והתשובה
// יושבת בתיבה נטושה. הכותרת Reply-To מפנה לתיבת המשרד, אבל היא אינה נראית
// למשתמש; ההבהרה הזו כן.
// ⚠️ בלי כתובת מייל. ההבהרה הופיעה שלוש פעמים בתחתית אותו מייל — כאן,
// ב-noReplyBox של התבנית, ובכותרת התחתונה של shell — וכל אחת הציגה שוב את
// כתובת המשרד. הכתובת שייכת לגוף ההודעה, שם היא רלוונטית להקשר; כאן היא
// רק חזרה שלישית על אותו דבר.
function automatedNotice(): string {
  return `<div style="max-width:520px;margin:16px auto 0;padding:16px 20px;border-radius:12px;`
    + `background:#fef2f2;border:2px solid #fecaca;direction:rtl;text-align:center;`
    + `font-family:'Heebo',Arial,sans-serif;line-height:1.8;">`
    + `<div style="font-weight:900;color:#991b1b;font-size:15px;margin-bottom:4px">`
    + `מייל זה נשלח ממערכת אוטומטית — אין להשיב עליו</div>`
    + `<div style="color:#b91c1c;font-size:13px">`
    + `הודעות הנשלחות לכתובת זו אינן נקראות. במידת הצורך ניתן לפנות לכל אגף בנפרד.</div>`
    + `</div>`
}

// הוספת ההבהרה לגוף ההודעה, לפני סגירת body אם קיים.
//
// 🔴 הבדיקה חייבת לכסות את *כל* הניסוחים שמופיעים בתבניות. היא חיפשה
// "אין להשיב" בלבד, בעוד noReplyBox כותב "ואין להשיב אליו" — ולכן החמיצה
// אותו, והנמען קיבל את אותה הבהרה פעמיים בזו אחר זו.
function withAutomatedNotice(html: string): string {
  if (/אין להשיב|ואין להשיב|אינן נקראות/.test(html)) return html
  const notice = automatedNotice()
  return /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${notice}</body>`)
    : html + notice
}

// ─────────────────────────────────────────────────────────────────────────────
// חשבונות שגוגל חסם זמנית (429 · "User-rate limit exceeded").
//
// ⚠️ למה: המונה היומי שלנו הוא תקרה *רכה* משלנו, אבל לגוגל יש תקרות נוספות
// (בין השאר לפי קצב) שאינן נספרות אצלנו. כשחשבון נחסם, הוא נשאר ראשון ברשימה
// וכל מייל המשיך לנסות אותו, להמתין לתשובת הרשת, לקבל 429 — ורק אז לעבור
// לחשבון הבא. בגל רישום המוני זה הוסיף המתנה מיותרת לכל בקשה. גוגל מחזיר
// בהודעת השגיאה את הזמן המדויק שבו החסימה פגה ("Retry after <ISO>"), ואנחנו
// מכבדים אותו: החשבון מדולג עד אז, ואז חוזר לסבב מעצמו.
//
// הזיכרון הוא בתהליך (לא ב-DB) בכוונה: הוא רק אופטימיזציה, ואיבודו ב-deploy
// גורם לכל היותר לניסיון כושל אחד נוסף שממילא מטופל.
// ─────────────────────────────────────────────────────────────────────────────
const _rateLimitedUntil = new Map<string, number>()
const RATE_LIMIT_FALLBACK_MS = 15 * 60_000   // אם גוגל לא ציין זמן — 15 דקות

function isRateLimited(email: string): boolean {
  const until = _rateLimitedUntil.get(email)
  if (until == null) return false
  if (Date.now() >= until) { _rateLimitedUntil.delete(email); return false }
  return true
}

// רישום חסימה מתוך שגיאת גוגל. מחזיר true אם זו אכן שגיאת מכסה (429).
function noteIfRateLimited(email: string, e: unknown): boolean {
  const err = e as { code?: number; status?: number; message?: string }
  const code = err?.code ?? err?.status
  const msg = String(err?.message ?? '')
  if (code !== 429 && !/rate limit|RESOURCE_EXHAUSTED/i.test(msg)) return false

  // "Retry after 2026-08-09T10:14:20.134Z" — הזמן המדויק שגוגל נקב בו.
  const m = msg.match(/Retry after (\S+)/)
  const parsed = m ? Date.parse(m[1]) : NaN
  const until = Number.isFinite(parsed) ? parsed : Date.now() + RATE_LIMIT_FALLBACK_MS
  _rateLimitedUntil.set(email, until)
  console.warn(`[mail] ${email} חסום ע"י Gmail עד ${new Date(until).toISOString()} — מדלגים עליו עד אז`)
  return true
}

// ניסיון שליחה דרך Workspace. מחזיר את כתובת החשבון ששלח, או null אם אף
// חשבון לא היה זמין — ואז הקורא ממשיך ל-Resend. אינו זורק לעולם.
//
// ⚠️ סבב בין חשבונות: התקרה של Google היא לכל משתמש בנפרד ואינה ניתנת
// להעלאה, ולכן הדרך היחידה להגדיל נפח היא להוסיף חשבונות. השליחה עוברת
// לחשבון הבא ברשימה ברגע שהקודם מיצה את מכסתו, ורק כשכולם מוצו — ל-Resend.
async function trySendViaGmail(
  to: string, subject: string, html: string, fallbackFrom: string, fromName: string, cap: number,
  replyTo?: string,
  // 🔴 כותרות שרשור — ראו ההערה ב-sendGmailMessage. הושמטו כאן, ולכן כל
  // תשובה לנמען Gmail (הרוב המכריע) נפתחה אצלו כשרשור חדש.
  thread?: { inReplyTo?: string; references?: string },
): Promise<string | null> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return null
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

    // ייבוא דינמי — googleapis כבד, ואין סיבה לטעון אותו במסלול שאינו ג'ימייל.
    const { listSendAccounts, gmailClientForToken, getGmailClient, sendGmailMessage } = await import('@/lib/gmail')
    const accounts = await listSendAccounts()

    // אין חשבון ייעודי — נופלים לחשבון הראשי עם מונה משלו, כדי שהיעדר
    // הגדרה חדשה לא ישבית שליחה שכבר עבדה.
    const pool = accounts.length
      ? accounts.map(a => ({ email: a.email, token: a.refresh_token }))
      : [{ email: '(ראשי)', token: '' }]

    for (const acc of pool) {
      // חשבון שגוגל חסם זמנית — מדלגים בלי לשלם על ניסיון רשת כושל.
      // ⚡ בלי זה, חשבון חסום נוסה מחדש בכל מייל והוסיף המתנה לכל בקשה.
      if (isRateLimited(acc.email)) continue

      // ⚠️ המונה אינו אטומי, ובכוונה: התקרה כאן רכה ומתחת לתקרה האמיתית של
      // Google. חריגה קלה בתנאי מרוץ תיתקל ממילא בתקרה האמיתית, והשליחה
      // תעבור לחשבון הבא או ל-Resend.
      const ck = gmailCounterKey(acc.email)
      const { data } = await admin.from('app_settings').select('value').eq('key', ck).maybeSingle()
      const next = (Number(data?.value ?? 0) || 0) + 1
      if (next > cap) continue   // החשבון מיצה את מכסתו היום — לבא בתור

      await admin.from('app_settings').upsert(
        { key: ck, value: String(next), updated_at: new Date().toISOString() }, { onConflict: 'key' },
      )

      try {
        const gmail = acc.token ? gmailClientForToken(acc.token) : await getGmailClient()
        // ⚠️ השולח הוא החשבון עצמו ולא כתובת מוגדרת: Gmail מכבד כתובת "מאת"
        // אחרת רק אם היא רשומה בחשבון כאליאס מאומת, ואחרת מתעלם ממנה בשקט.
        // כתובת אמיתית מונעת פער בין מה שהוגדר למה שהנמען רואה בפועל.
        const from = acc.token ? acc.email : fallbackFrom
        await sendGmailMessage(gmail, {
          to, subject, from, fromName, replyTo,
          inReplyTo: thread?.inReplyTo,
          references: thread?.references,
          // ⚠️ מייל בשרשור אינו מקבל את הודעת "אין להשיב": הוא נשלח דווקא
          // כדי שהנמען ישיב עליו, והתוספת סתרה את גוף ההודעה עצמו.
          html: thread?.inReplyTo || thread?.references
            ? html
            : withAutomatedNotice(html),
        })
        return acc.email
      } catch (e) {
        // כשל בחשבון מסוים — ממשיכים לבא בתור ולא מפילים את השליחה כולה.
        // חסימת מכסה (429) נרשמת כדי שהחשבון ידולג עד שהיא פגה. הלוג מקוצר
        // במכוון: אובייקט השגיאה של googleapis מכיל את גוף המייל כולו בבסיס64,
        // ובגל שליחות הוא הציף את לוג השרת במאות שורות לכל כישלון.
        if (noteIfRateLimited(acc.email, e)) continue
        console.error(`[mail] שליחה דרך ${acc.email} נכשלה, ממשיכים:`, (e as Error)?.message ?? e)
      }
    }

    console.warn('[mail] כל חשבונות השליחה מוצו או נכשלו — ממשיכים ב-Resend')
    return null
  } catch (e) {
    console.error('[mail] שליחה דרך Gmail נכשלה, נופלים ל-Resend:', e)
    return null
  }
}

// תיעוד מייל יוצא ב-Supabase כדי שיופיע בתיבת "דואר יוצא" של המחלקה. לא חוסם.
// resendId — המזהה שהוחזר מ-Resend. קריטי: ה-webhook של אירועי המסירה
// (delivered/opened/clicked/bounced) מזהה מיילים אך ורק לפיו.
async function logSentEmail(
  to: string, subject: string, html: string,
  attachments: MailAttachment[] | undefined, opts: MailOptions | undefined, fromName: string,
  resendId?: string | null,
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    const replyTo = opts?.replyTo ?? opts?.fromEmail ?? null
    const department = opts?.department
      ?? departmentByEmail(opts?.replyTo)?.key
      ?? departmentByEmail(opts?.fromEmail)?.key
      ?? 'main'
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await admin.from('sent_emails').insert({
      from_name: fromName,
      to_email: to,
      subject,
      html,
      department,
      reply_to: replyTo,
      sent_by: opts?.sentBy ?? null,
      attachments: (attachments ?? []).map(a => ({ filename: a.filename, mimeType: a.mimeType })),
      ...(resendId ? { resend_id: resendId } : {}),
      ...(opts?.scheduledAt ? { scheduled_at: opts.scheduledAt } : {}),
    })
    if (error) console.error('[mail] sent_emails log error:', error.message)
  } catch (e) {
    console.error('[mail] sent_emails log threw:', e)
  }
}

// שליחת מייל דרך Resend. ברירת המחדל לשולח היא noreply@chasamsofer.info,
// אך מיילים מחלקתיים נשלחים מכתובת המחלקה (fromEmail). תומך בצרופות.
export async function deliverMail(
  to: string,
  subject: string,
  html: string,
  attachments?: MailAttachment[],
  options?: MailOptions,
): Promise<{ ok: boolean; error?: string; id?: string }> {
  // 🔴 מרענן את מטמון הטקסטים הערוכים.
  //
  // ⚠️ ההערה ב-emailTextsStore הבטיחה שהקריאה הזו מתבצעת כאן, אבל היא
  // מעולם לא נכתבה: הקובץ הזה לא ייבא את המודול כלל. בפועל הטקסטים
  // נטענו רק בעליית השרת, ועריכה במסך ההגדרות לא השפיעה על מיילים
  // שנשלחו מתהליך אחר — עד לפריסה הבאה.
  //
  // ⚠️ הרענון כאן מועיל למייל *הבא*, לא לזה שביד: ה-HTML כבר נבנה עם
  // הטקסטים שהיו במטמון. זה מקובל — הפער מצטמצם לשליחה אחת במקום
  // להימשך עד הפריסה, וזו הנקודה היחידה שכל המיילים עוברים דרכה.
  // ⚠️ לא חוסם ולא זורק: כשל טעינה מחזיר את ברירות המחדל שבקוד.
  void import('./emailTextsStore').then(m => m.ensureEmailTexts()).catch(() => {})

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.error('[mail] RESEND_API_KEY חסר — לא נשלח מייל')
    return { ok: false, error: 'RESEND_API_KEY missing' }
  }

  const fromName = options?.fromName ?? BRAND_NAME
  const fromEmail = options?.fromEmail ?? NOREPLY_FROM
  const from = `${fromName} <${fromEmail}>`

  // ── ניתוב Gmail (ההסבר המלא ליד GMAIL ROUTING למעלה) ──
  // ⚠️ הפעלה מפורשת בלבד: רק קוד אימות מסומן 'high'. כל השאר — כולל דואר
  // תפעולי אחר — ממשיך ב-Resend, כדי לא לחסל את המכסה היומית הקטנה.
  const gmailPriority = options?.gmailPriority ?? 'normal'

  // 🔴 העברה הדרגתית של קודי האימות ל-Resend.
  //
  // ⚠️ חל על 'high' בלבד (= קוד אימות): רק הוא נמצא בתהליך ההעברה, ורק
  // הוא מספיק קריטי כדי להצדיק שליטה באחוזים. שאר הדואר ממשיך כרגיל.
  //
  // ⚠️ ההכרעה לפני בדיקת Gmail ולא בתוכה: כשהמשתמש בקבוצת ההעברה, אנחנו
  // רוצים לדלג על מסלול Gmail *לגמרי* — לא לנסות ולנפול אליו.
  let forceResend = false
  if (gmailPriority === 'high') {
    try {
      const { otpViaResend } = await import('./resendRollout')
      forceResend = await otpViaResend(to)
      if (forceResend) console.log(`[mail] קוד אימות דרך Resend (rollout) → ${to}`)
    } catch { /* תקלה בהגדרה — נשארים ב-Gmail, הערוץ המוכח */ }
  }

  if (!forceResend && gmailPriority !== 'never' && !options?.unsubscribeUrl && !options?.scheduledAt
      && !attachments?.length && isGmailAddress(to)) {
    const cap = gmailPriority === 'high' ? GMAIL_CAP_HIGH : GMAIL_CAP_NORMAL
    const sentBy = await trySendViaGmail(
      to, subject, html, fromEmail, fromName, cap,
      // ⚠️ תשובות מופנות לתיבה המאוישת. חשבונות השליחה ייעודיים ואיש אינו
      // קורא בהם, ובלי הכותרת תשובה של נמען הייתה נעלמת.
      options?.replyTo || REPLY_TO_FALLBACK,
      // 🔴 כותרות השרשור נמסרות גם כאן. השמטתן הייתה השורש לכך שתשובות
      // בירור נפתחו כשרשור חדש אצל נמעני Gmail — כלומר אצל הרוב.
      { inReplyTo: options?.inReplyTo, references: options?.references },
    )
    if (sentBy) {
      console.log(`[mail] נשלח דרך Workspace · ${sentBy} → ${to}`)
      // ⚠️ אין resendId במסלול הזה, ולכן אירועי המסירה של Resend לא יגיעו
      // להודעה הזו. התיעוד ב"דואר יוצא" נשמר כדי שההודעה בכל זאת תופיע שם.
      if (!options?.skipLog) {
        await logSentEmail(to, subject, html, attachments, options, fromName, null)
      }
      return { ok: true }
    }
  }

  // גרסת טקסט רגיל (multipart) — משפרת מסירה ומקטינה סיכוי לספאם
  const text = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()

  // כותרת הסרה מרשימת תפוצה. לדיוור המוני (ניוזלטר) מעבירים קישור One-Click —
  // דרישה של Gmail משולחים מסיביים; בלעדיה המיילים מסומנים כספאם.
  // ⚠️ מייל תפעולי (קוד אימות) יוצא *בלי* כותרות הסרה: הן מסמנות דיוור המוני,
  // וקוד חד-פעמי אינו דיוור. אין ממה להסיר את הנמען, והסימון רק מוריד את סיכויי
  // ההגעה לתיבה הראשית של הודעה שהמשתמש ממתין לה ברגע זה.
  const unsubHeaders: Record<string, string> = options?.transactional
    ? {}
    : options?.unsubscribeUrl
      ? {
          'List-Unsubscribe': `<${options.unsubscribeUrl}>, <mailto:office@chasamsofer.info?subject=unsubscribe>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      : { 'List-Unsubscribe': '<mailto:office@chasamsofer.info?subject=unsubscribe>' }

  try {
    const resend = new Resend(apiKey)
    const { data, error } = await resend.emails.send({
      from,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
      ...(options?.replyTo ? { replyTo: options.replyTo } : {}),
      ...(options?.scheduledAt ? { scheduledAt: options.scheduledAt } : {}),
      // מעקב פתיחות/קליקים — מופעל רק כשמבקשים במפורש (דיוור).
      // מיילים תפעוליים נשארים ללא מעקב, כדי לא להוסיף פיקסל ולעטוף קישורים.
      // מעקב פתיחות/קליקים — מופעל כברירת מחדל על כל המיילים.
      //
      // ⚠️ ה-SDK של Resend (v6) לא חושף את השדה הזה בטיפוסים, אבל ה-API
      // מקבל אותו. בלעדיו Resend לא מזריק פיקסל ולא עוטף קישורים, ולכן
      // לא נשלחים אירועי email.opened / email.clicked ל-webhook.
      // (זו הייתה הסיבה ל"נפתחו 0".)
      ...({ tracking: (options?.tracking === false || options?.transactional)
        ? { open: false, click: false }
        : { open: true, click: true },
      } as Record<string, unknown>),
      // כותרות שמשפרות אמון ומסירה (פחות סיכוי לספאם בג'ימייל/אאוטלוק)
      headers: {
        ...unsubHeaders,
        'X-Entity-Ref-ID': `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        // שרשור מייל — In-Reply-To / References גורמים ללקוח המייל של הנמען
        // לשרשר את ההודעה תחת אותה שיחה, במקום ליצור שרשור חדש.
        ...(options?.inReplyTo ? { 'In-Reply-To': options.inReplyTo } : {}),
        ...(options?.references ? { References: options.references } : {}),
      },
      ...(attachments?.length
        ? { attachments: attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.contentB64, 'base64'),
            ...(a.mimeType ? { contentType: a.mimeType } : {}),
          })) }
        : {}),
    })
    if (error) {
      console.error('[mail] Resend error:', error)
      return { ok: false, error: String(error.message ?? error) }
    }

    // מזהה ההודעה ב-Resend — בלעדיו אי אפשר לקשר אירועי מסירה/פתיחה/קליק למייל.
    const resendId = data?.id ?? null

    // תיעוד אוטומטי בתיבת "דואר יוצא" — אלא אם הקורא מתעד בעצמו
    if (!options?.skipLog) {
      await logSentEmail(to, subject, html, attachments, options, fromName, resendId)
    }
    return { ok: true, id: resendId ?? undefined }
  } catch (err) {
    console.error('[mail] Resend threw:', err)
    return { ok: false, error: String(err) }
  }
}

// מיפוי סוג-תוכן → סיומת קובץ, להבטחת צרופה שנפתחת אצל הנמען
const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/bmp': 'bmp',
  'image/tiff': 'tiff', 'image/svg+xml': 'svg',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
}

// חילוץ סיומת מתוך נתיב URL (מתעלם מ-query string)
function extFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname
    const m = path.match(/\.([a-z0-9]{2,5})$/i)
    return m ? m[1].toLowerCase() : null
  } catch {
    const m = url.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)
    return m ? m[1].toLowerCase() : null
  }
}

// שליפת קובץ מ-URL והמרתו לצרופה (base64), עם timeout. מחזיר null אם נכשל.
// מבטיח שלשם הקובץ יש סיומת תקינה (לפי ה-URL או סוג-התוכן) כדי שייפתח אצל הנמען.
export async function urlToAttachment(url: string, filename: string): Promise<MailAttachment | null> {
  try {
    let buf: Buffer
    let mimeType: string
    const path = storagePath(url)
    // אבטחה (מניעת SSRF): מצרפים אך ורק קבצים מדלי 'documents' של Supabase.
    // כתובת חיצונית שרירותית (למשל endpoint פנימי/מטא-דאטה של הענן) נדחית — לא מבצעים
    // fetch לכתובת שסופקה ע"י המשתמש. מותר: URL של האחסון, או נתיב-אחסון יחסי (לא absolute).
    const isAbsolute = /^https?:\/\//i.test(url)
    const isStorageObject = path !== url // נמצא סמן אחסון ('/documents/' וכו')
    const key = isStorageObject ? path : url
    if ((isAbsolute && !isStorageObject) || !key || key.includes('..')) return null
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supaUrl || !supaKey) return null
    {
      // קובץ בדלי 'documents' — הורדה דרך service-role (עובד גם כשהדלי פרטי)
      const admin = createClient(supaUrl, supaKey, { auth: { autoRefreshToken: false, persistSession: false } })
      const { data: blob } = await admin.storage.from('documents').download(key)
      if (!blob) return null
      buf = Buffer.from(await blob.arrayBuffer())
      mimeType = blob.type || 'application/octet-stream'
    }

    // ודא סיומת: אם השם כבר מסתיים בסיומת — נשאיר; אחרת נגזור מה-URL או מ-mimeType
    let safeName = filename
    if (!/\.[a-z0-9]{2,5}$/i.test(safeName)) {
      const ext = extFromUrl(url) ?? MIME_EXT[mimeType.toLowerCase()] ?? null
      if (ext) safeName = `${safeName}.${ext}`
    }

    return { filename: safeName, mimeType, contentB64: buf.toString('base64') }
  } catch { return null }
}
