// ─────────────────────────────────────────────────────────────────────────────
// מסלול הרישום המלא בשלוחת החגים (טכנוליין) — לחלוקה שמוגדרת "בטלפון בלבד".
//
// הסדר (לבקשת המשתמש, חנוכה תשפ״ז):
//   הודעה מקדימה ("לאחר הרישום תתבקשו לבחור מוקד…") → ברוכים הבאים
//   → ת"ז → תאריך לידה → מספר טלפון המעודכן במערכת
//   → הצהרת ייחוס ("נכדי החתם סופר דור אחר דור…", 1 לאישור)
//   → הצהרת נזקקות ("לאישור הגשת בקשה", 1 לאישור)
//   → רישום (+ אישור אוטומטי ומייל זכאות) → מעבר ישיר לבחירת מוקד.
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
import { notifyHolidayApproved } from '@/lib/holidayNotify'
import { digitsOnly } from '@/lib/idLookup'
import { spokenCenterDetails, spokenCenterName } from '@/lib/holidayCenterSpeech'
import { CENTER_VARS, nextCenterStep, buildChoiceList } from '@/lib/holidayCenterIvr'
import { askDigits, menu, say, hangup } from '../modules'
import type { TlContext, TlFile, TlResponse, TlResult } from '../types'
import {
  centerCapacities, findRegistrantById, getRecipient, getSpokenCenter, memberCanRegister,
  openCenters, readableName, saveCenterChoice,
} from './holidaysData'

