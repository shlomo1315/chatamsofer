// בוני תשובות Module API — כל תשובה היא אובייקט JSON עם type אחד.
import type { TlFile, TlResponse } from './types'

export const say = (...texts: string[]): TlFile[] =>
  texts.filter((t) => t && t.trim()).map((text) => ({ text }))

export const message = (...texts: string[]): TlResponse => ({ type: 'simpleMessage', files: say(...texts) })

export const hangup = (): TlResponse => ({ type: 'hangup' })

export const goTo = (path: string): TlResponse => ({ type: 'goTo', goTo: path })

export function menu(name: string, keys: string[], files: TlFile[], opts: { times?: number; timeout?: number } = {}): TlResponse {
  return {
    type: 'simpleMenu', name, enabledKeys: keys.join(','),
    times: opts.times ?? 3, timeout: opts.timeout ?? 5, errorReturn: 'ERROR', files,
  }
}

export function askDigits(name: string, max: number, files: TlFile[], opts: { min?: number; maskLog?: boolean; post?: boolean } = {}): TlResponse {
  return {
    type: 'getDTMF', name, max, min: opts.min, timeout: 6, skipKey: '#', skipValue: 'SKIP', confirmType: 'no',
    ...(opts.maskLog ? { maskLog: true } : {}), ...(opts.post ? { post: true } : {}), files,
  }
}

/** הקראת ספרות אחת-אחת (טכנוליין עושה זאת בעצמה, ללא פיצול ידני). */
export const digits = (code: string): TlFile => ({ digits: code.replace(/\D/g, '') })

/** הודעה ואז ניתוק — הברירת מחדל הבטוחה: תמיד JSON תקין. */
export const goodbye = (...texts: string[]): TlResponse[] => [message(...texts), hangup()]

/**
 * תבנית הודעה → קבצי שמע. {key} מוחלף בטקסט, או בקובץ (למשל digits) אם הערך הוא TlFile.
 * שדה שלא הועבר ערך עבורו מוסר — לא מוקרא כ"סוגריים".
 */
export function fill(template: string, vars: Record<string, string | TlFile> = {}): TlFile[] {
  const out: TlFile[] = []
  let buf = ''
  for (const part of String(template ?? '').split(/(\{\w+\})/)) {
    const m = /^\{(\w+)\}$/.exec(part)
    if (!m) { buf += part; continue }
    const v = vars[m[1]]
    if (v === undefined) continue
    if (typeof v === 'string') { buf += v; continue }
    out.push(...say(buf)); buf = ''
    out.push(v)
  }
  out.push(...say(buf))
  return out.map((f) => ('text' in f ? { ...f, text: f.text.replace(/\s+/g, ' ').trim() } : f))
}
