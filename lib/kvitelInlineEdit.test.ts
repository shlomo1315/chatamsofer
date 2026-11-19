// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

// flushSync ולא act: act לא קיים בבנייה של React ל-production (NODE_ENV=production בעותק)
const act = (fn: () => void) => flushSync(fn)
const settle = async (fn: () => void) => { flushSync(fn); for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) }
import { parsePerson, inlineEditBody, saveInlineEdit, PERSON_HINT } from './kvitelInlineEdit'
import type { KvitelRequestRow } from './kvitelQuery'
import { InlineText } from '../app/admin/kvitel/KvitelInlineCell'

// בקשה עם שני שמות ומגיש — כמו שורה בטבלת "לא נשלח"
const row = (): KvitelRequestRow => ({
  id: 'req-1', channel: 'form', status: 'pending', submitted_at: '2026-11-18T10:00:00Z', done_at: null,
  contact_name: 'משה כהן', contact_phone: '0501234567', contact_email: null, note: null, raw_text: null, recording_url: null,
  kvitel_request_lines: [
    { id: 'l1', position: 1, name: 'יוסף', relation: 'ben', parent_name: 'עדינה', request_type: 'health', request_note: null, flagged: false, flag_reason: null },
    { id: 'l2', position: 2, name: 'חנה', relation: 'bat', parent_name: 'רחל', request_type: 'health', request_note: null, flagged: false, flag_reason: null },
  ],
} as unknown as KvitelRequestRow)

describe('parsePerson', () => {
  it('מחלק לשם, בן/בת ושם האם', () => {
    expect(parsePerson('יוסף בן עדינה')).toEqual({ name: 'יוסף', relation: 'ben', parentName: 'עדינה' })
    expect(parsePerson('חנה דינה  בת רחל חיה')).toEqual({ name: 'חנה דינה', relation: 'bat', parentName: 'רחל חיה' })
  })
  it('"בן" בתחילת השם אינו המפריד', () => {
    expect(parsePerson('בן ציון בן שרה')).toEqual({ name: 'בן ציון', relation: 'ben', parentName: 'שרה' })
  })
  it('בלי בן/בת — לא מזוהה', () => {
    expect(parsePerson('יוסף עדינה')).toBeNull()
  })
})

describe('inlineEditBody', () => {
  it('תיקון שם אחד משאיר את השאר ואת המגיש', () => {
    const res = inlineEditBody(row(), { kind: 'line', index: 1, text: 'חנה בת שרה' })
    expect('body' in res && res.body).toEqual({
      id: 'req-1',
      lines: [
        { name: 'יוסף', relation: 'ben', parentName: 'עדינה', requestType: 'health', requestNote: '' },
        { name: 'חנה', relation: 'bat', parentName: 'שרה', requestType: 'health', requestNote: '' },
      ],
      contact: { name: 'משה כהן', phone: '0501234567', email: '' },
    })
  })
  it('טקסט ריק מסיר שם, אבל לא את האחרון', () => {
    const res = inlineEditBody(row(), { kind: 'line', index: 0, text: '' })
    expect('body' in res && res.body.lines.map(l => l.name)).toEqual(['חנה'])
    const one = { ...row(), kvitel_request_lines: row().kvitel_request_lines.slice(0, 1) }
    expect(inlineEditBody(one, { kind: 'line', index: 0, text: '' })).toHaveProperty('error')
  })
  it('שם שלא נכתב בצורה הנכונה — שגיאה עם הסבר', () => {
    expect(inlineEditBody(row(), { kind: 'line', index: 0, text: 'יוסף' })).toEqual({ error: PERSON_HINT })
  })
  it('הוספת שם מעתיקה את הבקשה', () => {
    const res = inlineEditBody(row(), { kind: 'add', text: 'דוד בן לאה' })
    expect('body' in res && res.body.lines[2]).toEqual({ name: 'דוד', relation: 'ben', parentName: 'לאה', requestType: 'health', requestNote: '' })
  })
  it('בקשה חלה על כל השמות, ו"אחר" דורש נוסח', () => {
    const res = inlineEditBody(row(), { kind: 'request', requestType: 'other', requestNote: 'הצלחה במבחן' })
    expect('body' in res && res.body.lines.map(l => [l.requestType, l.requestNote])).toEqual([['other', 'הצלחה במבחן'], ['other', 'הצלחה במבחן']])
    expect(inlineEditBody(row(), { kind: 'request', requestType: 'other', requestNote: ' ' })).toEqual({ error: 'כתבו מה הבקשה' })
  })
  it('פרטי מגיש: שדה אחד בלבד', () => {
    const res = inlineEditBody(row(), { kind: 'contact', field: 'email', value: ' a@b.co ' })
    expect('body' in res && res.body.contact).toEqual({ name: 'משה כהן', phone: '0501234567', email: 'a@b.co' })
  })
})

