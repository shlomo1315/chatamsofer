import type { SupabaseClient } from '@supabase/supabase-js'
import { MAX_LINES, validateLine, type KvitelLineInput, type KvitelRequestType } from '@/lib/kvitel'
import { askClaudeJson } from '@/lib/kvitelAi'
import { ingestKvitel } from '@/lib/kvitelIngest'

// ─────────────────────────────────────────────────────────────────────────────
// ערוץ המייל של הקוויטלאך: מייל לתיבה k@ מפוענח לשורות (שם, בן/בת, שם האם, בקשה).
//
// שני שלבים:
//   1. פענוח לפי תבנית ("משה בן שרה - לרפואה שלימה"), שורה אחר שורה. מהיר, בלי AI.
//   2. אם נשאר טקסט שלא פוענח, או שלא נמצאו שמות, ה-AI מפענח את כל המייל.
// כל שורה שהפענוח לא בטוח בה מסומנת, ואז הבקשה נכנסת ל"לבדיקה" ולא ל-Word.
// המייל נשמר גם בתיבה הרגילה (inbound_emails). כאן רק קולטים ממנו את השמות.
// ─────────────────────────────────────────────────────────────────────────────

export const KVITEL_MAILBOX = (process.env.KVITEL_MAILBOX || 'k@chasamsofer.info').toLowerCase()
const MAX_TEXT = 6000

export function isKvitelMailbox(recipients: string[]): boolean {
  return recipients.some(r => r.toLowerCase() === KVITEL_MAILBOX)
}

// קוויטלאך מגיעים בפועל גם לתיבות אחרות (m@, office@) עם "קויטל" בנושא.
// תשובה או העברה (Re:/Fwd:/השב) היא שרשור, לא בקשה חדשה.
const KVITEL_SUBJECT = /קו?ויטל|kvit(e|i)l/i
const REPLY_SUBJECT = /^\s*(re|fw|fwd|aw|tr|השב|תשובה|הועבר)\s*:/i
export function isKvitelSubject(subject: string): boolean {
  return KVITEL_SUBJECT.test(subject) && !REPLY_SUBJECT.test(subject)
}

// איך זוהה מייל קוויטל: לפי התיבה k@ (כל מייל נקלט), או לפי הנושא בתיבה אחרת
// (נקלט רק אם נמצא בו שם, כדי ששאלה כללית לא תיכנס כבקשה). מייל מכתובת הארגון עצמו לא נקלט לפי הנושא.
export function detectKvitelEmail(m: {
  recipients: string[]; subject: string; fromEmail: string; isOrgAddr: (a: string) => boolean
}): 'mailbox' | 'subject' | null {
  if (isKvitelMailbox(m.recipients)) return 'mailbox'
  if (isKvitelSubject(m.subject) && !m.isOrgAddr(m.fromEmail.toLowerCase())) return 'subject'
  return null
}

// גוף שהגיע מ-HTML נשאר לפעמים עם &quot; ו-&#39;, ואז לרפו&quot;ש לא מזוהה.
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

const TYPE_WORDS: [KvitelRequestType, RegExp][] = [
  ['refua', /רפו(א|ו)ה|רפו"ש|רפוש|רפ"ש|לרפו|בריאות/],
  ['parnasa', /פרנס/],
  // כולל קיצורים: זיווה"ג (זיווג הגון), זוו"ה.
  ['zivug', /זיווג|זווג|זיווה"?ג|זווה"?ג|זוו"ה|שידוך/],
  ['zera', /זרע של קיימא|זרעא חייא|זש"ק|זשק|זחו"ק|זחוק|פרי בטן|ילדים/],
  ['hatzlacha', /הצלח/],
  ['yeshua', /ישוע|ברכה/],
]

// מזהה סוג בקשה מתוך טקסט חופשי. מילה שלא מוכרת → "אחר" עם הטקסט עצמו.
export function guessRequestType(text: string): { requestType: KvitelRequestType; requestNote: string | null } | null {
  const t = text.replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, '')
  if (!t) return null
  for (const [key, re] of TYPE_WORDS) if (re.test(t)) return { requestType: key, requestNote: null }
  return { requestType: 'other', requestNote: t.slice(0, 80) }
}

