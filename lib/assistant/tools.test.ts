import { describe, it, expect } from 'vitest'
import { runTool, TOOL_DEFS, schemaForUser, type ToolCtx } from './tools'
import { TABLES } from './schema'

// ─────────────────────────────────────────────────────────────────────────────
// אבטחת העוזר: ההרשאות נאכפות בשרת, לא ע"י המודל.
// מזכירה של אגף אחד לא יכולה לשאוב נתונים מאגף אחר — גם אם המודל יבקש זאת.
// ─────────────────────────────────────────────────────────────────────────────

/** מסד מזויף — כל שאילתה מצליחה. אם ההרשאות נאכפות, לא נגיע לכאן. */
function fakeDb() {
  const chain: Record<string, unknown> = {}
  const self = () => chain
  Object.assign(chain, {
    from: self, select: self, eq: self, gte: self, or: self, order: self, limit: self,
    then: (r: (v: unknown) => unknown) => r({ data: [{ id: '1', secret: 'רגיש' }], count: 99 }),
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
  it('מזכירת יולדות אינה יכולה לשלוף הלוואות', async () => {
    const r = await runTool(secretary('maternity'), 'query_data', { table: 'loans' }) as { error?: string }
    expect(r.error, 'נתוני הלוואות נחשפו!').toContain('אין לך הרשאה')
  })

  it('מזכירת יולדות אינה יכולה לספור סיוע רפואי', async () => {
    const r = await runTool(secretary('maternity'), 'count_data', { table: 'financial_aid_requests' }) as { error?: string }
    expect(r.error).toContain('אין לך הרשאה')
  })

  it('מזכירת הלוואות אינה יכולה לחפש משפחות', async () => {
    const r = await runTool(secretary('loans'), 'query_data', { table: 'beneficiaries', search: 'ויסברג' }) as { error?: string }
    expect(r.error).toContain('אין לך הרשאה')
  })

  it('מזכירת הלוואות אינה יכולה לראות את עץ הדורות', async () => {
    const r = await runTool(secretary('loans'), 'query_data', { table: 'lineage_nodes' }) as { error?: string }
    expect(r.error).toContain('אין לך הרשאה')
  })

  it('מזכירה כן רואה את האגף שלה', async () => {
    const r = await runTool(secretary('loans'), 'count_data', { table: 'loans' }) as { error?: string }
    expect(r.error).toBeUndefined()
  })

  it('דואר פתוח לכל איש צוות (אינו אגף)', async () => {
    const r = await runTool(secretary('loans'), 'count_data', { table: 'inbound_emails' }) as { error?: string }
    expect(r.error).toBeUndefined()
  })

  it('מנהל רואה הכל', async () => {
    for (const t of TABLES) {
      const r = await runTool(admin, 'count_data', { table: t.table }) as { error?: string }
      expect(r.error, `מנהל נחסם מ-${t.table}`).toBeUndefined()
    }
  })
})

describe('ההנחיה חושפת רק את המותר', () => {
  it('מזכירת יולדות לא רואה טבלאות של אגפים אחרים', () => {
    const schema = schemaForUser(secretary('maternity'))
    expect(schema).toContain('maternity_aids')
    expect(schema, 'הלוואות נחשפו בהנחיה!').not.toContain('• loans')
    expect(schema, 'עץ הדורות נחשף בהנחיה!').not.toContain('lineage_nodes')
  })

  it('מנהל רואה את כל הטבלאות', () => {
    const schema = schemaForUser(admin)
    for (const t of TABLES) {
      expect(schema, `${t.table} חסר בהנחיה של המנהל`).toContain(t.table)
    }
  })

  it('ההנחיה כוללת את מילון הסטטוסים', () => {
    const schema = schemaForUser(admin)
    // בלי זה העוזר מציג "pending"/"active" גולמי ומפרש אותם לא נכון
    expect(schema).toContain('מילון הסטטוסים')
    expect(schema).toContain('מאושרת')
  })
})

describe('הכלים קריאה בלבד', () => {
  it('אין אף כלי שכותב, מעדכן או מוחק', () => {
    const forbidden = /create|update|delete|insert|approve|send|write|set_|remove/i
    for (const t of TOOL_DEFS) {
      expect(forbidden.test(t.name), `כלי שעלול לשנות נתונים: ${t.name}`).toBe(false)
    }
  })

  it('טבלה שאינה ברישום — נדחית', async () => {
    // הגנה: גם אם המודל ינחש שם טבלה אמיתי, אם היא לא ברישום — אין גישה
    const r = await runTool(admin, 'query_data', { table: 'profiles' }) as { error?: string }
    expect(r.error).toContain('אינה קיימת')
  })

  it('כלי לא מוכר נדחה', async () => {
    const r = await runTool(admin, 'delete_everything', {}) as { error?: string }
    expect(r.error).toContain('לא מוכר')
  })
})
