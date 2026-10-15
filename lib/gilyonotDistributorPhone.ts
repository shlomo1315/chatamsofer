import { ttsClean } from '@/lib/bookFairYemotIvr'
import { MAX_QUANTITY } from '@/lib/gilyonotDistributors'

// ─────────────────────────────────────────────────────────────────────────────
// שלוחת המפיצים בימות המשיח (מערכת ומספר נפרדים). המפיץ מזוהה לפי מספר הטלפון.
//
// הלוגיקה כאן טהורה: מה המתקשר שומע בכל שלב, ואיזו פעולה צריך לבצע. ה-webhook
// (app/api/webhooks/yemot-gilyonot) טוען את המפיץ ואת ההגדרות ומבצע את הפעולה.
//
// בלי טבלת מצב: ימות שולחת בכל פנייה את כל המשתנים שנאספו בשיחה, ולכן המצב נגזר מהם.
//   מפיץ רשום: (בחירת מקום, אם יש כמה) → ברכה עם הכמות → תפריט → פעולה → תודה וניתוק.
//   מספר לא רשום: הרשמה לסעודת ההילולא, או נציג בשעות הפעילות.
// ─────────────────────────────────────────────────────────────────────────────

export const DM_PICK = 'dm_pick'
export const DM_MENU = 'dm_menu'
export const DM_QTY = 'dm_qty'
export const DM_LEAVE = 'dm_leave'
export const DM_GUESTS = 'dm_guests'
export const DM_REC = 'dm_rec'
export const MAX_PICK = 9
export const MAX_GUESTS = 50
const MAX_RECORD_SECONDS = 90

const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const t = (text: string) => `t-${ttsClean(text)}`
const hangup = 'go_to_folder=hangup'
const say = (...texts: string[]) => `id_list_message=${joinTokens(...texts.map(t))}&${hangup}`

// 14 שדות ו-'No','no','no', כמו בשלוחת הקוויטלאך ובחגים וביולדות שעובדות.
function readDigit(varName: string, tokens: string[], keys: string[]): string {
  const ops = [varName, 'no', '1', '1', '10', 'No', 'no', 'no', '', keys.join('.'), '', '', '', '']
  return `read=${joinTokens(...tokens)}=${ops.join(',')}`
}

// מספר של כמה ספרות, מסתיים בסולמית
function readNumber(varName: string, tokens: string[], maxDigits: number): string {
  const ops = [varName, 'no', String(maxDigits), '1', '15', 'No', 'no', 'no', '', '', '', '', '', '']
  return `read=${joinTokens(...tokens)}=${ops.join(',')}`
}

// 'record' ולא 'voice': עם 'voice' חוזרות ההקשות במקום נתיב הקובץ (ראה bookFairYemotIvr).
function readRecord(varName: string, tokens: string[]): string {
  return `read=${joinTokens(...tokens)}=${[varName, '', 'record', String(MAX_RECORD_SECONDS), '9'].join(',')}`
}

export interface PhoneDistributor { id: string; full_name: string; quantity: number; city: string | null; synagogue: string | null }

export interface PhoneContext {
  distributors: PhoneDistributor[]
  /** יש מספר מזוהה (לא חסוי) */
  hasPhone: boolean
  agentPhone: string | null
  agentOpen: boolean
}

export type RecordingPurpose = 'issue' | 'address' | 'note'

export type DistributorPhoneAction =
  | { kind: 'quantity'; distributorId: string; action: 'received' | 'increase' | 'decrease'; quantity: number }
  | { kind: 'leave'; distributorId: string }
  | { kind: 'recording'; distributorId: string; purpose: RecordingPurpose; path: string; transcript: string | null }
  | { kind: 'hilula'; distributorId: string | null; guests: number }
  | null

export interface DistributorPhoneTurn { reply: string; action: DistributorPhoneAction }

const done = (reply: string, action: DistributorPhoneAction = null): DistributorPhoneTurn => ({ reply, action })
const digitsOnly = (v: string | undefined) => (/^\d+$/.test((v ?? '').trim()) ? Number(v!.trim()) : null)
const placeName = (d: PhoneDistributor) => [d.synagogue, d.city].filter(Boolean).join(' ב') || d.full_name

