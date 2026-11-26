import ExcelJS from 'exceljs'
import type { DonorCharge } from '@/lib/donorCharges'

// ─────────────────────────────────────────────────────────────────────────────
// התאמת קובץ אשראי לדוח החיובים של הנדיב: הנדיב מעלה את פירוט חברת האשראי
// (xlsx, xls, csv או PDF), המערכת מזהה לבד את עמודות התאריך, הסכום, בית העסק
// והאסמכתא, ומתאימה כל שורה לחיוב אחד במערכת.
//
// 🔴 פרטיות: הקובץ נקרא בזיכרון בלבד ולא נשמר. מהקובץ יוצאים רק תאריך, סכום,
// שם בית העסק (כל רצף של 7 ספרות ומעלה מוסתר, כדי שמספר כרטיס או ת״ז לא יצאו)
// ואסמכתא (רק מעמודה שכותרתה אסמכתא/שובר/אישור, ורק עד 12 ספרות).
// ─────────────────────────────────────────────────────────────────────────────

export class CardFileError extends Error {}

export const MAX_CARD_FILE_BYTES = 5 * 1024 * 1024
export const MAX_CARD_ROWS = 2000
/** טווח הימים לחיפוש חיוב שנרשם בתאריך אחר (פער תאריך) */
export const DATE_SLACK_DAYS = 3
/** פער סכום יחסי מרבי שעדיין נחשב לאותו חיוב (פער סכום) */
const AMOUNT_SLACK = 0.25

export interface FileRow {
  /** מספר השורה בקובץ (מ-1), להצגה */
  line: number
  /** YYYY-MM-DD */
  date: string
  merchant: string
  ref: string
  /** בשקלים; כשהקובץ במטבע זר ולא נמצא סכום בשקלים, זה הסכום המקורי ו-usd=true */
  amount: number
  usd?: boolean
}

export type CardColumns = { date: string; amount: string; merchant: string | null; ref: string | null }

/** שורה בקובץ שלא נקלטה כעסקה, עם הסיבה */
export interface SkippedRow { line: number; why: string }

export interface CardFile {
  columns: CardColumns
  rows: FileRow[]
  skipped: SkippedRow[]
  order: DateOrder
  /** הקובץ במטבע זר (כמו אמקס בדולרים); הסכום בשקלים נלקח מהעמודה הזו */
  ilsFrom: string | null
  foreign: boolean
}

// ── קריאת הקובץ לטבלה ──────────────────────────────────────────────────────

function xlCell(v: ExcelJS.CellValue): string {
  if (v == null) return ''
  // תאריך באקסל נשמר כחצות UTC של היום, ולכן חלקי ה-UTC הם התאריך עצמו
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(t => t.text).join('')
    if ('result' in v) return xlCell((v.result ?? null) as ExcelJS.CellValue)
    if ('text' in v) return String(v.text)
    return ''
  }
  return String(v)
}

async function xlsxTable(buf: ArrayBuffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.load(buf) } catch { throw new CardFileError('קובץ האקסל פגום או מוגן בסיסמה') }
  // הגיליון עם הכי הרבה שורות: בקבצי חברות האשראי זה גיליון העסקאות
  let best: string[][] = []
  wb.eachSheet(ws => {
    const rows: string[][] = []
    ws.eachRow(row => { rows.push(Array.from((row.values as ExcelJS.CellValue[]).slice(1), v => xlCell(v).trim())) })
    if (rows.length > best.length) best = rows
  })
  return best
}

function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf).replace(/^﻿/, '')
  if (!utf8.includes('�')) return utf8
  // קבצים ישנים מחברות האשראי נשמרים בקידוד העברי של חלונות
  try { return new TextDecoder('windows-1255').decode(buf) } catch { return utf8 }
}

/**
 * CSV/TSV. תא במירכאות יכול להכיל ירידת שורה (כמו Extended Details ו-Address
 * באמקס), ולכן מפרקים את כל הטקסט ולא שורה-שורה. מירכאות פותחות רק בתחילת תא,
 * כדי ש-בע"מ או ש"ח באמצע תא לא "יבלעו" את המשך הקובץ.
 */