// "שם בן/בת שם-האם [- בקשה]". שם האם נגמר במפריד, או במילת בקשה מוכרת (לרפואה, שיזכה).
// ⚠️ לא "כל מילה שמתחילה ב-ל": "פעשא לאה" היה נחתך ל"פעשא".
const LINE_RE = /^(.+?)\s+(בן|בת|ב"ר|בר)\s+(.+?)(?:\s*[-–—:,]\s*(.+)|\s+((?:ל|ש|ל?ה)(?:רפו|רפ"ש|פרנס|זיווג|זווג|זיווה|זווה|זוו"ה|שידוך|זרע|זש"ק|זשק|זחו"ק|הצלח|ישוע|ברכה|בריאות|יזכה|תזכה|שלום)\S*.*))?$/

// שורות התוכן: עד החתימה או הציטוט של מייל קודם, בלי מספור ותבליטים.
function bodyLines(text: string): string[] {
  const out: string[] = []
  for (const raw of decodeEntities(text).slice(0, MAX_TEXT).split(/\r?\n/)) {
    const line = raw.trim()
    if (/^(--|__|On .+wrote:|ב.+כתב|-----Original|נשלח מ)/.test(line)) break
    if (!line || line.startsWith('>')) continue
    out.push(line.replace(/^[\d]+[.)]\s*|^[•*\-–]\s*/, ''))
  }
  return out
}

export interface ParsedKvitelEmail {
  lines: KvitelLineInput[]
  flags: (string | null)[]
  leftover: string[]   // שורות שלא פוענחו (לא ברכות/חתימה)
}

