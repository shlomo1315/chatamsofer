import { describe, it, expect, vi } from 'vitest'
import { runTool, TOOL_DEFS, type ToolCtx } from './tools'

// ─────────────────────────────────────────────────────────────────────────────
// אבטחת העוזר: ההרשאות נאכפות בשרת, לא ע"י המודל.
// מזכירה של אגף אחד לא יכולה לשאוב נתונים מאגף אחר דרך העוזר — גם אם המודל
// יבקש זאת במפורש.
// ─────────────────────────────────────────────────────────────────────────────

/** מסד מזויף — כל שאילתה מחזירה נתונים. אם ההרשאות נאכפות, לא נגיע לכאן. */
function fakeDb() {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    from: self, select: self, eq: self, gte: self, or: self,
    order: self, limit: self,
    then: (r: (v: unknown) => unknown) => r({ data: [{ secret: 'נתון רגיש' }], count: 99 }),
  })
  return chain as never
}

const secretary = (section: string): ToolCtx => ({
  db: fakeDb(),
  perms: { [section]: 'view' } as never,
  isAdmin: false,
})

const admin: ToolCtx = { db: fakeDb(), perms: {}, isAdmin: true }

describe('אכיפת הרשאות', () => {
  it('מזכירת יולדות אינה יכולה לראות הלוואות', async () => {
    const r = await runTool(secretary('maternity'), 'list_requests', { section: 'loans' }) as { error?: string }
    expect(r.error, 'נתוני הלוואות נחשפו למי שאין לו הרשאה!').toContain('אין לך הרשאה')
  })

  it('מזכירת יולדות אינה יכולה לראות סיוע רפואי', async () => {
    const r = await runTool(secretary('maternity'), 'get_stats', { section: 'financial_aid' }) as { error?: string }
    expect(r.error).toContain('אין לך הרשאה')
  })

  it('מזכירת הלוואות אינה יכולה לחפש משפחות', async () => {
    // חיפוש משפחה דורש הרשאת beneficiaries
    const r = await runTool(secretary('loans'), 'search_beneficiary', { query: 'ויסברג' }) as { error?: string }
    expect(r.error).toContain('אין לך הרשאה')
  })

  it('מזכירת הלוואות אינה יכולה לספור נרשמים', async () => {
    const r = await runTool(secretary('loans'), 'count_registrations', { days: 7 }) as { error?: string }
    expect(r.error).toContain('אין לך הרשאה')
  })

  it('מזכירה כן רואה את האגף שלה', async () => {
    const r = await runTool(secretary('loans'), 'list_requests', { section: 'loans' }) as { error?: string }
    expect(r.error).toBeUndefined()
  })

  it('מנהל רואה הכל', async () => {
    for (const section of ['loans', 'maternity', 'financial_aid', 'widows']) {
      const r = await runTool(admin, 'get_stats', { section }) as { error?: string }
      expect(r.error, `מנהל נחסם מ-${section}`).toBeUndefined()
    }
  })

  it('משתמש בלי הרשאות כלל — לא מקבל נתונים', async () => {
    const none: ToolCtx = { db: fakeDb(), perms: {}, isAdmin: false }
    const r = await runTool(none, 'get_dashboard', {}) as { error?: string }
    expect(r.error).toContain('אין לך הרשאות')
  })
})

describe('הכלים קריאה בלבד', () => {
  it('אין אף כלי שכותב, מעדכן או מוחק', () => {
    const forbidden = /create|update|delete|insert|approve|send|write|set_|remove/i
    for (const t of TOOL_DEFS) {
      expect(forbidden.test(t.name), `כלי שעלול לשנות נתונים: ${t.name}`).toBe(false)
    }
  })

  it('כלי לא מוכר נדחה', async () => {
    const r = await runTool(admin, 'delete_everything', {}) as { error?: string }
    expect(r.error).toContain('לא מוכר')
  })
})
