import { createClient } from '@supabase/supabase-js'
import { getNedarimCreds, prikatTlush, removeMagneticByNumber, getClientCard } from '@/lib/nedarim'
import { unloadDueDate } from './unloadDueDate'

// ─────────────────────────────────────────────────────────────────────────────
// פריקת טעינה של תיק בודד — משותפת לפריקה האוטומטית (6 שבועות) ולביטול טעינה
// בעקבות שינוי סטטוס (אישור שבוטל / הוחזר לממתין).
//
// ⚠️ עד כה טעינה שבוצעה נשארה בתוקף לנצח: ברגע שהתיק נטען, שינוי הסטטוס
// ל"לא מאושר" לא נגע בכסף — היולדת נשארה עם 600 ₪ בכרטיס למרות שהבקשה נדחתה.
// ─────────────────────────────────────────────────────────────────────────────
export interface UnloadableAid {
  id: string
  card_tlush_id?: string | null
  card_number?: string | null
  card_balance?: number | string | null
  six_weeks_end?: string | null
  beneficiary?: { nedarim_id?: string | null } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = any

export async function unloadAidCard(
  admin: AdminDb,
  creds: NonNullable<Awaited<ReturnType<typeof getNedarimCreds>>>,
  aid: UnloadableAid,
  reason: string,
  // ⚠️ החזרת הכרטיס למלאי תלויה ב*סיבת* הפריקה, ולכן היא פרמטר ולא התנהגות
  // קבועה: פריקה בתום שישה שבועות מסיימת כרטיס שנוצל בפועל — החזרתו למלאי
  // הייתה מנפחת אותו. פריקה בעקבות ביטול אישור משחררת כרטיס שלא היה צריך
  // לצאת, והוא חייב לחזור.
  opts: { returnToStock?: boolean } = {},
): Promise<{ ok: boolean; message?: string }> {
  // 🔴 היתרה נשלפת מנדרים *לפני* הפריקה, ולא מ-card_balance שבמסד.
  //
  // ⚠️ card_balance נכתב פעם אחת בטעינה ואינו מתעדכן מקניות: משפחה
  // שקנתה ב-599.79 ונשארו לה 0.21 עדיין רשומה אצלנו כ-600. שמירת הערך
  // הזה כ"סכום שחזר" רשמה 600 לכל אחת מ-13 הפריקות — מספר שנראה מדויק
  // והיה שגוי לחלוטין. נדרים היא מקור האמת ליתרה.
  //
  // ⚠️ נשלף לפני הפריקה: אחריה היתרה 0 בהגדרה.
  let balanceBefore: number | null = null
  const nedId = aid.beneficiary?.nedarim_id ?? null
  if (nedId) {
    try {
      const card = await getClientCard(creds, String(nedId))
      balanceBefore = card?.totalFreeAmount ?? null
    } catch { /* כשל בשליפה — נשמר null ("לא נשמר"), לא ניחוש */ }
  }

  const r = await prikatTlush(creds, String(aid.card_tlush_id))

  // 🔴 "אין יתרה לפריקה" אינו כשל — הכסף כבר נוצל.
  //
  // ⚠️ קודם זה נחשב שגיאה, והתיק נשאר loaded עם ₪600 רשומים לנצח: הוא
  // הופיע כל יום כ"ממתין לפריקה", ניסה שוב, ונכשל שוב. שתי משפחות
  // נתקעו כך. המשמעות היא סיום תקין — הכרטיס מוצה.
  const alreadySpent = !r.ok && /אין יתרה/.test(r.message ?? '')

  if (!r.ok && !alreadySpent) {
    await admin.from('maternity_aids').update({ card_load_error: r.message }).eq('id', aid.id)
    return { ok: false, message: r.message }
  }

  // מחיקת הכרטיס המגנטי מהמשפחה בנדרים — כדי שבלידה הבאה יקבלו כרטיס חדש
  const nedarimId = aid.beneficiary?.nedarim_id ?? null
  const cardNumber = String(aid.card_number ?? '').trim()
  let cardRemoved = false
  let cardRemoveError: string | null = null
  if (nedarimId && cardNumber) {
    try {
      const rm = await removeMagneticByNumber(creds, String(nedarimId), cardNumber)
      cardRemoved = rm.ok
      if (!rm.ok) cardRemoveError = rm.message
    } catch (e) { cardRemoveError = e instanceof Error ? e.message : String(e) }
  } else {
    cardRemoved = true // אין כרטיס לנתק
  }

  await admin.from('maternity_aids').update({
    card_load_status: 'unloaded',
    card_unloaded_at: new Date().toISOString(),
    // ⚠️ כרטיס שנוצל במלואו — 0 חזר, וזה נתון ולא חוסר מידע.
    // ⚠️ 0 כשהכרטיס נוצל במלואו — זה נתון ולא חוסר מידע.
    card_unloaded_amount: alreadySpent ? 0 : balanceBefore,
    card_balance: 0,
    // ניקוי הכרטיס והאיסוף בתיק רק אם נותק בנדרים בהצלחה — כדי שבלידה הבאה אפשר יהיה לחבר מחדש
    card_number: cardRemoved ? null : aid.card_number,
    card_picked_up_at: cardRemoved ? null : undefined,
    card_load_error: alreadySpent ? 'הכרטיס נוצל במלואו — נסגר ללא פריקה' : cardRemoveError,
  }).eq('id', aid.id)

  let stockReturned = false
  if (opts.returnToStock) {
    try {
      const { addStockMovement } = await import('@/lib/cardStock')
      await addStockMovement(admin, {
        delta: 1, reason: 'adjust', aidId: aid.id,
        note: `החזרה אוטומטית — הטעינה בוטלה (${reason})`,
      })
      stockReturned = true
      // הכרטיס חזר למלאי → מיד לשחרר יולדת שממתינה בתור
      const { processAwaitingStock } = await import('@/lib/maternityCards')
      await processAwaitingStock(admin)
    } catch (e) {
      console.error('[unloadAidCard] החזרת הכרטיס למלאי נכשלה:', e instanceof Error ? e.message : e)
    }
  }

  await admin.from('activity_log').insert({
    action: 'maternity_card_unloaded',
    entity_type: 'maternity_aid',
    entity_id: aid.id,
    details: {
      tlushId: aid.card_tlush_id, reason,
      // ⚠️ מתועד: הכרטיס נסגר כי הכסף נוצל, לא כי נפרק בפועל.
      ...(alreadySpent ? { already_spent: true } : {}),
      card_removed: cardRemoved, card_remove_error: cardRemoveError, card_number_last4: cardNumber.slice(-4),
      stock_returned: stockReturned,
    },
  })
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// פריקת טעינות של לידות שאינן מאושרות — רשת ביטחון.
//
// ⚠️ הכלל הוא שביטול אישור מבטל את הטעינה, אבל סטטוס לידה משתנה ביותר ממסלול
// אחד (מסך היולדות, החזרת תיקונים, עדכון מהפורטל). מסלול שפוספס פירושו משפחה
// שאינה מאושרת ומחזיקה 600 ₪ — וכרטיס שחסר במלאי בלי הסבר. הסריקה הזו סוגרת
// את הפער מכל כיוון: אם נשארה טעינה חיה לתיק שאינו 'active', היא נפרקת,
// הכרטיס חוזר למלאי, והמשפחה מקבלת את מייל התיקון.
// ─────────────────────────────────────────────────────────────────────────────
export async function runUnloadUnapproved(
  opts: { notify?: boolean } = {},
): Promise<{ ok: boolean; processed: number; mailed: number; error?: string }> {
  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, processed: 0, mailed: 0, error: 'חיבור נדרים פלוס לא מוגדר' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, processed: 0, mailed: 0, error: 'Supabase לא מוגדר' }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: aids, error } = await admin
    .from('maternity_aids')
    .select('id, status, card_tlush_id, card_number, card_balance, beneficiary:beneficiaries(nedarim_id, email, full_name, family_name, spouse_name)')
    .eq('card_load_status', 'loaded')
    .not('card_tlush_id', 'is', null)
    .neq('status', 'active')
  if (error) return { ok: false, processed: 0, mailed: 0, error: error.message }

