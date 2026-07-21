import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { maternityCardEmail } from '@/lib/emailTemplates'
import { getNedarimCreds, findClientByZeout, saveClientCard, addTlush, getClientCard, getMaternityLimitedId } from '@/lib/nedarim'
import { logActivity } from '@/lib/activityLog'
import { consumeOneCard, getStockBalance } from '@/lib/cardStock'
import { maybeSendLowStockAlert } from '@/lib/cardStockAlert'

// סכום הטעינה הקבוע ליולדת בעת אישור הלידה
export const MATERNITY_LOAD_AMOUNT = 600

// בעת אישור לידה: לנכות כרטיס מהמלאי הגלובלי (אטומי), ואם יש מלאי — לוודא שהמשפחה קיימת
// בנדרים (לפי ת.ז, אחרת להקים אותה) ולהטעין 600 ₪ לארנק. אם אין מלאי → היולדת נכנסת לתור
// "ממתין למלאי", לא נטען כלום ולא נשלח שובר כרטיס (רק שובר בית החלמה נשלח בנפרד).
// שיוך הכרטיס הפיזי/מוקד נעשה בהמשך ידנית. best-effort — לא חוסם את אישור הלידה.
export async function loadMaternityCardOnApproval(
  admin: SupabaseClient, aidId: string, amount = MATERNITY_LOAD_AMOUNT,
): Promise<{ ok: boolean; notConfigured?: boolean; already?: boolean; awaitingStock?: boolean; error?: string; clientId?: string | null }> {
  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, beneficiary_id, card_balance, card_load_status, card_tlush_id')
    .eq('id', aidId).maybeSingle()
  if (!aid) return { ok: false, error: 'התיק לא נמצא' }
  if (aid.card_load_status === 'loaded' || aid.card_tlush_id) return { ok: true, already: true } // כבר נטען

  // ⚠️ המלאי נבדק לפני הכל — לפני נדרים ולפני כל פנייה חיצונית.
  // אין מלאי → היולדת נכנסת לתור ההמתנה ולא נוגעים בנדרים בכלל.
  // ה-600 ₪ ייטענו רק כשיתחדש המלאי, דרך processAwaitingStock.
  let remaining: number | null
  try {
    remaining = await consumeOneCard(admin, { reason: 'birth_approval', aidId: aid.id })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'שגיאת מלאי' }
  }
  if (remaining === null) {
    // אין מלאי כרטיסים — לתור "ממתין למלאי", ללא טעינה בנדרים.
    await admin.from('maternity_aids').update({ card_status: 'awaiting_stock', updated_at: new Date().toISOString() }).eq('id', aid.id)
    await logActivity(admin, { action: 'maternity_card_awaiting_stock', entityType: 'maternity_aid', entityId: aid.id, details: { reason: 'no_stock_on_approval' } })
    return { ok: true, awaitingStock: true }
  }

  // רק עכשיו — יש כרטיס פנוי — ניגשים לנדרים.
  // אם נדרים אינו מוגדר, מחזירים את הכרטיס שנוכה כדי שלא ייבלע.
  const creds = await getNedarimCreds()
  if (!creds) {
    try {
      await admin.from('card_stock_ledger').insert({
        delta: 1, reason: 'adjust', aid_id: aid.id,
        note: 'החזרה אוטומטית — נדרים אינו מוגדר',
      })
    } catch { /* החזרה best-effort */ }
    return { ok: false, notConfigured: true }
  }

  // ירדנו למלאי נמוך? נשלח התראה (best-effort, לא חוסם)
  await maybeSendLowStockAlert(admin, remaining)

  const { data: b } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, id_number, address, city, phone, phone2, email, nedarim_id')
    .eq('id', aid.beneficiary_id).maybeSingle()
  if (!b) return { ok: false, error: 'המשפחה לא נמצאה' }

  // אם הטעינה בנדרים תיכשל אחרי שכבר ניכינו כרטיס — מחזירים אותו למלאי (delta +1),
  // כדי שכרטיס לא "יבלע" בלי שהיולדת קיבלה בפועל.
  const restoreCard = async () => {
    try { await admin.from('card_stock_ledger').insert({ delta: 1, reason: 'adjust', aid_id: aid.id, note: 'החזרה אוטומטית — טעינת נדרים נכשלה' }) }
    catch { /* החזרה best-effort */ }
  }

  // 1) איתור/הקמת המשפחה בנדרים לפי ת.ז
  let clientId = b.nedarim_id ? String(b.nedarim_id) : null
  try {
    if (!clientId && b.id_number) clientId = await findClientByZeout(creds, String(b.id_number))
    if (!clientId) clientId = await saveClientCard(creds, b)
    if (clientId && clientId !== b.nedarim_id) await admin.from('beneficiaries').update({ nedarim_id: clientId }).eq('id', b.id)
  } catch (e) { await restoreCard(); return { ok: false, error: e instanceof Error ? e.message : 'שגיאת נדרים' } }
  if (!clientId) { await restoreCard(); return { ok: false, error: 'לא ניתן לאתר או להקים את המשפחה בנדרים' } }

  // 2) הטענת הזכאות — משויכת לקבוצת "הגבלת חנויות" של עזר יולדות (LimitedId)
  const limitedId = await getMaternityLimitedId()
  let result: Awaited<ReturnType<typeof addTlush>>
  try {
    result = await addTlush(creds, clientId, amount, undefined, 'הטענת זכאות יולדת (אישור לידה) — היכל החתם סופר', limitedId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await restoreCard()
    await admin.from('maternity_aids').update({ card_load_status: 'failed', card_load_error: msg }).eq('id', aid.id)
    await logActivity(admin, { action: 'maternity_card_load_failed', entityType: 'maternity_aid', entityId: aid.id, details: { amount, clientId, error: msg } })
    return { ok: false, error: msg, clientId }
  }
  if (!result.ok) {
    await restoreCard()
    await admin.from('maternity_aids').update({ card_load_status: 'failed', card_load_error: result.message }).eq('id', aid.id)
    await logActivity(admin, { action: 'maternity_card_load_failed', entityType: 'maternity_aid', entityId: aid.id, details: { amount, clientId, error: result.message } })
    return { ok: false, error: result.message, clientId }
  }

  // 3) רענון יתרה ועדכון התיק
  let newBalance = (Number(aid.card_balance) || 0) + amount
  try { const card = await getClientCard(creds, clientId); if (card?.totalFreeAmount != null) newBalance = card.totalFreeAmount } catch { /* אומדן */ }
  await admin.from('maternity_aids').update({
    card_status: 'loaded',
    card_load_status: 'loaded',
    card_tlush_id: result.tlushId,
    card_load_amount: amount,
    card_loaded_at: new Date().toISOString(),
    card_balance: newBalance,
    card_load_error: null,
  }).eq('id', aid.id)

  await logActivity(admin, { action: 'maternity_card_loaded', entityType: 'maternity_aid', entityId: aid.id, details: { amount, clientId, tlushId: result.tlushId, trigger: 'auto_on_approval' } })
  return { ok: true, clientId }
}

