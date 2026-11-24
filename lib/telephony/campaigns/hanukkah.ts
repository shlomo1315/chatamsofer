// הודעה יוצאת לרשימת התפוצה "חנוכה תשפ''ז" בטכנוליין (מערכת main).
// הקשה 1 — עוברת ישר לרישום בשלוחת החגים. הקשה 2 — חוסמת את המספר ברשימה הזו בלבד
// (מקש 9 של טכנוליין מסיר מכל מאגר החשבון, ולכן לא משתמשים בו).
// ⚠️ שליחה לרשימה רק מהמסך, באישור מפורש של מנהל. אין שליחה אוטומטית.
import { campaignApi, mailingListApi, type ApiResult } from '../interaction'
import { accountConfig, getSystem } from '../systems'
import { webhookUrl } from '../tree'
import { localPhone } from '../client'
import { goodbye } from '../modules'
import { holidays } from '../main/holidays'
import type { TlContext, TlResponse, TlResult } from '../types'

export const LIST_NAME = "חנוכה תשפ''ז"
export const CAMPAIGN_EXT = 'campaign-hanukkah'
const MENU_VAR = 'menu_pick'

/** הנוסח כפי ששלמה כתב — לתצוגה במסך. */
export const MESSAGE_TEXT =
  'שלום וברכה, הודעה משמחת מטעם איגוד הצאצאים שעל ידי היכל החתם סופר. לקראת ימי החנוכה תתקיים בעזרת השם חלוקת מענק סימלי בסך 250 ש"ח לאלו הזקוקים לכך. ' +
  'המרגישים צורך בקבלת הסיוע יכולים להירשם כעת במספר הטלפון 02-376-63-63. הרישום הוא רק דרך הטלפון ואין אפשרויות רישום נוספות. ' +
  'הרישום יתקיים אך ורק עד היום יום שלישי י"ד כסליו תשפ"ז בשעה 10 בלילה, לאחר מכן לא יתאפשר הרישום בשום אופן! ' +
  'למעבר לרישום כעת הקישו 1. לוויתור על קבלת המענק הנוכחי הקישו 2. בברכת א פריילעכן חנוכה.'

/** אותו נוסח להקראה: בלי פסיקים, מקפים וגרשיים (טכנוליין דוחה אותם), "שקלים" במקום ש"ח, והמספר ספרה-ספרה. */
export const AUDIO_TEXT =
  'שלום וברכה. הודעה משמחת מטעם איגוד הצאצאים שעל ידי היכל החתם סופר. לקראת ימי החנוכה תתקיים בעזרת השם חלוקת מענק סימלי בסך 250 שקלים לאלו הזקוקים לכך. ' +
  'המרגישים צורך בקבלת הסיוע יכולים להירשם כעת במספר הטלפון 0; 2; 3; 7; 6; 6; 3; 6; 3. הרישום הוא רק דרך הטלפון ואין אפשרויות רישום נוספות. ' +
  'הרישום יתקיים אך ורק עד היום יום שלישי י״ד כסליו תשפ״ז בשעה 10 בלילה. לאחר מכן לא יתאפשר הרישום בשום אופן! ' +
  'למעבר לרישום כעת הקישו 1. לוויתור על קבלת המענק הנוכחי הקישו 2. בברכת א פריילעכן חנוכה.'

export type ListInfo = { id: string; name: string; phonesCount: number; blocked: number }

type RawList = { id?: unknown; name?: unknown; phonesCount?: unknown; blocked?: unknown }
// מספרים עשויים להגיע כמחרוזת עם מפריד אלפים ("1,250")
const count = (v: unknown) => Number(String(v ?? '').replace(/\D/g, '')) || 0
const toInfo = (l: RawList): ListInfo => ({
  id: String(l.id ?? ''), name: String(l.name ?? ''), phonesCount: count(l.phonesCount), blocked: count(l.blocked),
})

/** הרשימה לפי שם, או null אם עוד לא נוצרה. */
export async function findList(): Promise<ApiResult<ListInfo | null>> {
  const res = await mailingListApi('main', 'mailingLists')
  if (!res.ok) return res
  const lists = Array.isArray(res.data.lists) ? (res.data.lists as RawList[]) : []
  const hit = lists.find((l) => String(l.name ?? '').trim() === LIST_NAME)
  return { ok: true, data: hit ? toInfo(hit) : null }
}

