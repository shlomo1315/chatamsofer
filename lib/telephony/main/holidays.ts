// שלוחת החגים: תפריט → זכאות (1) · המוקד שנבחר (2) · חיבור כרטיס בנדרים (3) · בחירת מוקד (4, לא מוכרז).
// טיימאאוט בתפריט = מסלול הרישום לחלוקה הפתוחה (כמו בימות).
// חסר-מצב: השלב נקבע לפי הערכים שחזרו מהמרכזיה (ה-REQUEST מצטבר לאורך השיחה).
//
// ⚠️ שם משתנה חדש לכל ניסיון (collect_id, collect_id2...) — אותם שמות כמו בימות,
// כך שהלוגיקה, ההודעות והנוסחים זהים לחלוטין בשתי המרכזיות.
//
// הלוגיקה זהה לשלוחת ימות (app/api/webhooks/yemot-holiday), שנשארת עד שהמעבר ייבדק.
// ההודעות נערכות באותו מסך ניהול (getHolidayMessages). בשלב זה TTS בלבד — הקלטות בהמשך.
import { getHolidayMessages, type HolidayMessages } from '@/lib/yemotHolidayMessages'
import { getOpenDistribution, registerToOpenDistribution } from '@/lib/holidayDistributions'
import { linkHolidayCard } from '@/lib/holidayCards'
import { resolveCardFamily } from '@/lib/yemotCardIdentity'
import { digitsOnly } from '@/lib/idLookup'
import { recipientDeadlineState, formatCountdown } from '@/lib/centerDeadline'
import { pickupPhaseOf } from '@/lib/centerPickupPhase'
import { pickupClosedMessageKey } from '@/lib/holidayPickupClosedMessage'
import { centerStatusKey } from '@/lib/holidayCenterStatusMessage'
import { spokenCenterDetails } from '@/lib/holidayCenterSpeech'
import { centerLabel } from '@/lib/holidayCenterPick'
import { CENTER_VARS, buildChoiceList, nextCenterStep } from '@/lib/holidayCenterIvr'
import { askDigits, digits, fill, hangup, menu, say } from '../modules'
import type { TlContext, TlFile, TlResponse, TlResult } from '../types'
import {
  centerCapacities, centerOpening, clearFailedCard, findMemberById, findMembersByPhone, getCenter,
  getRecipient, getSpokenCenter, latestDistribution, loadCard, memberCanRegister, openCenters,
  pickupEverStarted, readableName, saveCenterChoice, type Member, type SpokenCenter,
} from './holidaysData'

const MENU_VAR = 'menu_pick'
const ID_DIGITS = 9
const ID_VARS = ['collect_id', 'collect_id2', 'collect_id3']
const CONFIRM_VARS = ['collect_confirm', 'collect_confirm2', 'collect_confirm3']
const ELIG_ID_VARS = ['elg_id', 'elg_id2', 'elg_id3']
const CENTER_ID_VARS = ['ctr_id', 'ctr_id2', 'ctr_id3']
const CARD_PICK_ID_VARS = ['crd_pick', 'crd_pick2', 'crd_pick3']
const CARD_VARS = ['crd_num', 'crd_num2', 'crd_num3']
const CARD_CONFIRM_VARS = ['crd_ok', 'crd_ok2', 'crd_ok3']
const CARD_MIN_DIGITS = 8
const CARD_MAX_DIGITS = 20

const LOG = '[telephony:main/holidays]'

let _msgCache: { at: number; data: HolidayMessages } | null = null
async function messages(): Promise<HolidayMessages> {
  if (_msgCache && Date.now() - _msgCache.at < 60_000) return _msgCache.data
  const data = await getHolidayMessages()
  _msgCache = { at: Date.now(), data }
  return data
}

// מרכזיה עלולה לשלוח את אותה פנייה פעמיים. שיוך וטעינה מתבצעים פעם אחת לכל שיחה+כרטיס.
const _linkDedup = new Map<string, { at: number; body: TlResult }>()
const LINK_DEDUP_MS = 90_000

const last4 = (card: string) => (card ? '****' + card.slice(-4) : '')
const tapped = (v: unknown) => String(v ?? '').trim()