function delimitedTable(text: string): string[][] {
  const sample = text.split(/\r?\n/, 20).join('\n')
  const delim = sample.includes('\t') ? '\t' : sample.split(';').length > sample.split(',').length ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], cur = '', q = false
  const endCell = () => { row.push(cur.replace(/\s+/g, ' ').trim()); cur = '' }
  const endRow = () => { endCell(); if (row.some(Boolean)) rows.push(row); row = [] }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"' && !cur.trim()) { cur = ''; q = true }
    else if (ch === delim) endCell()
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; endRow() }
    else cur += ch
  }
  endRow()
  return rows
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }
const htmlText = (s: string) => s
  .replace(/<br\s*\/?>/gi, ' ')
  .replace(/<[^>]+>/g, '')
  .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ').trim()

/** "xls" שהוא בעצם טבלת HTML (כך מייצאות חלק מחברות האשראי). */
function htmlTable(text: string): string[][] {
  const rows: string[][] = []
  for (const tr of text.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m => htmlText(m[1]))
    if (cells.some(Boolean)) rows.push(cells)
  }
  return rows
}

type PdfItem = { str: string; x: number; y: number; w: number }

/**
 * חלק מקבצי ה-PDF שומרים עברית בסדר חזותי (הפוך). מזהים לפי האותיות הסופיות
 * (ך ם ן ף ץ), שבסדר הנכון באות רק בסוף מילה. ההחלטה לכל העמוד יחד, כדי
 * שגם מילים בלי אות סופית יתוקנו.
 */
export function isVisualHebrew(texts: string[]): boolean {
  const words = texts.flatMap(s => s.split(/\s+/)).filter(w => /[א-ת]{2,}/.test(w))
  return words.filter(w => /^[ךםןףץ]/.test(w)).length > words.filter(w => /[ךםןףץ]$/.test(w)).length
}

/** היפוך טקסט חזותי לסדר קריאה, בלי להפוך מספרים ותאריכים. */
export const reverseVisual = (s: string) => /[א-ת]/.test(s)
  ? [...s].reverse().join('').replace(/[0-9A-Za-z.,/:-]+/g, run => [...run].reverse().join(''))
  : s

/** PDF: הפריטים מקובצים לשורות לפי הגובה, ובכל שורה מימין לשמאל לתאים לפי הרווחים. */
async function pdfTable(buf: ArrayBuffer): Promise<string[][]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  let doc
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: false }).promise }
  catch { throw new CardFileError('קובץ ה-PDF פגום או מוגן בסיסמה') }
  const rows: string[][] = []
  for (let p = 1; p <= Math.min(doc.numPages, 50); p++) {
    const items = ((await (await doc.getPage(p)).getTextContent()).items as { str?: string; transform?: number[]; width?: number }[])
      .filter(i => i.str?.trim() && i.transform)
      .map(i => ({ str: i.str!.trim(), x: i.transform![4], y: i.transform![5], w: i.width ?? 0 }))
      .sort((a, b) => b.y - a.y)
    if (isVisualHebrew(items.map(i => i.str))) for (const i of items) i.str = reverseVisual(i.str)
    const lines: PdfItem[][] = []
    for (const it of items) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last[0].y - it.y) <= 3) last.push(it)
      else lines.push([it])
    }
    for (const line of lines) {
      line.sort((a, b) => (b.x + b.w) - (a.x + a.w))
      const cells: string[] = []
      let prev: PdfItem | null = null
      for (const it of line) {
        // רווח קטן בין פריטים = אותו תא (מילים של שם בית עסק), בסדר הקריאה מימין לשמאל
        if (prev && prev.x - (it.x + it.w) < 6) cells[cells.length - 1] = `${cells[cells.length - 1]} ${it.str}`
        else cells.push(it.str)
        prev = it
      }
      rows.push(cells)
    }
  }
  return rows
}

/** קריאת הקובץ לטבלת מחרוזות, לפי הסוג (ולפי התוכן, לא רק לפי הסיומת). */
export async function readCardTable(buf: ArrayBuffer, name: string): Promise<string[][]> {
  const head = new Uint8Array(buf.slice(0, 8))
  const ext = (name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]) ?? ''
  const startsWith = (...b: number[]) => b.every((x, i) => head[i] === x)
  if (startsWith(0x25, 0x50, 0x44, 0x46)) return pdfTable(buf)                    // %PDF
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) return xlsxTable(buf)                    // zip = xlsx
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0)) throw new CardFileError('קובץ xls ישן לא נתמך. פתחו אותו באקסל ושמרו כ-xlsx או CSV')
  if (!['csv', 'txt', 'xls', 'tsv', ''].includes(ext)) throw new CardFileError('סוג הקובץ לא נתמך. אפשר להעלות PDF, xlsx, xls או csv')
  const text = decodeText(buf)
  if (/^\s*</.test(text)) return htmlTable(text)
  return delimitedTable(text)
}

