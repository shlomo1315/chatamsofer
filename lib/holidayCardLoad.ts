// ─────────────────────────────────────────────────────────────────────────────
// טעינת כרטיסי החגים בנדרים.
//
// 🔴 רץ **רק** מכפתור מפורש. אין כאן Cron, אין טריגר, ואין הפעלה כתופעת
// לוואי של פעולה אחרת. זו פעולה כספית על כרטיסים אמיתיים.
//
// 🔴 הרשאות נדרים של החגים נפרדות מאלה של היולדות (getHolidayNedarimCreds),
// וכך גם קבוצת הגבלת החנויות. שימוש בהרשאות היולדות היה טוען מהתקציב
// הלא נכון.
//
// ⚠️ הטעינה מתבצעת בקצב מבוקר ולא במקביל מלא: נדרים חוסמת קצב, ואז חלק
// מהמשפחות נטענות וחלק לא — בלי שאיש יידע מי.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getHolidayNedarimCreds, getHolidayLimitedId, addTlush,
  findClientByZeout, normalizeZeout, saveClientCard, getClientCardFull,
  type NedarimCreds,
} from './nedarim'
import { pickZeoutForCreate, isAlreadyRegistered } from './holidayClientCreate'
import { testModeOutcome } from './holidayTestMode'

/** סכום ברירת המחדל לטעינה. ⚠️ ניתן לשינוי מהמסך — אינו קבוע קשיח. */
export const DEFAULT_LOAD_AMOUNT = 500

export interface LoadTarget {
  recipientId: string
  /** 🔴 לשמירת nedarim_id שנפתר בטעינה. בלעדיו המזהה אובד. */
  beneficiaryId?: string | null
  /**
   * 🔴 מזהה מוסד *החגים* (7014553) השמור אצלנו — חוסך את החיפוש כולו.
   *
   * ⚠️ כשהוא קיים אין קריאה ל-findClientByZeout, שמושכת את כל טבלת
   * הלקוחות. זה ההבדל בין אלפי רשומות לכל טעינה לבין אפס.
   *
   * ⚠️ מוסד החגים בלבד — לעולם לא nedarim_id, ששייכת ליולדות (7018265).
   */
  nedarimIdHoliday?: string | null
  idNumber: string | null
  name: string
  /** ⚠️ הפרטים הבאים נדרשים *רק* להקמת המשפחה בנדרים כשאינה קיימת. */
  spouseIdNumber?: string | null
  familyName?: string | null
  fullName?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
}

export interface LoadOutcome {
  recipientId: string
  ok: boolean
  error?: string
  tlushId?: string | null
  /**
   * מזהה המשפחה בנדרים כפי שנפתר בטעינה — באיתור או בהקמה.
   *
   * ⚠️ נוסף כי ההקמה כאן יצרה משפחה בנדרים בלי לשמור את המזהה אצלנו.
   * beneficiaries.nedarim_id נשאר null, ואז שיוך הכרטיס לא מצא את
   * המשפחה ונכשל ב"המשפחה אינה קיימת בנדרים" — על משפחה שהוקמה זה עתה.
   */
  clientId?: string | null
}

export interface LoadSummary {
  attempted: number
  loaded: number
  failed: number
  outcomes: LoadOutcome[]
}

/**
 * תאריך התוקף בפורמט שנדרים מצפה לו — dd/MM/yyyy.
 *
 * 🔴 פורמט ISO נשלח כפי שהוא היה מתפרש אצלם כתאריך אחר לגמרי (או נדחה),
 * וזה כסף אמיתי על כרטיסים אמיתיים בלי שום סימן שהתוקף שגוי.
 *
 * ⚠️ ערך ריק או פגום מחזיר undefined ולא מחרוזת שבורה: הטענה בלי תוקף
 * היא ההתנהגות הקודמת והבטוחה, ותוקף שגוי גרוע מהיעדר תוקף.
 */
