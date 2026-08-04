// ─────────────────────────────────────────────────────────────────────────────
// חלוקות חגים — שיוך הכרטיס למשפחה מאושרת.
//
// הזרימה בפועל: המשפחה נרשמת (שלב א'), הצוות מאשר, המשפחה מקבלת כרטיס פיזי
// במוקד ומשייכת אותו בעצמה — בטלפון או בממשק. השיוך הוא מה שהופך את הכרטיס
// לפעיל אצל נדרים, ולכן הוא נכתב אצלנו *רק* אחרי שנדרים אישר.
//
// ⚠️ הזכאות לשייך כרטיס נקבעת כאן ולא בכל ערוץ בנפרד. השלוחה הטלפונית, הממשק
// והמוקד כולם קוראים את eligibility(), כי שלוש בדיקות נפרדות ל"האם המשפחה
// מאושרת" היו נפרדות זו מזו בעדכון הראשון, ואז ערוץ אחד מאפשר מה שאחר חוסם.
//
// ⚠️ אנחנו לא סומכים על "ok" של נדרים בלבד: נדרים לעיתים מקשר את הכרטיס ומחזיר
// שגיאה או פסק-זמן. לכן כשל מאומת מול נדרים בשליפה חוזרת לפני שהוא מדווח כשל,
// אחרת המשפחה מקבלת "נכשל" על כרטיס שכן שויך והצוות מחפש תקלה שאינה קיימת.
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from '@/lib/apiAuth'
import { getOpenDistribution, type ActiveDistribution } from '@/lib/holidayDistributions'
import {
  getHolidayNedarimCreds, setMagneticCard, getClientCardFull, findClientByZeout,
} from '@/lib/nedarim'

export const HOLIDAY_CARD_DIGITS = 16

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface HolidayRecipient {
  id: string
  distribution_id: string
  beneficiary_id: string | null
  approval_status: ApprovalStatus
  card_number: string | null
  card_linked_at: string | null
  card_link_error: string | null
}

const RECIPIENT_COLS =
  'id, distribution_id, beneficiary_id, approval_status, card_number, card_linked_at, card_link_error'

/** שורת הנרשם של המשפחה בחלוקה מסוימת — null כשלא נרשמה. */
export async function getRecipient(
  distributionId: string,
  beneficiaryId: string,
): Promise<HolidayRecipient | null> {
  const db = getServiceClient()
  if (!db) return null
  const { data } = await db
    .from('distribution_recipients')
    .select(RECIPIENT_COLS)
    .eq('distribution_id', distributionId)
    .eq('beneficiary_id', beneficiaryId)
    .maybeSingle()
  return (data as HolidayRecipient | null) ?? null
}

export type DenyReason = 'closed' | 'not_registered' | 'not_approved' | 'rejected' | 'already_linked'

export type CardEligibility =
  | { allowed: true; recipient: HolidayRecipient; distribution: ActiveDistribution }
  | { allowed: false; reason: DenyReason; recipient?: HolidayRecipient; distribution?: ActiveDistribution }

/**
 * ההחלטה עצמה — פונקציה טהורה, כדי שתהיה ניתנת לבדיקה בלי מסד.
 *
 * ⚠️ 'already_linked' אינו כשל אלא מצב תקין: מי ששייך כבר צריך לשמוע זאת ולא
 * הודעת שגיאה, ובעיקר לא לשייך כרטיס שני שיפצל את היתרה.
 *
 * ⚠️ 'default deny': כל מצב אישור שאינו בדיוק 'approved' נחסם. אם ייווסף בעתיד
 * מצב חדש (למשל 'on_hold'), הוא ייחסם מעצמו ולא ייפתח בשקט לשיוך כרטיס.
 */
export function decideCardEligibility(
  dist: ActiveDistribution | null,
  rec: HolidayRecipient | null,
): CardEligibility {
  if (!dist) return { allowed: false, reason: 'closed' }
  if (!rec) return { allowed: false, reason: 'not_registered', distribution: dist }
  if (rec.approval_status === 'rejected') return { allowed: false, reason: 'rejected', recipient: rec, distribution: dist }
  if (rec.approval_status !== 'approved') return { allowed: false, reason: 'not_approved', recipient: rec, distribution: dist }
  if (rec.card_number && rec.card_linked_at) {
    return { allowed: false, reason: 'already_linked', recipient: rec, distribution: dist }
  }
  return { allowed: true, recipient: rec, distribution: dist }
}

/** האם המשפחה יכולה לשייך כרטיס לחלוקה הפתוחה — התשובה היחידה במערכת. */
export async function cardEligibility(beneficiaryId: string): Promise<CardEligibility> {
  const dist = await getOpenDistribution()
  if (!dist) return { allowed: false, reason: 'closed' }
  return decideCardEligibility(dist, await getRecipient(dist.id, beneficiaryId))
}

export interface LinkCardResult {
  ok: boolean
  /** שויך עכשיו (false = היה משויך כבר, וזו הצלחה) */
  linked: boolean
  /** נוסח השגיאה של נדרים — מוקרא למתקשר כמו שהוא, כי הוא הסיבה האמיתית */
  error?: string
}