// ── זיהוי העמודות והשורות ──────────────────────────────────────────────────

/** סדר התאריך בקובץ: יום/חודש (ישראל) או חודש/יום (ארה״ב, למשל אמקס). */
export type DateOrder = 'dmy' | 'mdy'
const SHORT_DATE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/

/** תאריך בכל אחד מהפורמטים הנפוצים → YYYY-MM-DD, או null. */
export function parseCardDate(raw: string, order: DateOrder = 'dmy'): string | null {
  const s = raw.trim()
  let y: number, m: number, d: number
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (r) { y = +r[1]; m = +r[2]; d = +r[3] }
  else if ((r = s.match(SHORT_DATE))) {
    ;[d, m] = order === 'mdy' ? [+r[2], +r[1]] : [+r[1], +r[2]]
    y = r[3].length === 2 ? 2000 + +r[3] : +r[3]
  }
  else return null
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return new Date(`${iso}T12:00:00Z`).getUTCDate() === d ? iso : null
}

/** סכום כסף (₪, ש״ח, פסיקים, מינוס מימין או משמאל) → מספר, או null. */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/₪|ש["״']?ח|NIS|ILS|USD|\$|\s/gi, '').replace(/,/g, '')
  let neg = false
  if (/^-|-$/.test(s)) { neg = true; s = s.replace(/^-|-$/g, '') }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return neg ? -n : n
}

/**
 * סדר התאריך נקבע לכל הקובץ יחד: תאריך שהחלק הראשון שלו גדול מ-12 מוכיח יום/חודש,
 * והחלק השני גדול מ-12 מוכיח חודש/יום. כשכל התאריכים דו-משמעיים (09/08/2026),
 * קובץ באנגלית (כמו אמקס) הוא חודש/יום וקובץ בעברית הוא יום/חודש.
 */
export function detectDateOrder(table: string[][]): DateOrder {
  let dmy = 0, mdy = 0
  for (const row of table) for (const c of row) {
    const r = c.trim().match(SHORT_DATE)
    if (!r) continue
    if (+r[1] > 12 && +r[2] <= 12) dmy++
    else if (+r[2] > 12 && +r[1] <= 12) mdy++
  }
  if (dmy !== mdy) return dmy > mdy ? 'dmy' : 'mdy'
  const english = table.slice(0, 15).some(r => r.some(c => /^(transaction\s+)?date$/i.test(c.trim())) && !r.some(c => /[א-ת]/.test(c)))
  return english ? 'mdy' : 'dmy'
}

/**
 * סכום בשקלים מתוך טקסט באנגלית, כמו בעמודת Extended Details של אמקס:
 * "Foreign Spend Amount: 1,380.00 Israeli New Sheqels Commission Amount: …".
 */
export function ilsInText(s: string): number | null {
  const r = s.match(/(\d[\d,]*(?:\.\d{1,2})?)\s*(?:israeli\s+new\s+sh?e[qk]e?l\w*|ILS\b|NIS\b)/i)
    ?? s.match(/\b(?:ILS|NIS)\s*(\d[\d,]*(?:\.\d{1,2})?)/)
  if (!r) return null
  const n = Number(r[1].replace(/,/g, ''))
  return n > 0 ? n : null
}

const maskMerchant = (s: string) => s.replace(/\d{7,}/g, '•••').replace(/\s+/g, ' ').trim().slice(0, 80)
const cleanRef = (s: string) => { const d = s.replace(/\D/g, ''); return d.length <= 12 ? d : '' }

const HEADS = {
  date: [/תאריך\s*(עסקה|רכישה|ביצוע)/, /^תאריך$/, /תאריך/, /date/i],
  amount: [/סכום\s*(ה)?חיוב/, /סכום/, /amount|sum/i],
  merchant: [/בית\s*(ה)?עסק/, /שם/, /פרטים|תיאור/, /merchant|description/i],
  ref: [/אסמכתא|שובר|אישור/, /reference|ref/i],
}

/** אינדקס העמודה שהכותרת שלה מתאימה לתבנית החזקה ביותר. */
function pickHead(cells: string[], pats: RegExp[], taken: number[]): number {
  for (const p of pats) {
    const i = cells.findIndex((c, j) => !taken.includes(j) && p.test(c))
    if (i >= 0) return i
  }
  return -1
}