export function toNedarimExpiry(iso: string | null | undefined): string | undefined {
  const s = (iso ?? '').trim()
  if (!s) return undefined
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return undefined
  // ⚠️ נבדק שהתאריך שנוצר תואם למה שנכתב: "2026-13-45" נבלע ע"י Date
  // ומתגלגל לחודש הבא במקום להיפסל.
  const iso10 = s.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso10) && d.toISOString().slice(0, 10) !== iso10) return undefined
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
}

/**
 * טוען סכום לכרטיס אחד.
 *
 * ⚠️ מחזיר תוצאה ולא זורק: כשל במשפחה אחת אינו סיבה להפיל את כל המנה.
 */
export async function loadOne(
  creds: NedarimCreds,
  limitedId: string,
  target: LoadTarget,
  amount: number,
  /** תוקף הכרטיס (ISO) — מגיע מהחלוקה, לכל חלוקה בנפרד. */
  expiryIso?: string | null,
): Promise<LoadOutcome> {
  const zeout = normalizeZeout(target.idNumber ?? '')
  if (!zeout) {
    return { recipientId: target.recipientId, ok: false, error: 'אין תעודת זהות ברשומה' }
  }

  try {
    // ─────────────────────────────────────────────────────────────────────
    // איתור המשפחה — ואם אינה קיימת, הקמתה.
    //
    // ⚠️ מחפשים לפי *שתי* הת"ז ולא רק לפי אחת: המשפחה בנדרים עשויה להיות
    // רשומה על שם בן/בת הזוג. חיפוש לפי אחת בלבד החזיר null, המערכת ניסתה
    // להקים משפחה קיימת, ונדרים דחו ב"מספר זהות זה כבר רשום אצל X".
    //
    // ⚠️ כשל *החיפוש* אינו סיבה לוותר: GetClient_Table עלול להיכשל מצד
    // נדרים, ואילו SaveClientCard מצליחה ומחזירה ClientId בכל מקרה.
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 מזהה החגים שכבר שמור אצלנו — בלי שום פנייה לנדרים.
    //
    // ⚠️ עד כה החיפוש רץ *תמיד*, גם כשהמזהה היה ידוע, וכל findClientByZeout
    // מושכת את **כל** טבלת הלקוחות (אלפי רשומות) פעמיים לכל טעינה. זה מה
    // שניפח את הספירה אצל נדרים עד לאיום בחסימה — לא מספר השיוכים, שהיה
    // 208 בלילה שלם.
    //
    // 🔴 בטוח רק בזכות ההפרדה: nedarim_id_holiday שייך למוסד 7014553 בלבד.
    // אותו דילוג על nedarim_id המשותפת היה פונה עם מזהה של מוסד היולדות.
    //
    // ⚠️ מזהה מת עדיין מטופל: getClientCardFull/addTlush ייכשלו, ומסלול
    // ההתאוששות הקיים יאתר מחדש. הדילוג חוסך את המקרה הנפוץ בלי לוותר
    // על החריג.
    let clientId: string | null = target.nedarimIdHoliday
      ? String(target.nedarimIdHoliday)
      : null

    if (!clientId) {
      for (const candidate of [target.idNumber, target.spouseIdNumber].filter(Boolean)) {
        if (clientId) break
        try {
          clientId = await findClientByZeout(creds, String(candidate))
        } catch (e) {
          console.error('[holiday-load] חיפוש המשפחה בנדרים נכשל — ממשיכים להקמה:',
            e instanceof Error ? e.message : e)
        }
      }
    }

    if (!clientId) {
      const createZeout = pickZeoutForCreate(target.idNumber, target.spouseIdNumber)
      if (!createZeout) {
        return { recipientId: target.recipientId, ok: false, error: 'אין תעודת זהות ברשומה' }
      }
      try {
        // ⚠️ Groupe 'חלוקת חגים' ולא ברירת המחדל 'לידות': שיוך לקבוצה
        // הלא נכונה מערבב את משפחות החגים עם היולדות בנדרים.
        clientId = await saveClientCard(creds, {
          id_number: createZeout,
          family_name: target.familyName ?? target.name,
          full_name: target.fullName ?? target.name,
          phone: target.phone,
          phone2: target.phone2,
          email: target.email,
          address: target.address,
          city: target.city,
        }, null, 'חלוקת חגים')
      } catch (e) {
        // 🔴 "כבר רשום אצל X" אינו כשל: המשפחה קיימת בנדרים תחת רשומה
        // אחרת (בדרך כלל בן/בת הזוג), והחיפוש פשוט לא מצא אותה. מנסים
        // לאתר שוב לפי הת"ז השנייה לפני שמוותרים.
        const raw = e instanceof Error ? e.message : String(e)
        if (!isAlreadyRegistered(raw)) throw e
        for (const candidate of [target.spouseIdNumber, target.idNumber].filter(Boolean)) {
          if (clientId) break
          try { clientId = await findClientByZeout(creds, String(candidate)) } catch { /* ממשיכים */ }
        }
        if (!clientId) {
          return { recipientId: target.recipientId, ok: false, error: `המשפחה קיימת בנדרים אך לא אותרה — ${raw}` }
        }
      }
    }

    if (!clientId) {
      return { recipientId: target.recipientId, ok: false, error: 'הקמת המשפחה בנדרים לא החזירה מזהה' }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 🔴 שער אחרון לפני שהכסף יוצא: האם *נדרים* כבר טענה למשפחה הזו?
    //
    // ⚠️ כל ההגנות שקדמו לכאן נשענות על load_status שלנו, והבאג הוא בדיוק
    // שהוא אינו אמין: הקריאה ל-addTlush יוצאת *לפני* שנכתב 'loaded', ולכן
    // ריצה שנקטעה בין השתיים (timeout, כשל רשת, נפילת תהליך) משאירה כסף
    // שיצא ושורה שנראית "לא נטענה" — והיא נטענת שוב.
    //
    // ⚠️ AddTlush אינה idempotent: אין לה מפתח ייחודיות (LimitedId הוא
    // הגבלת חנויות בלבד), ולכן שליחה כפולה = טעינה כפולה, בלי כל התרעה.
    // התגלה 14.09 אצל סלושץ (300505997) — ₪500 פעמיים.
    //
    // 🔴 כשל *בבדיקה* אינו עוצר את הטעינה: משפחה שלא נטענה מעולם הייתה
    // נחסמת בגלל תקלת רשת רגעית, וזה הנזק ההפוך. חוסמים רק על ידיעה ודאית.
    // ─────────────────────────────────────────────────────────────────────
    try {
      const card = await getClientCardFull(creds, clientId)
      const already = countHolidayLoads(card, amount)
      if (already > 0) {
        return {
          recipientId: target.recipientId, ok: false, clientId,
          error: `כבר נטען בנדרים (${already} טעינות של ${amount}) — הטעינה נמנעה`,
        }
      }
    } catch (e) {
      console.error('[holiday-load] בדיקת טעינה קיימת נכשלה — ממשיכים לטעינה:',
        e instanceof Error ? e.message : e)
    }

    // ⚠️ התוקף עובר לנדרים. קודם נשלח undefined והכרטיסים יצאו בלי
    // תאריך תפוגה כלל — היתרה נשארה זמינה ללא הגבלת זמן.
    const res = await addTlush(creds, clientId, amount, toNedarimExpiry(expiryIso), 'חלוקת חגים', limitedId)
    if (!res.ok) return { recipientId: target.recipientId, ok: false, error: res.message || 'הטעינה נדחתה', clientId }
    return { recipientId: target.recipientId, ok: true, tlushId: res.tlushId, clientId }
  } catch (e) {
    return { recipientId: target.recipientId, ok: false, error: e instanceof Error ? e.message : 'תקלה' }
  }
}

/**
 * טוען מנה של כרטיסים ומעדכן את הסטטוס לכל שורה.
 *
 * ⚠️ סדרתי עם השהיה קצרה ולא Promise.all: נדרים חוסמת קצב על עשרות
 * קריאות מקבילות, והתוצאה היא כשלים אקראיים שנראים כתקלה במערכת.
 */
export async function runLoadBatch(
  db: SupabaseClient,
  targets: LoadTarget[],
  amount: number = DEFAULT_LOAD_AMOUNT,
  opts: { delayMs?: number; expiryIso?: string | null; testMode?: boolean } = {},
): Promise<LoadSummary> {
  const summary: LoadSummary = { attempted: targets.length, loaded: 0, failed: 0, outcomes: [] }
  if (!targets.length) return summary

  // ⚠️ במצב בדיקה אין קריאה לנדרים כלל, ולכן גם אין צורך בהרשאות. דרישת
  // הרשאות כאן הייתה חוסמת בדיוק את הבדיקה שנועדה לרוץ לפני שהן מוגדרות.
  const creds = opts.testMode ? null : await getHolidayNedarimCreds()
  if (!creds && !opts.testMode) {
    // 🔴 נכשל-סגור: בלי הרשאות אין לנסות עם ברירת מחדל כלשהי.
    throw new Error('לא הוגדרו הרשאות נדרים לחלוקות חגים')
  }
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 נכשל-סגור בלי קבוצת הגבלת חנויות — בדיוק כמו בלי הרשאות.
  //
  // ⚠️ זה היה הבאג החמור: LimitedId ריק אינו "בלי הגבלה" כהחלטה, הוא
  // **היעדר אכיפה**. אצל נדרים תלוש בלי LimitedId ניתן למימוש בכל בית עסק
  // ברשת, ו-3,878 טעינות (08.09–16.09) יצאו כך — הקטגוריה "חלוקת חגים"
  // (Groupe) תויגה נכון, אבל היא תיוג לדוחות ואינה אוכפת דבר בקופה.
  // המשפחות קנו בחנויות שמחוץ לרשימה, וזה נגלה רק בדיעבד.
  //
  // ⚠️ הקוד כאן *כן* העביר את limitedId; מה שחסר היה ערך. המסך תיעד "ריק
  // = מצב תקין לחגים", ולכן לא הייתה ברירת מחדל ולא אזהרה — ההנחה עצמה
  // הייתה שגויה, ולא שורת הקוד.
  //
  // 🔴 אין ברירת מחדל קשיחה כאן, במתכוון: 823 היא קבוצת היולדות ("אוכל
  // מוכן") ושייכת למוסד 7018265. הצמדתה לטעינת חגים במוסד 7014553 הייתה
  // מגבילה לחנויות הלא-נכונות — שגיאה שקטה גרועה מעצירה רועשת.
  // ─────────────────────────────────────────────────────────────────────────
  const limitedId = opts.testMode ? '' : await getHolidayLimitedId()
  if (!opts.testMode && !limitedId) {
    throw new Error(
      'לא הוגדרה קבוצת הגבלת חנויות לחגים (LimitedId). טעינה בלי הגבלה תאפשר ' +
      'מימוש בכל בית עסק. הגדירו את הקבוצה בהגדרות → נדרים חגים, ואז טענו שוב.',
    )
  }

  for (const t of targets) {
    // ─────────────────────────────────────────────────────────────────────
    // 🔴 מצב בדיקה — לא נוגעים בנדרים ולא נוגעים במסד.
    //
    // ⚠️ ה-return המוקדם הוא כל הביטחון: אין קריאה ל-addTlush, אין הקמת
    // לקוח, ואין כתיבת load_status. שורה שסומנה 'loaded' בבדיקה הייתה
    // נחסמת מטעינה אמיתית אחר כך — כלומר משפחה בלי כסף בכרטיס, בשקט.
    // ─────────────────────────────────────────────────────────────────────
    if (opts.testMode) {
      summary.outcomes.push(testModeOutcome(t))
      summary.loaded++
      if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs))
      continue
    }

    // ⚠️ creds מובטח כאן: מצב בדיקה יצא ב-continue למעלה, ובלעדיו
    // הפונקציה כבר זרקה.
    const outcome = await loadOne(creds!, limitedId, t, amount, opts.expiryIso)
    summary.outcomes.push(outcome)
    if (outcome.ok) summary.loaded++; else summary.failed++

    await db.from('distribution_recipients').update({
      load_status: outcome.ok ? 'loaded' : 'failed',
      load_error: outcome.ok ? null : (outcome.error ?? 'תקלה'),
      loaded_at: outcome.ok ? new Date().toISOString() : null,
    }).eq('id', t.recipientId)

    // 🔴 שמירת מזהה נדרים — גם כשהטעינה נכשלה.
    //
    // ⚠️ ההקמה בנדרים הצליחה ברגע שיש clientId, ובלי לשמור אותו כאן
    // המשפחה קיימת שם ואינה ידועה לנו: שיוך הכרטיס לא ימצא אותה, וניסיון
    // חוזר ינסה להקים אותה שוב ויידחה ב"מספר זהות זה כבר רשום".
    //
    // 🔴 נכתב ל-nedarim_id_holiday ולא ל-nedarim_id.
    //
    // ⚠️ זה היה מקור הערבוב: טעינת חגים שמרה מזהה של מוסד החגים (7014553)
    // בעמודה ששייכת למוסד היולדות (7018265). אצל משפחה שיש לה גם תיק
    // יולדות, המסלול של היולדות קרא את המזהה הזה ופנה איתו למוסד שלו —
    // מזהה שאינו קיים שם, או גרוע מכך, מזהה של משפחה אחרת לגמרי.
    if (outcome.clientId && t.beneficiaryId) {
      const { error: nidErr } = await db.from('beneficiaries')
        .update({ nedarim_id_holiday: String(outcome.clientId) })
        .eq('id', t.beneficiaryId).is('nedarim_id_holiday', null)
      if (nidErr) console.error(`[holiday-load] שמירת nedarim_id_holiday נכשלה ben=${t.beneficiaryId}:`, nidErr.message)
    }

    if (opts.delayMs) await new Promise(r => setTimeout(r, opts.delayMs))
  }

  console.log(`[holiday-load] הסתיים: ${summary.loaded} נטענו · ${summary.failed} נכשלו מתוך ${summary.attempted}`)
  return summary
}

