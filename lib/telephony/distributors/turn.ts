// שלוחת המפיצים של הגיליונות בטכנוליין — לוגיקה טהורה (בלי מסד). כל פנייה היא צעד אחד;
// המצב נגזר מהמשתנים שהמרכזיה מצרפת (שם המודול = שם המשתנה), כמו בימות.
import { askDigits, goodbye, menu, message, say } from '../modules'
import type { TlParams, TlResult } from '../types'
import type { PhoneContext, PhoneDistributor, RecordingPurpose, DistributorPhoneAction } from '@/lib/gilyonotDistributorPhone'
import { DM_GUESTS, DM_LEAVE, DM_MENU, DM_PICK, DM_QTY, DM_REC, MAX_GUESTS, MAX_PICK } from '@/lib/gilyonotDistributorPhone'
import { MAX_QUANTITY } from '@/lib/gilyonotDistributors'

export type DistributorTurn = { result: TlResult; action: DistributorPhoneAction }

const done = (result: TlResult, action: DistributorPhoneAction = null): DistributorTurn => ({ result, action })
const num = (v: string | undefined) => (/^\d+$/.test((v ?? '').trim()) ? Number(v!.trim()) : null)
const place = (d: PhoneDistributor) => [d.synagogue, d.city].filter(Boolean).join(' ב') || d.full_name
const bye = (...t: string[]) => done(goodbye(...t))

const PROMPTS: Record<RecordingPurpose, string> = {
  issue: 'נא תארו אחרי הצליל את התקלה. בסיום הקישו סולמית',
  address: 'נא אמרו אחרי הצליל את הכתובת החדשה המלאה, כולל העיר. בסיום הקישו סולמית',
  note: 'הנציג אינו זמין כעת. השאירו הודעה אחרי הצליל, והמשרד יחזור אליכם. בסיום הקישו סולמית',
}
const THANKS: Record<RecordingPurpose, string> = {
  issue: 'הדיווח התקבל, והמשרד יטפל בו בהקדם. תודה ושלום',
  address: 'הכתובת החדשה התקבלה. המשרד יעדכן אותה ויודיע לשליח. תודה ושלום',
  note: 'ההודעה התקבלה, והמשרד יחזור אליכם. תודה ושלום',
}

function agent(ctx: PhoneContext): DistributorTurn | null {
  const dial = (ctx.agentPhone ?? '').replace(/\D/g, '')
  if (!ctx.agentOpen || !dial) return null
  return done([message('מעבירים אתכם לנציג, נא להמתין'), { type: 'simpleRouting', name: 'dial', dialPhone: dial, ringSec: 30, endCall: 'yes' }])
}

function recording(p: TlParams, id: string, purpose: RecordingPurpose): DistributorTurn {
  const rec = (p[`PATH_${DM_REC}`] ?? p[DM_REC] ?? '').trim()
  if (!rec) return done({ type: 'record', name: DM_REC, max: 90, min: 2, confirm: 'confirmOnly', files: say(PROMPTS[purpose]), maskLog: true })
  return done(goodbye(THANKS[purpose]), { kind: 'recording', distributorId: id, purpose, path: rec, transcript: null })
}

function hilula(p: TlParams, id: string | null): DistributorTurn {
  const raw = p[DM_GUESTS]
  if (!raw) return done(askDigits(DM_GUESTS, 2, say('הרשמה לסעודת ההילולא. כמה משתתפים, כולל אתכם? הקישו את המספר ובסיום סולמית'), { min: 1 }))
  const guests = num(raw)
  if (!guests || guests > MAX_GUESTS) return bye(`מספר המשתתפים צריך להיות בין 1 ל-${MAX_GUESTS}. נא להתקשר שוב`)
  return done(
    goodbye(`נרשמה בקשה ל-${guests} משתתפים בסעודת ההילולא. ${id ? 'כמפיצים, יש לכם קדימות. ' : ''}המשרד יאשר את ההשתתפות. תודה ושלום`),
    { kind: 'hilula', distributorId: id, guests },
  )
}

function unknownCaller(p: TlParams, ctx: PhoneContext): DistributorTurn {
  const a = agent(ctx)
  const choice = p[DM_MENU] ?? ''
  if (choice === '1' && ctx.hasPhone) return hilula(p, null)
  if (choice === '2' && a) return a
  const intro = 'שלום, כאן מערך המפיצים של גיליונות החתם סופר. המספר שממנו התקשרתם אינו רשום כמפיץ.'
  if (!ctx.hasPhone) return a ?? bye(intro, 'כדי להשתמש בקו נא להתקשר ממספר מזוהה. תודה ושלום')
  const options = ['להרשמה לסעודת ההילולא הקישו 1.', ...(a ? ['לשיחה עם נציג הקישו 2.'] : [])]
  return done(menu(DM_MENU, a ? ['1', '2'] : ['1'], say(intro, ...options)))
}