  let processed = 0
  let mailed = 0
  for (const aid of aids ?? []) {
    try {
      const statusHe = aid.status === 'cancelled' ? 'הבקשה אינה מאושרת'
        : aid.status === 'pending' ? 'הבקשה חזרה להמתנה לאישור'
        : 'הבקשה אינה מאושרת'
      const r = await unloadAidCard(admin, creds, aid as unknown as UnloadableAid,
        `ביטול טעינה — ${statusHe}`, { returnToStock: true })
      if (!r.ok) continue
      processed++

      if (opts.notify !== false) {
        const ben = aid.beneficiary as { email?: string | null; full_name?: string | null; family_name?: string | null; spouse_name?: string | null } | null
        if (ben?.email) {
          const { birthApprovalRetractedEmail } = await import('@/lib/emailTemplates')
          const { deliverMail } = await import('@/lib/sendMail')
          const { mailFor } = await import('@/lib/departments')
          const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || String(ben.full_name ?? '')
          const payload = birthApprovalRetractedEmail(motherName, { rejected: aid.status === 'cancelled' })
          const res = await deliverMail(ben.email, payload.subject, payload.html, undefined, mailFor('maternity'))
          if (res.ok) mailed++
        }
      }
    } catch (e) {
      console.error('[unload-unapproved] failed for', aid.id, e)
    }
  }

