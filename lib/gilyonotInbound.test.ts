import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/emailTextsStore', () => ({ textFor: (_k: string, d: string) => d, ensureEmailTexts: async () => {} }))

import { handleGilyonotInbound, buildGilyonotReply, isAutomatedInbound, isSpoofedSender, SENDER_DAILY_CAP } from './gilyonotInbound'

type Row = Record<string, unknown>

/** מסד בזיכרון: רק מה שהקליטה משתמשת בו. */
function fakeDb(subs: Row[] = [], log: Row[] = []) {
  const tables: Record<string, Row[]> = { gilyonot_subscribers: subs, auto_reply_log: log }
  return {
    tables,
    from(name: string) {
      const rows = tables[name]
      const filters: ((r: Row) => boolean)[] = []
      let head = false
      const q = {
        select(_c?: string, o?: { head?: boolean }) { head = !!o?.head; return q },
        eq(k: string, v: unknown) { filters.push(r => r[k] === v); return q },
        like(k: string, v: string) { const pre = v.replace('%', ''); filters.push(r => String(r[k]).startsWith(pre)); return q },
        gte(k: string, v: string) { filters.push(r => String(r[k]) >= v); return q },
        maybeSingle: async () => ({ data: rows.filter(r => filters.every(f => f(r)))[0] ?? null, error: null }),
        insert: async (row: Row) => {
          if (name === 'gilyonot_subscribers' && rows.some(r => r.email === row.email)) return { error: { code: '23505', message: 'dup' } }
          rows.push({ id: String(rows.length + 1), status: 'active', token: `tok-${rows.length + 1}`, created_at: new Date().toISOString(), ...row })
          return { error: null }
        },
        update(patch: Row) { return { eq: async (_k: string, v: unknown) => { rows.filter(r => r.id === v).forEach(r => Object.assign(r, patch)); return { error: null } } } },
        then(res: (v: unknown) => unknown) {
          const n = rows.filter(r => filters.every(f => f(r))).length
          return Promise.resolve(res({ count: head ? n : null, data: null, error: null }))
        },
      }
      return q
    },
  } as unknown as SupabaseClient & { tables: Record<string, Row[]> }
}

const mk = () => ({ sent: [] as { to: string; subject: string; html: string; unsub: string | null }[] })
const sender = (m: ReturnType<typeof mk>) => async (to: string, mail: { subject: string; html: string }, unsub: string | null) => { m.sent.push({ to, ...mail, unsub }); return true }

