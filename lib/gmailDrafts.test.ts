import { describe, it, expect } from 'vitest'
import {
  checkDraftConflict, isDraftEmpty, reconcileDrafts, encodeDraftMime, CONFLICT_MESSAGE,
  type DraftRow,
} from './gmailDrafts'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ טיוטה היא הדבר היחיד בסנכרון שהמשתמש עורך *בו-זמנית* בשני מקומות.
// כל כשל כאן פירושו טקסט שנכתב ונעלם — ולכן הבדיקות נעולות על ההתנגשויות.
// ─────────────────────────────────────────────────────────────────────────────

describe('🔴 זיהוי התנגשות — טקסט שנכתב לא נעלם בשקט', () => {
  it('אין התנגשות כשהגרסה לא זזה', () => {
    expect(checkDraftConflict('m1', 'm1')).toEqual({ kind: 'none' })
  })

  it('טיוטה חדשה — אין עם מה להתנגש', () => {
    expect(checkDraftConflict(null, null)).toEqual({ kind: 'none' })
    expect(checkDraftConflict(null, 'm9')).toEqual({ kind: 'none' })
  })

  it('🔴 הגרסה המרוחקת התקדמה — התנגשות', () => {
    // בלי הזיהוי הזה, שמירה מהתוכנה הייתה דורסת בשקט את מה שנכתב בטלפון.
    expect(checkDraftConflict('m1', 'm2')).toEqual({ kind: 'remote-changed', remoteRevision: 'm2' })
  })

  it('🔴 נמחקה בצד השני', () => {
    // כתיבה עיוורת הייתה מחזירה לחיים טיוטה שנמחקה בכוונה.
    expect(checkDraftConflict('m1', null)).toEqual({ kind: 'remote-deleted' })
  })

  it('לכל התנגשות יש הודעה למשתמש', () => {
    for (const k of ['remote-changed', 'remote-deleted'] as const) {
      expect(CONFLICT_MESSAGE[k]).toBeTruthy()
    }
  })
})

describe('טיוטה ריקה אינה נשמרת', () => {
  it('🔴 ריקה לגמרי', () => {
    // אחרת כל פתיחה וסגירה של חלון יוצרת טיוטה ריקה בגמייל.
    expect(isDraftEmpty({})).toBe(true)
    expect(isDraftEmpty({ to_email: '', subject: '', body: '' })).toBe(true)
    expect(isDraftEmpty({ body: '   ' })).toBe(true)
  })

  it('גוף שהוא HTML ריק נחשב ריק', () => {
    expect(isDraftEmpty({ body: '<div></div>' })).toBe(true)
    expect(isDraftEmpty({ body: '<p><br></p>' })).toBe(true)
  })

  it('כל שדה שמולא הופך אותה ללא-ריקה', () => {
    expect(isDraftEmpty({ to_email: 'a@b.com' })).toBe(false)
    expect(isDraftEmpty({ subject: 'נושא' })).toBe(false)
    expect(isDraftEmpty({ body: '<p>שלום</p>' })).toBe(false)
  })
})

describe('התאמה מול Gmail', () => {
  const local = (id: string): DraftRow => ({
    draft_id: id, message_id: null, thread_id: null, to_email: null,
    subject: null, body: null, updated_at: '', base_revision: null,
  })

  it('🔴 טיוטה שנעלמה מ-Gmail מסומנת למחיקה ואינה חוזרת', () => {
    // טיוטות שנמחקו וחוזרות בכל סנכרון גורמות למשתמש לאבד אמון במערכת.
    const r = reconcileDrafts([local('d1'), local('d2')], [{ id: 'd1' }])
    expect(r.removedLocally).toEqual(['d2'])
  })

  it('אין מחיקות כששני הצדדים תואמים', () => {
    const r = reconcileDrafts([local('d1')], [{ id: 'd1' }])
    expect(r.removedLocally).toEqual([])
  })

  it('רשימה מקומית ריקה אינה מוחקת דבר', () => {
    const r = reconcileDrafts([], [{ id: 'd1' }, { id: 'd2' }])
    expect(r.removedLocally).toEqual([])
    expect(r.remoteIds).toEqual(['d1', 'd2'])
  })
})

describe('קידוד MIME', () => {
  it('🔴 base64url ולא base64 — Gmail דוחה את הרגיל', () => {
    const enc = encodeDraftMime({ to: 'a@b.com', subject: 'x', body: '<p>y</p>' })
    expect(enc).not.toMatch(/[+/=]/)
  })

  it('🔴 נושא בעברית מקודד ואינו נשלח גולמי', () => {
    // נושא בעברית ללא קידוד מגיע כג'יבריש בחלק מהלקוחות.
    const enc = encodeDraftMime({ to: 'a@b.com', subject: 'שלום', body: '' })
    const decoded = Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    expect(decoded).toContain('=?UTF-8?B?')
    expect(decoded).not.toContain('Subject: שלום')
  })

  it('הגוף והנמען נכנסים למעטפה', () => {
    const enc = encodeDraftMime({ to: 'yos@x.com', subject: 's', body: '<p>תוכן</p>' })
    const decoded = Buffer.from(enc.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    expect(decoded).toContain('To: yos@x.com')
    expect(decoded).toContain('<p>תוכן</p>')
    expect(decoded).toContain('charset=UTF-8')
  })

  it('שדות חסרים אינם מפילים', () => {
    expect(() => encodeDraftMime({})).not.toThrow()
  })
})
