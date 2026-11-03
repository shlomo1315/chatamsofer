// שלוחת היולדות: זיהוי לפי מספר המתקשר → לידה פעילה → הקשת כרטיס נדרים → אישור → שיוך בנדרים.
// חסר-מצב: השלב נקבע לפי הערכים שחזרו מהמרכזיה (ה-REQUEST מצטבר לאורך השיחה).
//
// ⚠️ שם משתנה חדש לכל ניסיון (card1, ok1, card2, ok2...): ערך ישן שנשאר ב-REQUEST
// לא יכול "לדלג" בשמנו על שלב, ואין צורך לסמוך על סדר הביצוע של removeParams.
//
// הלוגיקה זהה לשלוחת ימות (app/api/webhooks/yemot-maternity), שנשארת עד שהמעבר ייבדק.
// פעולות הרישום נשארות באותם שמות (yemot_card_registered וכו') — כך המסכים, הדוחות
// ובדיקת "כרטיס כבר משויך" עובדים על שתי המרכזיות יחד.
import { getNedarimCreds, setMagneticCard, findClientByZeout, getClientCardFull } from '@/lib/nedarim'
import { getMaternityMessages, type MaternityMessages } from '@/lib/yemotMaternityMessages'
import { canLinkMaternityCard } from '@/lib/maternityCardGate'
import { askDigits, digits, fill, goTo, goodbye, hangup, menu } from '../modules'
import { normalizePhone } from '../shared/phone'
import type { TlFile, TlHandler, TlResponse, TlResult } from '../types'
import {
  findActiveAid, isCardRegistered, logActivity, markPickedUp, saveLinkError, saveNedarimId, setCardNumber,
  type Aid, type Family,
} from './maternityData'

const CARD_DIGITS = 16
const MAX_ATTEMPTS = 5
const cardVar = (n: number) => `card${n}`
const okVar = (n: number) => `ok${n}`

const CHANNEL = 'technoline'

let _msgCache: { at: number; data: MaternityMessages } | null = null
async function messages(): Promise<MaternityMessages> {
  if (_msgCache && Date.now() - _msgCache.at < 60_000) return _msgCache.data
  const data = await getMaternityMessages()
  _msgCache = { at: Date.now(), data }
  return data
}

// מרכזיה עלולה לשלוח את אותה פנייה פעמיים. שיוך בנדרים מתבצע פעם אחת לכל שיחה+כרטיס.
const _linkDedup = new Map<string, { at: number; body: TlResult }>()
const LINK_DEDUP_MS = 90_000

/** הניסיון האחרון שהוקש בו כרטיס (1..5), או 0 אם עוד לא. */
function lastAttempt(params: Record<string, string>): number {
  for (let n = MAX_ATTEMPTS; n >= 1; n--) if (String(params[cardVar(n)] ?? '').trim()) return n
  return 0
}

/** מספר כרטיס לרישום — 4 ספרות אחרונות בלבד. */
const last4 = (card: string) => (card ? '****' + card.slice(-4) : '')