// שולח ליולדת מייל "כרטיס מזון אושר" + שובר הכרטיס (PDF) מצורף (best-effort).
// נקרא כשמלאי מתחדש ויולדת מתור ההמתנה מקבלת את כרטיסה.
// מחזיר האם השובר אכן נשלח. ⚠️ קודם החזירה void ובלעה כל כשל — כך יולדת
// יכלה לקבל כרטיס בלי לדעת עליו, ואיש לא ידע שהמייל לא יצא.
export async function sendCardVoucher(
  admin: SupabaseClient, aidId: string, centerName?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { data: aid } = await admin
      .from('maternity_aids')
      .select('birth_date, recovery_home, recovery_eligibility_days, is_twins, beneficiary:beneficiaries(full_name, family_name, spouse_name, id_number, spouse_id_number, address, city, email, phone, spouse_phone)')
      .eq('id', aidId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = aid as any
    const ben = a?.beneficiary
    if (!ben?.email) return { ok: false, error: 'אין כתובת מייל ליולדת — השובר לא נשלח' }

    // בניית שובר הכרטיס (PDF) לצירוף — best-effort; אם נכשל, נשלח את המייל בלבד
    let attachments: import('@/lib/sendMail').MailAttachment[] | undefined
    try {
      const { buildCardVoucherOnly } = await import('@/lib/maternityVoucher')
      const { recoveryDaysOf } = await import('@/lib/maternity')
      const motherName = [ben.family_name, ben.spouse_name || ben.full_name].filter(Boolean).join(' ') || (ben.full_name ?? '')
      attachments = await buildCardVoucherOnly({
        motherName,
        motherId: ben.spouse_id_number || ben.id_number,
        address: ben.address, city: ben.city, phone: ben.phone, spousePhone: ben.spouse_phone,
        birthDate: a.birth_date, recoveryHome: a.recovery_home,
        recoveryDays: recoveryDaysOf({ recovery_eligibility_days: a.recovery_eligibility_days, is_twins: a.is_twins }),
      })
    } catch (e) { console.error('[maternityCards] card voucher build failed:', e) }

    const mail = maternityCardEmail(ben, { centerName, phones: [ben.phone, ben.spouse_phone] })
    const sent = await deliverMail(ben.email, mail.subject, mail.html, attachments, mailFor('maternity'))
    if (sent && sent.ok === false) {
      console.error('[maternityCards] voucher mail failed:', sent.error)
      return { ok: false, error: sent.error || 'שליחת השובר נכשלה' }
    }
    return { ok: true }
  } catch (e) {
    console.error('[maternityCards] voucher mail failed:', e)
    return { ok: false, error: e instanceof Error ? e.message : 'שליחת השובר נכשלה' }
  }
}

