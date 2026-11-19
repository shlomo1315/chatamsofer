import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// זרימה מלאה של מייל ל-k@: פענוח → ingestKvitel → kvitel_requests + kvitel_request_lines.
// ה-AI כבוי (מחזיר null), כך שנבדק הפענוח לפי תבנית בלבד.
vi.mock('./kvitelAi', () => ({ askClaudeJson: async () => null }))

import { handleKvitelEmail } from './kvitelEmail'
import { extractAttachmentTexts, type KvitelAttachmentText } from './kvitelAttachments'

type Row = Record<string, unknown>

// מסד מדומה בזיכרון: רק מה ש-handleKvitelEmail ו-ingestKvitel משתמשים בו.
function fakeDb() {
  const tables: Record<string, Row[]> = {}
  let seq = 0
  const t = (name: string) => (tables[name] ??= [])
  const query = (name: string, opts?: { count?: string; head?: boolean }) => {
    const filters: [string, unknown][] = []
    const rows = () => t(name).filter(r => filters.every(([k, v]) => r[k] === v))
    const q = {
      eq: (k: string, v: unknown) => { filters.push([k, v]); return q },
      neq: () => q, gte: () => q, in: () => q, limit: () => q,
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res(opts?.count ? { count: rows().length, data: null, error: null } : { data: rows(), error: null }),
    }
    return q
  }
  const db = {
    tables,
    from: (name: string) => ({
      select: (_c?: string, opts?: { count?: string; head?: boolean }) => query(name, opts),
      insert: (input: Row | Row[]) => {
        const list = (Array.isArray(input) ? input : [input]).map(r => ({ id: `${name}-${++seq}`, ...r }))
        if (name === 'kvitel_requests' && list.some(r => r.source_ref && t(name).some(x => x.channel === r.channel && x.source_ref === r.source_ref))) {
          const err = { error: { code: '23505', message: 'duplicate' }, data: null }
          return { select: () => ({ single: async () => err }), then: (res: (v: unknown) => unknown) => res(err) }
        }
        t(name).push(...list)
        const ok = { error: null, data: list[0] }
        return { select: () => ({ single: async () => ok }), then: (res: (v: unknown) => unknown) => res({ error: null }) }
      },
      update: (patch: Row) => ({ eq: async (k: string, v: unknown) => { t(name).filter(r => r[k] === v).forEach(r => Object.assign(r, patch)); return { error: null } } }),
      upsert: async (input: Row[]) => { t(name).push(...input); return { error: null } },
      delete: () => ({ eq: async (k: string, v: unknown) => { tables[name] = t(name).filter(r => r[k] !== v); return { error: null } } }),
    }),
  }
  return db as unknown as SupabaseClient & { tables: Record<string, Row[]> }
}

const mail = (o: Partial<{ messageId: string; subject: string; text: string; attachments: KvitelAttachmentText[] }>) => ({
  messageId: '<m1@mail>', fromEmail: 'Donor@Gmail.com', fromName: 'משפחת כהן', subject: 'שמות לתפילה', text: '', ...o,
})

