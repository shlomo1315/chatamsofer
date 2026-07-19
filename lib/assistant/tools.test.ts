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
    from: self, select: self, eq: self, gte: self, or: self, order: self, limit: self, in: self,
    then: (r: (v: unknown) => unknown) => r({ data: [{ id: '1', secret: 'רגיש' }], count: 99 }),
  })
  return chain as never
}

const secretary = (section: string): ToolCtx => ({
  db: fakeDb(),
  perms: { [section]: 'view' } as never,
  isAdmin: false,
  mailboxEmails: null,
  mailboxKeys: null,
})

const admin: ToolCtx = { db: fakeDb(), perms: {}, isAdmin: true, mailboxEmails: null, mailboxKeys: null }

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

  // ⚠️ תיבות הדואר מסוננות פר-משתמש במסך המייל. בלי אכיפה זהה כאן, העוזר
  // היה דלת עורפית שמחזירה את דואר כל המחלקות לכל איש צוות.
  it('משתמש שחסום מתיבות הדואר לא מקבל דואר גם דרך העוזר', async () => {
    const blocked: ToolCtx = { db: fakeDb(), perms: {} as never, isAdmin: false, mailboxEmails: [], mailboxKeys: [] }
    const r = await runTool(blocked, 'query_data', { table: 'inbound_emails' }) as { error?: string }
    expect(r.error, 'דואר נחשף למשתמש חסום!').toContain('אין לך הרשאה')
  })

  it('משתמש שחסום מתיבות הדואר לא מקבל ספירת דואר בסקירה', async () => {
    const blocked: ToolCtx = { db: fakeDb(), perms: {} as never, isAdmin: false, mailboxEmails: [], mailboxKeys: [] }
    const r = await runTool(blocked, 'get_overview', {}) as Record<string, unknown>
    expect(r['דואר'], 'ספירת דואר נחשפה למשתמש חסום!').toBeUndefined()
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

  // ⚠️ רגרסיה: sent_emails חייב להיות מסונן לפי department (מפתחות), לא from_email
  // (עמודה שאינה קיימת בטבלה). db שמתעד לפי איזו עמודה סוננה מוודא זאת.
  it('דואר יוצא מסונן לפי department עם מפתחות התיבה (לא from_email)', async () => {
    const calls: { col: string; vals: unknown }[] = []
    const recordingDb = () => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      Object.assign(chain, {
        from: self, select: self, eq: self, gte: self, or: self, order: self, limit: self,
        in: (col: string, vals: unknown) => { calls.push({ col, vals }); return chain },
        then: (r: (v: unknown) => unknown) => r({ data: [], count: 0 }),
      })
      return chain as never
    }
    const ctx: ToolCtx = {
      db: recordingDb(), perms: {} as never, isAdmin: false,
      mailboxEmails: ['igud@chasamsofer.info'], mailboxKeys: ['igud'],
    }
    await runTool(ctx, 'query_data', { table: 'sent_emails' })
    const scope = calls.find(c => c.col === 'department' || c.col === 'from_email')
    expect(scope, 'sent_emails לא סונן כלל').toBeDefined()
    expect(scope!.col, 'sent_emails סונן לפי from_email שאינו קיים בטבלה').toBe('department')
    expect(scope!.vals).toEqual(['igud'])
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

describe('עץ הדורות (lineage_tree)', () => {
  it('מזכיר ללא הרשאת עץ הדורות נחסם', async () => {
    const r = await runTool(secretary('loans'), 'lineage_tree', { name: 'שמעון סופר' }) as { error?: string }
    expect(r.error, 'עץ הדורות נחשף בלי הרשאה!').toContain('אין לך הרשאה')
  })

  it('מזכיר ללא הרשאת עץ הדורות נחסם גם מבדיקת אמינות', async () => {
    const r = await runTool(secretary('loans'), 'lineage_reliability', { beneficiaryId: 'x' }) as { error?: string }
    expect(r.error, 'בדיקת אמינות נחשפה בלי הרשאה!').toContain('אין לך הרשאה')
  })

  const nodes = [
    { id: 'r', name: 'החתם סופר', generation: 1, parent_id: null, relation: null },
    { id: 's', name: 'שמעון סופר', generation: 2, parent_id: 'r', relation: 'son' },
    { id: 'c1', name: 'ראובן סופר', generation: 3, parent_id: 's', relation: 'son' },
    { id: 'c2', name: 'לוי סופר', generation: 3, parent_id: 's', relation: 'son' },
    { id: 'g1', name: 'יהודה סופר', generation: 4, parent_id: 'c1', relation: 'son' },
  ]
  // מסד מזויף שמחזיר את העץ ל-lineage_nodes וספירת משפחות ל-beneficiaries
  function treeDb(ns: unknown[], famCount = 0): ToolCtx['db'] {
    const node = () => {
      const b: Record<string, unknown> = {}
      Object.assign(b, { select: () => b, eq: () => b, then: (res: (v: unknown) => unknown) => res({ data: ns, error: null }) })
      return b
    }
    const ben = () => {
      const b: Record<string, unknown> = {}
      // הקוד שולף שורות (lineage_node_id, birth_date) וסופר את אורכן
      const rows = Array.from({ length: famCount }, () => ({ lineage_node_id: null, birth_date: null }))
      Object.assign(b, { select: () => b, in: () => b, then: (res: (v: unknown) => unknown) => res({ data: rows }) })
      return b
    }
    return { from: (t: string) => (t === 'lineage_nodes' ? node() : ben()) } as never
  }
  const lineageAdmin = (db: ToolCtx['db']): ToolCtx => ({ db, perms: {} as never, isAdmin: true, mailboxEmails: null, mailboxKeys: null })

  it('סופר ילדים, נכדים וסה״כ צאצאים', async () => {
    const r = await runTool(lineageAdmin(treeDb(nodes, 4)), 'lineage_tree', { name: 'שמעון סופר' }) as {
      ילדים_ישירים: { מספר: number }; נכדים: { מספר: number }; סהכ_צאצאים: number
      אבות_קדמונים: { שם: string }[]; משפחות_רשומות_בענף: number
    }
    expect(r.ילדים_ישירים.מספר).toBe(2)   // ראובן + לוי
    expect(r.נכדים.מספר).toBe(1)          // יהודה
    expect(r.סהכ_צאצאים).toBe(3)          // ראובן + לוי + יהודה
    expect(r.אבות_קדמונים).toEqual([{ שם: 'החתם סופר', דור: 1 }])
    expect(r.משפחות_רשומות_בענף).toBe(4)
  })

  it('שם כפול → מחזיר מועמדים להבהרה', async () => {
    const dup = [...nodes, { id: 's2', name: 'שמעון סופר', generation: 3, parent_id: 'c1', relation: 'son' }]
    const r = await runTool(lineageAdmin(treeDb(dup)), 'lineage_tree', { name: 'שמעון סופר' }) as { מועמדים?: unknown[] }
    expect(r.מועמדים?.length).toBe(2)
  })

  it('שם שלא קיים → הודעת "לא נמצא"', async () => {
    const r = await runTool(lineageAdmin(treeDb(nodes)), 'lineage_tree', { name: 'משה רבינו' }) as { message?: string }
    expect(r.message).toContain('לא נמצא')
  })
})