/** הניסיון האחרון שבו הוקש ערך (אינדקס), או -1 אם עוד לא. */
function lastAttempt(params: Record<string, string>, vars: string[]): number {
  for (let i = vars.length - 1; i >= 0; i--) if (tapped(params[vars[i]])) return i
  return -1
}

type Vars = Record<string, string | TlFile>
type Kit = {
  ctx: TlContext
  files: (key: string, vars?: Vars) => TlFile[]
  end: (key: string, vars?: Vars) => TlResponse[]
  askId: (name: string, lead: TlFile[]) => TlResponse
}

function kit(ctx: TlContext, M: HolidayMessages): Kit {
  const files = (key: string, vars?: Vars) => fill(M[key]?.text ?? '', vars)
  return {
    ctx, files,
    end: (key, vars) => [{ type: 'simpleMessage', files: files(key, vars) }, hangup()],
    askId: (name, lead) => askDigits(name, ID_DIGITS, [...lead, ...files('ask_id')], { min: 1, maskLog: true, post: true }),
  }
}

/** בחירה מרשימת מספרים: ספרה אחת → תפריט עם מקשים מותרים; מספרים דו-ספרתיים → הקשה חופשית. */
function choose(name: string, numbers: number[], files: TlFile[]): TlResponse {
  if (numbers.every(n => n >= 1 && n <= 9)) return menu(name, numbers.map(String), files)
  return askDigits(name, Math.max(...numbers.map(n => String(n).length)), files, { min: 1 })
}

export async function holidays(ctx: TlContext): Promise<TlResult> {
  const k = kit(ctx, await messages())
  try {
    const choice = tapped(ctx.params[MENU_VAR])
    if (!choice) return menu(MENU_VAR, ['1', '2', '3', '4'], k.files('main_menu'))
    console.log(`${LOG} callId=${ctx.callId} route=${choice}`)
    if (choice === '1') return await eligibility(k)
    if (choice === '2') return await centers(k, 'hear')
    if (choice === '3') return await cardRoute(k)
    if (choice === '4') return await centers(k, 'pick')
    return await registration(k)
  } catch (e) {
    console.error(`${LOG} callId=${ctx.callId} error`, e instanceof Error ? e.message : e)
    return k.end('failed')
  }
}

/**
 * זיהוי לפי ת"ז שהוקשה, עד 3 ניסיונות. מחזיר את המשפחה, או תשובה למרכזיה (בקשה חוזרת/סיום).
 * ⚠️ ניסיון שגוי מבקש שוב בשם המשתנה הבא — ערך ישן לא נדרס ולא "מדלג" על שלב.
 */
async function identifyById(k: Kit, vars: string[]): Promise<{ ben: Member; attempt: number } | { reply: TlResult }> {
  const attempt = lastAttempt(k.ctx.params, vars)
  if (attempt < 0) return { reply: k.askId(vars[0], []) }
  const typed = digitsOnly(k.ctx.params[vars[attempt]])
  const hasNext = attempt + 1 < vars.length
  const retry = (key: string) => ({ reply: hasNext ? k.askId(vars[attempt + 1], k.files(key)) : k.end(key) })
  if (typed.length !== ID_DIGITS) return retry('id_invalid')
  const ben = await findMemberById(typed)
  if (!ben) {
    console.log(`${LOG} callId=${k.ctx.callId} id not found (attempt ${attempt + 1})`)
    return retry('not_found')
  }
  return { ben, attempt }
}

// ── טיימאאוט בתפריט: רישום לחלוקה הפתוחה ──
async function registration(k: Kit): Promise<TlResult> {
  const dist = await getOpenDistribution()
  if (!dist) return k.end('closed')
  const id = await identifyById(k, ID_VARS)
  if ('reply' in id) return id.reply
  const { ben, attempt } = id
  if (!memberCanRegister(ben)) return k.end('not_eligible')

  const name = readableName(ben)
  const distName = `${dist.name}${dist.year ? ` ${dist.year}` : ''}`
  if (await getRecipient(dist.id, ben.id, 'id')) return k.end('already', { name, distribution: distName })

  const confirmed = tapped(k.ctx.params[CONFIRM_VARS[attempt]])
  if (!confirmed) {
    return menu(CONFIRM_VARS[attempt], ['1'], [...k.files('identify', { name }), ...k.files('ask_confirm', { distribution: distName })])
  }
  if (confirmed !== '1') return k.end('cancelled')

  const result = await registerToOpenDistribution(ben.id, 'phone', { phone: k.ctx.phone })
  if (!result.ok) {
    console.error(`${LOG} register failed`, result.error)
    return k.end('failed')
  }
  console.log(`${LOG} registered ben=${ben.id} dist=${dist.id} created=${result.created}`)
  return k.end(result.created ? 'success' : 'already', { name, distribution: distName })
}