export const maternity: TlHandler = async ({ phone, callId, params }) => {
  if (!phone) return goodbye('שגיאה במספר המתקשר')
  const caller = normalizePhone(phone)
  const [M, found] = await Promise.all([messages(), findActiveAid(caller)])

  const files = (key: string, vars?: Record<string, string | TlFile>) => fill(M[key]?.text ?? '', vars)
  const end = (key: string, vars?: Record<string, string | TlFile>): TlResponse[] =>
    [{ type: 'simpleMessage', files: files(key, vars) }, hangup()]
  const askCard = (n: number, lead: TlFile[]): TlResponse =>
    askDigits(cardVar(n), CARD_DIGITS, [...lead, ...files('ask_card')], { min: 1, maskLog: true, post: true })

  const n = lastAttempt(params)
  const card = n ? String(params[cardVar(n)]).trim() : ''
  console.log(`[telephony:main/maternity] callId=${callId} attempt=${n} card=${last4(card)} lookup=${found.kind}`)

  if (found.kind === 'error') {
    console.error('[telephony:main/maternity] DB error', found.error)
    return end('system_error')
  }

  // ── שלב הכרטיס והאישור ──
  if (n) {
    if (found.kind !== 'active') return end('system_error')
    const { aid, family, familyName } = found
    if (aid.status !== 'active') return end('pending_approval')
    if (!canLinkMaternityCard(aid)) return end('card_not_allocated')

    const confirm = String(params[okVar(n)] ?? '').trim()
    if (!confirm) {
      if (!/^\d+$/.test(card) || card.length !== CARD_DIGITS) {
        return n < MAX_ATTEMPTS ? askCard(n + 1, files('card_length')) : end('card_length')
      }
      await setCardNumber(aid.id, card)
      return menu(okVar(n), ['1', '2'], files('card_readback', { card: digits(card) }), { times: 2, timeout: 7 })
    }
    if (confirm === '1') return linkCard({ aid, family, familyName, card, caller, callId, end })
    if (confirm === '2' && n < MAX_ATTEMPTS) {
      await setCardNumber(aid.id, null)
      return askCard(n + 1, [])
    }
    if (confirm === '2') return goodbye('יותר מדי ניסיונות אנא נסי שוב מאוחר יותר או פני למשרד')
    return goodbye('לא התקבלה בחירה אנא חייגי שוב')
  }

  // ── שלב 1: זיהוי ──
  if (found.kind === 'notFound') {
    await logActivity('yemot_phone_not_found', 'phone', null, { caller, callId, channel: CHANNEL, note: 'מספר לא קיים במערכת' })
    const menuPath = process.env.TECHNOLINE_MAIN_EXT_MENU?.trim()
    return menuPath ? [{ type: 'simpleMessage', files: files('not_found') }, goTo(menuPath)] : end('not_found')
  }
  if (found.kind === 'noBirth') {
    await logActivity('yemot_no_active_birth', 'beneficiary', found.familyId, {
      caller, callId, channel: CHANNEL, beneficiary_id: found.familyId, family_name: found.familyName,
    })
    return end('no_birth')
  }

  const { aid, familyName } = found
  if (aid.status !== 'active') {
    await logActivity('yemot_pending_approval', 'maternity_aid', aid.id, { caller, callId, channel: CHANNEL, family_name: familyName, status: aid.status })
    return end('pending_approval')
  }
  // לא נוכה לה כרטיס מהמלאי — כרטיס שקיבלה בלי שובר אינו שלה (ראו lib/maternityCardGate).
  if (!canLinkMaternityCard(aid)) {
    await logActivity('yemot_card_not_allocated', 'maternity_aid', aid.id, {
      caller, callId, channel: CHANNEL, family_name: familyName, card_status: aid.card_status, card_load_status: aid.card_load_status,
    })
    return end('card_not_allocated')
  }

  const existing = String(aid.card_number ?? '').trim()
  if (existing) {
    if (await isCardRegistered(aid.id)) {
      await logActivity('yemot_card_already_linked', 'maternity_aid', aid.id, { caller, callId, channel: CHANNEL, family_name: familyName, card_number_last4: existing.slice(-4) })
      return end('card_already_linked', { card: digits(existing) })
    }
    // מספר תקוע מהקלדה שלא הושלמה — מנקים כדי לאפשר חיבור מחדש
    await setCardNumber(aid.id, null)
  }

  return askCard(1, [...files('identify', { name: familyName }), ...files('welcome')])
}

type LinkArgs = {
  aid: Aid; family: Family; familyName: string; card: string; caller: string; callId: string
  end: (key: string, vars?: Record<string, string | TlFile>) => TlResponse[]
}

async function linkCard(a: LinkArgs): Promise<TlResult> {
  const key = a.callId ? `${a.callId}:${a.card}` : ''
  const now = Date.now()
  for (const [k, v] of _linkDedup) if (now - v.at > LINK_DEDUP_MS) _linkDedup.delete(k)
  const cached = key ? _linkDedup.get(key) : undefined
  if (cached) return cached.body
  const body = await doLink(a)
  if (key) _linkDedup.set(key, { at: Date.now(), body })
  return body
}