describe('saveInlineEdit', () => {
  it('שולח PUT לנתיב השורות ומחזיר שורה מעודכנת', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const res = await saveInlineEdit(row(), { kind: 'line', index: 0, text: 'יוסף בן מרים' }, fetcher as unknown as typeof fetch)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/admin/kvitel/lines')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string).lines[0]).toMatchObject({ name: 'יוסף', parentName: 'מרים' })
    expect('row' in res && res.row.kvitel_request_lines[0].parent_name).toBe('מרים')
    expect('row' in res && res.row.kvitel_request_lines[1].parent_name).toBe('רחל')
  })
  it('שגיאת שרת חוזרת כהודעה', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }))
    expect(await saveInlineEdit(row(), { kind: 'contact', field: 'name', value: 'x' }, fetcher as unknown as typeof fetch)).toEqual({ error: 'אין הרשאה' })
  })
  it('קלט שגוי לא נשלח לשרת', async () => {
    const fetcher = vi.fn()
    expect(await saveInlineEdit(row(), { kind: 'add', text: 'בלי מפריד' }, fetcher as unknown as typeof fetch)).toEqual({ error: PERSON_HINT })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('InlineText — עריכה בתוך התא', () => {
  let root: Root | null = null
  let host: HTMLDivElement
  afterEach(() => { act(() => root?.unmount()); host?.remove(); root = null })

  function mount(onSave: (v: string) => Promise<string | null>) {
    host = document.createElement('div'); document.body.appendChild(host)
    root = createRoot(host)
    act(() => root!.render(createElement(InlineText, { value: 'יוסף בן עדינה', label: 'השם', onSave }, 'יוסף בן עדינה')))
  }
  const type = (input: HTMLInputElement, v: string) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => { set.call(input, v); input.dispatchEvent(new Event('input', { bubbles: true })) })
  }
  const key = (el: Element, k: string) => act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })) })

  it('לחיצה פותחת שדה, ו-Enter שומר את הערך החדש', async () => {
    const onSave = vi.fn(async () => null)
    mount(onSave)
    expect(host.querySelector('input')).toBeNull()
    act(() => host.querySelector<HTMLButtonElement>('[data-inline-view]')!.click())
    const input = host.querySelector('input')!
    expect(input.value).toBe('יוסף בן עדינה')
    type(input, 'יוסף בן מרים')
    await settle(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith('יוסף בן מרים')
    expect(host.querySelector('input')).toBeNull()
  })

  it('Escape מבטל בלי לשמור', () => {
    const onSave = vi.fn(async () => null)
    mount(onSave)
    act(() => host.querySelector<HTMLButtonElement>('[data-inline-view]')!.click())
    const input = host.querySelector('input')!
    type(input, 'משהו אחר')
    key(input, 'Escape')
    expect(onSave).not.toHaveBeenCalled()
    expect(host.querySelector('input')).toBeNull()
  })

  it('שגיאה מוצגת והשדה נשאר פתוח', async () => {
    mount(async () => 'השמירה נכשלה')
    act(() => host.querySelector<HTMLButtonElement>('[data-inline-view]')!.click())
    const input = host.querySelector('input')!
    type(input, 'יוסף בן מרים')
    await settle(() => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    expect(host.querySelector('[role=alert]')?.textContent).toBe('השמירה נכשלה')
    expect(host.querySelector('input')).not.toBeNull()
  })
})
