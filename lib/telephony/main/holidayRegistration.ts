// ─────────────────────────────────────────────────────────────────────────────
// מסלול הרישום המלא בשלוחת החגים (טכנוליין) — לחלוקה שמוגדרת "בטלפון בלבד".
//
// הסדר (לבקשת המשתמש, חנוכה תשפ״ז):
//   ת"ז כולל ספרת ביקורת (מיד בכניסה, בלי הודעות לפני)
//   → "הינכם מועברים לרישום לחלוקה…" → "שימו לב, בשלב זה הינכם מועברים למספר שאלות…"
//   → תאריך לידה → מספר טלפון המעודכן במערכת
//   → הצהרת ייחוס ("נכדי החתם סופר דור אחר דור…", 1 לאישור)
//   → הצהרת נזקקות ("לאישור הגשת בקשה", 1 לאישור)
//   → רישום (+ אישור אוטומטי ומייל זכאות) → הודעת סיום וניתוק.
//   בחירת המוקד אינה בשיחה הזו: עדכון לבחירת המוקד יישלח בהמשך.
//
// 🔴 חסר-מצב כמו כל השלוחה: השלב נגזר מהמשתנים שחזרו מהמרכזיה. בכל פנייה
// הזיהוי נבדק מחדש מהערכים שכבר הוקשו, ולכן אי אפשר "לקפוץ" לשלב מאוחר.
//
// ⚠️ שמות משתנים ייחודיים (r_*) — לא משותפים למסלול הרישום הישן או לבירור
// הזכאות, כדי שערך ממסלול אחר באותה שיחה לא ידלג על שאלה.
// ─────────────────────────────────────────────────────────────────────────────
import { registerToOpenDistribution, type ActiveDistribution } from '@/lib/holidayDistributions'
import { getDistRules, blockedByDeepReview, type DistRules } from '@/lib/holidayDistRules'
import { asksParentBirth, checkRegistrantBirth, phoneMatches } from '@/lib/holidayPhoneRegistrationRules'
import { notifyHolidayReceived } from '@/lib/holidayNotify'
import { digitsOnly } from '@/lib/idLookup'
import { spokenCenterDetails, spokenCenterName } from '@/lib/holidayCenterSpeech'
import { validateIsraeliId } from '@/lib/validation'
import { askDigits, menu, say, hangup } from '../modules'
import type { TlContext, TlFile, TlResponse, TlResult } from '../types'
import { findRegistrantById, getRecipient, getSpokenCenter, memberCanRegister, readableName } from './holidaysData'

// ⚠️ 6 משתנים ל-3 ניסיונות: אחרי כל ניסיון עלולה להגיע סולמית שנשארה (ראו stage).
const tries6 = (p: string) => [p, `${p}2`, `${p}3`, `${p}4`, `${p}5`, `${p}6`] as const
export const REG_VARS = {
  id: tries6('r_id'),
  birth: tries6('r_bd'),
  phone: tries6('r_ph'),
  lineage: 'r_lin',
  need: 'r_need',
} as const

const LOG = '[telephony:main/holidays:register]'
const ID_DIGITS = 9
const MAX_TRIES = 3

type Vars = Record<string, string | TlFile>
export type RegKit = {
  ctx: TlContext
  files: (key: string, vars?: Vars) => TlFile[]
  end: (key: string, vars?: Vars) => TlResponse[]
}

const tapped = (v: unknown) => String(v ?? '').trim()
function lastAttempt(params: Record<string, string>, vars: readonly string[]): number {
  for (let i = vars.length - 1; i >= 0; i--) if (tapped(params[vars[i]])) return i
  return -1
}
/** ת"ז תקינה: בדיוק 9 ספרות וספרת ביקורת נכונה. */
export const validPhoneId = (id: string) => id.length === ID_DIGITS && validateIsraeliId(id)

