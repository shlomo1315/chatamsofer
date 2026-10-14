import { formatLine, type KvitelLineInput } from '@/lib/kvitel'
import { ttsClean } from '@/lib/bookFairYemotIvr'

// ─────────────────────────────────────────────────────────────────────────────
// ערוץ הטלפון של הקוויטלאך (מערכת ימות משיח נפרדת, מספר משלה).
//
// הלוגיקה כאן טהורה: מה המתקשר שומע בכל שלב, ומה צריך לשמור. ה-webhook
// (app/api/webhooks/yemot-kvitel) טוען את השמות השמורים ומבצע את השמירה.
//
// בלי טבלת מצב: ימות שולחת בכל פנייה את כל המשתנים שנאספו בשיחה,
// ולכן המצב נגזר מהם.
//   1. יש שמות שמורים למספר: מקריאים אותם. 1 לאישור, 2 להקלטת שמות חדשים.
//   2. אין שמות, או שהקישו 2: הקלטה. ההקלטה נכנסת ל"לבדיקה" עם התמלול (אם יש).
//   3. אישור: השמות השמורים נכנסים כבקשה חדשה.
// ─────────────────────────────────────────────────────────────────────────────

export const KV_CONFIRM = 'kv_confirm'
export const KV_REC = 'kv_rec'
export const MAX_SPOKEN = 10
const MAX_RECORD_SECONDS = 120

const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')
const t = (text: string) => `t-${ttsClean(text)}`
const hangup = 'go_to_folder=hangup'

// 14 שדות ו-'No','no','no', כמו בשלוחות החגים והיולדות שעובדות.
function readDigit(varName: string, tokens: string[], keys: string[]): string {
  const ops = [varName, 'no', '1', '1', '10', 'No', 'no', 'no', '', keys.join('.'), '', '', '', '']
  return `read=${joinTokens(...tokens)}=${ops.join(',')}`
}

// 'record' ולא 'voice': עם 'voice' חוזרות ההקשות במקום נתיב הקובץ (ראה bookFairYemotIvr).
function readRecord(varName: string, tokens: string[]): string {
  return `read=${joinTokens(...tokens)}=${[varName, '', 'record', String(MAX_RECORD_SECONDS), '9'].join(',')}`
}

export function spokenLine(l: KvitelLineInput): string {
  return t(formatLine(l))
}

export type KvitelPhoneAction =
  | { kind: 'saved' }
  | { kind: 'recording'; path: string; transcript: string | null }
  | null

export interface KvitelPhoneTurn { reply: string; action: KvitelPhoneAction }

export function kvitelPhoneTurn(params: Record<string, string>, saved: KvitelLineInput[]): KvitelPhoneTurn {
  const confirm = params[KV_CONFIRM] ?? ''
  const rec = (params[KV_REC] ?? '').trim()

  // ההקלטה הסתיימה. "Digits-..." הוא הקשות ולא הקלטה (כך עונה ימות כשאין קובץ).
  if (rec) {
    if (/^Digits[-=]/i.test(rec)) {
      return { reply: `id_list_message=${t('לא התקבלה הקלטה. נא להתקשר שוב')}&${hangup}`, action: null }
    }
    const transcript = (params[`${KV_REC}_voice`] ?? '').trim() || null
    return {
      reply: `id_list_message=${t('השמות נקלטו ויוזכרו בתפילה על הציון הקדוש. תודה ושלום')}&${hangup}`,
      action: { kind: 'recording', path: rec, transcript },
    }
  }

  if (confirm === '1' && saved.length) {
    return {
      reply: `id_list_message=${t('השמות נשלחו ויוזכרו בתפילה על הציון הקדוש. תודה ושלום')}&${hangup}`,
      action: { kind: 'saved' },
    }
  }

  const recordPrompt = t('נא אמרו אחרי הצליל את השמות. לכל שם: השם, בן או בת, שם האם, והבקשה. בסיום הקישו סולמית')
  if (confirm === '2' || !saved.length) {
    return { reply: readRecord(KV_REC, [t('שלום, כאן קוויטלאך היכל החתם סופר'), recordPrompt].slice(confirm === '2' ? 1 : 0)), action: null }
  }

  const shown = saved.slice(0, MAX_SPOKEN)
  return {
    reply: readDigit(KV_CONFIRM, [
      t('שלום, כאן קוויטלאך היכל החתם סופר. השמות ששלחתם בפעם הקודמת'),
      ...shown.map(spokenLine),
      t('לשליחת השמות האלה הקישו 1. להקלטת שמות חדשים הקישו 2'),
    ], ['1', '2']),
    action: null,
  }
}

// ההקלטה יושבת בימות (Trash/ApiVoice, שם הקובץ לפי הטלפון וחותמת הזמן, ראה yemot-book-fair).
// נשמרת הפניה, ולא כתובת שהדפדפן יכול לנגן: הורדה מימות דורשת טוקן ועוברת בשרת.
export const YEMOT_REF = 'yemot:'
export const recordingRef = (phone: string, apiTime: string) => `${YEMOT_REF}${phone.replace(/\D/g, '')}:${apiTime.replace(/\D/g, '')}`
export const isYemotRef = (url: string | null | undefined) => !!url?.startsWith(YEMOT_REF)