// נדרים מנסח "הכרטיס כבר משויך למשפחה זו" בכמה דרכים — זיהוי רחב בכוונה, כי
// המשמעות זהה: המטרה הושגה.
const isAlreadyMsg = (m: string) =>
  /משפחה\s*זו|כבר\s*(מוגדר|מוגד|משוי|משויך)|(מוגדר|משויך|משוי)\S*\s*למשפחה/.test(m)

/**
 * שיוך כרטיס בנדרים + שמירה על שורת הנרשם.
 *
 * ⚠️ הכתיבה אצלנו מותנית בהצלחה בנדרים: כרטיס שנשמר אצלנו ולא שויך בנדרים היה
 * מוצג לצוות כמשויך, והמשפחה הייתה מגיעה לחנות עם כרטיס מת.
 */
export async function linkHolidayCard(
  beneficiaryId: string,
  cardNumber: string,
  opts: { phone?: string | null } = {},
): Promise<LinkCardResult> {
  const digits = String(cardNumber ?? '').replace(/\D/g, '')
  if (digits.length !== HOLIDAY_CARD_DIGITS) return { ok: false, linked: false, error: 'מספר הכרטיס אינו תקין' }

  const db = getServiceClient()
  if (!db) return { ok: false, linked: false, error: 'שגיאת שרת' }

  const elig = await cardEligibility(beneficiaryId)
  if (!elig.allowed) {
    // כרטיס שכבר שויך — לא נוגעים בו, וזו הצלחה מבחינת המתקשר
    if (elig.reason === 'already_linked') return { ok: true, linked: false }
    return { ok: false, linked: false, error: 'אינכם מאושרים לשיוך כרטיס בחלוקה זו' }
  }
  const rec = elig.recipient

  // ⚠️ הרשאת החגים ולא הראשית: החגים והיולדות הם שני תקציבים בנדרים
  const creds = await getHolidayNedarimCreds()
  if (!creds) return { ok: false, linked: false, error: 'ממשק נדרים אינו מוגדר' }

  // מזהה נדרים של המשפחה — מהרשומה, ובהיעדרו חיפוש לפי ת"ז ושמירה חזרה, כדי
  // שכרטיס תקין תמיד ישויך גם למשפחה שה-nedarim_id שלה לא נשמר בעבר.
  const { data: ben } = await db
    .from('beneficiaries')
    .select('id, id_number, nedarim_id')
    .eq('id', beneficiaryId)
    .maybeSingle()
  let nedarimId = ben?.nedarim_id ? String(ben.nedarim_id) : null
  if (!nedarimId && ben?.id_number) {
    try {
      nedarimId = await findClientByZeout(creds, String(ben.id_number))
      if (nedarimId) await db.from('beneficiaries').update({ nedarim_id: nedarimId }).eq('id', beneficiaryId)
    } catch (e) { console.error('[holidayCards] findClientByZeout failed', e) }
  }
  if (!nedarimId) {
    const error = 'המשפחה אינה קיימת בנדרים'
    await db.from('distribution_recipients').update({ card_link_error: error }).eq('id', rec.id)
    return { ok: false, linked: false, error }
  }

  let ok = false, message = ''
  try {
    const r = await setMagneticCard(creds, nedarimId, digits, { timeoutMs: 12_000 })
    ok = r.ok; message = r.message
  } catch (e) { message = e instanceof Error ? e.message : String(e) }

  if (!ok) {
    // ייתכן שנדרים כן קישר והחזיר שגיאה — מאמתים בשליפה חוזרת לפני דיווח כשל
    ok = isAlreadyMsg(message) || await cardLinkedInNedarim(creds, nedarimId, digits)
  }
  if (!ok) {
    console.error(`[holidayCards] setMagneticCard failed: ${message}`)
    await db.from('distribution_recipients')
      .update({ card_link_error: `שיוך הכרטיס נכשל — תגובת נדרים: ${message}` })
      .eq('id', rec.id)
    return { ok: false, linked: false, error: message || 'שגיאה טכנית' }
  }

  const { error: upErr } = await db.from('distribution_recipients').update({
    card_number: digits,
    card_linked_at: new Date().toISOString(),
    card_link_error: null,
    card_linked_phone: opts.phone ?? null,
  }).eq('id', rec.id)
  if (upErr) {
    // הכרטיס שויך בנדרים אך לא נשמר אצלנו — מדווחים כדי שלא ייווצר פער שקט
    console.error('[holidayCards] card linked in Nedarim but DB update failed:', upErr.message)
    return { ok: true, linked: true, error: upErr.message }
  }
  return { ok: true, linked: true }
}

async function cardLinkedInNedarim(
  creds: NonNullable<Awaited<ReturnType<typeof getHolidayNedarimCreds>>>,
  nedarimId: string,
  digits: string,
): Promise<boolean> {
  try {
    const full = await getClientCardFull(creds, nedarimId)
    const cards = Array.isArray((full as { Cards?: unknown } | null)?.Cards)
      ? (full as { Cards: Record<string, unknown>[] }).Cards
      : []
    return cards.some(c => !c.RemovedDate
      && [c.MagneticCard, c.CardNumber].some(v => String(v ?? '').replace(/\D/g, '') === digits))
  } catch { return false }
}