// מילים שאינן שמות: פתיחה וסגירה של מייל.
const NOISE = /^(שלום|שלו"ם|בס"ד|ב"ה|בסייעתא|לכבוד|תודה|בברכה|נא להזכיר|נא להתפלל|אבקש|מצורפים|השמות|רשימת)/

// שורה שכולה בקשה כללית ("לרפואה שלימה") — לא שם שלא פוענח.
const isRequestLine = (l: string) => { const g = guessRequestType(l); return !!g && g.requestType !== 'other' && l.length < 40 }

export function parseKvitelEmailText(subject: string, text: string): ParsedKvitelEmail {
  // בקשה כללית לכל המייל ("לרפואה שלימה" בנושא או בשורה נפרדת) לשורות שאין להן בקשה.
  const lines = bodyLines(text)
  const general = [subject, ...lines.filter(l => !LINE_RE.test(l))]
    .filter(isRequestLine).map(l => guessRequestType(l)).find(Boolean) ?? null

  const out: ParsedKvitelEmail = { lines: [], flags: [], leftover: [] }
  for (const line of lines) {
    const parts = line.split(/[;]|,(?=[^,]*\s(?:בן|בת)\s)/).map(p => p.trim()).filter(Boolean)
    let matched = false
    for (const part of parts) {
      const m = part.match(LINE_RE)
      if (!m) continue
      matched = true
      const own = guessRequestType(m[4] ?? m[5] ?? '')
      const req = own ?? general
      const v = validateLine({
        name: m[1], relation: m[2] === 'בת' ? 'bat' : 'ben', parentName: m[3],
        requestType: req?.requestType ?? 'yeshua', requestNote: req?.requestNote ?? null,
      }, out.lines.length)
      if (!v.ok) { out.leftover.push(part); continue }
      // "נתן בן שרה מלכה לתפילה בציון": המשפט נבלע בשם האם. נשאר ל-AI ומסומן.
      const longParent = m[3].trim().split(/\s+/).length > 3
      if (longParent) out.leftover.push(part)
      out.lines.push(v.line)
      out.flags.push(
        longParent ? 'שם האם ארוך, ייתכן שנבלע בו טקסט'
        : !req ? 'לא צוין סוג בקשה (הונח "ישועה וברכה")'
          : m[2] === 'ב"ר' || m[2] === 'בר' ? 'בן או בת? (נכתב ב"ר)'
            : req.requestType === 'other' ? 'בקשה חופשית מהמייל' : null,
      )
    }
    if (!matched && !NOISE.test(line) && !isRequestLine(line)) out.leftover.push(line)
  }
  out.lines = out.lines.slice(0, MAX_LINES)
  out.flags = out.flags.slice(0, MAX_LINES)
  return out
}

interface AiLine { name: string; relation: 'ben' | 'bat'; parentName: string; requestType: string; requestNote?: string | null; sure?: boolean }

// פענוח AI למייל שלא פוענח לפי תבנית. כל שורה שה-AI לא בטוח בה מסומנת.
export async function aiParseKvitelEmail(subject: string, text: string): Promise<{ lines: KvitelLineInput[]; flags: (string | null)[] } | null> {
  const res = await askClaudeJson<{ lines: AiLine[] }>({
    system: 'אתה מפענח מיילים שנשלחים לתיבת קוויטלאך (שמות לתפילה על ציון צדיק). חלץ כל אדם: שם פרטי, בן או בת, שם האם, וסוג הבקשה. אל תמציא שמות ואל תתקן כתיב. ענה JSON בלבד.',
    prompt: `סוגי בקשה מותרים: refua (רפואה), parnasa (פרנסה), zivug (זיווג), zera (זרע של קיימא), hatzlacha (הצלחה), yeshua (ישועה וברכה), other (אחר, עם requestNote קצר).
החזר {"lines":[{"name":"","relation":"ben|bat","parentName":"","requestType":"","requestNote":null,"sure":true}]}.
sure=false כשחסר שם האם, כשלא ברור אם בן או בת, או כשהבקשה לא נאמרה במפורש.

נושא: ${subject}
${text.slice(0, MAX_TEXT)}`,
    maxTokens: 2000, timeoutMs: 20000,
  })
  if (!res || !Array.isArray(res.lines)) return null
  const lines: KvitelLineInput[] = []
  const flags: (string | null)[] = []
  for (const l of res.lines.slice(0, MAX_LINES)) {
    const v = validateLine(l as unknown as Record<string, unknown>, lines.length)
    if (!v.ok) continue
    lines.push(v.line)
    flags.push(l.sure === false ? 'פענוח AI לא בטוח' : null)
  }
  return { lines, flags }
}

// נקרא מ-webhook של Resend לכל מייל קוויטל (ראו detectKvitelEmail). בטוח לקריאה חוזרת (sourceRef = message-id).
// requireLines: מייל שזוהה לפי הנושא בלבד נקלט רק אם נמצא בו שם.
export async function handleKvitelEmail(db: SupabaseClient, m: {
  messageId: string; fromEmail: string; fromName: string | null; subject: string; text: string; requireLines?: boolean
}): Promise<{ ok: boolean; requestId?: string; status?: string; skipped?: string }> {
  m = { ...m, subject: decodeEntities(m.subject), text: decodeEntities(m.text) }
  const { count } = await db.from('kvitel_requests').select('id', { count: 'exact', head: true })
    .eq('channel', 'email').eq('source_ref', m.messageId)
  if (count) return { ok: true }

  let parsed: { lines: KvitelLineInput[]; flags: (string | null)[] } = parseKvitelEmailText(m.subject, m.text)
  let note = 'פוענח מהמייל לפי תבנית'
  const leftover = (parsed as ParsedKvitelEmail).leftover
  if (!parsed.lines.length || leftover.length) {
    const ai = await aiParseKvitelEmail(m.subject, m.text)
    if (ai && ai.lines.length >= parsed.lines.length) { parsed = ai; note = 'פוענח מהמייל ב-AI' }
    else if (leftover.length) note = `נשארו ${leftover.length} שורות שלא פוענחו — יש לבדוק את המקור`
  }
  if (m.requireLines && !parsed.lines.length) return { ok: true, skipped: 'no-names' }

  const res = await ingestKvitel(db, {
    channel: 'email',
    // שורות שלא פוענחו → כל הבקשה לבדיקה, גם אם הסוכן לא סימן דבר.
    status: note.startsWith('נשארו') ? 'review' : undefined,
    email: m.fromEmail, contactName: m.fromName,
    lines: parsed.lines, lineFlags: parsed.flags,
    rawText: `${m.subject}\n\n${m.text}`.slice(0, MAX_TEXT),
    sourceRef: m.messageId, note,
  })
  if (!res.ok) { console.error('[kvitel-email] ingest failed:', res.error); return { ok: false } }
  return { ok: true, requestId: res.requestId, status: res.status }
}