function findHeader(table: string[][], order: DateOrder) {
  for (let r = 0; r < Math.min(table.length, 15); r++) {
    const cells = table[r]
    if (cells.some(c => parseCardDate(c, order))) continue
    const date = pickHead(cells, HEADS.date, [])
    const amount = pickHead(cells, HEADS.amount, [date])
    if (date < 0 || amount < 0) continue
    const merchant = pickHead(cells, HEADS.merchant, [date, amount])
    const ref = pickHead(cells, HEADS.ref, [date, amount, merchant])
    return { row: r, width: cells.length, date, amount, merchant, ref, names: cells }
  }
  return null
}

/** בלי כותרת (או כשהשורה לא בנויה כמו הכותרת): זיהוי לפי התוכן. בלי אסמכתא, כדי לא לחשוף מספר מזהה. */
function rowByContent(cells: string[], order: DateOrder): { date: string; amount: number; amountAt: number; dateAt: number; merchant: string } | null {
  const di = cells.findIndex(c => parseCardDate(c, order))
  if (di < 0) return null
  let amount: number | null = null, amountAt = -1
  for (let i = cells.length - 1; i >= 0; i--) {
    if (i === di || /^\d{5,}$/.test(cells[i].trim())) continue
    const n = parseMoney(cells[i])
    if (n != null && n !== 0) { amount = n; amountAt = i; break }
  }
  if (amount == null) return null
  const merchant = cells.filter(c => /\p{L}/u.test(c) && !parseCardDate(c, order)).sort((a, b) => b.length - a.length)[0] ?? ''
  return { date: parseCardDate(cells[di], order)!, amount, amountAt, dateAt: di, merchant }
}

const EXTENDED_HEAD = /extended\s*details/i
const FOREIGN_AMOUNT_HEAD = /usd|\$|dollar|דולר/i
const MAX_SKIPPED = 500

/**
 * שורות העסקאות מהטבלה, עם שמות העמודות שזוהו.
 * קובץ במטבע זר (אמקס בדולרים): הסכום בשקלים נלקח מהטקסט של Extended Details,
 * ושורה שאין בה סכום בשקלים מסומנת usd ולא נכנסת להתאמה.
 * כל שורה אחרי הכותרת שלא נקלטה נרשמת ב-skipped עם הסיבה.
 */
export function extractCardRows(table: string[][]): CardFile {
  const order = detectDateOrder(table)
  const h = findHeader(table, order)
  const ext = h ? h.names.findIndex(c => EXTENDED_HEAD.test(c)) : -1
  let foreign = ext >= 0 || (h != null && FOREIGN_AMOUNT_HEAD.test(h.names[h.amount]))
  let ilsFrom: string | null = null
  const rows: FileRow[] = [], skipped: SkippedRow[] = [], inShekels = new Set<FileRow>()
  for (let r = h ? h.row + 1 : 0; r < table.length; r++) {
    const cells = table[r]
    let row: FileRow | null = null, why = ''
    let skip: number[] = []
    if (h && cells.length >= h.width - 1) {
      const rawDate = (cells[h.date] ?? '').trim()
      const date = parseCardDate(rawDate, order)
      const amount = parseMoney(cells[h.amount] ?? '')
      if (date && amount != null && amount !== 0) {
        row = {
          line: r + 1, date, amount,
          merchant: maskMerchant(h.merchant >= 0 ? cells[h.merchant] ?? '' : ''),
          ref: h.ref >= 0 ? cleanRef(cells[h.ref] ?? '') : '',
        }
        skip = [h.date, h.amount, h.merchant]
      } else {
        why = !rawDate ? 'אין תאריך' : !date ? `תאריך לא תקין: ${rawDate.slice(0, 20)}` : amount == null ? 'לא נמצא סכום' : 'סכום אפס'
      }
    }
    if (!row) {
      const c = rowByContent(cells, order)
      if (c) {
        row = { line: r + 1, date: c.date, amount: c.amount, merchant: maskMerchant(c.merchant), ref: '' }
        skip = [c.dateAt, c.amountAt]
      }
    }
    if (!row) {
      if (cells.filter(c => c.trim()).length >= 2 && skipped.length < MAX_SKIPPED) {
        skipped.push({ line: r + 1, why: why || 'לא נמצאו תאריך וסכום' })
      }
      continue
    }
    // סכום בשקלים בתא אחר בשורה (Extended Details): הוא הסכום שנבדק, עם הסימן של הסכום המקורי
    const where = ext >= 0 ? [ext] : cells.map((_, i) => i).filter(i => !skip.includes(i))
    for (const i of where) {
      const ils = ilsInText(cells[i] ?? '')
      if (ils == null) continue
      row.amount = row.amount < 0 ? -ils : ils
      inShekels.add(row)
      foreign = true
      ilsFrom ??= h?.names[i] || 'פירוט העסקה'
      break
    }
    rows.push(row)
    if (rows.length > MAX_CARD_ROWS) throw new CardFileError(`בקובץ יותר מ-${MAX_CARD_ROWS.toLocaleString('en-US')} עסקאות. פצלו אותו לתקופות קצרות יותר`)
  }
  if (!rows.length) throw new CardFileError('לא נמצאו בקובץ עסקאות עם תאריך וסכום. ודאו שזה קובץ הפירוט מחברת האשראי')
  if (foreign) for (const r of rows) if (!inShekels.has(r)) r.usd = true
  const columns: CardColumns = h
    ? { date: h.names[h.date], amount: h.names[h.amount], merchant: h.merchant >= 0 ? h.names[h.merchant] : null, ref: h.ref >= 0 ? h.names[h.ref] : null }
    : { date: 'תאריך (זוהה לפי התוכן)', amount: 'סכום (זוהה לפי התוכן)', merchant: 'בית עסק (זוהה לפי התוכן)', ref: null }
  return { columns, rows, skipped, order, ilsFrom, foreign }
}