/** הנציג: חיוג יוצא בשעות הפעילות. ⚠️ routing_yemot ולא go_to_folder (ראה ivrRuntime). */
function toAgent(ctx: PhoneContext): string | null {
  const digits = (ctx.agentPhone ?? '').replace(/\D/g, '')
  return ctx.agentOpen && digits ? `id_list_message=${t('מעבירים אתכם לנציג, נא להמתין')}&routing_yemot=${digits}` : null
}

const RECORD_PROMPTS: Record<RecordingPurpose, string> = {
  issue: 'נא תארו אחרי הצליל את התקלה. בסיום הקישו סולמית',
  address: 'נא אמרו אחרי הצליל את הכתובת החדשה המלאה, כולל העיר. בסיום הקישו סולמית',
  note: 'הנציג אינו זמין כעת. השאירו הודעה אחרי הצליל, והמשרד יחזור אליכם. בסיום הקישו סולמית',
}
const RECORD_THANKS: Record<RecordingPurpose, string> = {
  issue: 'הדיווח התקבל, והמשרד יטפל בו בהקדם. תודה ושלום',
  address: 'הכתובת החדשה התקבלה. המשרד יעדכן אותה ויודיע לשליח. תודה ושלום',
  note: 'ההודעה התקבלה, והמשרד יחזור אליכם. תודה ושלום',
}

function recordingStep(params: Record<string, string>, distributorId: string, purpose: RecordingPurpose): DistributorPhoneTurn {
  const rec = (params[DM_REC] ?? '').trim()
  if (!rec) return done(readRecord(DM_REC, [t(RECORD_PROMPTS[purpose])]))
  // "Digits-..." הוא הקשות ולא הקלטה (כך עונה ימות כשאין קובץ)
  if (/^Digits[-=]/i.test(rec)) return done(say('לא התקבלה הקלטה. נא להתקשר שוב'))
  const transcript = (params[`${DM_REC}_voice`] ?? '').trim() || null
  return done(say(RECORD_THANKS[purpose]), { kind: 'recording', distributorId, purpose, path: rec, transcript })
}

function hilulaStep(params: Record<string, string>, distributorId: string | null): DistributorPhoneTurn {
  const raw = params[DM_GUESTS]
  if (!raw) return done(readNumber(DM_GUESTS, [t('הרשמה לסעודת ההילולא. כמה משתתפים, כולל אתכם? הקישו את המספר ובסיום סולמית')], 2))
  const guests = digitsOnly(raw)
  if (!guests || guests > MAX_GUESTS) return done(say(`מספר המשתתפים צריך להיות בין 1 ל-${MAX_GUESTS}. נא להתקשר שוב`))
  return done(
    say(`נרשמה בקשה ל-${guests} משתתפים בסעודת ההילולא. ${distributorId ? 'כמפיצים, יש לכם קדימות. ' : ''}המשרד יאשר את ההשתתפות. תודה ושלום`),
    { kind: 'hilula', distributorId, guests },
  )
}

function unknownCaller(params: Record<string, string>, ctx: PhoneContext): DistributorPhoneTurn {
  const agent = toAgent(ctx)
  const menu = params[DM_MENU] ?? ''
  if (menu === '1' && ctx.hasPhone) return hilulaStep(params, null)
  if (menu === '2' && agent) return done(agent)
  const intro = 'שלום, כאן מערך המפיצים של גיליונות החתם סופר. המספר שממנו התקשרתם אינו רשום כמפיץ.'
  if (!ctx.hasPhone) return done(agent ?? say(intro, 'כדי להשתמש בקו נא להתקשר ממספר מזוהה. תודה ושלום'))
  const options = ['להרשמה לסעודת ההילולא הקישו 1.', ...(agent ? ['לשיחה עם נציג הקישו 2.'] : [])]
  return done(readDigit(DM_MENU, [t(`${intro} ${options.join(' ')}`)], agent ? ['1', '2'] : ['1']))
}

export const MENU_TEXT = [
  'לדיווח על קבלת הגיליונות הקישו 1.',
  'לדיווח על תקלה 2.',
  'לבקשת תוספת 3.',
  'לבקשת הפחתה 4.',
  'לעדכון כתובת 5.',
  'להפסקת ההפצה 6.',
  'להרשמה לסעודת ההילולא 7.',
  'לשיחה עם נציג 8.',
].join(' ')