/** מחזיר את הרשימה, ויוצר אותה אם אינה קיימת. */
export async function ensureList(): Promise<ApiResult<ListInfo & { created: boolean }>> {
  const found = await findList()
  if (!found.ok) return found
  if (found.data) return { ok: true, data: { ...found.data, created: false } }
  const made = await mailingListApi('main', 'mailingListEdit', { name: LIST_NAME })
  if (!made.ok) return made
  const id = String(made.data.id ?? made.data.mailingList ?? '')
  if (!id) return { ok: false, error: 'טכנוליין לא החזירה מזהה לרשימה החדשה' }
  return { ok: true, data: { id, name: LIST_NAME, phonesCount: 0, blocked: 0, created: true } }
}

/** גוף campaignRun. target: מספר אחד (ניסיון) או מזהה הרשימה (שליחה). */
export function campaignBody(site: string, target: { phone: string } | { listId: string }): Record<string, unknown> | null {
  const cfg = getSystem('main')
  if (!cfg.secret) return null
  const action = `apiUrl-${webhookUrl(site, 'main', cfg.secret, CAMPAIGN_EXT)}`
  return {
    ...('phone' in target ? { phones: [target.phone] } : { mailingList: target.listId }),
    title: 'phone' in target ? `${LIST_NAME} (ניסיון)` : LIST_NAME,
    audioText: AUDIO_TEXT,
    ...(cfg.callerId ? { callId: cfg.callerId } : {}),
    callLength: 30, dialRetries: 1, betweenRetries: 5,
    'keysAction-1': action,
    'keysAction-2': action,
  }
}

export type RunResult = { ok: true; data: Record<string, unknown> } | { ok: false; error: string }

/** שיגור: ניסיון למספר אחד, או לכל הרשימה. */
export async function runCampaign(site: string, target: { phone: string } | { listId: string }): Promise<RunResult> {
  const cfg = getSystem('main')
  if (!cfg.apiKey) return { ok: false, error: 'חסר TECHNOLINE_MAIN_API_KEY' }
  if (!accountConfig().outboundEnabled) return { ok: false, error: 'שיחות יוצאות כבויות (TECHNOLINE_OUTBOUND_ENABLED)' }
  let t = target
  if ('phone' in target) {
    const p = localPhone(target.phone)
    if (!p) return { ok: false, error: 'מספר טלפון לא תקין' }
    t = { phone: p }
  }
  const body = campaignBody(site, t)
  if (!body) return { ok: false, error: 'חסר TECHNOLINE_MAIN_SECRET' }
  const res = await campaignApi('main', 'campaignRun', body)
  return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error }
}

/** חוסם מספר ברשימה הזו בלבד (setStatus=1). */
export async function removeFromList(phone: string): Promise<ApiResult<unknown>> {
  const p = localPhone(phone)
  if (!p) return { ok: false, error: 'מספר טלפון לא תקין' }
  const list = await findList()
  if (!list.ok) return list
  if (!list.data) return { ok: false, error: 'הרשימה לא נמצאה' }
  return mailingListApi('main', 'setStatus', { mailingList: list.data.id, phone: p, status: 1 })
}

const LOG = '[telephony:main/campaign-hanukkah]'

/** מטפל ההקשות מהקמפיין (apiUrl). 2 → הסרה מהרשימה; 1 → רישום החגים. */
export async function campaignHanukkah(ctx: TlContext): Promise<TlResult> {
  // אחרי המעבר לרישום, menu_pick=1 נשלח בכל פנייה (addParams), וכל השיחה ממשיכה בשלוחת החגים.
  if (!ctx.params[MENU_VAR] && ctx.params.digit === '2') {
    const res = await removeFromList(ctx.phone)
    if (!res.ok) console.error(`${LOG} callId=${ctx.callId} הסרה נכשלה: ${res.error}`)
    return goodbye(res.ok ? 'הוסרתם מרשימת התפוצה. תודה ולהתראות' : 'לא הצלחנו להסיר את המספר. אנא נסו שוב מאוחר יותר')
  }
  const first = !ctx.params[MENU_VAR]
  const result = await holidays({ ...ctx, ext: 'holidays', params: { ...ctx.params, [MENU_VAR]: ctx.params[MENU_VAR] || '1' } })
  if (!first) return result
  const list = Array.isArray(result) ? result : [result]
  const [head, ...rest] = list
  const tagged: TlResponse = { ...head, addParams: { ...head.addParams, [MENU_VAR]: '1' } }
  return Array.isArray(result) ? [tagged, ...rest] : tagged
}