// ── מקש 1: בדיקת זכאות ──
async function eligibility(k: Kit): Promise<TlResult> {
  const id = await identifyById(k, ELIG_ID_VARS)
  if ('reply' in id) return id.reply
  const dist = await latestDistribution<{ id: string }>('id')
  if (!dist) return k.end('not_registered_dist')
  const rec = await getRecipient(dist.id, id.ben.id, 'approval_status')
  if (!rec) return k.end('not_registered_dist')
  return k.end(rec.approval_status === 'approved' ? 'eligible_yes' : 'eligible_pending')
}

// ── מקש 3: חיבור כרטיס — זיהוי לפי מספר המתקשר, שיוך בנדרים וטעינה ──
type CardDist = { id: string; amount_per_family: number | null; card_expiry: string | null; test_mode: boolean | null; pickup_open: boolean | null }

async function cardRoute(k: Kit): Promise<TlResult> {
  const { params, callId, phone } = k.ctx
  const dist = await latestDistribution<CardDist>('id, amount_per_family, card_expiry, test_mode, pickup_open')
  if (!dist) return k.end('closed')
  if (!dist.pickup_open) {
    const everStarted = await pickupEverStarted(dist.id)
    return k.end(pickupClosedMessageKey({ pickupOpen: false, everStarted }) ?? 'card_pickup_closed')
  }

  // זיהוי לפי מספר המתקשר; כמה משפחות על אותו מספר → בחירה לפי ת"ז.
  const candidates = await findMembersByPhone(phone)
  const pickAttempt = lastAttempt(params, CARD_PICK_ID_VARS)
  const typedPick = pickAttempt >= 0 ? digitsOnly(params[CARD_PICK_ID_VARS[pickAttempt]]) : ''
  const resolved = resolveCardFamily(candidates.map(c => ({ id: c.id, id_number: c.id_number })), typedPick)
  const askPick = (name: string, lead: TlFile[]) =>
    askDigits(name, ID_DIGITS, [...lead, ...k.files('card_ask_id_multi')], { min: 1, maskLog: true, post: true })
  if (!resolved.ok) {
    if (resolved.reason === 'phone_unknown') {
      console.log(`${LOG} callId=${callId} card: phone not registered`)
      return k.end('card_phone_unknown')
    }
    if (resolved.reason === 'need_id_choice') return askPick(CARD_PICK_ID_VARS[0], [])
    return pickAttempt + 1 < CARD_PICK_ID_VARS.length
      ? askPick(CARD_PICK_ID_VARS[pickAttempt + 1], k.files('card_id_not_on_phone'))
      : k.end('card_id_not_on_phone')
  }
  const ben = candidates.find(c => c.id === resolved.familyId)
  if (!ben) return k.end('failed')

  const rec = await getRecipient(dist.id, ben.id, 'id, center_id, approval_status, card_number, load_status')
  if (!rec) return k.end('not_found')
  if (rec.approval_status !== 'approved') return k.end('pending_approval')
  if (!rec.center_id) return k.end('card_no_center')
  // מוקד שטרם החל לחלק חוסם; מוקד שסיים — לא (מי שמחזיק כרטיס כבר היה שם).
  if (pickupPhaseOf(await centerOpening(dist.id, rec.center_id)) === 'not_started') return k.end('card_center_not_open')
  // כרטיס שכבר חובר — לא מחליפים (כסף שנטען היה נשאר על כרטיס שאיש אינו מחזיק).
  if (rec.card_number) return k.end('card_already')

  const askCard = (name: string, lead: TlFile[]) =>
    askDigits(name, CARD_MAX_DIGITS, [...lead, ...k.files('card_ask')], { min: 1, maskLog: true, post: true })
  const cAttempt = lastAttempt(params, CARD_VARS)
  if (cAttempt < 0) return askCard(CARD_VARS[0], k.files('identify', { name: readableName(ben) }))

  const card = digitsOnly(params[CARD_VARS[cAttempt]])
  const hasNext = cAttempt + 1 < CARD_VARS.length
  if (card.length < CARD_MIN_DIGITS) {
    return hasNext ? askCard(CARD_VARS[cAttempt + 1], k.files('card_invalid')) : k.end('card_invalid')
  }
  const confirm = tapped(params[CARD_CONFIRM_VARS[cAttempt]])
  if (!confirm) return menu(CARD_CONFIRM_VARS[cAttempt], ['1', '2'], k.files('card_readback', { card: digits(card) }), { times: 2, timeout: 7 })
  if (confirm === '2') return hasNext ? askCard(CARD_VARS[cAttempt + 1], []) : k.end('card_invalid')
  if (confirm !== '1') return k.end('cancelled')

  const key = callId ? `${callId}:${card}` : ''
  const now = Date.now()
  for (const [kk, v] of _linkDedup) if (now - v.at > LINK_DEDUP_MS) _linkDedup.delete(kk)
  const cached = key ? _linkDedup.get(key) : undefined
  if (cached) return cached.body
  const body = await linkAndLoad(k, dist, ben, rec, card)
  if (key) _linkDedup.set(key, { at: Date.now(), body })
  return body
}

