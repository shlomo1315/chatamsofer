// ─────────────────────────────────────────────────────────────────────────────
// חלוקות חגים — שיוך הכרטיס למשפחה מאושרת.
//
// ⚠️ מצב נוכחי: מצב האישור (approval_status) פעיל ומנוהל במסך החלוקה. *ערוץ*
// שיוך הכרטיס הוא שלב ב' ואינו מחובר עדיין לשלוחה הטלפונית — השלוחה עושה כרגע
// רישום ראשוני בלבד. הקוד כאן מוכן ומכוסה בבדיקות, וממתין לערוץ שיצרוך אותו.
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
  getHolidayNedarimCreds, setMagneticCard, getClientCardFull, findClientByZeout, saveClientCard,
} from '@/lib/nedarim'
import { pickZeoutForCreate, isAlreadyRegistered } from '@/lib/holidayClientCreate'

export const HOLIDAY_CARD_DIGITS = 16

/** שדות המשפחה הדרושים לאיתור *ולהקמה* בנדרים. */
interface BenRow {
  id: string
  id_number?: string | null
  spouse_id_number?: string | null
  family_name?: string | null
  full_name?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  nedarim_id?: string | null
}

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
  opts: {
    phone?: string | null
    /**
     * 🔴 מזהה החלוקה שהקורא כבר זיהה — עוקף את getOpenDistribution.
     *
     * ⚠️ getOpenDistribution מחזירה חלוקה רק כש-registration_open=true,
     * כלומר שער *הרישום*. שיוך הכרטיס קורה בשלב האיסוף, הרבה אחרי
     * שהרישום נסגר — ואז היא מחזירה null, וכל שיוך נדחה ב"אינכם מאושרים
     * לשיוך כרטיס בחלוקה זו". שלוחת הטלפון כבר זיהתה את החלוקה לפי
     * pickup_open, ואין שום סיבה לחפש אותה שוב לפי שער אחר.
     */
    distributionId?: string | null
  } = {},
): Promise<LinkCardResult> {
  const digits = String(cardNumber ?? '').replace(/\D/g, '')
  if (digits.length !== HOLIDAY_CARD_DIGITS) return { ok: false, linked: false, error: 'מספר הכרטיס אינו תקין' }

  const db = getServiceClient()
  if (!db) return { ok: false, linked: false, error: 'שגיאת שרת' }

  // ⚠️ כשהקורא מסר חלוקה — נבדקת השורה שלה בלבד, ולא שער הרישום.
  let rec: HolidayRecipient
  if (opts.distributionId) {
    const row = await getRecipient(opts.distributionId, beneficiaryId)
    if (!row) return { ok: false, linked: false, error: 'אינכם רשומים לחלוקה זו' }
    if (row.approval_status === 'rejected' || row.approval_status !== 'approved') {
      return { ok: false, linked: false, error: 'אינכם מאושרים לשיוך כרטיס בחלוקה זו' }
    }
    // כרטיס שכבר שויך — לא נוגעים בו, וזו הצלחה מבחינת המתקשר
    if (row.card_number && row.card_linked_at) return { ok: true, linked: false }
    rec = row
  } else {
    const elig = await cardEligibility(beneficiaryId)
    if (!elig.allowed) {
      if (elig.reason === 'already_linked') return { ok: true, linked: false }
      return { ok: false, linked: false, error: 'אינכם מאושרים לשיוך כרטיס בחלוקה זו' }
    }
    rec = elig.recipient
  }

  // ⚠️ הרשאת החגים ולא הראשית: החגים והיולדות הם שני תקציבים בנדרים
  const creds = await getHolidayNedarimCreds()
  if (!creds) return { ok: false, linked: false, error: 'ממשק נדרים אינו מוגדר' }

  // מזהה נדרים של המשפחה — מהרשומה, ובהיעדרו חיפוש לפי ת"ז ושמירה חזרה, כדי
  // שכרטיס תקין תמיד ישויך גם למשפחה שה-nedarim_id שלה לא נשמר בעבר.
  const { data: ben } = await db
    .from('beneficiaries')
    .select('id, id_number, spouse_id_number, family_name, full_name, phone, phone2, email, address, city, nedarim_id')
    .eq('id', beneficiaryId)
    .maybeSingle()
  const bn = ben as BenRow | null

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 איתור המשפחה בנדרים — ואם אינה קיימת, הקמתה.
  //
  // ⚠️ עד כה רק *חיפשנו*, ומשפחה שלא נמצאה נדחתה ב"המשפחה אינה קיימת
  // בנדרים". אבל runLoadBatch (הטעינה) מקימה משפחה כשאינה קיימת — ולכן
  // מי שכבר נטען עבר, ומי שהגיע לשיוך לפני טעינה נדחה. בפועל: משפחה
  // שנבדקה אתמול עבדה (היא נטענה קודם), ומשפחות היום נכשלו.
  //
  // ⚠️ חיפוש לפי *שתי* הת"ז: המשפחה בנדרים עשויה להיות רשומה על שם
  // בן/בת הזוג, וחיפוש לפי אחת בלבד החזיר null על משפחה שקיימת.
  // ─────────────────────────────────────────────────────────────────────────
  let nedarimId = bn?.nedarim_id ? String(bn.nedarim_id) : null

  const lookup = async (): Promise<string | null> => {
    for (const cand of [bn?.id_number, bn?.spouse_id_number].filter(Boolean)) {
      try {
        const hit = await findClientByZeout(creds, String(cand))
        if (hit) return hit
      } catch (e) { console.error('[holidayCards] findClientByZeout failed', e) }
    }
    return null
  }

  if (!nedarimId) nedarimId = await lookup()

  if (!nedarimId) {
    // 🔴 הקמה — אותה התנהגות בדיוק כמו בטעינה (lib/holidayCardLoad).
    const createZeout = pickZeoutForCreate(bn?.id_number, bn?.spouse_id_number)
    if (!createZeout) {
      const error = 'אין תעודת זהות ברשומה'
      await db.from('distribution_recipients').update({ card_link_error: error }).eq('id', rec.id)
      return { ok: false, linked: false, error }
    }
    try {
      // ⚠️ Groupe 'חלוקת חגים' — אחרת המשפחה מתערבבת עם משפחות היולדות.
      nedarimId = await saveClientCard(creds, {
        id_number: createZeout,
        family_name: bn?.family_name ?? '',
        full_name: bn?.full_name ?? '',
        phone: bn?.phone, phone2: bn?.phone2, email: bn?.email,
        address: bn?.address, city: bn?.city,
      }, null, 'חלוקת חגים')
    } catch (e) {
      // 🔴 "כבר רשום אצל X" אינו כשל: המשפחה קיימת תחת רשומה אחרת
      // (בדרך כלל בן/בת הזוג) והחיפוש לא מצא אותה. מנסים לאתר שוב.
      const raw = e instanceof Error ? e.message : String(e)
      if (!isAlreadyRegistered(raw)) {
        const error = `הקמת המשפחה בנדרים נכשלה — ${raw}`
        await db.from('distribution_recipients').update({ card_link_error: error }).eq('id', rec.id)
        return { ok: false, linked: false, error }
      }
      nedarimId = await lookup()
      if (!nedarimId) {
        const error = `המשפחה קיימת בנדרים אך לא אותרה — ${raw}`
        await db.from('distribution_recipients').update({ card_link_error: error }).eq('id', rec.id)
        return { ok: false, linked: false, error }
      }
    }
  }

  if (!nedarimId) {
    const error = 'הקמת המשפחה בנדרים לא החזירה מזהה'
    await db.from('distribution_recipients').update({ card_link_error: error }).eq('id', rec.id)
    return { ok: false, linked: false, error }
  }
  if (nedarimId !== bn?.nedarim_id) {
    await db.from('beneficiaries').update({ nedarim_id: nedarimId }).eq('id', beneficiaryId)
  }

  let ok = false, message = ''
  try {
    const r = await setMagneticCard(creds, nedarimId, digits, { timeoutMs: 12_000 })
    ok = r.ok; message = r.message
  } catch (e) { message = e instanceof Error ? e.message : String(e) }

  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 מזהה שמור שנדרים אינה מכירה — מאתרים מחדש ומנסים שוב.
  //
  // ⚠️ "מספר לקוח לא מוכר" על nedarim_id ששמור אצלנו פירושו שהרשומה
  // בנדרים נמחקה או מוזגה. בלי הניסיון החוזר המשפחה נתקעת לנצח על מזהה
  // מת, והשגיאה נראית כתקלת מערכת במקום כנתון מיושן.
  // ─────────────────────────────────────────────────────────────────────────
  if (!ok && /לא מוכר|לא נמצא|not found/i.test(message)) {
    const fresh = await lookup()
    if (fresh && fresh !== nedarimId) {
      console.warn(`[holidayCards] nedarim_id ${nedarimId} אינו מוכר — מאותר מחדש כ-${fresh}`)
      nedarimId = fresh
      await db.from('beneficiaries').update({ nedarim_id: fresh }).eq('id', beneficiaryId)
      try {
        const r2 = await setMagneticCard(creds, fresh, digits, { timeoutMs: 12_000 })
        ok = r2.ok; message = r2.message
      } catch (e) { message = e instanceof Error ? e.message : String(e) }
    }
  }

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