describe('מייל ל-k@ נקלט כבקשת קוויטל', () => {
  let db: ReturnType<typeof fakeDb>
  beforeEach(() => { db = fakeDb() })

  it('בן: נוצרת בקשה עם השורה ופרטי הבקשה', async () => {
    const r = await handleKvitelEmail(db, mail({ text: 'משה בן יהודית - לרפואה שלימה' }))
    expect(r.ok).toBe(true)
    expect(r.requestId).toBeTruthy()
    const [req] = db.tables.kvitel_requests
    expect(req).toMatchObject({ channel: 'email', source_ref: '<m1@mail>', contact_email: 'donor@gmail.com', contact_name: 'משפחת כהן' })
    expect(String(req.raw_text)).toContain('משה בן יהודית')
    expect(db.tables.kvitel_request_lines.map(l => [l.request_id, l.name, l.relation, l.parent_name, l.request_type]))
      .toEqual([[req.id, 'משה', 'ben', 'יהודית', 'refua']])
  })

  it('בת', async () => {
    await handleKvitelEmail(db, mail({ text: 'שרה בת רחל לזיווג הגון' }))
    expect(db.tables.kvitel_request_lines.map(l => [l.name, l.relation, l.parent_name, l.request_type]))
      .toEqual([['שרה', 'bat', 'רחל', 'zivug']])
  })

  it('כמה שמות במייל אחד: בקשה אחת עם כל השורות', async () => {
    await handleKvitelEmail(db, mail({
      subject: 'לרפואה שלימה',
      text: 'שלום רב,\nמשה בן יהודית\nשרה בת רחל - פרנסה\nיעקב בן לאה, דוד בן מרים\nתודה רבה',
    }))
    expect(db.tables.kvitel_requests).toHaveLength(1)
    expect(db.tables.kvitel_request_lines.map(l => [l.name, l.relation, l.parent_name, l.request_type])).toEqual([
      ['משה', 'ben', 'יהודית', 'refua'],
      ['שרה', 'bat', 'רחל', 'parnasa'],
      ['יעקב', 'ben', 'לאה', 'refua'],
      ['דוד', 'ben', 'מרים', 'refua'],
    ])
  })

  it('מייל בלי פורמט "X בן/בת Y": לא נוצרת בקשה', async () => {
    const r = await handleKvitelEmail(db, mail({ subject: 'שאלה', text: 'שלום, מתי נוסעים לציון? תודה' }))
    expect(r).toEqual({ ok: true, skipped: 'no-names' })
    expect(db.tables.kvitel_requests ?? []).toHaveLength(0)
  })

  it('מייל כפול (אותו message-id שוב): לא נוצרת בקשה שנייה', async () => {
    const m = mail({ text: 'משה בן יהודית - לרפואה' })
    const first = await handleKvitelEmail(db, m)
    const second = await handleKvitelEmail(db, m)
    expect(first.requestId).toBeTruthy()
    expect(second).toEqual({ ok: true, duplicate: true })
    expect(db.tables.kvitel_requests).toHaveLength(1)
    expect(db.tables.kvitel_request_lines).toHaveLength(1)
  })

  it('שני מיילים שונים: שתי בקשות נפרדות', async () => {
    await handleKvitelEmail(db, mail({ messageId: '<a@x>', text: 'משה בן יהודית' }))
    await handleKvitelEmail(db, mail({ messageId: '<b@x>', text: 'שרה בת רחל' }))
    expect(db.tables.kvitel_requests).toHaveLength(2)
  })
})