export async function parseCardFile(buf: ArrayBuffer, name: string): Promise<CardFile> {
  if (buf.byteLength === 0) throw new CardFileError('הקובץ ריק')
  if (buf.byteLength > MAX_CARD_FILE_BYTES) throw new CardFileError('הקובץ גדול מ-5MB')
  return extractCardRows(await readCardTable(buf, name))
}

// ── ההתאמה ─────────────────────────────────────────────────────────────────

/**
 * ok/diff/none: שורה של בית החלמה, מותאמת / עם פער / בלי חיוב.
 * other: בית העסק לא זוהה כבית החלמה במערכת (לא נכנס להתאמה).
 * out: התאריך מחוץ לטווח שנבחר.
 */
export type MatchStatus = 'ok' | 'diff' | 'none' | 'other' | 'out'
export interface MatchedRow extends FileRow {
  status: MatchStatus
  chargeId: string | null
  /** הסבר קצר לפער או לחוסר ההתאמה; ריק כשהותאם */
  why: string
}
export interface ReconcileResult {
  rows: MatchedRow[]
  /** מזהי חיובים בטווח שאין להם שורה בקובץ */
  missing: string[]
  range: { from: string; to: string }
}

const DAY_MS = 86_400_000
const dayDiff = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS)
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
const money = (n: number) => `₪${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const norm = (s: string) => s.replace(/["'״׳`.,\-–()]/g, '').replace(/\s+/g, ' ').trim()
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005

const merchantKey = (s: string) => norm(s).toLowerCase()

/**
 * לאיזה בית החלמה שייך בית עסק בקובץ: לפי השם (שם הבית מופיע בשם בית העסק),
 * ואם לא, לפי הקובץ עצמו: בית שיש בו חיוב באותו סכום בדיוק ובתאריך קרוב
 * לחלק מספיק מהשורות של בית העסק (לפחות 30% ולא פחות משתיים; לבית עסק עם שורה אחת, אותו תאריך בדיוק).
 * כשכמה בתים עומדים בזה, רק הבית עם הכי הרבה התאמות.
 * כך גם שם באנגלית (אמקס) מזוהה, ובית עסק שאינו בית החלמה (מוסדות, ישיבות) לא נכנס.
 */