describe('קליטת מייל ל-d@', () => {
  it('שולח חדש נרשם ומקבל אישור עם כפתור הסרה והודעת "אין להשיב"', async () => {
    const db = fakeDb(); const m = mk()
    const r = await handleGilyonotInbound(db, { fromEmail: 'Moshe@Gmail.com', fromName: 'משה כהן' }, sender(m))
    expect(r).toBe('added')
    expect(db.tables.gilyonot_subscribers).toHaveLength(1)
    expect(db.tables.gilyonot_subscribers[0]).toMatchObject({ email: 'moshe@gmail.com', source: 'email', full_name: 'משה כהן' })
    expect(m.sent).toHaveLength(1)
    expect(m.sent[0].html).toContain('שימו לב, הרישום שלכם בוצע בהצלחה')
    expect(m.sent[0].html).toContain('מעתה, בכל פעם שיישלח גיליון, תקבלו אותו במייל')
    expect(m.sent[0].html).toContain('מייל זה נשלח ממערכת אוטומטית. תיבת הדואר הזו אינה נקראת כלל')
    expect(m.sent[0].html).toContain('הסרה מרשימת התפוצה')
    expect(m.sent[0].html).toContain('/api/gilyonot/unsubscribe/tok-1')
    expect(m.sent[0].html).toContain('Heebo')
    expect(m.sent[0].html).toContain('logo')
    expect(m.sent[0].unsub).toContain('/api/gilyonot/unsubscribe/tok-1')
  })

  it('שולח שכבר רשום לא נוסף שוב ומקבל "אתם כבר רשומים"', async () => {
    const db = fakeDb([{ id: '9', email: 'a@x.com', status: 'active', full_name: 'א', token: 'tok-9' }]); const m = mk()
    const r = await handleGilyonotInbound(db, { fromEmail: 'a@x.com' }, sender(m))
    expect(r).toBe('exists')
    expect(db.tables.gilyonot_subscribers).toHaveLength(1)
    expect(m.sent[0].html).toContain('שימו לב, אתם כבר רשומים לקבלת גיליונות מהמערכת')
    expect(m.sent[0].html).toContain('מייל זה נשלח ממערכת אוטומטית')
    expect(m.sent[0].html).toContain('/api/gilyonot/unsubscribe/tok-9')
  })

  it('מי שהסיר את עצמו לא מוחזר אוטומטית, ומקבל קישור להרשמה מחדש', async () => {
    const db = fakeDb([{ id: '9', email: 'a@x.com', status: 'unsubscribed', full_name: null, token: 'tok-9' }]); const m = mk()
    expect(await handleGilyonotInbound(db, { fromEmail: 'a@x.com' }, sender(m))).toBe('blocked_unsubscribed')
    expect(db.tables.gilyonot_subscribers[0].status).toBe('unsubscribed')
    expect(m.sent[0].html).toContain('/gilyonot')
    expect(m.sent[0].html).not.toContain('/api/gilyonot/unsubscribe/')
  })

  it('לא משיב להודעות אוטומטיות ולא רושם אותן', async () => {
    const db = fakeDb(); const m = mk()
    for (const fromEmail of ['mailer-daemon@googlemail.com', 'noreply@shop.com', 'postmaster@x.com', 'bounce-123@x.com', 'office@chasamsofer.info']) {
      expect(await handleGilyonotInbound(db, { fromEmail }, sender(m))).toBe('ignored_auto')
    }
    const headers = [{ name: 'Auto-Submitted', value: 'auto-replied' }]
    expect(await handleGilyonotInbound(db, { fromEmail: 'out@of-office.com', headers }, sender(m))).toBe('ignored_auto')
    expect(await handleGilyonotInbound(db, { fromEmail: 'x@y.com', headers: { 'Precedence': 'bulk' } }, sender(m))).toBe('ignored_auto')
    expect(db.tables.gilyonot_subscribers).toHaveLength(0)
    expect(m.sent).toHaveLength(0)
  })

  it('דוחה כתובת לא תקינה ושולח מזויף (DMARC נכשל)', async () => {
    const db = fakeDb(); const m = mk()
    expect(await handleGilyonotInbound(db, { fromEmail: 'לא מייל' }, sender(m))).toBe('ignored_invalid')
    const headers = [{ name: 'Authentication-Results', value: 'mx.google.com; spf=pass; dmarc=fail (p=REJECT)' }]
    expect(await handleGilyonotInbound(db, { fromEmail: 'victim@x.com', headers }, sender(m))).toBe('ignored_spoofed')
    expect(db.tables.gilyonot_subscribers).toHaveLength(0)
    expect(m.sent).toHaveLength(0)
  })

  it('הגבלת קצב: אחרי התקרה היומית לשולח לא נשלח מענה נוסף', async () => {
    const db = fakeDb(); const m = mk()
    for (let i = 0; i < SENDER_DAILY_CAP; i++) await handleGilyonotInbound(db, { fromEmail: 'a@x.com' }, sender(m))
    expect(await handleGilyonotInbound(db, { fromEmail: 'a@x.com' }, sender(m))).toBe('rate_limited')
    expect(m.sent).toHaveLength(SENDER_DAILY_CAP)
  })

  it('כשל בשליחה מחזיר error (כדי שה-webhook ינסה שוב)', async () => {
    const db = fakeDb()
    expect(await handleGilyonotInbound(db, { fromEmail: 'a@x.com' }, async () => false)).toBe('error')
  })
})

describe('עזרי הקליטה', () => {
  it('זיהוי אוטומטי וזיוף', () => {
    expect(isAutomatedInbound('person@gmail.com', [])).toBe(false)
    expect(isAutomatedInbound('person@gmail.com', [{ name: 'List-Id', value: 'x' }])).toBe(true)
    expect(isSpoofedSender([{ name: 'Authentication-Results', value: 'spf=pass dkim=pass dmarc=pass' }])).toBe(false)
    expect(isSpoofedSender(undefined)).toBe(false)
  })
  it('קישור ההסרה מופיע רק כשיש טוקן', () => {
    expect(buildGilyonotReply('added', { unsubscribeUrl: null }).html).not.toContain('הסרה מרשימת התפוצה')
  })
})
