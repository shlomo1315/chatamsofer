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
  amount: number
}

export type CardColumns = { date: string; amount: string; merchant: string | null; ref: string | null }

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

function splitLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') q = false
      else cur += ch
    } else if (ch === '"') q = true
    else if (ch === delim) { out.push(cur.trim()); cur = '' }
    else cur += ch
  }
  out.push(cur.trim())
  return out
}

function delimitedTable(text: string): string[][] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const sample = lines.slice(0, 20).join('\n')
  const delim = sample.includes('\t') ? '\t' : sample.split(';').length > sample.split(',').length ? ';' : ','
  return lines.map(l => splitLine(l, delim))
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

/** תאריך בכל אחד מהפורמטים הנפוצים → YYYY-MM-DD, או null. */
export function parseCardDate(raw: string): string | null {
  const s = raw.trim()
  let y: number, m: number, d: number
  let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/)
  if (r) { y = +r[1]; m = +r[2]; d = +r[3] }
  else if ((r = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/))) { d = +r[1]; m = +r[2]; y = r[3].length === 2 ? 2000 + +r[3] : +r[3] }
  else return null
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return new Date(`${iso}T12:00:00Z`).getUTCDate() === d ? iso : null
}

/** סכום כסף (₪, ש״ח, פסיקים, מינוס מימין או משמאל) → מספר, או null. */
export function parseMoney(raw: string): number | null {
  let s = raw.replace(/₪|ש["״']?ח|NIS|ILS|\s/gi, '').replace(/,/g, '')
  let neg = false
  if (/^-|-$/.test(s)) { neg = true; s = s.replace(/^-|-$/g, '') }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const n = Number(s)
  return neg ? -n : n
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

function findHeader(table: string[][]) {
  for (let r = 0; r < Math.min(table.length, 15); r++) {
    const cells = table[r]
    if (cells.some(c => parseCardDate(c))) continue
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
function rowByContent(cells: string[]): { date: string; amount: number; merchant: string } | null {
  const di = cells.findIndex(c => parseCardDate(c))
  if (di < 0) return null
  let amount: number | null = null
  for (let i = cells.length - 1; i >= 0; i--) {
    if (i === di || /^\d{5,}$/.test(cells[i].trim())) continue
    const n = parseMoney(cells[i])
    if (n != null && n !== 0) { amount = n; break }
  }
  if (amount == null) return null
  const merchant = cells.filter(c => /\p{L}/u.test(c) && !parseCardDate(c)).sort((a, b) => b.length - a.length)[0] ?? ''
  return { date: parseCardDate(cells[di])!, amount, merchant }
}

/** שורות העסקאות מהטבלה, עם שמות העמודות שזוהו. */
export function extractCardRows(table: string[][]): { columns: CardColumns; rows: FileRow[] } {
  const h = findHeader(table)
  const rows: FileRow[] = []
  for (let r = h ? h.row + 1 : 0; r < table.length; r++) {
    const cells = table[r]
    let row: FileRow | null = null
    if (h && cells.length >= h.width - 1) {
      const date = parseCardDate(cells[h.date] ?? '')
      const amount = parseMoney(cells[h.amount] ?? '')
      if (date && amount != null && amount !== 0) {
        row = {
          line: r + 1, date, amount,
          merchant: maskMerchant(h.merchant >= 0 ? cells[h.merchant] ?? '' : ''),
          ref: h.ref >= 0 ? cleanRef(cells[h.ref] ?? '') : '',
        }
      }
    }
    if (!row) {
      const c = rowByContent(cells)
      if (c) row = { line: r + 1, date: c.date, amount: c.amount, merchant: maskMerchant(c.merchant), ref: '' }
    }
    if (!row) continue
    rows.push(row)
    if (rows.length > MAX_CARD_ROWS) throw new CardFileError(`בקובץ יותר מ-${MAX_CARD_ROWS.toLocaleString('en-US')} עסקאות. פצלו אותו לתקופות קצרות יותר`)
  }
  if (!rows.length) throw new CardFileError('לא נמצאו בקובץ עסקאות עם תאריך וסכום. ודאו שזה קובץ הפירוט מחברת האשראי')
  const columns: CardColumns = h
    ? { date: h.names[h.date], amount: h.names[h.amount], merchant: h.merchant >= 0 ? h.names[h.merchant] : null, ref: h.ref >= 0 ? h.names[h.ref] : null }
    : { date: 'תאריך (זוהה לפי התוכן)', amount: 'סכום (זוהה לפי התוכן)', merchant: 'בית עסק (זוהה לפי התוכן)', ref: null }
  return { columns, rows }
}

export async function parseCardFile(buf: ArrayBuffer, name: string): Promise<{ columns: CardColumns; rows: FileRow[] }> {
  if (buf.byteLength === 0) throw new CardFileError('הקובץ ריק')
  if (buf.byteLength > MAX_CARD_FILE_BYTES) throw new CardFileError('הקובץ גדול מ-5MB')
  return extractCardRows(await readCardTable(buf, name))
}

// ── ההתאמה ─────────────────────────────────────────────────────────────────

export type MatchStatus = 'ok' | 'diff' | 'none'
export interface MatchedRow extends FileRow {
  status: MatchStatus
  chargeId: string | null
  /** הסבר קצר לפער או לחוסר ההתאמה; ריק כשהותאם */
  why: string
}
export interface ReconcileResult {
  rows: MatchedRow[]
  /** מזהי חיובים בטווח התאריכים של הקובץ שאין להם שורה בקובץ */
  missing: string[]
  range: { from: string; to: string }
}

const DAY_MS = 86_400_000
const dayDiff = (a: string, b: string) => Math.round(Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS)
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}`
const money = (n: number) => `₪${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const norm = (s: string) => s.replace(/["'״׳`.,\-–()]/g, '').replace(/\s+/g, ' ').trim()
const sameAmount = (a: number, b: number) => Math.abs(a - b) < 0.005

/**
 * כל שורה בקובץ מקבלת לכל היותר חיוב אחד, וכל חיוב משויך לשורה אחת.
 * שלושה מעברים, מהחזק לחלש: תאריך וסכום זהים; אותו סכום בתאריך קרוב (עד 3 ימים);
 * אותו תאריך בסכום קרוב (עד 25%). שורה שבית העסק שלה מזכיר סניף מחפשת רק בסניף הזה.
 */
export function reconcile(fileRows: FileRow[], charges: DonorCharge[]): ReconcileResult {
  const homes = [...new Set(charges.map(c => c.home))]
  const used = new Set<string>()
  const result: MatchedRow[] = fileRows.map(r => ({ ...r, status: 'none', chargeId: null, why: '' }))
  const pools = result.map(r => {
    const m = norm(r.merchant)
    const hit = homes.filter(h => norm(h) && m.includes(norm(h)))
    return { home: hit[0] ?? null, list: hit.length ? charges.filter(c => hit.includes(c.home)) : charges }
  })

  const pass = (score: (r: MatchedRow, c: DonorCharge) => number | null, done: (r: MatchedRow, c: DonorCharge) => void) => {
    result.forEach((r, i) => {
      if (r.chargeId) return
      let best: DonorCharge | null = null, bestScore = Infinity
      for (const c of pools[i].list) {
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

  result.forEach((r, i) => {
    if (!r.chargeId) r.why = `אין חיוב${pools[i].home ? ` ב${pools[i].home}` : ''} ב-${dm(r.date)} על ${money(r.amount)}`
  })

  const dates = fileRows.map(r => r.date).sort()
  const range = { from: dates[0], to: dates[dates.length - 1] }
  const missing = charges.filter(c => !used.has(c.id) && c.date >= range.from && c.date <= range.to).map(c => c.id)
  return { rows: result, missing, range }
}
