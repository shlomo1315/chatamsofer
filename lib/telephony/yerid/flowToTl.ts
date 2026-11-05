// מתאם: מתרגם את תשובות זרימת היריד (lib/bookFairPhoneFlow, פורמט הטקסט הישן)
// למודולי JSON של טכנוליין. כך זרימת השיחה נשארת מקור אמת אחד, בלי שום תלות במרכזיה.
//
// ⚠️ ב-Module API ה-REQUEST מצטבר לאורך השיחה. כדי שתשובה ישנה לא תיקרא שוב,
// כל שם משתנה מקבל סיומת _q<seq>, ובבקשה הבאה נקראים רק המפתחות של ה-seq האחרון.
import type { TlFile, TlParams, TlResponse } from '../types'

const TOKEN_SPLIT = /\.(?=[tndf]-)/

/** טוקני השמעה (t-/n-/d-/f-) לפריטי files של טכנוליין. */
export function tokensToFiles(tokens: string): TlFile[] {
  const files: TlFile[] = []
  for (const tok of tokens.split(TOKEN_SPLIT)) {
    const body = tok.slice(2).trim()
    if (!body) continue
    if (tok.startsWith('t-')) files.push({ text: body })
    else if (tok.startsWith('n-')) files.push({ number: body })
    else if (tok.startsWith('d-')) files.push({ digits: body })
    else if (tok.startsWith('f-')) files.push({ fileName: body })
  }
  return files
}

const suffixed = (name: string, seq: number) => `${name}_q${seq}`
const withFiles = (files: TlFile[]) => (files.length ? { files } : {})

function readToTl(body: string, seq: number): TlResponse | null {
  const eq = body.lastIndexOf('=')
  if (eq < 0) return null
  const files = tokensToFiles(body.slice(0, eq))
  const ops = body.slice(eq + 1).split(',')
  const name = ops[0]?.trim()
  if (!name) return null

  if (ops[2] === 'record') {
    return {
      type: 'record', name: suffixed(name, seq), max: Number(ops[3]) || 30, confirm: 'no',
      hangupSave: 'yes', sttSoft: true, ...withFiles(files),
    }
  }
  const max = Number(ops[2]) || 20
  const min = Math.min(Number(ops[3]) || 1, max)
  const timeout = Number(ops[4]) || 12
  // # בלי קלט = חזרה לתפריט הראשי (כמו במרכזיה), # אחרי ספרות = סיום הקלט.
  return {
    type: 'getDTMF', name: suffixed(name, seq), max, min, timeout,
    skipKey: '#', skipValue: '#', confirmType: 'no', ...withFiles(files),
  }
}

/** תשובת טקסט אחת (פקודות מחוברות ב-&) למערך מודולים של טכנוליין. */
export function flowToTl(response: string, seq: number): TlResponse[] {
  const out: TlResponse[] = []
  for (const part of response.split('&')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq)
    const val = part.slice(eq + 1)
    if (key === 'id_list_message') {
      const files = tokensToFiles(val)
      if (files.length) out.push({ type: 'simpleMessage', files })
    } else if (key === 'read') {
      const r = readToTl(val, seq)
      if (r) out.push(r)
    } else if (key === 'go_to_folder' && val === 'hangup') {
      out.push({ type: 'hangup' })
    }
  }
  if (!out.length) out.push({ type: 'hangup' })
  return out
}

const PBX = /^PBX/

/**
 * הפרמטרים של התשובה האחרונה בלבד, בלי הסיומת _q<seq>.
 * גם קידומות של תוצאות (TEXT_/FILEID_/PATH_/CONFIRM_ וכו') נשמרות.
 * ERROR (תם הזמן) הופך לערך ריק, כמו "לא הוקש כלום" במרכזיה.
 */
export function cleanParams(params: TlParams, seq: number): TlParams {
  const out: TlParams = {}
  const tail = `_q${seq}`
  for (const [k, v] of Object.entries(params)) {
    if (PBX.test(k)) out[k] = v
    else if (k.endsWith(tail)) out[k.slice(0, -tail.length)] = v === 'ERROR' ? '' : v
  }
  return out
}