export function distributorPhoneTurn(params: Record<string, string>, ctx: PhoneContext): DistributorPhoneTurn {
  const list = ctx.distributors.slice(0, MAX_PICK)
  if (!list.length) return unknownCaller(params, ctx)

  // אדם אחד יכול להפיץ בכמה מקומות: בוחרים קודם על איזה מהם מדובר
  let d = list[0]
  if (list.length > 1) {
    const pick = digitsOnly(params[DM_PICK])
    if (!pick || pick > list.length) {
      return done(readDigit(DM_PICK, [
        t(`שלום ${list[0].full_name}, כאן מערך המפיצים של גיליונות החתם סופר. אתם רשומים כמפיצים בכמה מקומות.`),
        ...list.map((x, i) => t(`עבור ${placeName(x)}, ${x.quantity} גיליונות בשבוע, הקישו ${i + 1}.`)),
      ], list.map((_, i) => String(i + 1))))
    }
    d = list[pick - 1]
  }

  const menu = params[DM_MENU] ?? ''
  switch (menu) {
    case '1': case '3': case '4': {
      const action = menu === '1' ? 'received' : menu === '3' ? 'increase' : 'decrease'
      const raw = params[DM_QTY]
      if (!raw) {
        const prompt = action === 'received'
          ? 'כמה גיליונות התקבלו השבוע? הקישו את המספר ובסיום סולמית'
          : `כרגע אתם מקבלים ${d.quantity} גיליונות. הקישו את הכמות החדשה המבוקשת ובסיום סולמית`
        return done(readNumber(DM_QTY, [t(prompt)], 6))
      }
      const q = digitsOnly(raw)
      if (q === null || q > MAX_QUANTITY) return done(say('הכמות לא נקלטה. נא להתקשר שוב'))
      if (action === 'increase' && q <= d.quantity) return done(say(`בתוספת, הכמות החדשה צריכה להיות יותר מ-${d.quantity}. נא להתקשר שוב`))
      if (action === 'decrease' && q >= d.quantity) return done(say(`בהפחתה, הכמות החדשה צריכה להיות פחות מ-${d.quantity}. נא להתקשר שוב`))
      const thanks = action === 'received'
        ? (q === d.quantity ? 'תודה, הקבלה נרשמה. שלום' : 'תודה, הקבלה נרשמה, והמשרד יבדוק את ההפרש. שלום')
        : 'הבקשה התקבלה. הכמות תתעדכן אחרי אישור המשרד. תודה ושלום'
      return done(say(thanks), { kind: 'quantity', distributorId: d.id, action, quantity: q })
    }
    case '2': return recordingStep(params, d.id, 'issue')
    case '5': return recordingStep(params, d.id, 'address')
    case '6': {
      const c = params[DM_LEAVE] ?? ''
      if (!c) return done(readDigit(DM_LEAVE, [t('להפסקת ההפצה ויציאה ממערך המפיצים הקישו 1. לביטול הקישו 2')], ['1', '2']))
      if (c !== '1') return done(say('ההפצה ממשיכה כרגיל. תודה ושלום'))
      return done(say('ההתנתקות נרשמה, והשליח קיבל הודעה. תודה רבה על כל ההפצה. שלום'), { kind: 'leave', distributorId: d.id })
    }
    case '7': return hilulaStep(params, d.id)
    case '8': return toAgent(ctx) ? done(toAgent(ctx)!) : recordingStep(params, d.id, 'note')
  }

  const greeting = list.length > 1
    ? `${placeName(d)}: ${d.quantity} גיליונות בכל שבוע.`
    : `שלום ${d.full_name}, כאן מערך המפיצים של גיליונות החתם סופר. אתם מקבלים ${d.quantity} גיליונות בכל שבוע.`
  return done(readDigit(DM_MENU, [t(greeting), t(MENU_TEXT)], ['1', '2', '3', '4', '5', '6', '7', '8']))
}

/** מה המתקשר שומע כשהשמירה נכשלה או נדחתה בשרת (במקום התודה). */
export const failReply = (error: string) => say(`${error}. נא להתקשר שוב מאוחר יותר`)