// קובץ Word מינימלי: כל שורה פסקה, ושורה אחת בטבלה (תאים נפרדים).
async function docx(paragraphs: string[], table: string[][] = []) {
  const { default: JSZip } = await import('jszip')
  const p = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${t.replace(/&/g, '&amp;')}</w:t></w:r></w:p>`
  const rows = table.map(r => `<w:tr>${r.map(c => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`).join('')
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${paragraphs.map(p).join('')}${rows ? `<w:tbl>${rows}</w:tbl>` : ''}</w:body></w:document>`)
  return zip.generateAsync({ type: 'nodebuffer' })
}

const names = (db: ReturnType<typeof fakeDb>) =>
  (db.tables.kvitel_request_lines ?? []).map(l => `${l.name} ${l.relation === 'bat' ? 'בת' : 'בן'} ${l.parent_name}`)

describe('מייל מועבר ל-k@', () => {
  let db: ReturnType<typeof fakeDb>
  beforeEach(() => { db = fakeDb() })

  it('העברה מ-Gmail: השמות שאחרי כותרת ההעברה נקלטים', async () => {
    const r = await handleKvitelEmail(db, mail({
      subject: 'Fwd: שמות לתפילה',
      text: '\n\n---------- Forwarded message ---------\nמאת: יוסף לוי <y@gmail.com>\nDate: Thu, 14 Nov 2026 at 10:02\nSubject: שמות לתפילה\nTo: <bakashot@chasamsofer.info>\n\n\nמשה בן יהודית\nשרה בת רחל - לזיווג\n',
    }))
    expect(r.requestId).toBeTruthy()
    expect(names(db)).toEqual(['משה בן יהודית', 'שרה בת רחל'])
  })

  it('העברה מ-Outlook (FW ו-Original Message): נקלט', async () => {
    await handleKvitelEmail(db, mail({
      subject: 'FW: בקשה',
      text: '-----Original Message-----\nFrom: a@b.com\nSent: Monday\nTo: k@chasamsofer.info\nSubject: בקשה\n\nיעקב בן לאה',
    }))
    expect(names(db)).toEqual(['יעקב בן לאה'])
  })

  it('תשובה (לא העברה): הטקסט המצוטט לא נקלט', async () => {
    const r = await handleKvitelEmail(db, mail({
      subject: 'Re: שאלה',
      text: 'תודה רבה\n\n-----Original Message-----\nFrom: a@b.com\n\nמשה בן יהודית',
    }))
    expect(r).toEqual({ ok: true, skipped: 'no-names' })
  })

  it('העברה בלי שמות: לא נוצרת בקשה', async () => {
    const r = await handleKvitelEmail(db, mail({
      subject: 'Fwd: קבלה',
      text: '---------- Forwarded message ---------\nFrom: a@b.com\nSubject: קבלה\n\nמצורפת קבלה על התרומה, תודה',
    }))
    expect(r).toEqual({ ok: true, skipped: 'no-names' })
  })
})

describe('קובץ מצורף במייל ל-k@', () => {
  let db: ReturnType<typeof fakeDb>
  beforeEach(() => { db = fakeDb() })
  const wordFile = async (paras: string[], table: string[][] = []) =>
    extractAttachmentTexts([{ filename: 'שמות.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: await docx(paras, table) }])

  it('קובץ Word בלבד (גוף ריק): השמות מהקובץ נקלטים', async () => {
    const r = await handleKvitelEmail(db, mail({
      text: 'מצורף קובץ',
      attachments: await wordFile(['רשימת שמות', 'משה בן יהודית'], [['שרה', 'בת', 'רחל']]),
    }))
    expect(r.requestId).toBeTruthy()
    expect(names(db)).toEqual(['משה בן יהודית', 'שרה בת רחל'])
    const raw = String(db.tables.kvitel_requests[0].raw_text)
    expect(raw).toContain('[קובץ מצורף: שמות.docx]')
  })

  it('גוף וקובץ יחד: בקשה אחת עם כל השמות', async () => {
    await handleKvitelEmail(db, mail({ text: 'דוד בן מרים', attachments: await wordFile(['משה בן יהודית']) }))
    expect(db.tables.kvitel_requests).toHaveLength(1)
    expect(names(db)).toEqual(['דוד בן מרים', 'משה בן יהודית'])
  })

  it('גוף וקובץ בלי שמות: לא נוצרת בקשה', async () => {
    const r = await handleKvitelEmail(db, mail({ subject: 'קבלה', text: 'מצורף', attachments: await wordFile(['קבלה מספר 12']) }))
    expect(r).toEqual({ ok: true, skipped: 'no-names' })
    expect(db.tables.kvitel_requests ?? []).toHaveLength(0)
  })

  it('כפילות עם קובץ: אותו message-id לא נקלט פעמיים', async () => {
    const m = mail({ text: '', attachments: await wordFile(['משה בן יהודית']) })
    await handleKvitelEmail(db, m)
    expect(await handleKvitelEmail(db, m)).toEqual({ ok: true, duplicate: true })
    expect(db.tables.kvitel_requests).toHaveLength(1)
  })

  it('יותר מ-40 שמות: 40 נקלטים והבקשה עוברת לבדיקה', async () => {
    const abc = 'אבגדהוזחטיכלמנסעפצקרשת'
    const many = Array.from({ length: 45 }, (_, i) => `משה${abc[i % 22]}${abc[Math.floor(i / 22)]} בן יהודית`)
    await handleKvitelEmail(db, mail({ attachments: await wordFile(many) }))
    expect(db.tables.kvitel_request_lines).toHaveLength(40)
    expect(db.tables.kvitel_requests[0].status).toBe('review')
  })

  it('קובץ PDF: הטקסט נקרא', async () => {
    const { PDFDocument, StandardFonts } = await import('pdf-lib')
    const pdf = await PDFDocument.create()
    const page = pdf.addPage()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    page.drawText('Names list', { x: 50, y: 700, font })
    page.drawText('second line', { x: 50, y: 680, font })
    const [got] = await extractAttachmentTexts([{ filename: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) }])
    expect(got.text).toContain('Names list')
    expect(got.text).toContain('second line')
  })

  it('קובץ טקסט וקובץ שאינו נקרא: הטקסט נקלט, התמונה מדולגת', async () => {
    const got = await extractAttachmentTexts([
      { filename: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('רבקה בת שרה') },
      { filename: 'a.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([1, 2, 3]) },
      { filename: 'bad.docx', mimeType: '', buffer: Buffer.from('not a zip') },
    ])
    expect(got).toEqual([{ filename: 'a.txt', text: 'רבקה בת שרה' }])
  })
})