// ⚠️ 4 משתנים ל-3 ניסיונות: אחד שמור לסולמית שנשארה מהשאלה הקודמת (ראו stage).
export const REG_VARS = {
  id: ['r_id', 'r_id2', 'r_id3', 'r_id4'],
  birth: ['r_bd', 'r_bd2', 'r_bd3', 'r_bd4'],
  phone: ['r_ph', 'r_ph2', 'r_ph3', 'r_ph4'],
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
function choose(name: string, numbers: number[], files: TlFile[]): TlResponse {
  if (numbers.every(n => n >= 1 && n <= 9)) return menu(name, numbers.map(String), files)
  return askDigits(name, Math.max(...numbers.map(n => String(n).length)), files, { min: 1 })
}

/**
 * שלב הקשה עם עד 3 ניסיונות. מחזיר את הערך שהוקש בניסיון האחרון והאם יש ניסיון נוסף,
 * או בקשה למרכזיה לשאול (שוב).
 */
function stage(
  k: RegKit, vars: readonly string[], ask: (name: string, lead: TlFile[]) => TlResponse,
): { value: string; attempt: number; retry: (key: string) => TlResult } | { reply: TlResult } {
  const { params } = k.ctx
  const attempt = lastAttempt(params, vars)
  if (attempt < 0) return { reply: ask(vars[0], []) }
  const value = digitsOnly(params[vars[attempt]])
  const canAsk = attempt + 1 < vars.length
  // 🔴 סולמית שנשארה מההקשה הקודמת (ת"ז של 9 ספרות "ולאחר מכן סולמית") מגיעה
  // לשאלה הבאה כ-SKIP תוך שבריר שנייה. זו לא תשובה: שואלים שוב, בלי הודעת שגיאה.
  if (!value && canAsk) return { reply: ask(vars[attempt + 1], []) }
  const tries = vars.slice(0, attempt + 1).filter(v => digitsOnly(params[v])).length
  const hasNext = canAsk && tries < MAX_TRIES
  return {
    value,
    attempt,
    retry: (key: string) => (hasNext ? ask(vars[attempt + 1], k.files(key)) : k.end(key)),
  }
}

export async function phoneRegistration(k: RegKit, dist: ActiveDistribution): Promise<TlResult> {
  const { params, callId, phone: callerPhone } = k.ctx
  const rules = await getDistRules(dist.id)
  const distName = `${dist.name}${dist.year ? ` ${dist.year}` : ''}`

  // ── 1. ת"ז (לפניה: ההודעה המקדימה וברוכים הבאים — רק בפנייה הראשונה) ──
  const idStage = stage(k, REG_VARS.id, (name, lead) => askDigits(name, ID_DIGITS, [
    ...(name === REG_VARS.id[0] ? [...k.files('reg_notice'), ...k.files('reg_welcome', { distribution: distName })] : []),
    ...lead, ...k.files('reg_ask_id'),
  ], { min: 1, maskLog: true, post: true }))
  if ('reply' in idStage) return idStage.reply
  if (idStage.value.length !== ID_DIGITS) return idStage.retry('id_invalid')
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

  // ── 2. תאריך לידה: נשואים, של הבעל או של האשה; אחרים, של בעל הת"ז ──
  const birthPrompt = asksParentBirth(ben) ? 'reg_ask_birth_couple' : 'reg_ask_birth'
  const bdStage = stage(k, REG_VARS.birth, (name, lead) =>
    askDigits(name, 8, [...lead, ...k.files(birthPrompt)], { min: 1, maskLog: true, post: true }))
  if ('reply' in bdStage) return bdStage.reply
  const bd = checkRegistrantBirth(bdStage.value, idStage.value, ben)
  if (bd === 'mismatch') {
    console.log(`${LOG} callId=${callId} ben=${ben.id} birth mismatch (attempt ${bdStage.attempt + 1})`)
    return bdStage.retry('reg_birth_mismatch')
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
  const existing = await getRecipient(dist.id, ben.id, 'id, center_id, approval_status')

  // ── 4-5. הצהרות — רק למי שעוד לא רשום ──
  if (!existing) {
    const lineage = tapped(params[REG_VARS.lineage])
    if (!lineage) {
      return menu(REG_VARS.lineage, ['1', '2'], [...k.files('identify', { name }), ...k.files('reg_ask_lineage')], { timeout: 7 })
    }
    if (lineage !== '1') return k.end('reg_declined')
    const need = tapped(params[REG_VARS.need])
    if (!need) return menu(REG_VARS.need, ['1', '2'], k.files('reg_ask_need'), { timeout: 7 })
    if (need !== '1') return k.end('reg_declined')
  }

  // ── 6. רישום ──
  let rec = existing
  let lead: TlFile[] = []
  if (!rec) {
    const result = await registerToOpenDistribution(ben.id, 'phone', { phone: phStage.value || callerPhone, distribution: dist })
    if (!result.ok) {
      console.error(`${LOG} register failed ben=${ben.id}: ${result.error}`)
      return k.end(result.deepReview ? 'reg_deep_review' : 'failed')
    }
    console.log(`${LOG} registered ben=${ben.id} dist=${dist.id} created=${result.created} approved=${!!result.approved}`)
    if (result.created && result.approved && result.recipientId) {
      // ⚠️ המייל אינו מעכב את השיחה; כשל נרשם על השורה (notify_error).
      const rid = result.recipientId
      void notifyHolidayApproved([rid], { email: true, phone: false })
        .catch(e => console.error(`${LOG} approval mail failed rec=${rid}`, e instanceof Error ? e.message : e))
    }
    rec = await getRecipient(dist.id, ben.id, 'id, center_id, approval_status')
    if (!rec) return k.end('failed')
    lead = k.files(result.approved ? 'reg_success_approved' : 'reg_success_pending', { distribution: distName })
  }
  if (rec.approval_status === 'rejected') return k.end('not_eligible')

  // ── 7. בחירת מוקד ──
  return centerStep(k, dist.id, rec, rules, lead, distName, name)
}

/** מה שמוקרא על מוקד: עם ימים ושעות רק אחרי שפורסמו. */
async function centerSpeech(k: RegKit, rules: DistRules, centerId: string, fallback: string): Promise<TlFile[]> {
  const c = await getSpokenCenter(centerId)
  if (rules.hoursPublished) return say(spokenCenterDetails(c) || fallback)
  return [...say(spokenCenterName(c) || fallback), ...k.files('center_hours_later')]
}

async function centerStep(
  k: RegKit, distributionId: string, rec: { id: string; center_id: string | null },
  rules: DistRules, lead: TlFile[], distName: string, name: string,
): Promise<TlResult> {
  const { params } = k.ctx
  if (Object.values(CENTER_VARS).some(v => tapped(params[v]) === 'ERROR')) return k.end('reg_center_later')

  const { centers, taken } = await openCenters(distributionId)
  const step = nextCenterStep({
    centers, taken, capacities: await centerCapacities(), currentCenterId: rec.center_id, centersOpen: true,
    tapped: {
      region: params[CENTER_VARS.region], city: params[CENTER_VARS.city],
      center: params[CENTER_VARS.center], confirm: params[CENTER_VARS.confirm],
    },
  })
  const bye = (files: TlFile[]): TlResponse[] => [{ type: 'simpleMessage', files }, hangup()]

  switch (step.kind) {
    case 'closed':
    case 'no_centers':
      return bye([...lead, ...k.files('reg_center_later'), ...k.files('reg_final')])
    case 'already':
      // כבר רשומים וכבר בחרו מוקד — אישור ופרטי המוקד.
      return bye([
        ...k.files('already', { name, distribution: distName }), ...k.files('center_already'),
        ...(await centerSpeech(k, rules, step.centerId, step.label)),
      ])
    case 'full':
      return bye(k.files('center_full'))
    case 'cancelled':
      return bye(k.files('reg_center_later'))
    case 'ask_region':
      return choose(CENTER_VARS.region, step.options.map((_, i) => i + 1), [
        ...lead, ...k.files('ask_region'), ...say(buildChoiceList(step.options)),
      ])
    case 'ask_city':
      return choose(CENTER_VARS.city, step.options.map(o => o.number), [
        ...lead, ...k.files('reg_to_centers'),
        ...say(step.options.map(o => `ל${o.city} הקישו ${o.number}`).join(' ')),
      ])
    case 'ask_center':
      return choose(CENTER_VARS.center, step.options.map((_, i) => i + 1), say(buildChoiceList(step.options.map(o => ({ label: o.name })))))
    case 'confirm':
      return menu(CENTER_VARS.confirm, ['1', '2'], k.files('center_confirm', { center: step.label }))
    case 'save': {
      const error = await saveCenterChoice(distributionId, rec.id, step.center.id)
      if (error) {
        console.error(`${LOG} save center failed`, error)
        return k.end('failed')
      }
      console.log(`${LOG} center chosen rec=${rec.id} center=${step.center.id}`)
      return bye([
        ...k.files('center_success', { center: step.label }),
        ...(rules.hoursPublished ? [] : k.files('center_hours_later')),
        ...k.files('reg_final'),
      ])
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// מקש 2 — שמיעת הזכאות: ת"ז + תאריך לידה (כמו ברישום), ואז:
//   נרשם ואושר → "נרשמתם ואושרתם" · נרשם וממתין → "ממתין לאישור"
//   לא נרשם, הרישום פתוח → "זכאים להגיש בקשה, להרשמה הקישו 1" (או סיבת החסימה)
//   לא נרשם, הרישום כבר לא פתוח → "זמן הרישום חלף"
// ⚠️ משתנים e_* — נפרדים מהרישום (r_*), כדי שמעבר בין מסלולים לא ידלג על שאלה.
// ─────────────────────────────────────────────────────────────────────────────
export const ELIG_VARS = { id: ['e_id', 'e_id2', 'e_id3', 'e_id4'], birth: ['e_bd', 'e_bd2', 'e_bd3', 'e_bd4'] } as const

export async function phoneEligibility(
  k: RegKit, distId: string, rules: DistRules, registrationOpen: boolean,
): Promise<TlResult> {
  const { callId } = k.ctx
  const idStage = stage(k, ELIG_VARS.id, (name, lead) =>
    askDigits(name, ID_DIGITS, [...lead, ...k.files('reg_ask_id')], { min: 1, maskLog: true, post: true }))
  if ('reply' in idStage) return idStage.reply
  if (idStage.value.length !== ID_DIGITS) return idStage.retry('id_invalid')
  const ben = await findRegistrantById(idStage.value)
  if (!ben) return idStage.retry('not_found')

  const birthPrompt = asksParentBirth(ben) ? 'reg_ask_birth_couple' : 'reg_ask_birth'
  const bdStage = stage(k, ELIG_VARS.birth, (name, lead) =>
    askDigits(name, 8, [...lead, ...k.files(birthPrompt)], { min: 1, maskLog: true, post: true }))
  if ('reply' in bdStage) return bdStage.reply
  if (checkRegistrantBirth(bdStage.value, idStage.value, ben) === 'mismatch') return bdStage.retry('reg_birth_mismatch')

  const name = readableName(ben)
  const rec = await getRecipient(distId, ben.id, 'id, approval_status')
  console.log(`${LOG} callId=${callId} eligibility ben=${ben.id} registered=${!!rec} open=${registrationOpen}`)
  if (rec) return k.end(rec.approval_status === 'approved' ? 'elig_registered_approved' : 'elig_registered_pending', { name })
  if (!registrationOpen) return k.end('elig_registration_passed', { name })
  if (!memberCanRegister(ben)) return k.end('not_eligible')
  if (blockedByDeepReview(rules, ben.eligibility_status)) return k.end('reg_deep_review')
  return k.end('elig_can_apply', { name })
}

// ─────────────────────────────────────────────────────────────────────────────
// מקש 3 — שמיעת המוקד שנבחר: שם המוקד, ואם הימים והשעות פורסמו — גם הם;
// אחרת "עדכון מדויק על מועד החלוקה במוקד יימסר בהמשך".
// ─────────────────────────────────────────────────────────────────────────────
export const CENTER_HEAR_VARS = ['h_id', 'h_id2', 'h_id3', 'h_id4'] as const

export async function phoneHearCenter(k: RegKit, distId: string, rules: DistRules): Promise<TlResult> {
  const idStage = stage(k, CENTER_HEAR_VARS, (name, lead) =>
    askDigits(name, ID_DIGITS, [...lead, ...k.files('reg_ask_id')], { min: 1, maskLog: true, post: true }))
  if ('reply' in idStage) return idStage.reply
  if (idStage.value.length !== ID_DIGITS) return idStage.retry('id_invalid')
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