function homesOfMerchant(key: string, rows: FileRow[], homes: string[], charges: DonorCharge[]): string[] {
  const byName = homes.filter(h => merchantKey(h) && key.includes(merchantKey(h)))
  if (byName.length) return byName
  const countable = rows.filter(r => !r.usd)
  if (!countable.length) return []
  // שורה יחידה: רק אותו תאריך ואותו סכום, כדי שתשלום מקרי באותו סכום לא יקושר
  const single = countable.length === 1
  const need = single ? 1 : Math.max(2, Math.ceil(countable.length * 0.3))
  const hits = homes.map(h => ({ h, n: countable.filter(r => charges.some(c =>
    c.home === h && sameAmount(c.amount, r.amount) && dayDiff(c.date, r.date) <= (single ? 0 : DATE_SLACK_DAYS))).length }))
  // רק הבית עם הכי הרבה התאמות, כדי שבית עסק של סניף אחד לא יחפש גם בסניף אחר
  const best = Math.max(0, ...hits.map(x => x.n))
  return best >= need ? hits.filter(x => x.n === best).map(x => x.h) : []
}

/**
 * רק שורות בטווח (ברירת מחדל: טווח הקובץ) ורק של בתי עסק שזוהו כבית החלמה נכנסות להתאמה,
 * וכל אחת מחפשת רק בחיובים של הבית שלה, כך שאין התאמה בין סניפים.
 * כל שורה מקבלת לכל היותר חיוב אחד, וכל חיוב משויך לשורה אחת.
 * שלושה מעברים, מהחזק לחלש: תאריך וסכום זהים; אותו סכום בתאריך קרוב (עד 3 ימים);
 * אותו תאריך בסכום קרוב (עד 25%).
 */
export function reconcile(fileRows: FileRow[], charges: DonorCharge[], opts: { range?: { from: string; to: string } } = {}): ReconcileResult {
  const dates = fileRows.map(r => r.date).sort()
  const range = opts.range ?? { from: dates[0], to: dates[dates.length - 1] }
  const homes = [...new Set(charges.map(c => c.home))]
  const used = new Set<string>()
  const result: MatchedRow[] = fileRows.map(r => ({ ...r, status: 'none', chargeId: null, why: '' }))

  const groups = new Map<string, MatchedRow[]>()
  for (const r of result) {
    if (r.date < range.from || r.date > range.to) { r.status = 'out'; r.why = 'מחוץ לטווח שנבחר'; continue }
    const k = merchantKey(r.merchant)
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const pools = new Map<MatchedRow, { homes: string[]; list: DonorCharge[] }>()
  for (const [key, rows] of groups) {
    const linked = homesOfMerchant(key, rows, homes, charges)
    const list = charges.filter(c => linked.includes(c.home))
    for (const r of rows) {
      if (!linked.length) { r.status = 'other'; r.why = 'בית העסק לא זוהה כבית החלמה במערכת' }
      else if (r.usd) r.why = 'הסכום בקובץ בדולרים, ולא נמצא לו סכום בשקלים'
      else pools.set(r, { homes: linked, list })
    }
  }

  const pass = (score: (r: MatchedRow, c: DonorCharge) => number | null, done: (r: MatchedRow, c: DonorCharge) => void) => {
    result.forEach(r => {
      const pool = pools.get(r)
      if (r.chargeId || !pool) return
      let best: DonorCharge | null = null, bestScore = Infinity
      for (const c of pool.list) {
        if (used.has(c.id)) continue
        const s = score(r, c)
        if (s != null && s < bestScore) { best = c; bestScore = s }
      }
      if (best) { used.add(best.id); r.chargeId = best.id; done(r, best) }
    })
  }

  pass((r, c) => (r.date === c.date && sameAmount(r.amount, c.amount) ? 0 : null), r => { r.status = 'ok' })
  pass((r, c) => {
    if (!sameAmount(r.amount, c.amount)) return null
    const d = dayDiff(r.date, c.date)
    return d <= DATE_SLACK_DAYS ? d : null
  }, (r, c) => { r.status = 'diff'; r.why = `תאריך: ${dm(r.date)} בקובץ, ${dm(c.date)} במערכת` })
  pass((r, c) => {
    if (r.date !== c.date || c.amount <= 0) return null
    const d = Math.abs(r.amount - c.amount)
    return d / c.amount <= AMOUNT_SLACK ? d : null
  }, (r, c) => { r.status = 'diff'; r.why = `סכום: ${money(r.amount)} בקובץ, ${money(c.amount)} במערכת` })

  result.forEach(r => {
    const pool = pools.get(r)
    if (pool && !r.chargeId) r.why = `אין חיוב ב${pool.homes.join(' / ')} ב-${dm(r.date)} על ${money(r.amount)}`
  })

  const missing = charges.filter(c => !used.has(c.id) && c.date >= range.from && c.date <= range.to).map(c => c.id)
  return { rows: result, missing, range }
}
