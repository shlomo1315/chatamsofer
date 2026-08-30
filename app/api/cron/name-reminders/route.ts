import { NextResponse, type NextRequest } from 'next/server'
import { getServiceClient, verifyCronSecret } from '@/lib/apiAuth'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { isBlockedForMail } from '@/lib/jewishCalendar'
import { ensureEmailTexts } from '@/lib/emailTextsStore'
import { babiesOf, type AidNameFields } from '@/lib/babyNames'
import { buildNameFixMail } from '@/lib/nameFixMail'
import { selectNameReminderTargets, MAX_NAME_REMINDERS, type ReminderRow } from '@/lib/nameFixReminder'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ─────────────────────────────────────────────────────────────────────────────
// תזכורת שבועית להשלמת שם התינוק — רצה בימי ראשון.
//
// הרצה: GET עם ?token=<CRON_SECRET> או Authorization: Bearer.
// ב-Railway: Cron Service בביטוי `0 9 * * 0` עם TZ=Asia/Jerusalem.
//
// 🔴 רק תיקים שהיולדת סימנה בהם "עדיין אין שם" ושחסר בהם שם בפועל.
// כללי הבחירה כולם ב-lib/nameFixReminder (מודול טהור ובדוק).
//
// 🔴 לא נשלח בשבתות ובחגים — isBlockedForMail היא אותה פונקציה שכל מיילי
// המערכת עוברים דרכה. יום ראשון אינו חסום בדרך כלל, אבל הוא כן יכול ליפול
// בחג (סוכות, פסח, שבועות) — ואז המשלוח מדלג לשבוע הבא במקום לצאת בחג.
//
// ⚠️ כל מייל נשלח ומתועד בנפרד: כשל אצל משפחה אחת לא מפיל את הריצה ולא
// מונע מהשאר לקבל. המונה מתקדם רק אחרי שליחה מוצלחת, אחרת כשל רשת היה
// "שורף" תזכורת שמעולם לא הגיעה.
// ─────────────────────────────────────────────────────────────────────────────

type BenJoin = { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null }

export async function GET(request: NextRequest) {
  // נכשל-סגור: בלי CRON_SECRET תואם — חסום.
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  if (isBlockedForMail(now)) {
    console.log('[name-reminders] דילוג — שבת/חג')
    return NextResponse.json({ ok: true, skipped: 'shabbat_or_holiday' })
  }

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })

  await ensureEmailTexts()

  // 🔴 מסננים ב-SQL על הדגל: התיקים הממתינים הם מיעוט קטן, ואין טעם למשוך
  // את כל הטבלה כדי לסנן בזיכרון.
  const { data, error } = await db
    .from('maternity_aids')
    .select('id, baby_name, baby_name_pending, babies, name_reminder_sent_at, name_reminder_count, ' +
      'beneficiary:beneficiaries(email, full_name, family_name, spouse_name)')
    .eq('baby_name_pending', true)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as unknown as (ReminderRow & { beneficiary?: BenJoin | BenJoin[] | null })[]

  // ⚠️ Supabase מחזיר יחס כמערך או כאובייקט, תלוי בשאילתה — ראו lib/babyNames.
  const one = (rel: BenJoin | BenJoin[] | null | undefined): BenJoin | null =>
    (Array.isArray(rel) ? rel[0] : rel) ?? null

  const withEmail = rows.map(r => ({ ...r, email: one(r.beneficiary)?.email ?? null }))
  const targets = selectNameReminderTargets(withEmail, now)

  let sent = 0
  const failures: { id: string; error: string }[] = []

  for (const t of targets) {
    const ben = one((t as { beneficiary?: BenJoin | BenJoin[] | null }).beneficiary)
    const motherName =
      [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || (ben?.full_name ?? '')
    const count = (t.name_reminder_count ?? 0) + 1

    const { subject, html } = buildNameFixMail({
      aidId: t.id,
      motherName,
      reminderNumber: count,
      babyCount: babiesOf(t as AidNameFields).length,
    })

    try {
      await deliverMail(t.email!, subject, html, [], mailFor('maternity'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`[name-reminders] שליחה נכשלה לתיק ${t.id}:`, msg)
      failures.push({ id: t.id, error: msg })
      continue
    }

    // ⚠️ המונה מתקדם רק אחרי שליחה מוצלחת — אחרת כשל רשת היה סופר תזכורת
    // שמעולם לא הגיעה, והמשפחה הייתה מגיעה לתקרה בלי לקבל דבר.
    const { error: upErr } = await db
      .from('maternity_aids')
      .update({ name_reminder_sent_at: now.toISOString(), name_reminder_count: count })
      .eq('id', t.id)
    if (upErr) {
      // 🔴 המייל *כן* יצא. אם המונה לא נשמר, הריצה הבאה תשלח שוב לאותה
      // משפחה — ולכן זה נרשם כתקלה גלויה ולא נבלע.
      console.error(`[name-reminders] המייל נשלח לתיק ${t.id} אך המונה לא עודכן:`, upErr.message)
      failures.push({ id: t.id, error: `נשלח אך המונה לא עודכן: ${upErr.message}` })
    }
    sent++
  }

  console.log(`[name-reminders] נבדקו ${rows.length}, נשלחו ${sent}, כשלים ${failures.length}`)
  return NextResponse.json({
    ok: true,
    checked: rows.length,
    eligible: targets.length,
    sent,
    failures,
    maxReminders: MAX_NAME_REMINDERS,
  })
}
