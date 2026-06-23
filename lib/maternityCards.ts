import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { maternityCardEmail } from '@/lib/emailTemplates'
import { getNedarimCreds, findClientByZeout, saveClientCard, addTlush, getClientCard, setMagneticCard, type NedarimCreds } from '@/lib/nedarim'

// סכום הטעינה הקבוע ליולדת בעת אישור הלידה
export const MATERNITY_LOAD_AMOUNT = 600

// איתור/הקמת המשפחה בנדרים לפי ת.ז — מחזיר ClientId ושומר אותו בחזרה ב-beneficiaries.
// best-effort: לא זורק. משמש גם בהטענת הזכאות וגם בשיוך הכרטיס המגנטי.
export async function ensureNedarimClient(
  admin: SupabaseClient, beneficiaryId: string, creds?: NedarimCreds,
): Promise<{ clientId: string | null; error?: string; notConfigured?: boolean }> {
  const c = creds ?? (await getNedarimCreds())
  if (!c) return { clientId: null, notConfigured: true }

  const { data: b } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, id_number, address, city, phone, phone2, email, nedarim_id')
    .eq('id', beneficiaryId).maybeSingle()
  if (!b) return { clientId: null, error: 'המשפחה לא נמצאה' }

  let clientId = b.nedarim_id ? String(b.nedarim_id) : null
  try {
    if (!clientId && b.id_number) clientId = await findClientByZeout(c, String(b.id_number))
    if (!clientId) clientId = await saveClientCard(c, b)
    if (clientId && clientId !== b.nedarim_id) await admin.from('beneficiaries').update({ nedarim_id: clientId }).eq('id', b.id)
  } catch (e) { return { clientId: null, error: e instanceof Error ? e.message : 'שגיאת נדרים' } }
  if (!clientId) return { clientId: null, error: 'לא ניתן לאתר או להקים את המשפחה בנדרים' }
  return { clientId }
}