  return { ok: true, processed, mailed }
}

// פריקה אוטומטית של כרטיסים שעברו 6 שבועות מהלידה.
// משמש גם את נקודת-הקצה /api/nedarim/unload-expired וגם את המתזמן הפנימי (instrumentation).
export async function runUnloadExpired(): Promise<{ ok: boolean; processed: number; error?: string }> {
  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, processed: 0, error: 'חיבור נדרים פלוס לא מוגדר' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, processed: 0, error: 'Supabase לא מוגדר' }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const todayStr = new Date().toISOString().slice(0, 10) // yyyy-mm-dd

  // 🔴 השאילתה *אינה* מסננת לפי six_weeks_end במסד.
  //
  // עד כה היא עשתה `.lte('six_weeks_end', today)`, ו-194 מתוך 208
  // הכרטיסים הטעונים היו עם six_weeks_end = NULL. השוואה ל-NULL אינה
  // מחזירה שורות לעולם — ולכן הפריקה רצה כל לילה, מצאה 0 תיקים, דיווחה
  // הצלחה, וכלום לא נפרק. 12 יולדות עברו שישה שבועות עם ₪7,200 תקועים
  // בכרטיסים, ואף אחד לא ידע.
  //
  // ⚠️ הסינון עבר לצד הקוד עם נפילה-לאחור ל-birth_date: תאריך הלידה
  // קיים תמיד, ו-six_weeks_end הוא רק שדה נגזר שלעתים לא מולא.
  const { data: aids, error } = await admin
    .from('maternity_aids')
    .select('id, card_tlush_id, six_weeks_end, birth_date, card_number, card_balance, beneficiary:beneficiaries(nedarim_id)')
    .eq('card_load_status', 'loaded')
    .not('card_tlush_id', 'is', null)
  if (error) return { ok: false, processed: 0, error: error.message }

  let processed = 0
  let skippedNoDate = 0
  for (const aid of aids ?? []) {
    // ⚠️ דרך unloadDueDate המשותף ולא חישוב מקומי — כך המסך והפריקה
    // מסכימים על אותו מועד. חישוב כפול הוא בדיוק מה שיצר את הבאג.
    const due = unloadDueDate(aid as { six_weeks_end?: string | null; birth_date?: string | null })
    if (!due) { skippedNoDate++; continue }
    if (due > todayStr) continue   // טרם הגיע המועד

    try {
      const derived = !(aid.six_weeks_end ?? '').trim()
      const r = await unloadAidCard(admin, creds, aid as UnloadableAid,
        `פריקה אוטומטית בתום 6 שבועות (${due}${derived ? ' — נגזר מתאריך הלידה' : ''})`)
      if (r.ok) processed++
    } catch (e) {
      console.error('[unload-expired] failed for', aid.id, e)
    }
  }

  // ⚠️ מדווח על תיקים שאין מהם לגזור מועד — אחרת הם נשארים טעונים
  // לנצח בלי שאיש יידע.
  if (skippedNoDate > 0) {
    console.warn(`[unload-expired] ${skippedNoDate} תיקים ללא תאריך לידה ו-six_weeks_end — לא נפרקו`)
  }

  return { ok: true, processed }
}