async function linkAndLoad(
  k: Kit, dist: CardDist, ben: Member, rec: { id: string; load_status?: string | null }, card: string,
): Promise<TlResult> {
  const amount = Number(dist.amount_per_family ?? 0)
  if (!amount) {
    console.error(`${LOG} no amount for distribution ${dist.id}`)
    return k.end('card_failed', { reason: 'לא הוגדר סכום לחלוקה' })
  }
  const link = await linkHolidayCard(ben.id, card, { phone: k.ctx.phone || null, distributionId: dist.id })
  if (!link.ok) {
    console.error(`${LOG} link failed rec=${rec.id} card=${last4(card)}: ${link.error}`)
    return k.end('card_failed', { reason: link.error ?? '' })
  }
  if (rec.load_status === 'loaded') return k.end('card_success')

  try {
    const summary = await loadCard([{
      recipientId: rec.id, beneficiaryId: ben.id, idNumber: ben.id_number ?? null,
      name: ben.family_name ?? ben.full_name ?? '', spouseIdNumber: ben.spouse_id_number ?? null,
      familyName: ben.family_name ?? null, fullName: ben.full_name ?? null,
      nedarimIdHoliday: ben.nedarim_id_holiday ?? null,
    }], amount, { expiryIso: dist.card_expiry, testMode: !!dist.test_mode })
    const bad = summary.outcomes.find(o => !o.ok)
    if (bad) {
      // מנקים את מספר הכרטיס: השארתו הייתה חוסמת ניסיון חוזר על כרטיס שלא הוטען.
      await clearFailedCard(rec.id, bad.error ?? 'טעינה נכשלה')
      console.error(`${LOG} load failed rec=${rec.id}: ${bad.error}`)
      return k.end('card_failed', { reason: bad.error ?? '' })
    }
    console.log(`${LOG} card linked and loaded rec=${rec.id} card=${last4(card)}`)
    return k.end('card_success')
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'תקלה'
    await clearFailedCard(rec.id, msg)
    console.error(`${LOG} load threw rec=${rec.id}: ${msg}`)
    return k.end('card_failed', { reason: msg })
  }
}

// ── מקש 2: שמיעת המוקד שנבחר · מקש 4: בחירת מוקד ──
type CentersDist = { id: string; centers_open: boolean | null; centers_deadline: string | null; centers_deadline_extended: string | null }

/** פרטי המוקד להקראה: כתובת ושעות, ואם אין — שם המוקד בלבד. */
const spoken = (s: SpokenCenter | null, fallback: string) => say(spokenCenterDetails(s) || fallback)

