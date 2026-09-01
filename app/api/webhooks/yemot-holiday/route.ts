// ─────────────────────────────────────────────────────────────────────────────
// Webhook לימות המשיח — שלוחת הרישום לחלוקת חגים.
//
// ⚠️ שלב א' — *רישום ראשוני בלבד*. שיוך הכרטיס, הטעינה והמוקדים נעשים בשלב הבא
// ואינם בשלוחה הזו. לכן אין תפריט: המשפחה מזוהה, שומעת את שם החלוקה, ומקישה 1.
// שיחה של 15 שניות.
//
// ⚠️ למה זה הערוץ המרכזי: חלק גדול מהמשפחות אינן גולשות. רישום שדורש ממשק היה
// מדיר אותן לגמרי, ולכן הרישום הטלפוני הוא זה שקובע זכאות.
//
// ⚠️ הזיהוי הוא לפי *תעודת זהות שמוקשת בשיחה*, ולא לפי המספר שממנו התקשרו: על
// אותו מספר יכולים להיות רשומים כמה נרשמים (הורים וילדים נשואים באותו בית),
// וזיהוי לפי טלפון היה רושם את הכרטסת הלא נכונה — טעות שקטה שאיש לא היה מגלה
// עד החלוקה עצמה. הטלפון עדיין נשמר על הרישום, לתיעוד בלבד.
//
// ⚠️ מי יכול להירשם: רק מי שיש לו *כרטסת משלו* באיגוד הצאצאים. מי שמופיע כילד
// בכרטסת של הוריו אינו רשום באיגוד בעצמו — החיפוש הוא מול טבלת הצאצאים בלבד,
// ולכן ת"ז שלו לא תימצא והוא ישמע שעליו להירשם קודם לאיגוד.
//
// פרוטוקול התגובה (זהה לשלוחת היולדות):
//   • הודעה:      id_list_message=<token>      (token = t-<טקסט TTS> או f-<קובץ>)
//   • קליטת הקשה: read=<token>=<valName>,<re_enter>,<max>,<min>,<sec>,No,no,no,,<digits>,,,,
//   • ניתוק:      go_to_folder=hangup
//   • פקודות מופרדות ב-"&". טקסט TTS אסור שיכיל: . - " ' & |
//
// ⚠️ fail-closed על ApiToken: השלוחה יוצרת רישום שגורר תקציב, ולכן בקשה בלי
// אימות נדחית — כולל כשהסוד עצמו אינו מוגדר.
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { deadlineState, formatCountdown } from '@/lib/centerDeadline'
import { getServiceClient } from '@/lib/apiAuth'
import { getOpenDistribution, registerToOpenDistribution } from '@/lib/holidayDistributions'
import { getHolidayMessages, type HolidayMessages } from '@/lib/yemotHolidayMessages'
import { digitsOnly, idOrFilter, sameId } from '@/lib/idLookup'
import { centerLabel, type CenterRow } from '@/lib/holidayCenterPick'
import { runLoadBatch } from '@/lib/holidayCardLoad'
import {
  CENTER_VARS, buildChoiceList, loadOpenCenters, nextCenterStep,
} from '@/lib/holidayCenterIvr'

export const dynamic = 'force-dynamic'

// ⚠️ משתנה חדש לכל ניסיון: קריאה חוזרת של משתנה שכבר מלא יוצרת לולאה אינסופית
// בימות. שלושה ניסיונות להקשת ת"ז — טעות בהקשה של 9 ספרות שכיחה, ולנתק אחריה
// היה מאלץ את המתקשר לחייג שוב.
const ID_VARS = ['collect_id', 'collect_id2', 'collect_id3']
const CONFIRM_VARS = ['collect_confirm', 'collect_confirm2', 'collect_confirm3']
const ID_DIGITS = 9

/** בחירת התפריט הראשי. ⚠️ שם ייחודי — התנגשות עם משתנה קיים = לולאה. */
const MENU_VAR = 'menu_pick'
/** ת"ז למסלול המוקדים — נפרד מ-ID_VARS כדי שמסלול אחד לא ידרוס את השני. */
const CENTER_ID_VARS = ['ctr_id', 'ctr_id2', 'ctr_id3']