export const MENU_TEXT = [
  'לדיווח על קבלת הגיליונות הקישו 1.', 'לדיווח על תקלה 2.', 'לבקשת תוספת 3.', 'לבקשת הפחתה 4.',
  'לעדכון כתובת 5.', 'להפסקת ההפצה 6.', 'להרשמה לסעודת ההילולא 7.', 'לשיחה עם נציג 8.',
].join(' ')

export function distributorTurn(p: TlParams, ctx: PhoneContext): DistributorTurn {
  const list = ctx.distributors.slice(0, MAX_PICK)
  if (!list.length) return unknownCaller(p, ctx)

  let d = list[0]
  if (list.length > 1) {
    const pick = num(p[DM_PICK])
    if (!pick || pick > list.length) {
      return done(menu(DM_PICK, list.map((_, i) => String(i + 1)), say(
        `שלום ${list[0].full_name}, כאן מערך המפיצים של גיליונות החתם סופר. אתם רשומים כמפיצים בכמה מקומות.`,
        ...list.map((x, i) => `עבור ${place(x)}, ${x.quantity} גיליונות בשבוע, הקישו ${i + 1}.`),
      )))
    }
    d = list[pick - 1]
  }

  const choice = p[DM_MENU] ?? ''
  switch (choice) {
    case '1': case '3': case '4': {
      const action = choice === '1' ? 'received' : choice === '3' ? 'increase' : 'decrease'
      const raw = p[DM_QTY]
      if (!raw) {
        const prompt = action === 'received'
          ? 'כמה גיליונות התקבלו השבוע? הקישו את המספר ובסיום סולמית'
          : `כרגע אתם מקבלים ${d.quantity} גיליונות. הקישו את הכמות החדשה המבוקשת ובסיום סולמית`
        return done(askDigits(DM_QTY, 6, say(prompt), { min: 1 }))
      }
      const q = num(raw)
      if (q === null || q > MAX_QUANTITY) return bye('הכמות לא נקלטה. נא להתקשר שוב')
      if (action === 'increase' && q <= d.quantity) return bye(`בתוספת, הכמות החדשה צריכה להיות יותר מ-${d.quantity}. נא להתקשר שוב`)
      if (action === 'decrease' && q >= d.quantity) return bye(`בהפחתה, הכמות החדשה צריכה להיות פחות מ-${d.quantity}. נא להתקשר שוב`)
      const thanks = action === 'received'
        ? (q === d.quantity ? 'תודה, הקבלה נרשמה. שלום' : 'תודה, הקבלה נרשמה, והמשרד יבדוק את ההפרש. שלום')
        : 'הבקשה התקבלה. הכמות תתעדכן אחרי אישור המשרד. תודה ושלום'
      return done(goodbye(thanks), { kind: 'quantity', distributorId: d.id, action, quantity: q })
    }
    case '2': return recording(p, d.id, 'issue')
    case '5': return recording(p, d.id, 'address')
    case '6': {
      const c = p[DM_LEAVE] ?? ''
      if (!c) return done(menu(DM_LEAVE, ['1', '2'], say('להפסקת ההפצה ויציאה ממערך המפיצים הקישו 1. לביטול הקישו 2')))
      if (c !== '1') return bye('ההפצה ממשיכה כרגיל. תודה ושלום')
      return done(goodbye('ההתנתקות נרשמה, והשליח קיבל הודעה. תודה רבה על כל ההפצה. שלום'), { kind: 'leave', distributorId: d.id })
    }
    case '7': return hilula(p, d.id)
    case '8': return agent(ctx) ?? recording(p, d.id, 'note')
  }

  const greeting = list.length > 1
    ? `${place(d)}: ${d.quantity} גיליונות בכל שבוע.`
    : `שלום ${d.full_name}, כאן מערך המפיצים של גיליונות החתם סופר. אתם מקבלים ${d.quantity} גיליונות בכל שבוע.`
  return done(menu(DM_MENU, ['1', '2', '3', '4', '5', '6', '7', '8'], say(greeting, MENU_TEXT)))
}