// מעבד את תור "ממתין למלאי" מול המלאי הגלובלי: יולדות ותיקות קודם (FIFO). לכל אחת —
// מטעין בפועל בנדרים (loadMaternityCardOnApproval מנכה כרטיס אטומית) ושולח שובר. נעצר
// ברגע שהמלאי אוזל. מחזיר כמה טופלו. נקרא אחרי הוספת מלאי חדש.
export interface AwaitingStockResult {
  processed: number
  /** נכשלו למרות שהיה מלאי — היולדת נשארה בתור ולא קיבלה שובר. */
  failed: number
  /** נדרים אינו מוגדר — אף יולדת לא תטופל עד שיוגדר. */
  notConfigured: boolean
  errors: string[]
}

export async function processAwaitingStock(admin: SupabaseClient): Promise<AwaitingStockResult> {
  const out: AwaitingStockResult = { processed: 0, failed: 0, notConfigured: false, errors: [] }

  let balance = await getStockBalance(admin)
  if (balance <= 0) return out
  // ⚠️ שתי עמודות מסמנות המתנה — card_status (תור גלובלי) ו-card_voucher_status
  // (תור השובר). סינון לפי אחת בלבד השאיר יולדות אמיתיות מחוץ לתור.
  // ⚠️ לא מסתפקים בסימון awaiting_stock: יולדות שאושרו אך נתקעו בסטטוס אחר
  // (pending/approved) מעולם לא נכנסו לתור, ולכן לא קיבלו כרטיס ולא שובר
  // גם אחרי חידוש מלאי. נסרקות כאן כל הלידות המאושרות שטרם נטענו בפועל.
  const { data: candidates } = await admin
    .from('maternity_aids')
    .select('id, card_status, card_voucher_status, card_load_status, card_tlush_id')
    .eq('status', 'active')
    .order('updated_at', { ascending: true }) // ותיקות קודם (FIFO)

  const waiting = (candidates ?? []).filter(a =>
    // טרם נטען בפועל
    a.card_load_status !== 'loaded' && !a.card_tlush_id &&
    // ולא נדחה/בוטל ידנית
    a.card_status !== 'rejected',
  )
  if (!waiting.length) return out

  for (const w of waiting) {
    if (balance <= 0) break
    // loadMaternityCardOnApproval מנכה כרטיס אטומית ומטעין בנדרים. אם אין מלאי → awaitingStock=true.
    const r = await loadMaternityCardOnApproval(admin, w.id)
    if (r.awaitingStock) break        // המלאי אזל בדיוק כעת — עוצרים

    // ⚠️ נדרים לא מוגדר → אף יולדת לא תיטען. קודם הלולאה המשיכה בשקט:
    // המלאי נשאר תקוע, היולדות לא קיבלו שובר, ואיש לא ידע. עוצרים ומדווחים.
    if (r.notConfigured) {
      out.notConfigured = true
      out.errors.push('נדרים אינו מוגדר — לא ניתן להטעין כרטיסים')
      break
    }

    if (!r.ok) {
      // כשל ליולדת ספציפית — הכרטיס הוחזר למלאי. ממשיכים לבאה, אך סופרים ומדווחים.
      out.failed++
      if (r.error) out.errors.push(r.error)
      continue
    }

    // ⚠️ already = הכרטיס כבר נטען בעבר (card_load_status='loaded'), ולכן לא
    // נוכה כרטיס עכשיו. בלי הטיפול הזה היולדת נשארה תקועה בתור לנצח:
    // הלולאה ספרה "הצלחה", הסטטוס לא נוקה, והשובר לא נשלח. מנקים ושולחים.
    if (r.already) {
      await admin.from('maternity_aids').update({
        card_status: 'loaded',
        card_voucher_status: 'issued',
        updated_at: new Date().toISOString(),
      }).eq('id', w.id)
      const v = await sendCardVoucher(admin, w.id, null)
      if (!v.ok) { out.failed++; out.errors.push(v.error || 'שליחת השובר נכשלה') }
      else out.processed++
      continue
    }

    // הטעינה הצליחה → הכרטיס נוכה, שולחים שובר
    const voucher = await sendCardVoucher(admin, w.id, null)
    // ⚠️ הכרטיס כבר נוכה והוטען. אם השובר לא נשלח — היולדת לא יודעת שיש לה
    // כרטיס. נספר ככשל כדי שהמסך יציג זאת, ולא ידווח על הצלחה שקרית.
    if (!voucher.ok) {
      out.failed++
      out.errors.push(voucher.error || 'שליחת השובר נכשלה')
    } else {
      // ניקוי תור השובר — loadMaternityCardOnApproval מעדכן card_status בלבד,
      // ובלי זה היולדת הייתה חוזרת לתור בכל הוספת מלאי.
      await admin.from('maternity_aids')
        .update({ card_voucher_status: 'issued', updated_at: new Date().toISOString() })
        .eq('id', w.id)
      out.processed++
    }
    balance = await getStockBalance(admin)
  }
  return out
}