/**
 * מי זכאי לטעינה — מסונן ולא מנוחש.
 *
 * ⚠️ שלושה תנאים, וכל אחד מהם מונע טעינה כפולה או שגויה:
 *   1. מאושר — טעינה לפני אישור היא כסף שיצא בטעות
 *   2. טרם נטען — 'loaded' לא ייטען שוב
 *   3. יש ת"ז — בלעדיה אין את מי לחפש בנדרים
 */
export function eligibleForLoad(rows: {
  id: string
  approval_status?: string | null
  load_status?: string | null
  id_number?: string | null
  name?: string
  /** 🔴 לשמירת nedarim_id שנפתר בטעינה. */
  beneficiary_id?: string | null
  /** 🔴 מזהה מוסד החגים — נוכחותו מדלגת על החיפוש בנדרים לגמרי. */
  nedarim_id_holiday?: string | null
  // ⚠️ הפרטים הבאים אינם לתצוגה: הם נשלחים לנדרים בהקמת המשפחה כשאינה
  // קיימת שם. השמטתם הייתה מקימה לקוח בלי טלפון וכתובת — לקוח שאינו
  // שמיש למוקד החלוקה, ובלי שום סימן שמשהו חסר.
  /** 🔴 מזהה המוקד שנבחר. null = טרם בחר → אינו נטען. */
  center_id?: string | null
  spouse_id_number?: string | null
  family_name?: string | null
  full_name?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
}[]): LoadTarget[] {
  // 🔴 שכבת הגנה אחרונה מפני טעינה כפולה.
  //
  // ⚠️ במסד יש אינדקס ייחודי על (distribution_id, beneficiary_id) שמונע
  // שתי שורות לאותה משפחה, וזו ההגנה החזקה. כאן מסננים לפי *תעודת
  // הזהות* — כי היא המפתח שלפיו נדרים מזהה את המשפחה, ושתי רשומות
  // שונות עם אותה ת"ז היו מייצרות שתי טעינות לאותו כרטיס.
  //
  // ⚠️ כסף שיצא פעמיים אינו ניתן להחזרה, ולכן העלות של סינון מיותר
  // נמוכה בהרבה מהעלות של החמצה.
  const seenId = new Set<string>()

  return rows
    .filter(r => r.approval_status === 'approved')
    .filter(r => r.load_status !== 'loaded')
    .filter(r => !!(r.id_number ?? '').trim())
    // 🔴 רק מי שבחר מוקד.
    //
    // הטעינה והשובר הם פעולה אחת: מיד אחרי הטעינה נשלח השובר, והוא
    // בנוי כולו סביב המוקד — הכתובת, המועד והמקום. טעינה למי שטרם
    // בחר מוציאה כסף בלי שיש מה לשלוח, והמשפחה אינה יודעת לאן להגיע.
    //
    // ⚠️ undefined ≠ null: מי שלא העביר את השדה כלל (קורא ישן) אינו
    // נחסם, ורק מי שנבדק ונמצא בלי מוקד יורד. חסימה על undefined
    // הייתה מאפסת בשקט את הטעינה אצל כל קורא שלא עודכן.
    .filter(r => r.center_id === undefined || !!r.center_id)
    .filter(r => {
      const key = String(r.id_number ?? '').trim()
      if (seenId.has(key)) return false
      seenId.add(key)
      return true
    })
    .map(r => ({
      recipientId: r.id,
      beneficiaryId: r.beneficiary_id ?? null,
      nedarimIdHoliday: r.nedarim_id_holiday ?? null,
      idNumber: r.id_number ?? null,
      name: r.name ?? '',
      spouseIdNumber: r.spouse_id_number ?? null,
      familyName: r.family_name ?? null,
      fullName: r.full_name ?? null,
      phone: r.phone ?? null,
      phone2: r.phone2 ?? null,
      email: r.email ?? null,
      address: r.address ?? null,
      city: r.city ?? null,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כמה טעינות בסכום החלוקה כבר קיימות בנדרים למשפחה הזו.
//
// ⚠️ מבנה התשובה של GetClientCard אינו אחיד — הטעינות מגיעות תחת מפתחות
// שונים, ולעיתים כאובייקט יחיד ולא כמערך. קריאה לפי מפתח אחד בלבד החזירה
// 0 בשקט, כלומר "לא נטען" על משפחה שכן נטענה — בדיוק הכשל שהפונקציה
// אמורה למנוע.
//
// ⚠️ נספרות רק טעינות בסכום המדויק של החלוקה: למשפחה עשויות להיות טעינות
// מתוכניות אחרות (יולדות, סיוע), וספירתן הייתה חוסמת חלוקת חגים לגיטימית.
// ─────────────────────────────────────────────────────────────────────────────
export function countHolidayLoads(payload: unknown, amount: number): number {
  if (!payload || typeof payload !== 'object') return 0
  const obj = payload as Record<string, unknown>

  const asRows = (v: unknown): Record<string, unknown>[] => {
    if (Array.isArray(v)) return v.filter(x => x && typeof x === 'object') as Record<string, unknown>[]
    // ⚠️ פריט יחיד מוחזר כאובייקט ולא כמערך באורך 1.
    if (v && typeof v === 'object') return [v as Record<string, unknown>]
    return []
  }

  const looksLikeLoad = (r: Record<string, unknown>) =>
    'Amount' in r || 'TlushId' in r || 'Sum' in r

  let rows: Record<string, unknown>[] = []
  for (const key of ['Tlushim', 'Tlushim_Table', 'Loads', 'Tlush']) {
    if (key in obj) { rows = asRows(obj[key]); if (rows.length) break }
  }
  if (!rows.length) {
    for (const v of Object.values(obj)) {
      const cand = asRows(v)
      if (cand.length && cand.some(looksLikeLoad)) { rows = cand; break }
    }
  }

  const num = (v: unknown): number => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : NaN
  }

  return rows.filter(r => {
    const a = num(r.Amount ?? r.Sum)
    return Number.isFinite(a) && Math.abs(a - amount) < 0.01
  }).length
}
