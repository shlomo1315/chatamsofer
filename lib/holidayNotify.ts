// ─────────────────────────────────────────────────────────────────────────────
// חלוקות חגים — הודעת האישור למשפחה.
//
// זה החוליה שסוגרת את התהליך: הצוות מאשר, והמשפחה צריכה לדעת (א) שאושרה,
// (ב) שאחרי קבלת הכרטיס במוקד חובה לשייך אותו, אחרת הוא אינו פעיל.
//
// ⚠️ שני ערוצים, כל אחד נכשל בנפרד: חלק גדול מהמשפחות אינן גולשות ואין להן
// מייל, ולכן צינתוק אינו "תוספת" אלא הערוץ העיקרי אצלן. נפילה של אחד אינה
// מבטלת את השני, וכל כשל נשמר בנפרד כדי שהצוות יראה למי לא הגיעה הודעה.
//
// ⚠️ notified_at נכתב רק כשמשהו אכן נשלח. סימון "נשלח" על כשל היה מסתיר משפחה
// שלא קיבלה הודעה, והיא הייתה מגיעה למוקד בלי לדעת שצריך לשייך.
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from '@/lib/apiAuth'
import { holidayApprovedEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { placeTtsCall } from '@/lib/yemotCall'

export interface NotifyOptions {
  email?: boolean
  phone?: boolean
  /** שליחה חוזרת גם למי שכבר קיבל הודעה */
  force?: boolean
}

export interface NotifyOutcome {
  id: string
  name: string
  emailSent?: boolean
  phoneCalled?: boolean
  skipped?: 'not_approved' | 'already_notified' | 'no_channel'
  error?: string
}

export interface NotifySummary {
  sent: number
  skipped: number
  failed: number
  results: NotifyOutcome[]
}

type Row = {
  id: string
  approval_status: string | null
  notified_at: string | null
  amount: number | null
  phone: string | null
  distribution: { name: string | null; year: string | null; amount_per_family: number | null } | null
  beneficiary: {
    family_name: string | null; full_name: string | null; spouse_name: string | null
    email: string | null; phone: string | null; phone2: string | null; spouse_phone: string | null
  } | null
}

const SELECT =
  'id, approval_status, notified_at, amount, phone, ' +
  'distribution:distributions(name, year, amount_per_family), ' +
  'beneficiary:beneficiaries(family_name, full_name, spouse_name, email, phone, phone2, spouse_phone)'

/** נוסח הצינתוק — קצר ובלי פסיקים (פסיק ב-ttsMode מפצל את הטקסט למשתני תבנית). */
export function approvalCallText(distributionName: string): string {
  return `שלום וברכה מהיכל החתם סופר בקשתכם לחלוקת ${distributionName} אושרה `
    + 'לאחר קבלת הכרטיס יש לשייך אותו בשלוחה הטלפונית בהקשה 2 כדי שיהיה פעיל '
    + 'ואני חוזר שנית הבקשה אושרה ויש לשייך את הכרטיס לאחר קבלתו'
}

/**
 * שליחת הודעת אישור לרשומות שנבחרו.
 *
 * ⚠️ רק משפחה שמצב האישור שלה 'approved' מקבלת הודעה — גם אם המנהל סימן שורה
 * אחרת בטעות. הודעת "אושרתם" למי שלא אושר היא נזק שאין ממנו חזרה.
 */
export async function notifyHolidayApproved(
  ids: string[],
  opts: NotifyOptions = {},
): Promise<NotifySummary> {
  const { email = true, phone = true, force = false } = opts
  const out: NotifySummary = { sent: 0, skipped: 0, failed: 0, results: [] }
  const db = getServiceClient()
  if (!db || !ids.length) return out

  const { data } = await db.from('distribution_recipients').select(SELECT).in('id', ids)
  const rows = (data ?? []) as unknown as Row[]

  const phoneExt = (process.env.YEMOT_HOLIDAY_EXT || '').trim() || null

  for (const r of rows) {
    const b = r.beneficiary
    const name = [b?.family_name, b?.spouse_name || b?.full_name].filter(Boolean).join(' ') || 'משפחה'
    const res: NotifyOutcome = { id: r.id, name }

    if (r.approval_status !== 'approved') {
      res.skipped = 'not_approved'; out.skipped++; out.results.push(res); continue
    }
    if (r.notified_at && !force) {
      res.skipped = 'already_notified'; out.skipped++; out.results.push(res); continue
    }

    const distName = [r.distribution?.name, r.distribution?.year].filter(Boolean).join(' ') || 'החגים'
    const amount = r.amount ?? r.distribution?.amount_per_family ?? null
    const errors: string[] = []

    if (email && b?.email) {
      try {
        const built = holidayApprovedEmail({
          familyName: b.family_name, spouseName: b.spouse_name || b.full_name,
          distributionName: distName, amount, phoneExtension: phoneExt,
        })
        await deliverMail(b.email, built.subject, built.html, undefined, mailFor('igud'))
        res.emailSent = true
      } catch (e) {
        errors.push(`מייל: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    if (phone) {
      // ⚠️ מנסים את המספרים לפי סדר, ומסתפקים בשיחה *אחת* שיצאה: צינתוק לכל
      // מספר של אותה משפחה נשמע כמו תקלה ומעודד התעלמות מהשיחה הבאה.
      const candidates = [r.phone, b?.phone, b?.spouse_phone, b?.phone2]
        .map(p => String(p ?? '').replace(/\D/g, '')).filter(p => p.length >= 9)
      const tried = new Set<string>()
      let lastErr = ''
      for (const p of candidates) {
        if (tried.has(p)) continue
        tried.add(p)
        const c = await placeTtsCall(p, approvalCallText(distName))
        if (c.ok) { res.phoneCalled = true; break }
        if (c.notConfigured) { lastErr = 'ימות אינו מוגדר'; break }
        lastErr = c.error ?? 'החיוג נכשל'
      }
      if (!res.phoneCalled) {
        if (!candidates.length) errors.push('צינתוק: אין מספר טלפון')
        else errors.push(`צינתוק: ${lastErr || 'נכשל'}`)
      }
    }

    const anySent = !!res.emailSent || !!res.phoneCalled
    if (!anySent) {
      res.error = errors.join(' · ') || 'לא נשלח דבר'
      out.failed++
      await db.from('distribution_recipients')
        .update({ notify_error: res.error }).eq('id', r.id)
    } else {
      out.sent++
      // notify_error נשמר גם בהצלחה חלקית (למשל מייל עבר וצינתוק נכשל) — הצוות
      // צריך לדעת שערוץ אחד לא הגיע, בלי שזה ייחשב כשל מלא.
      await db.from('distribution_recipients').update({
        notified_at: new Date().toISOString(),
        notify_error: errors.length ? errors.join(' · ') : null,
      }).eq('id', r.id)
      if (errors.length) res.error = errors.join(' · ')
    }
    out.results.push(res)
  }

  return out
}