async function doLink({ aid, family, familyName, card, caller, callId, end }: LinkArgs): Promise<TlResult> {
  const creds = await getNedarimCreds()
  if (!creds) {
    console.error('[telephony:main/maternity] nedarim not configured')
    return end('system_error')
  }
  // מזהה נדרים מהרשומה; אם חסר — איתור לפי ת"ז ושמירה.
  let nedarimId = family.nedarim_id ? String(family.nedarim_id) : null
  if (!nedarimId && family.id_number) {
    try {
      nedarimId = await findClientByZeout(creds, String(family.id_number))
      if (nedarimId) await saveNedarimId(family.id, nedarimId)
    } catch (e) { console.error('[telephony:main/maternity] findClientByZeout failed', e) }
  }
  if (!nedarimId) {
    await logActivity('yemot_error', 'maternity_aid', aid.id, { caller, callId, channel: CHANNEL, family_name: familyName, error: 'אין nedarim_id למשפחה (גם לא נמצא לפי ת"ז)' })
    return end('not_in_nedarim')
  }

  let ok = false, msg = ''
  const attempt = async (id: string) => {
    try { const r = await setMagneticCard(creds, id, card, { timeoutMs: 12_000 }); ok = r.ok; msg = r.message }
    catch (e) { msg = e instanceof Error ? e.message : String(e) }
  }
  await attempt(nedarimId)

  // 🔴 מזהה שמור שנדרים אינה מכירה (נמחק/מוזג) — מאתרים מחדש לפי שתי הת"ז ומנסים שוב.
  if (!ok && /לא מוכר|לא נמצא|not found/i.test(msg)) {
    let fresh: string | null = null
    for (const z of [family.id_number, family.spouse_id_number].filter(Boolean)) {
      if (fresh) break
      try { fresh = await findClientByZeout(creds, String(z)) } catch { /* המועמד הבא */ }
    }
    if (fresh && fresh !== nedarimId) {
      console.warn(`[telephony:main/maternity] nedarim_id ${nedarimId} אינו מוכר — מאותר מחדש כ-${fresh}`)
      nedarimId = fresh
      await saveNedarimId(family.id, fresh)
      await attempt(fresh)
    }
  }

  // נדרים לעיתים משייך ומחזיר שגיאה — "כבר משויך" או כרטיס שמופיע אצלם = הצלחה.
  const already = !ok && (isAlreadyMsg(msg) || (await cardLinkedInNedarim(creds, nedarimId, card)))
  if (!ok && !already) {
    console.error(`[telephony:main/maternity] setMagneticCard failed: ${msg}`)
    await logActivity('yemot_error', 'maternity_aid', aid.id, {
      caller, callId, channel: CHANNEL, family_name: familyName, error: msg, card_number_last4: card.slice(-4), nedarim_id: nedarimId,
    })
    await saveLinkError(aid.id, `שיוך כרטיס בטלפון נכשל — תגובת נדרים: ${msg}`)
    return goodbye(`הפעולה נכשלה הסיבה ${msg || 'שגיאה טכנית'}`)
  }

  const { centerName, firstTime } = await markPickedUp(aid, card)
  if (firstTime) {
    await logActivity('yemot_card_registered', 'maternity_aid', aid.id, {
      caller, callId, channel: CHANNEL, family_name: familyName, card_number_last4: card.slice(-4), nedarim_id: nedarimId, center: centerName,
    })
    try {
      const { cancelCardPickupReminders } = await import('@/lib/scheduledMail')
      await cancelCardPickupReminders(aid.id)
    } catch (e) { console.error('[telephony:main/maternity] ביטול תזכורות איסוף נכשל:', e) }
  }
  console.log(`[telephony:main/maternity] card linked aid=${aid.id} firstTime=${firstTime} already=${already}`)
  return end('link_success', { center: centerName })
}

const isAlreadyMsg = (m: string) => /משפחה\s*זו|כבר\s*(מוגדר|מוגד|משוי|משויך)|(מוגדר|משויך|משוי)\S*\s*למשפחה/.test(m)

async function cardLinkedInNedarim(creds: NonNullable<Awaited<ReturnType<typeof getNedarimCreds>>>, clientId: string, card: string) {
  try {
    const full = await getClientCardFull(creds, clientId)
    const cards = (full as { Cards?: unknown } | null)?.Cards
    if (!Array.isArray(cards)) return false
    return (cards as Record<string, unknown>[]).some((c) =>
      !c.RemovedDate && [c.MagneticCard, c.CardNumber].some((v) => String(v ?? '').replace(/\D/g, '') === card))
  } catch { return false }
}