/**
 * שלב הקשה עם עד 3 ניסיונות. מחזיר את הערך האמיתי האחרון שהוקש והאם יש ניסיון נוסף,
 * או בקשה למרכזיה לשאול (שוב). intro מושמע לפני השאלה הראשונה.
 *
 * 🔴 סולמית שנשארה מההקשה הקודמת מגיעה לשאלה הבאה כ-SKIP תוך שבריר שנייה וקוטעת
 * את מה שמתנגן. זו לא תשובה: אם עוד לא הוקש ערך — שואלים שוב עם ה-intro; אם הוקש —
 * מחזירים אותו לבדיקה חוזרת, וכך הודעת השגיאה ("אינו תואם") מושמעת שוב ולא נבלעת.
 */
function stage(
  k: RegKit, vars: readonly string[], ask: (name: string, lead: TlFile[]) => TlResponse, intro: TlFile[] = [],
): { value: string; attempt: number; retry: (key: string) => TlResult } | { reply: TlResult } {
  const { params } = k.ctx
  const attempt = lastAttempt(params, vars)
  if (attempt < 0) return { reply: ask(vars[0], intro) }
  const canAsk = attempt + 1 < vars.length
  const real = vars.slice(0, attempt + 1).map(v => digitsOnly(params[v])).filter(Boolean)
  if (!real.length && canAsk) return { reply: ask(vars[attempt + 1], intro) }
  const hasNext = canAsk && real.length < MAX_TRIES
  return {
    value: real.at(-1) ?? '',
    attempt: Math.max(real.length - 1, 0),
    retry: (key: string) => (hasNext ? ask(vars[attempt + 1], k.files(key)) : k.end(key)),
  }
}

