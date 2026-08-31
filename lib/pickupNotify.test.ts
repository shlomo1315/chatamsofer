import { describe, it, expect } from 'vitest'
import { scopeNotify, type NotifyCandidate } from './pickupNotify'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מי מקבל הודעה שהכרטיס מוכן.
//
// ⚠️ ההודעה אומרת "הכרטיס מוכן לאיסוף". משפחה שתקבל אותה בלי שנטען
// לה כרטיס תיסע למוקד ותחזור ריקם — ולכן הזכאות היא **נטען בפועל**,
// ולא "מאושר" או "בחר מוקד".
// ─────────────────────────────────────────────────────────────────────────────

const rows: NotifyCandidate[] = [
  { id: 'a', load_status: 'loaded',  center_id: 'c1', phone: '0501111111', email: 'a@b.co', notified_at: null },
  { id: 'b', load_status: 'loaded',  center_id: 'c1', phone: null,         email: 'b@b.co', notified_at: null },
  { id: 'c', load_status: 'loaded',  center_id: 'c1', phone: '0503333333', email: null,     notified_at: null },
  { id: 'd', load_status: 'pending', center_id: 'c1', phone: '0504444444', email: 'd@b.co', notified_at: null },
  { id: 'e', load_status: 'loaded',  center_id: null, phone: '0505555555', email: 'e@b.co', notified_at: null },
  { id: 'f', load_status: 'loaded',  center_id: 'c1', phone: '0506666666', email: 'f@b.co', notified_at: '2026-09-01T10:00:00Z' },
]

describe('scopeNotify — 🔴 מי מקבל', () => {
  it('🔴 רק מי שנטען לו הכרטיס בפועל', () => {
    const r = scopeNotify(rows)
    expect(r.phone.map(x => x.id)).not.toContain('d')
    expect(r.email.map(x => x.id)).not.toContain('d')
    expect(r.skipped.notLoaded).toBe(1)
  })

  it('⚠️ נטען בלי מוקד — לא מקבל. ההודעה נוקבת בשם המוקד', () => {
    const r = scopeNotify(rows)
    expect(r.phone.map(x => x.id)).not.toContain('e')
    expect(r.skipped.noCenter).toBe(1)
  })

  it('🔴 מי שכבר קיבל אינו מקבל שוב', () => {
    // ⚠️ הפעולה חוזרת: מריצים אותה שוב אחרי טעינה נוספת, ומשפחה
    // שמקבלת צינתוק שלישי מתקשרת למשרד לברר אם משהו השתבש.
    const r = scopeNotify(rows)
    expect(r.phone.map(x => x.id)).not.toContain('f')
    expect(r.skipped.alreadyNotified).toBe(1)
  })

  it('טלפון ומייל מחושבים בנפרד', () => {
    const r = scopeNotify(rows)
    // b בלי טלפון → רק מייל · c בלי מייל → רק טלפון
    expect(r.phone.map(x => x.id)).toEqual(['a', 'c'])
    expect(r.email.map(x => x.id)).toEqual(['a', 'b'])
  })

  it('⚠️ רשימה ריקה אינה קורסת', () => {
    const r = scopeNotify([])
    expect(r.phone).toEqual([])
    expect(r.email).toEqual([])
  })
})

describe('⚠️ מספרי טלפון', () => {
  it('מספר לא תקין מדולג — צינתוק אליו נכשל ממילא', () => {
    const r = scopeNotify([
      { id: 'x', load_status: 'loaded', center_id: 'c1', phone: '123', email: null, notified_at: null },
    ])
    expect(r.phone).toEqual([])
    expect(r.skipped.badPhone).toBe(1)
  })

  it('מספר עם מקפים ורווחים מתקבל ומנוקה', () => {
    const r = scopeNotify([
      { id: 'x', load_status: 'loaded', center_id: 'c1', phone: '050-123 4567', email: null, notified_at: null },
    ])
    expect(r.phone[0]?.phone).toBe('0501234567')
  })
})

describe('⚠️ הגבלה לרשימה שנבחרה', () => {
  it('onlyIds מצמצם ואינו עוקף את הכללים', () => {
    const r = scopeNotify(rows, { onlyIds: new Set(['a', 'd']) })
    expect(r.phone.map(x => x.id)).toEqual(['a'])
  })
})