async function centers(k: Kit, mode: 'hear' | 'pick'): Promise<TlResult> {
  const { params } = k.ctx
  const dist = await latestDistribution<CentersDist>('id, centers_open, centers_deadline, centers_deadline_extended')
  if (!dist) return k.end('centers_closed')
  const id = await identifyById(k, CENTER_ID_VARS)
  if ('reply' in id) return id.reply
  const { ben } = id
  const rec = await getRecipient(dist.id, ben.id, 'id, center_id, approval_status, load_status, source, deadline_extended')
  if (!rec) return k.end('not_eligible')
  const { centers: list, taken } = await openCenters(dist.id)

  if (mode === 'hear') {
    if (!rec.center_id) return k.end('center_none')
    const c = list.find(x => x.id === rec.center_id) ?? (await getCenter(rec.center_id))
    const label = centerLabel(c) ?? ''
    const phase = pickupPhaseOf(await centerOpening(dist.id, rec.center_id))
    if (phase === 'ended') return k.end('card_center_ended')
    const readyKey = centerStatusKey({ centerPickupOpen: phase === 'active', loaded: rec.load_status === 'loaded' })
    const details = spoken(await getSpokenCenter(rec.center_id), label)
    return [{ type: 'simpleMessage', files: [...k.files(readyKey), ...details] }, hangup()]
  }

  // לא התקבלה בחירה אחרי כל החזרות בתפריט — מסיימים במקום לחזור על השאלה בלי סוף.
  if (Object.values(CENTER_VARS).some(v => tapped(params[v]) === 'ERROR')) return k.end('cancelled')

  const dl = recipientDeadlineState(dist.centers_deadline ?? null, dist.centers_deadline_extended ?? null, rec)
  const approved = rec.approval_status === 'approved'
  const gateOpen = !!dist.centers_open && approved && !dl.closed
  const countdown = dl.msLeft !== null && !dl.closed ? k.files('centers_countdown', { left: formatCountdown(dl.msLeft) }) : []

  const step = nextCenterStep({
    centers: list, taken, capacities: await centerCapacities(), currentCenterId: rec.center_id, centersOpen: gateOpen,
    tapped: {
      region: params[CENTER_VARS.region], city: params[CENTER_VARS.city],
      center: params[CENTER_VARS.center], confirm: params[CENTER_VARS.confirm],
    },
  })

  switch (step.kind) {
    case 'closed':
      return k.end(!dist.centers_open ? 'centers_closed' : !approved ? 'pending_approval' : 'centers_deadline_over')
    case 'no_centers':
      return k.end('centers_closed')
    case 'already': {
      const details = spoken(await getSpokenCenter(step.centerId), step.label)
      return [{ type: 'simpleMessage', files: [...k.files('center_already'), ...details] }, hangup()]
    }
    case 'full':
      return k.end('center_full')
    case 'cancelled':
      return k.end('cancelled')
    case 'ask_region':
      return choose(CENTER_VARS.region, step.options.map((_, i) => i + 1), [
        ...k.files('centers_intro'), ...countdown, ...k.files('ask_region'), ...say(buildChoiceList(step.options)),
      ])
    case 'ask_city':
      // המספר הוא של העיר (מתפרסם מראש), ולא מיקום ברשימה — ולכן יכול להיות דו-ספרתי.
      return choose(CENTER_VARS.city, step.options.map(o => o.number), [
        ...k.files('identify', { name: readableName(ben) }), ...k.files('centers_intro'), ...countdown,
        ...k.files('ask_city_intro'), ...say(step.options.map(o => `ל${o.city} הקישו ${o.number}`).join(' ')),
      ])
    case 'ask_center':
      return choose(CENTER_VARS.center, step.options.map((_, i) => i + 1), say(buildChoiceList(step.options.map(o => ({ label: o.name })))))
    case 'confirm':
      return menu(CENTER_VARS.confirm, ['1', '2'], k.files('center_confirm', { center: step.label }))
    case 'save': {
      const error = await saveCenterChoice(dist.id, rec.id, step.center.id)
      if (error) {
        console.error(`${LOG} save center failed`, error)
        return k.end('failed')
      }
      console.log(`${LOG} center chosen ben=${ben.id} center=${step.center.id}`)
      return k.end('center_success', { center: step.label })
    }
  }
}