export async function phoneRegistration(k: RegKit, dist: ActiveDistribution): Promise<TlResult> {
  const { params, callId, phone: callerPhone } = k.ctx
  const rules = await getDistRules(dist.id)

  // ── 1. ת"ז כולל ספרת ביקורת — מיד בכניסה, בלי הודעות לפני ──
  const idStage = stage(k, REG_VARS.id, (name, lead) =>
    askDigits(name, ID_DIGITS, [...lead, ...k.files('reg_ask_id_full')], { min: 1, maskLog: true, post: true }))
  if ('reply' in idStage) return idStage.reply
  if (!validPhoneId(idStage.value)) return idStage.retry('id_invalid')
  const ben = await findRegistrantById(idStage.value)
  if (!ben) {
    // ת"ז שלא קיימת באיגוד הצאצאים — הודעה וניתוק, בלי ניסיון נוסף.
    console.log(`${LOG} callId=${callId} id not found`)
    return k.end('reg_id_not_found')
  }
  if (!memberCanRegister(ben)) return k.end('not_eligible')
  if (blockedByDeepReview(rules, ben.eligibility_status)) {
    console.log(`${LOG} callId=${callId} ben=${ben.id} blocked: deep_review`)
    return k.end('reg_deep_review')
  }
  // כבר רשומים — מיד אחרי הת"ז, בלי שאלות. הבעל והאשה באותה כרטסת, ולכן ת"ז של כל אחד מהם מזהה.
  // ⚠️ מפתח חדש ולא 'already': נוסחים שנשמרו מהמסך גוברים על defaultText.
  const existing = await getRecipient(dist.id, ben.id, 'id, approval_status')
  if (existing) {
    if (existing.approval_status === 'rejected') return k.end('not_eligible')
    console.log(`${LOG} callId=${callId} ben=${ben.id} already registered`)
    return k.end('reg_already_received')
  }

  // ── 2. הודעות המעבר, ואחריהן תאריך לידה: נשואים, של הבעל או של האשה; אחרים, של בעל הת"ז ──
  // ⚠️ הודעות המעבר הן ה-intro של שאלת התאריך: סולמית שנשארה אחרי הת"ז קוטעת אותן,
  // ו-stage משמיע אותן שוב.
  const birthPrompt = asksParentBirth(ben) ? 'reg_ask_birth_couple' : 'reg_ask_birth'
  const bdStage = stage(k, REG_VARS.birth, (name, lead) =>
    askDigits(name, 8, [...lead, ...k.files(birthPrompt)], { min: 1, maskLog: true, post: true }),
  [...k.files('reg_to_registration'), ...k.files('reg_questions_notice')])
  if ('reply' in bdStage) return bdStage.reply
  const bd = checkRegistrantBirth(bdStage.value, idStage.value, ben)
  if (bd === 'mismatch') {
    console.log(`${LOG} callId=${callId} ben=${ben.id} birth mismatch (attempt ${bdStage.attempt + 1})`)
    return bdStage.retry('reg_birth_no_match')
  }
  if (bd === 'unknown') console.log(`${LOG} callId=${callId} ben=${ben.id} no stored birth date — skipped`)

  // ── 3. מספר הטלפון המעודכן במערכת ──
  const phStage = stage(k, REG_VARS.phone, (name, lead) =>
    askDigits(name, 10, [...lead, ...k.files('reg_ask_phone')], { min: 1, maskLog: true, post: true }))
  if ('reply' in phStage) return phStage.reply
  if (!phoneMatches(phStage.value, ben)) {
    console.log(`${LOG} callId=${callId} ben=${ben.id} phone mismatch (attempt ${phStage.attempt + 1})`)
    return phStage.retry('reg_phone_mismatch')
  }

  const name = readableName(ben)

  // ── 4-5. הצהרות ──
  const lineage = tapped(params[REG_VARS.lineage])
  if (!lineage) {
    return menu(REG_VARS.lineage, ['1', '2'], [...k.files('identify', { name }), ...k.files('reg_ask_lineage')], { timeout: 7 })
  }
  if (lineage !== '1') return k.end('reg_declined')
  const need = tapped(params[REG_VARS.need])
  if (!need) return menu(REG_VARS.need, ['1', '2'], k.files('reg_ask_need'), { timeout: 7 })
  if (need !== '1') return k.end('reg_declined')

  const bye = (files: TlFile[]): TlResponse[] => [{ type: 'simpleMessage', files }, hangup()]

  // ── 6. רישום → הודעת סיום וניתוק (בחירת המוקד תיעשה בהמשך, בעדכון נפרד) ──
  {
    const result = await registerToOpenDistribution(ben.id, 'phone', { phone: phStage.value || callerPhone, distribution: dist })
    if (!result.ok) {
      console.error(`${LOG} register failed ben=${ben.id}: ${result.error}`)
      return k.end(result.deepReview ? 'reg_deep_review' : 'failed')
    }
    console.log(`${LOG} registered ben=${ben.id} dist=${dist.id} created=${result.created} approved=${!!result.approved}`)
    if (result.created && result.approved && result.recipientId) {
      // ⚠️ מייל "הבקשה התקבלה", לא מייל האישור עם סכום ושיוך כרטיס: זה נשלח
      // רק כשהצוות מאשר. המייל אינו מעכב את השיחה; כשל נרשם על השורה (notify_error).
      const rid = result.recipientId
      void notifyHolidayReceived(rid)
        .catch(e => console.error(`${LOG} received mail failed rec=${rid}`, e instanceof Error ? e.message : e))
    }
    const rec = await getRecipient(dist.id, ben.id, 'id, approval_status')
    if (!rec) return k.end('failed')
    if (rec.approval_status === 'rejected') return k.end('not_eligible')
    return bye([
      ...(result.approved ? k.files('reg_success_received') : []),
      ...k.files('reg_final_plural'),
    ])
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// מקש 2 — שמיעת הזכאות: ת"ז + תאריך לידה (כמו ברישום), ואז:
//   נרשם ואושר → "נרשמתם ואושרתם" · נרשם וממתין → "ממתין לאישור"
//   לא נרשם, הרישום פתוח → "זכאים להגיש בקשה, להרשמה הקישו 1" (או סיבת החסימה)
//   לא נרשם, הרישום כבר לא פתוח → "זמן הרישום חלף"
// ⚠️ משתנים e_* — נפרדים מהרישום (r_*), כדי שמעבר בין מסלולים לא ידלג על שאלה.
// ─────────────────────────────────────────────────────────────────────────────
export const ELIG_VARS = { id: tries6('e_id'), birth: tries6('e_bd') } as const

export async function phoneEligibility(
  k: RegKit, distId: string, rules: DistRules, registrationOpen: boolean,
): Promise<TlResult> {
  const { callId } = k.ctx
  const idStage = stage(k, ELIG_VARS.id, (name, lead) =>
    askDigits(name, ID_DIGITS, [...lead, ...k.files('reg_ask_id_full')], { min: 1, maskLog: true, post: true }))
  if ('reply' in idStage) return idStage.reply
  if (!validPhoneId(idStage.value)) return idStage.retry('id_invalid')
  const ben = await findRegistrantById(idStage.value)
  if (!ben) return idStage.retry('not_found')

  const birthPrompt = asksParentBirth(ben) ? 'reg_ask_birth_couple' : 'reg_ask_birth'
  const bdStage = stage(k, ELIG_VARS.birth, (name, lead) =>
    askDigits(name, 8, [...lead, ...k.files(birthPrompt)], { min: 1, maskLog: true, post: true }))
  if ('reply' in bdStage) return bdStage.reply
  if (checkRegistrantBirth(bdStage.value, idStage.value, ben) === 'mismatch') return bdStage.retry('reg_birth_no_match')

  const name = readableName(ben)
  const rec = await getRecipient(distId, ben.id, 'id, approval_status')
  console.log(`${LOG} callId=${callId} eligibility ben=${ben.id} registered=${!!rec} open=${registrationOpen}`)
  if (rec) return rec.approval_status === 'approved' ? k.end('elig_already_registered') : k.end('elig_registered_pending', { name })
  if (!registrationOpen) return k.end('elig_registration_passed', { name })
  if (!memberCanRegister(ben)) return k.end('not_eligible')
  if (blockedByDeepReview(rules, ben.eligibility_status)) return k.end('reg_deep_review')
  return k.end('elig_can_apply', { name })
}

// ─────────────────────────────────────────────────────────────────────────────
// מקש 3 — שמיעת המוקד שנבחר: שם המוקד, ואם הימים והשעות פורסמו — גם הם;
// אחרת "עדכון מדויק על מועד החלוקה במוקד יימסר בהמשך".
// ─────────────────────────────────────────────────────────────────────────────
export const CENTER_HEAR_VARS = tries6('h_id')

export async function phoneHearCenter(k: RegKit, distId: string, rules: DistRules): Promise<TlResult> {
  const idStage = stage(k, CENTER_HEAR_VARS, (name, lead) =>
    askDigits(name, ID_DIGITS, [...lead, ...k.files('reg_ask_id_full')], { min: 1, maskLog: true, post: true }))
  if ('reply' in idStage) return idStage.reply
  if (!validPhoneId(idStage.value)) return idStage.retry('id_invalid')
  const ben = await findRegistrantById(idStage.value)
  if (!ben) return idStage.retry('not_found')
  const rec = await getRecipient(distId, ben.id, 'id, center_id')
  if (!rec) return k.end('phase_not_registered')
  if (!rec.center_id) return k.end('center_none')
  const c = await getSpokenCenter(rec.center_id)
  const files: TlFile[] = rules.hoursPublished
    ? [...k.files('center_yours'), ...say(spokenCenterDetails(c) || spokenCenterName(c))]
    : [...k.files('center_yours'), ...say(spokenCenterName(c)), ...k.files('center_update_later')]
  return [{ type: 'simpleMessage', files }, hangup()]
}