// ── מקש 2: חיבור כרטיס נדרים ──
// ⚠️ משתנים נפרדים לחלוטין ממסלולי הרישום והמוקד: ימות מחזירה בכל בקשה גם
// את ההקשות הקודמות, ושימוש חוזר במשתנה של מסלול אחר היה גורם למסלול
// "לדלג" על שלב שהמתקשר מעולם לא ביצע.
const CARD_ID_VARS = ['crd_id', 'crd_id2', 'crd_id3']
const CARD_VARS = ['crd_num', 'crd_num2', 'crd_num3']
const CARD_CONFIRM_VARS = ['crd_ok', 'crd_ok2', 'crd_ok3']
/** ⚠️ מינימום ספרות בכרטיס נדרים — קצר מזה הוא בוודאות שגיאת הקשה. */
const CARD_MIN_DIGITS = 8

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b))
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// TTS של ימות אינו סובל את התווים האלה — מסירים אותם ולא נותנים להם לשבור שיחה.
// ⚠️ כולל גרש (׳) וגרשיים (״) עבריים — הם מופיעים בקיצורי שנה ("תשפ״ז") ושיבשו
// את ההקראה. הסרתם משאירה "תשפז", שימות מקריאה כמילה תקינה.
const tts = (t: string) => String(t ?? '').replace(/[.\-"'&|׳״]/g, ' ').replace(/\s+/g, ' ').trim()
const tToken = (t: string) => `t-${tts(t)}`
const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const idMessage = (...tokens: string[]) => `id_list_message=${joinTokens(...tokens)}`
const goToFolder = (target: string) => `go_to_folder=${target}`

type ReadOpts = { max?: number | ''; min?: number; wait?: number; allowed?: (string | number)[] }
function readTap(valName: string, promptTokens: string[], opts: ReadOpts = {}): string {
  const { max = '', min = 1, wait = 15, allowed } = opts
  const ops = [
    valName, 'yes',
    max === '' ? '' : String(max), String(min), String(wait),
    'No', 'no', 'no', '',
    allowed && allowed.length ? allowed.join('.') : '',
    '', '', '', '',
  ]
  return `read=${joinTokens(...promptTokens)}=${ops.join(',')}`
}

/** בקשת הקשת ת"ז — עם הודעת הקדמה אופציונלית (ת"ז לא תקינה / לא נמצאה). */
function askIdCommand(msgs: HolidayMessages, varName: string, prefixKey?: string): string {
  return readTap(varName, [
    prefixKey ? msgToken(msgs, prefixKey) : '',
    msgToken(msgs, 'ask_id'),
  ].filter(Boolean), { max: ID_DIGITS, min: 1 })
}

function yemotText(commands: string[], callId?: string) {
  const body = commands.join('&') + '&'
  console.log(`[yemot-holiday] response${callId ? ` (callId=${callId})` : ''}: ${body}`)
  return new NextResponse(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

const msgToken = (msgs: HolidayMessages, key: string, repl?: Record<string, string>) => {
  const m = msgs[key]
  if (m?.audio) return `f-${m.audio}`
  let t = m?.text ?? ''
  if (repl) for (const [k, v] of Object.entries(repl)) t = t.replaceAll(`{${k}}`, v)
  // ⚠️ טקסט ריק מחזיר מחרוזת ריקה ולא "t-": מנהל שמוחק נוסח הודעה
  // היה יוצר טוקן ריק בתשובה לימות, ואין לדעת איך היא מגיבה לו.
  // הקוראים מסננים אותו ב-filter(Boolean) וב-joinTokens.
  if (!t.trim()) return ''
  return tToken(t)
}

type Member = {
  id: string
  family_name?: string | null
  full_name?: string | null
  spouse_name?: string | null
  id_number?: string | null
  spouse_id_number?: string | null
  is_active?: boolean | null
  eligibility_status?: string | null
}

// ⚠️ כרטסת שאינה פתוחה לרישום: לא-פעילה, או שנדחתה. רישום של משפחה שנדחתה
// יוצר התחייבות תקציבית למי שהארגון החליט לא לאשר — ולכן נחסם ומוסבר בשיחה.
// כרטסת שממתינה לאישור *כן* נרשמת: היא רשומה באיגוד, והאישור לחלוקה נפרד.
/**
 * השם שמוקרא בשיחה — שם משפחה ואחריו השם הפרטי.
 *
 * ⚠️ full_name ולא spouse_name: full_name הוא שמו הפרטי של הבעל, וזה
 * מה שהמתקשר מצפה לשמוע. צירוף spouse_name היה גורם לשלוחה להקריא
 * "משפחת <שם האישה>".
 *
 * ⚠️ מקור אחד לכל המסלולים: הרישום, בחירת המוקד וחיבור הכרטיס חייבים
 * להקריא בדיוק אותו שם, אחרת אותו אדם נשמע אחרת בכל מסלול.
 *
 * ⚠️ שם ריק אפשרי (רשומות ישנות בלי שם כלל) — הקורא מסנן טוקן ריק.
 */
function readableName(m: Member): string {
  const family = m.family_name?.trim() ?? ''
  const first = m.full_name?.trim() ?? ''
  if (family && first) return `${family} ${first}`
  return family || first
}

function memberCanRegister(m: Member): boolean {
  if (m.is_active === false) return false
  return m.eligibility_status !== 'rejected'
}

/**
 * איתור הכרטסת לפי תעודת הזהות שהוקשה — של הבעל או של האישה, שתיהן על אותה
 * כרטסת משפחתית.
 *
 * ⚠️ החיפוש הוא בטבלת הצאצאים בלבד ולא בילדים שרשומים בתוך כרטסת של הורה:
 * הרישום לחלוקה פתוח רק למי שיש לו כרטסת משלו באיגוד.
 *
 * ⚠️ מחפשים בכמה גרסאות של המספר (עם ואפילו בלי אפס מוביל) — ת"ז נשמרה במאגר
 * בכמה צורות, והשוואה אחת מדויקת הייתה מחזירה "לא נמצא" למשפחה שכן רשומה.
 */
async function findMemberById(idNumber: string): Promise<Member | null> {
  const db = getServiceClient()
  if (!db) return null
  const filter = idOrFilter(idNumber, ['id_number', 'spouse_id_number'])
  if (!filter) return null
  const { data } = await db
    .from('beneficiaries')
    .select('id, full_name, family_name, spouse_name, id_number, spouse_id_number, is_active, eligibility_status')
    .or(filter)
    .limit(5)
  const rows = (data ?? []) as Member[]
  // אימות חוזר בקוד — כדי שלא נסתמך על צורת השמירה במסד
  const exact = rows.filter(r => sameId(r.id_number, idNumber) || sameId(r.spouse_id_number, idNumber))
  // מעדיפים כרטסת שיכולה להירשם — כדי ששתי כרטסות היסטוריות (אחת לא פעילה)
  // לא יחסמו משפחה שדווקא כן רשומה כראוי.
  return exact.find(memberCanRegister) ?? exact[0] ?? null
}

/**
 * מסלול 3 (בחירת מוקד) ומסלול 4 (שמיעת המוקד שנבחר).
 *
 * 🔴 אינו תלוי בשער הרישום: בחירת המוקדים נפתחת דווקא *אחרי* שהרישום
 * נסגר, ולכן היא נשלטת ב-centers_open בלבד.
 *
 * ⚠️ הכללים עצמם ב-lib/holidayCenterPick ו-lib/holidayCenterIvr, כדי
 * שהטלפון והממשק הדיגיטלי לא ייפרדו זה מזה.
 */
/**
 * מסלול 2 — חיבור כרטיס נדרים שהמשפחה קיבלה במוקד.
 *
 * 🔴 סדר הפעולות: קודם מוקד, אחר כך כרטיס. הכרטיס נמסר *במוקד*, ולכן מי
 * שטרם בחר מוקד אין לו כרטיס ביד — ובקשה להקיש מספר הייתה שולחת אותו
 * לחפש משהו שאינו קיים.
 *
 * ⚠️ אינו תלוי בשער הרישום: החיבור מתרחש אחרי שהרישום נסגר ואחרי
 * שהמוקדים חילקו. בדיקת getOpenDistribution כאן הייתה מנתקת את השיחה.
 *
 * ⚠️ אישור הספרות לפני השיוך — כמו בשלוחת היולדות: הקשה שגויה משייכת
 * כרטיס של משפחה אחרת, וזו טעות שאי אפשר לתקן בטלפון.
 */
async function handleCardRoute(
  params: Record<string, string>,
  msgs: HolidayMessages,
  callId: string,
): Promise<NextResponse> {
  const db = getServiceClient()
  if (!db) return yemotText([idMessage(msgToken(msgs, 'failed')), goToFolder('hangup')], callId)

  // ⚠️ החלוקה האחרונה ולא getOpenDistribution — ראו handleCenterRoute.
  const { data: distRow } = await db.from('distributions')
    .select('id, amount_per_family, card_expiry, test_mode')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const dist = distRow as {
    id: string; amount_per_family: number | null
    card_expiry: string | null; test_mode: boolean | null
  } | null
  if (!dist) return yemotText([idMessage(msgToken(msgs, 'closed')), goToFolder('hangup')], callId)

  // ── זיהוי ──
  let attempt = -1
  for (let i = CARD_ID_VARS.length - 1; i >= 0; i--) {
    if (String(params[CARD_ID_VARS[i]] ?? '').trim()) { attempt = i; break }
  }
  if (attempt < 0) {
    return yemotText([readTap(CARD_ID_VARS[0], [msgToken(msgs, 'ask_id')], { max: ID_DIGITS, min: 1 })], callId)
  }

  const typedId = digitsOnly(params[CARD_ID_VARS[attempt]])
  const hasNextTry = attempt + 1 < CARD_ID_VARS.length
  if (typedId.length !== ID_DIGITS) {
    if (hasNextTry) {
      return yemotText([readTap(CARD_ID_VARS[attempt + 1],
        [msgToken(msgs, 'id_invalid'), msgToken(msgs, 'ask_id')], { max: ID_DIGITS, min: 1 })], callId)
    }
    return yemotText([idMessage(msgToken(msgs, 'id_invalid')), goToFolder('hangup')], callId)
  }

  const ben = await findMemberById(typedId)
  if (!ben) {
    if (hasNextTry) {
      return yemotText([readTap(CARD_ID_VARS[attempt + 1],
        [msgToken(msgs, 'not_found'), msgToken(msgs, 'ask_id')], { max: ID_DIGITS, min: 1 })], callId)
    }
    return yemotText([idMessage(msgToken(msgs, 'not_found')), goToFolder('hangup')], callId)
  }

  const { data: recRow } = await db.from('distribution_recipients')
    .select('id, center_id, approval_status, card_number, load_status')
    .eq('distribution_id', dist.id).eq('beneficiary_id', ben.id).maybeSingle()
  const rec = recRow as {
    id: string; center_id: string | null; approval_status: string | null
    card_number: string | null; load_status: string | null
  } | null

  // לא רשום לחלוקה — אין למה לחבר כרטיס.
  if (!rec) return yemotText([idMessage(msgToken(msgs, 'not_found')), goToFolder('hangup')], callId)

  // ⚠️ ממתין לאישור — ולא "כרטסת שאינה פעילה". ראו ההערה בשער הבחירה.
  if (rec.approval_status !== 'approved') {
    return yemotText([idMessage(msgToken(msgs, 'pending_approval')), goToFolder('hangup')], callId)
  }

  // 🔴 השער האמיתי של המסלול: בלי מוקד אין כרטיס ביד.
  if (!rec.center_id) {
    return yemotText([idMessage(msgToken(msgs, 'card_no_center')), goToFolder('hangup')], callId)
  }

  // ⚠️ כרטיס שכבר חובר — לא מציעים לחבר שוב. חיבור שני היה מחליף כרטיס
  // שכבר הוטען, כלומר כסף שנשאר על כרטיס שאיש אינו מחזיק.
  if (rec.card_number) {
    return yemotText([idMessage(msgToken(msgs, 'card_already')), goToFolder('hangup')], callId)
  }

  // ── הקשת מספר הכרטיס ──
  let cAttempt = -1
  for (let i = CARD_VARS.length - 1; i >= 0; i--) {
    if (String(params[CARD_VARS[i]] ?? '').trim()) { cAttempt = i; break }
  }
  if (cAttempt < 0) {
    // 🔴 הזיהוי נאמר לפני הבקשה: המתקשר חייב לדעת שהמערכת זיהתה *אותו*
    // לפני שהוא מוסר מספר כרטיס. בלי זה הוא מקיש בעיוורון, ומי שהקיש
    // ת"ז שגויה משייך כרטיס למשפחה אחרת בלי לדעת.
    return yemotText([readTap(CARD_VARS[0], [
      msgToken(msgs, 'identify', { name: readableName(ben) }),
      msgToken(msgs, 'card_ask'),
      // ⚠️ סינון טוקן ריק: הודעה שנוסחה נמחק מייצרת "t-" ריק, וימות
      // מגיבה לו בצורה בלתי צפויה במקום לדלג עליו.
    ].filter(Boolean), { max: '', min: 1 })], callId)
  }

  const card = digitsOnly(params[CARD_VARS[cAttempt]])
  const hasNextCard = cAttempt + 1 < CARD_VARS.length
  if (card.length < CARD_MIN_DIGITS) {
    if (hasNextCard) {
      return yemotText([readTap(CARD_VARS[cAttempt + 1],
        [msgToken(msgs, 'card_invalid'), msgToken(msgs, 'card_ask')], { max: '', min: 1 })], callId)
    }
    return yemotText([idMessage(msgToken(msgs, 'card_invalid')), goToFolder('hangup')], callId)
  }

  // ── אישור הספרות ──
  // ⚠️ הספרות מוקראות מופרדות בפסיקים — אחרת ימות מקריאה מספר ארוך
  // כמילה אחת ואי אפשר לאמת אותו באוזן.
  const confirm = String(params[CARD_CONFIRM_VARS[cAttempt]] ?? '').trim()
  if (!confirm) {
    return yemotText([readTap(CARD_CONFIRM_VARS[cAttempt], [
      msgToken(msgs, 'card_readback', { card: card.split('').join(', ') + ' , ,' }),
    ], { max: 1, min: 1, allowed: [1, 2] })], callId)
  }

  // תיקון (2) — מבקשים מספר חדש במשתנה הבא, אחרת קריאה חוזרת של משתנה
  // מלא יוצרת לולאה אינסופית בימות.
  if (confirm === '2') {
    if (hasNextCard) {
      return yemotText([readTap(CARD_VARS[cAttempt + 1], [msgToken(msgs, 'card_ask')], { max: '', min: 1 })], callId)
    }
    return yemotText([idMessage(msgToken(msgs, 'card_invalid')), goToFolder('hangup')], callId)
  }

  // ── שיוך וטעינה ──
  // 🔴 אותו מנגנון בדיוק שהמסך הניהולי משתמש בו (runLoadBatch): מימוש
  // שני היה נפרד ממנו בשקט — מצב בדיקה, תקרת חנויות ותוקף הכרטיס כולם
  // יושבים שם, ושכפולם היה יוצר שתי התנהגויות שונות לאותה פעולה.
  const amount = Number(dist.amount_per_family ?? 0)
  if (!amount) {
    console.error(`[yemot-holiday] אין סכום לחלוקה ${dist.id} — לא ניתן לטעון`)
    return yemotText([
      idMessage(msgToken(msgs, 'card_failed', { reason: 'לא הוגדר סכום לחלוקה' })),
      goToFolder('hangup'),
    ], callId)
  }

  // ⚠️ הכרטיס נשמר *לפני* הטעינה: runLoadBatch קורא אותו מהרשומה.
  const { error: saveErr } = await db.from('distribution_recipients')
    .update({ card_number: card, card_linked_at: new Date().toISOString(), card_link_error: null })
    .eq('id', rec.id).is('card_number', null)
  if (saveErr) {
    console.error('[yemot-holiday] שמירת מספר הכרטיס נכשלה:', saveErr.message)
    return yemotText([
      idMessage(msgToken(msgs, 'card_failed', { reason: 'שגיאה טכנית בשמירה' })),
      goToFolder('hangup'),
    ], callId)
  }

  try {
    const summary = await runLoadBatch(db, [{
      recipientId: rec.id,
      idNumber: ben.id_number ?? null,
      name: ben.family_name ?? ben.full_name ?? '',
      spouseIdNumber: ben.spouse_id_number ?? null,
      familyName: ben.family_name ?? null,
      fullName: ben.full_name ?? null,
    }], amount, { expiryIso: dist.card_expiry, testMode: !!dist.test_mode })

    const bad = summary.outcomes.find(o => !o.ok)
    if (bad) {
      // ⚠️ מנקים את מספר הכרטיס: השארתו חוסמת ניסיון חוזר ("כרטיס כבר
      // מחובר") על כרטיס שלא הוטען — כלומר משפחה בלי כסף ובלי דרך לתקן.
      await db.from('distribution_recipients')
        .update({ card_number: null, card_linked_at: null, card_link_error: bad.error ?? 'טעינה נכשלה' })
        .eq('id', rec.id)
      console.error(`[yemot-holiday] טעינה נכשלה rec=${rec.id}: ${bad.error}`)
      // 🔴 הסיבה המדויקת נאמרת למתקשר — "אירעה תקלה" סתמית שולחת
      // את כולם למשרד, גם את מי שרק הקיש כרטיס של מישהו אחר.
      return yemotText([
        idMessage(msgToken(msgs, 'card_failed', { reason: bad.error ?? '' })),
        goToFolder('hangup'),
      ], callId)
    }

    console.log(`[yemot-holiday] כרטיס חובר והוטען rec=${rec.id} card=****${card.slice(-4)}`)
    return yemotText([idMessage(msgToken(msgs, 'card_success')), goToFolder('hangup')], callId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'תקלה'
    await db.from('distribution_recipients')
      .update({ card_number: null, card_linked_at: null, card_link_error: msg })
      .eq('id', rec.id)
    console.error('[yemot-holiday] טעינה זרקה:', msg)
    return yemotText([
      idMessage(msgToken(msgs, 'card_failed', { reason: msg })),
      goToFolder('hangup'),
    ], callId)
  }
}

async function handleCenterRoute(
  choice: string,
  params: Record<string, string>,
  msgs: HolidayMessages,
  callId: string,
): Promise<NextResponse> {
  const db = getServiceClient()
  if (!db) return yemotText([idMessage(msgToken(msgs, 'failed')), goToFolder('hangup')], callId)

  // החלוקה האחרונה — ⚠️ לא getOpenDistribution: היא מחזירה null כשהרישום
  // סגור, וזה בדיוק המצב שבו בחירת המוקדים פעילה.
  //
  // ⚠️ הטבלה היא distributions ולא holiday_distributions: לשם מצביע
  // distribution_recipients.distribution_id (אומת ב-FK), ומשם קורא גם
  // lib/holidayDistributions. קריאה מהטבלה השנייה הייתה מחזירה חלוקה
  // אחרת לגמרי, והבחירה לא הייתה נמצאת לעולם.
  const { data: distRow } = await db.from('distributions')
    .select('id, centers_open, centers_deadline')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const dist = distRow as {
    id: string; centers_open: boolean; centers_deadline: string | null
  } | null
  if (!dist) return yemotText([idMessage(msgToken(msgs, 'centers_closed')), goToFolder('hangup')], callId)

  // ── זיהוי ──
  let attempt = -1
  for (let i = CENTER_ID_VARS.length - 1; i >= 0; i--) {
    if (String(params[CENTER_ID_VARS[i]] ?? '').trim()) { attempt = i; break }
  }
  if (attempt < 0) {
    return yemotText([readTap(CENTER_ID_VARS[0], [msgToken(msgs, 'ask_id')], { max: ID_DIGITS, min: 1 })], callId)
  }

  const typedId = digitsOnly(params[CENTER_ID_VARS[attempt]])
  const hasNextTry = attempt + 1 < CENTER_ID_VARS.length
  if (typedId.length !== ID_DIGITS) {
    if (hasNextTry) {
      return yemotText([readTap(CENTER_ID_VARS[attempt + 1],
        [msgToken(msgs, 'id_invalid'), msgToken(msgs, 'ask_id')], { max: ID_DIGITS, min: 1 })], callId)
    }
    return yemotText([idMessage(msgToken(msgs, 'id_invalid')), goToFolder('hangup')], callId)
  }

  const ben = await findMemberById(typedId)
  if (!ben) {
    if (hasNextTry) {
      return yemotText([readTap(CENTER_ID_VARS[attempt + 1],
        [msgToken(msgs, 'not_found'), msgToken(msgs, 'ask_id')], { max: ID_DIGITS, min: 1 })], callId)
    }
    return yemotText([idMessage(msgToken(msgs, 'not_found')), goToFolder('hangup')], callId)
  }

  // ⚠️ רק מי שרשום לחלוקה יכול לבחור מוקד — הבחירה נשמרת על הרשומה שלו.
  // ⚠️ approval_status — שער הבחירה, ראו הערך המחושב למטה.
  // ⚠️ load_status נשלף כדי להבחין בין "בחרת מוקד" ל"הכרטיס מוכן":
  // מי שהכרטיס שלו כבר טעון מתקשר בעקבות הצינתוק, וההודעה שהוא צריך
  // לשמוע היא איפה לאסוף — לא אישור על בחירה שעשה לפני שבועיים.
  const { data: recRow } = await db.from('distribution_recipients')
    .select('id, center_id, approval_status, load_status')
    .eq('distribution_id', dist.id).eq('beneficiary_id', ben.id).maybeSingle()
  const rec = recRow as {
    id: string; center_id: string | null; approval_status: string | null
    load_status: string | null
  } | null
  if (!rec) return yemotText([idMessage(msgToken(msgs, 'not_eligible')), goToFolder('hangup')], callId)

  const { centers, taken } = await loadOpenCenters(db, dist.id)

  // ── מסלול 4: שמיעה בלבד ──
  if (choice === '4') {
    if (!rec.center_id) return yemotText([idMessage(msgToken(msgs, 'center_none')), goToFolder('hangup')], callId)
    const c = centers.find(x => x.id === rec.center_id)
      ?? (await db.from('holiday_centers').select('id, city, name, region, sort_order')
        .eq('id', rec.center_id).maybeSingle()).data as CenterRow | null
    const label = centerLabel(c) ?? ''

    // 🔴 שתי הודעות שונות לשני מצבים.
    //
    // מי שהכרטיס שלו כבר נטען מתקשר בעקבות הצינתוק, והשאלה שלו היא
    // "איפה אני אוסף". אישור על בחירה שעשה לפני שבועיים אינו עונה
    // עליה, ומשאיר אותו מתקשר למשרד.
    //
    // ⚠️ בלי שעות ובלי תאריכים בשתיהן — מועדי החלוקה טרם נקבעו,
    // והקראתם כאן הייתה מוסרת מידע שישתנה.
    const readyKey = rec.load_status === 'loaded' ? 'card_ready' : 'center_already'
    return yemotText([
      idMessage(msgToken(msgs, readyKey, { center: label })),
      goToFolder('hangup'),
    ], callId)
  }

  // ── מסלול 3: בחירה ──
  const capacities: Record<string, number | null> = {}
  const { data: caps } = await db.from('holiday_centers').select('id, capacity')
  for (const r of (caps ?? []) as { id: string; capacity: number | null }[]) capacities[r.id] = r.capacity

  // ─────────────────────────────────────────────────────────────────────
  // 🔴 השער האפקטיבי — שלושה תנאים, לא אחד.
  //
  // ⚠️ nextCenterStep מקבלת centersOpen בודד, ולכן שלושת השערים
  // מחושבים כאן לערך אחד. בלי זה הטלפון היה מאפשר בדיוק את מה שהאתר
  // חוסם — וזה מה שקרה בפועל: 87 משפחות שאינן מאושרות בחרו מוקד.
  // ─────────────────────────────────────────────────────────────────────
  const dl = deadlineState(dist.centers_deadline ?? null)
  const approved = rec.approval_status === 'approved'
  const gateOpen = !!dist.centers_open && approved && !dl.closed

  // 🔴 הספירה לאחור שתושמע לפני הבחירה.
  //
  // ⚠️ מחרוזת ריקה כשאין מועד — msgToken על טקסט ריק אינו מוסיף דבר
  // לתשובה, ולכן אין צורך בהסתעפות בכל מקום שמשמיע אותה.
  const countdown = dl.msLeft !== null && !dl.closed
    ? msgToken(msgs, 'centers_countdown', { left: formatCountdown(dl.msLeft) })
    : ''

  const step = nextCenterStep({
    centers, taken, capacities,
    currentCenterId: rec.center_id,
    centersOpen: gateOpen,
    tapped: {
      region: params[CENTER_VARS.region], city: params[CENTER_VARS.city],
      center: params[CENTER_VARS.center], confirm: params[CENTER_VARS.confirm],
    },
  })

  switch (step.kind) {
    case 'closed': {
      // ⚠️ הודעה לפי הסיבה: "סגור" למי שממתין לאישור שולח אותו למשרד,
      // בזמן שהוא רק צריך לדעת שהבקשה בבדיקה.
      // 🔴 pending_approval ולא not_eligible: מי שממתין לאישור שמע
      // "הכרטסת שלכם אינה פעילה, פנו למשרד" — הודעה שגויה שנשלחה
      // ל-6,048 משפחות שרשומות כראוי. ההמתנה היא המצב התקין בשלב הזה.
      const key = !dist.centers_open ? 'centers_closed'
        : !approved ? 'pending_approval'
        : 'centers_deadline_over'
      return yemotText([idMessage(msgToken(msgs, key)), goToFolder('hangup')], callId)
    }
    case 'no_centers':
      return yemotText([idMessage(msgToken(msgs, 'centers_closed')), goToFolder('hangup')], callId)
    case 'already':
      return yemotText([idMessage(msgToken(msgs, 'center_already', { center: step.label })), goToFolder('hangup')], callId)
    case 'full':
      return yemotText([idMessage(msgToken(msgs, 'center_full')), goToFolder('hangup')], callId)
    case 'cancelled':
      return yemotText([idMessage(msgToken(msgs, 'cancelled')), goToFolder('hangup')], callId)

    case 'ask_region':
      // ⚠️ הספירה אחרי ההסבר ולפני התפריט: לפניו היא נשמעת כאזהרה
      // מנותקת, ואחרי התפריט המאזין כבר מקיש ואינו שומע אותה.
      return yemotText([readTap(CENTER_VARS.region, [
        msgToken(msgs, 'centers_intro'),
        countdown,
        tToken(`${msgs.ask_region?.text ?? ''} ${buildChoiceList(step.options)}`),
      ].filter(Boolean), { max: 1, min: 1, allowed: step.options.map((_, i) => i + 1) })], callId)

    case 'ask_city':
      // 🔴 המספר הוא של *העיר* ולא מיקום ברשימה.
      //
      // ⚠️ שלושת הערכים למטה חייבים להיגזר מ-number ולא מהאינדקס:
      //   · ההקראה — "לרכסים הקישו 18" ולא "הקישו 4"
      //   · allowed — אחרת הקשה 18 נדחית כלא חוקית
      //   · max     — אורך המספר הגדול ביותר. נגזר ממספר האפשרויות,
      //     4 ערים היו נותנות ספרה אחת, וימות הייתה קוטעת את "18" ל-"1"
      //     ושולחת את המתקשר לירושלים.
      // 🔴 ההסבר והספירה מושמעים כאן ולא רק ב-ask_region.
      //
      // ⚠️ זה היה באג שקט: שכבת האזורים נעקפת (רוב הערים הן מוקד יחיד),
      // ולכן המסלול בפועל מגיע ישר ל-ask_city — ו-centers_intro
      // והספירה לאחור לא נשמעו לאיש. המשפחה לא שמעה שהבחירה סופית,
      // שהכרטיס נמסר רק במוקד שנבחר, וכמה זמן נותר לבחור.
      //
      // ⚠️ הסדר: הסבר → ספירה → הקדמה → רשימה. הספירה לפני הרשימה
      // ולא אחריה, כי מרגע שהרשימה מתחילה המאזין כבר מקיש.
      // 🔴 הזיהוי ראשון: בחירת מוקד היא סופית, והמתקשר חייב לדעת שהמערכת
      // זיהתה *אותו* לפני שהוא בוחר. מי שהקיש ת"ז שגויה היה בוחר מוקד
      // למשפחה אחרת — ואי אפשר לבטל.
      return yemotText([readTap(CENTER_VARS.city, [
        msgToken(msgs, 'identify', { name: readableName(ben) }),
        msgToken(msgs, 'centers_intro'),
        countdown,
        msgToken(msgs, 'ask_city_intro'),
        // ─────────────────────────────────────────────────────────────
        // 🔴 ההקלטה קודמת לרשימה הנבנית.
        //
        // ⚠️ כאן נשלח תמיד tToken — טקסט גולמי — גם כשלמנהל כבר היה
        // קובץ ElevenLabs מוכן. שתי תוצאות: העריכה שלו לא נשמעה
        // (הקובץ התעלם), וימות נאלצה לייצר קול ל-18 ערים בזמן אמת —
        // מה שהוסיף כחצי דקה של שקט לפני כל בחירה.
        //
        // ⚠️ נופלים לרשימה הנבנית כשאין הקלטה: היא תמיד מדויקת, בעוד
        // שהקלטה מתיישנת ברגע שמוקד נפתח או נסגר.
        // ─────────────────────────────────────────────────────────────
        msgs.ask_city?.audio
          ? msgToken(msgs, 'ask_city')
          : tToken(step.options.map(o => `ל${o.city} הקישו ${o.number}`).join(' ')),
      ].filter(Boolean), {
        max: Math.max(...step.options.map(o => String(o.number).length)),
        min: 1,
        allowed: step.options.map(o => o.number),
      })], callId)

    case 'ask_center':
      return yemotText([readTap(CENTER_VARS.center, [
        // ⚠️ נשאר טקסט חי: רשימת המוקדים *בתוך עיר* משתנה לפי העיר
        // שנבחרה, ולכן קובץ אחד אינו יכול לשרת אותה. ראו ask_city.
        tToken(buildChoiceList(step.options.map(o => ({ label: o.name })))),
      ], {
        // אותה נגזרת כמו בערים — ראו ההערה למעלה.
        max: String(step.options.length).length,
        min: 1,
        allowed: step.options.map((_, i) => i + 1),
      })], callId)

    case 'confirm':
      // 🔴 אזהרת הסופיות מושמעת כאן — *לפני* האישור.
      return yemotText([readTap(CENTER_VARS.confirm, [
        msgToken(msgs, 'center_confirm', { center: step.label }),
      ], { max: 1, min: 1, allowed: [1, 2] })], callId)

    case 'save': {
      const { error } = await db.from('distribution_recipients').update({
        center_id: step.center.id,
        center_chosen_at: new Date().toISOString(),
        center_source: 'phone',
      }).eq('id', rec.id).is('center_id', null)   // ⚠️ תנאי המרוץ: לא לדרוס בחירה שנשמרה בינתיים

      if (error) {
        console.error('[yemot-holiday] שמירת מוקד נכשלה:', error.message)
        return yemotText([idMessage(msgToken(msgs, 'failed')), goToFolder('hangup')], callId)
      }
      console.log(`[yemot-holiday] מוקד נבחר: ben=${ben.id} → ${step.center.id} (${step.label})`)
      return yemotText([idMessage(msgToken(msgs, 'center_success', { center: step.label })), goToFolder('hangup')], callId)
    }
  }
}

export async function handleHolidayCall(params: Record<string, string>): Promise<NextResponse> {
  const apiPhone = String(params['ApiPhone'] ?? '').trim()
  const callId = String(params['ApiCallId'] ?? '').trim()

  const secret = process.env.YEMOT_WEBHOOK_SECRET
  if (!secret) {
    console.error('[yemot-holiday] YEMOT_WEBHOOK_SECRET אינו מוגדר — דחיית כל הבקשות (fail-closed)')
    return yemotText([idMessage(tToken('אין הרשאה')), goToFolder('hangup')], callId)
  }
  if (!safeEqual(params['ApiToken'] ?? '', secret)) {
    console.warn('[yemot-holiday] ApiToken שגוי — דחייה')
    return yemotText([idMessage(tToken('אין הרשאה')), goToFolder('hangup')], callId)
  }

  const msgs = await getHolidayMessages()

  // ── תפריט ראשי ────────────────────────────────────────────────────────────
  // 🔴 התפריט ממומש כאן ולא כ-type=menu בימות: שלוחה 6 נשארת כפי שהיא
  // מוגדרת, ואיננו נוגעים בהגדרה של מסלול רישום שעובד בפרודקשן.
  //
  // ⚠️ התפריט קודם ל-getOpenDistribution *במכוון*. קודם השער רץ בראש
  // הוובהוק וניתק את השיחה כשהרישום סגור — אבל בחירת המוקדים נפתחת
  // דווקא אחרי שהרישום נסגר, כך שמסלול 3 לא היה נגיש כלל. עכשיו כל
  // מסלול בודק את השער שלו בנפרד.
  const choice = String(params[MENU_VAR] ?? '').trim()
  if (!choice) {
    return yemotText([
      readTap(MENU_VAR, [msgToken(msgs, 'main_menu')], { max: 1, min: 1, allowed: [1, 2, 3, 4] }),
    ], callId)
  }

  // מסלולים 3 ו-4 — בחירת מוקד ושמיעתו. אינם תלויים בשער הרישום.
  if (choice === '3' || choice === '4') {
    return handleCenterRoute(choice, params, msgs, callId)
  }

  // מסלול 2 — חיבור כרטיס נדרים. גם הוא אינו תלוי בשער הרישום: הכרטיס
  // נמסר במוקד אחרי שהרישום נסגר.
  if (choice === '2') {
    return handleCardRoute(params, msgs, callId)
  }


  // ⚠️ getOpenDistribution בודק גם את מתג-האב של המחלקה (הגדרות → שערי מחלקות),
  // ולכן סגירה שם מכבה את מסלול הרישום.
  const dist = await getOpenDistribution()
  if (!dist) {
    return yemotText([idMessage(msgToken(msgs, 'closed')), goToFolder('hangup')], callId)
  }

  // ── הקשת תעודת הזהות ──────────────────────────────────────────────────────
  // ימות מחזירה בכל בקשה גם את ההקשות הקודמות, ולכן מאתרים את הניסיון האחרון.
  let attempt = -1
  for (let i = ID_VARS.length - 1; i >= 0; i--) {
    if (String(params[ID_VARS[i]] ?? '').trim()) { attempt = i; break }
  }
  if (attempt < 0) {
    return yemotText([askIdCommand(msgs, ID_VARS[0])], callId)
  }

  const typedId = digitsOnly(params[ID_VARS[attempt]])
  const hasNextTry = attempt + 1 < ID_VARS.length

  // ⚠️ אורך בלבד ולא ספרת ביקורת: כרטסת שנשמרה עם מספר שאינו עובר את הביקורת
  // (או דרכון) קיימת במאגר, וחסימה על הביקורת הייתה מונעת ממנה להירשם. מספר
  // שאינו קיים אצלנו ממילא ייפול על "לא נמצא".
  if (typedId.length !== ID_DIGITS) {
    if (hasNextTry) return yemotText([askIdCommand(msgs, ID_VARS[attempt + 1], 'id_invalid')], callId)
    return yemotText([idMessage(msgToken(msgs, 'id_invalid')), goToFolder('hangup')], callId)
  }

  const ben = await findMemberById(typedId)
  if (!ben) {
    console.log(`[yemot-holiday] ת"ז שהוקשה אינה רשומה באיגוד (ניסיון ${attempt + 1})`)
    // טעות בהקשה של 9 ספרות שכיחה — מבקשים שוב במשתנה הבא, ולא מנתקים מיד
    if (hasNextTry) return yemotText([askIdCommand(msgs, ID_VARS[attempt + 1], 'not_found')], callId)
    return yemotText([idMessage(msgToken(msgs, 'not_found')), goToFolder('hangup')], callId)
  }
  if (!memberCanRegister(ben)) {
    console.log(`[yemot-holiday] ben=${ben.id} כרטסת אינה פתוחה לרישום (active=${ben.is_active}, status=${ben.eligibility_status})`)
    return yemotText([idMessage(msgToken(msgs, 'not_eligible')), goToFolder('hangup')], callId)
  }

  const name = readableName(ben)
  const distName = `${dist.name}${dist.year ? ` ${dist.year}` : ''}`

  // ⚠️ כבר רשום — בכל ערוץ (אתר, מייל, נדרים או שיחה קודמת). נאמר לו זאת *לפני*
  // שמציעים לו להקיש 1, כדי שלא יאשר רישום שכבר קיים ויחשוב שהיה כפול.
  const db = getServiceClient()
  if (db) {
    const { data: already } = await db.from('distribution_recipients')
      .select('id').eq('distribution_id', dist.id).eq('beneficiary_id', ben.id).maybeSingle()
    if (already) {
      return yemotText([idMessage(msgToken(msgs, 'already', { name, distribution: distName })), goToFolder('hangup')], callId)
    }
  }

  // שלב האישור — 1 לרישום. המשתנה משויך לניסיון ה-ת"ז הנוכחי, כדי שהקשה מניסיון
  // קודם לא תיחשב אישור לזיהוי חדש.
  const confirmed = String(params[CONFIRM_VARS[attempt]] ?? '').trim()
  if (!confirmed) {
    return yemotText([
      readTap(CONFIRM_VARS[attempt], [
        msgToken(msgs, 'identify', { name }),
        msgToken(msgs, 'ask_confirm', { distribution: distName }),
      ], { max: 1, min: 1, allowed: [1] }),
    ], callId)
  }
  if (confirmed !== '1') {
    return yemotText([idMessage(msgToken(msgs, 'cancelled')), goToFolder('hangup')], callId)
  }

  const result = await registerToOpenDistribution(ben.id, 'phone', { phone: apiPhone })
  if (!result.ok) {
    console.error('[yemot-holiday] register failed:', result.error)
    return yemotText([idMessage(msgToken(msgs, 'failed')), goToFolder('hangup')], callId)
  }
  console.log(`[yemot-holiday] נרשם: ${ben.id} (${name}) לחלוקה ${dist.id} · created=${result.created}`)
  return yemotText([
    idMessage(msgToken(msgs, result.created ? 'success' : 'already', { name, distribution: distName })),
    goToFolder('hangup'),
  ], callId)
}

function paramsFromSearch(url: URL): Record<string, string> {
  const out: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { out[k] = v })
  return out
}

export async function GET(request: NextRequest) {
  return handleHolidayCall(paramsFromSearch(new URL(request.url)))
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const params = paramsFromSearch(url)
  try {
    const ct = request.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      Object.assign(params, await request.json())
    } else {
      const form = await request.formData()
      form.forEach((v, k) => { params[k] = String(v) })
    }
  } catch { /* ימות שולחת לעיתים ב-query בלבד */ }
  return handleHolidayCall(params)
}