// שיוך כרטיס מגנטי לארנק הנדרים של היולדת, ושמירת המספר ב-maternity_aids.
// best-effort: השמירה המקומית מתבצעת תמיד; אם נדרים לא מוגדר/השיוך נכשל — linked=false
// (אך ok=true) כדי שהצוות יוכל להשלים ידנית. מתאים לקריאה מה-webhook ומכפתור ניהול עתידי.
export async function linkMaternityCard(
  admin: SupabaseClient, aidId: string, cardNumber: string,
): Promise<{ ok: boolean; linked: boolean; error?: string; notConfigured?: boolean }> {
  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, beneficiary_id')
    .eq('id', aidId).maybeSingle()
  if (!aid) return { ok: false, linked: false, error: 'התיק לא נמצא' }

  // שמירה מקומית תמיד — גם אם השיוך לנדרים ייכשל
  const { error: saveErr } = await admin.from('maternity_aids').update({ card_number: cardNumber }).eq('id', aid.id)
  if (saveErr) return { ok: false, linked: false, error: saveErr.message }

  const creds = await getNedarimCreds()
  if (!creds) return { ok: true, linked: false, notConfigured: true }

  const { clientId, error: clientErr } = await ensureNedarimClient(admin, aid.beneficiary_id, creds)
  if (!clientId) {
    await admin.from('maternity_aids').update({ card_load_error: clientErr ?? 'שיוך כרטיס: נדרים' }).eq('id', aid.id)
    return { ok: true, linked: false, error: clientErr }
  }

  try {
    const r = await setMagneticCard(creds, clientId, cardNumber)
    if (!r.ok) {
      await admin.from('maternity_aids').update({ card_load_error: `שיוך כרטיס: ${r.message}` }).eq('id', aid.id)
      return { ok: true, linked: false, error: r.message }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'שגיאת נדרים'
    await admin.from('maternity_aids').update({ card_load_error: `שיוך כרטיס: ${msg}` }).eq('id', aid.id)
    return { ok: true, linked: false, error: msg }
  }

  return { ok: true, linked: true }
}

// בעת אישור לידה: לוודא שהמשפחה קיימת בנדרים (לפי ת.ז, אחרת להקים אותה), ולהטעין 600 ₪ לארנק.
// שיוך הכרטיס הפיזי/מוקד נעשה בהמשך ידנית. best-effort — לא חוסם את אישור הלידה.
export async function loadMaternityCardOnApproval(
  admin: SupabaseClient, aidId: string, amount = MATERNITY_LOAD_AMOUNT,
): Promise<{ ok: boolean; notConfigured?: boolean; already?: boolean; error?: string; clientId?: string | null }> {
  const creds = await getNedarimCreds()
  if (!creds) return { ok: false, notConfigured: true }

  const { data: aid } = await admin
    .from('maternity_aids')
    .select('id, beneficiary_id, card_balance, card_load_status, card_tlush_id')
    .eq('id', aidId).maybeSingle()
  if (!aid) return { ok: false, error: 'התיק לא נמצא' }
  if (aid.card_load_status === 'loaded' || aid.card_tlush_id) return { ok: true, already: true } // כבר נטען

  // 1) איתור/הקמת המשפחה בנדרים לפי ת.ז
  const ensured = await ensureNedarimClient(admin, aid.beneficiary_id, creds)
  const clientId = ensured.clientId
  if (!clientId) return { ok: false, error: ensured.error ?? 'לא ניתן לאתר או להקים את המשפחה בנדרים' }

  // 2) הטענת הזכאות
  let result: Awaited<ReturnType<typeof addTlush>>
  try {
    result = await addTlush(creds, clientId, amount, undefined, 'הטענת זכאות יולדת (אישור לידה) — היכל החתם סופר')
  } catch (e) {
    await admin.from('maternity_aids').update({ card_load_status: 'failed', card_load_error: e instanceof Error ? e.message : String(e) }).eq('id', aid.id)
    return { ok: false, error: e instanceof Error ? e.message : 'שגיאת נדרים', clientId }
  }
  if (!result.ok) {
    await admin.from('maternity_aids').update({ card_load_status: 'failed', card_load_error: result.message }).eq('id', aid.id)
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

  return { ok: true, clientId }
}

// שולח ליולדת מייל "כרטיס מזון אושר / שובר" (best-effort)
export async function sendCardVoucher(admin: SupabaseClient, aidId: string, centerName?: string | null) {
  try {
    const { data: aid } = await admin
      .from('maternity_aids')
      .select('beneficiary:beneficiaries(full_name, family_name, spouse_name, email)')
      .eq('id', aidId)
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ben = (aid as any)?.beneficiary
    if (!ben?.email) return
    const mail = maternityCardEmail(ben, { centerName })
    await deliverMail(ben.email, mail.subject, mail.html, undefined, mailFor('maternity'))
  } catch (e) {
    console.error('[maternityCards] voucher mail failed:', e)
  }
}

// מחשב כמה מקומות פנויים בכל מוקד פעיל
async function centersAvailability(admin: SupabaseClient) {
  const { data: centers } = await admin.from('card_centers').select('id, name, stock, is_active')
  const { data: used } = await admin
    .from('maternity_aids')
    .select('card_center_id, card_status')
    .in('card_status', ['approved', 'loaded'])
  const usedBy: Record<string, number> = {}
  for (const a of used ?? []) if (a.card_center_id) usedBy[a.card_center_id] = (usedBy[a.card_center_id] ?? 0) + 1
  return (centers ?? [])
    .filter(c => c.is_active)
    .map(c => ({ id: c.id as string, name: c.name as string, free: (c.stock as number) - (usedBy[c.id] ?? 0) }))
    .filter(c => c.free > 0)
}

// מעבד את תור "ממתין למלאי": משייך יולדות (ותיקות קודם) למוקדים פנויים,
// מעדכן ל-approved ושולח להן שובר אוטומטית. מחזיר כמה טופלו.
export async function processAwaitingStock(admin: SupabaseClient): Promise<number> {
  const avail = await centersAvailability(admin)
  if (!avail.length) return 0
  const { data: waiting } = await admin
    .from('maternity_aids')
    .select('id')
    .eq('card_status', 'awaiting_stock')
    .order('updated_at', { ascending: true })
  if (!waiting?.length) return 0

  let processed = 0
  for (const w of waiting) {
    const center = avail.find(c => c.free > 0)
    if (!center) break
    const { error } = await admin
      .from('maternity_aids')
      .update({ card_status: 'approved', card_center_id: center.id, updated_at: new Date().toISOString() })
      .eq('id', w.id)
    if (error) continue
    center.free--
    await sendCardVoucher(admin, w.id, center.name)
    processed++
  }
  return processed
}

// אישור כרטיס אוטומטי בעת אישור הלידה: אם יש מלאי — מאשר ומשייך מוקד ושולח שובר;
// אם אין מלאי — מכניס לתור "ממתין למלאי". לא נוגע בכרטיס שכבר אושר/נטען.
export async function autoApproveCard(admin: SupabaseClient, aidId: string): Promise<void> {
  const { data: aid } = await admin.from('maternity_aids').select('id, card_status').eq('id', aidId).maybeSingle()
  if (!aid) return
  if (aid.card_status === 'approved' || aid.card_status === 'loaded') return
  const avail = await centersAvailability(admin)
  if (avail.length) {
    const c = avail[0]
    const { error } = await admin
      .from('maternity_aids')
      .update({ card_status: 'approved', card_center_id: c.id, updated_at: new Date().toISOString() })
      .eq('id', aidId)
    if (!error) await sendCardVoucher(admin, aidId, c.name)
  } else {
    await admin
      .from('maternity_aids')
      .update({ card_status: 'awaiting_stock', updated_at: new Date().toISOString() })
      .eq('id', aidId)
  }
}
