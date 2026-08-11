// צומת בעץ לכל נרשם — והכלל שאין עליו פשרה: **בלי לייצר כפילות**.
//
// הפונקציה הזו תרוץ על ~5,900 משפחות קיימות ואז על כל רישום חדש. יצירה כפולה
// כאן פירושה להכפיל את הבלגן שהמנהל בדיוק מנקה (660 קבוצות כפילויות), ולכן
// הבדיקות מתמקדות בכל מסלול שבו הצומת *כבר קיים* בצורה אחרת.
import { describe, it, expect } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureBeneficiaryNode, beneficiaryNodeName, nodeIsSelf } from './beneficiaryNode'

type Node = { id: string; name: string; parent_id: string | null; generation: number; status: string | null; id_number: string | null; relation?: string | null }
type Ben = { id: string; id_number: string | null; full_name: string | null; spouse_name: string | null; family_name: string | null; gender: string | null; lineage_node_id: string | null; lineage_chain?: unknown }

// מסד מדומה מינימלי שמכסה בדיוק את הקריאות שהפונקציה עושה.
function fakeDb(nodes: Node[], bens: Ben[]) {
  let seq = 0
  const db = {
    from(table: string) {
      if (table === 'lineage_nodes') {
        const filters: { col: string; val: unknown }[] = []
        const api: Record<string, unknown> = {
          select() { return api },
          eq(col: string, val: unknown) { filters.push({ col, val }); return api },
          in(col: string, vals: unknown[]) { filters.push({ col, val: vals }); return api },
          limit() { return api },
          maybeSingle() {
            const hit = nodes.find(n => filters.every(f => (n as unknown as Record<string, unknown>)[f.col] === f.val))
            return Promise.resolve({ data: hit ?? null, error: null })
          },
          single() {
            const hit = nodes[nodes.length - 1]
            return Promise.resolve({ data: hit ? { id: hit.id } : null, error: null })
          },
          insert(row: Record<string, unknown>) {
            const created: Node = {
              id: `new-${++seq}`,
              name: String(row.name),
              parent_id: (row.parent_id as string) ?? null,
              generation: Number(row.generation),
              status: (row.status as string) ?? null,
              id_number: (row.id_number as string) ?? null,
              relation: (row.relation as string) ?? null,
            }
            nodes.push(created)
            return { select: () => ({ single: () => Promise.resolve({ data: { id: created.id }, error: null }) }) }
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(col: string, val: unknown) {
                for (const n of nodes) {
                  if ((n as unknown as Record<string, unknown>)[col] === val) Object.assign(n, patch)
                }
                return Promise.resolve({ error: null })
              },
            }
          },
          then(res: (v: { data: Node[]; error: null }) => unknown) {
            const rows = nodes.filter(n => filters.every(f => (n as unknown as Record<string, unknown>)[f.col] === f.val))
            return Promise.resolve(res({ data: rows, error: null }))
          },
        }
        return api
      }
      // beneficiaries — select נדרש כדי שהפונקציה תוכל להשלים בעצמה את
      // lineage_chain כשהקורא לא הביא אותו.
      {
        const filters: { col: string; val: unknown }[] = []
        const api: Record<string, unknown> = {
          select() { return api },
          eq(col: string, val: unknown) { filters.push({ col, val }); return api },
          maybeSingle() {
            const hit = bens.find(b => filters.every(f => (b as unknown as Record<string, unknown>)[f.col] === f.val))
            return Promise.resolve({ data: hit ?? null, error: null })
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(col: string, val: unknown) {
                for (const b of bens) {
                  if ((b as unknown as Record<string, unknown>)[col] === val) Object.assign(b, patch)
                }
                return Promise.resolve({ error: null })
              },
            }
          },
        }
        return api
      }
    },
  }
  return db as unknown as SupabaseClient
}

const father: Node = { id: 'father', name: 'רבי אברהם ניסן ומרת רבקה דויטש', parent_id: 'gramps', generation: 7, status: 'verified', id_number: null }
const ben = (over: Partial<Ben> = {}): Ben => ({
  id: 'b1', id_number: '123456789', full_name: 'יצחק', spouse_name: 'שרה',
  family_name: 'דויטש', gender: 'male', lineage_node_id: 'father', ...over,
})

describe('beneficiaryNodeName', () => {
  it('בונה את הניסוח האחיד של העץ', () => {
    expect(beneficiaryNodeName(ben())).toBe('רבי יצחק ומרת שרה דויטש')
  })
  it('בלי שם אישה — רק הבעל', () => {
    expect(beneficiaryNodeName(ben({ spouse_name: null }))).toBe('רבי יצחק דויטש')
  })
  it('בלי שם בכלל — מחרוזת ריקה (לא ייבנה צומת)', () => {
    expect(beneficiaryNodeName(ben({ full_name: null, spouse_name: null, family_name: null }))).toBe('')
  })
})

describe('ensureBeneficiaryNode', () => {
  it('נרשם בלי צומת משלו — נוצר צומת ממתין תחת האב, והקישור עובר אליו', async () => {
    const nodes = [{ ...father }]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: true, adopted: false })
    const created = nodes.find(n => n.id !== 'father')!
    expect(created.name).toBe('רבי יצחק ומרת שרה דויטש')
    expect(created.parent_id).toBe('father')
    expect(created.generation).toBe(8)
    // ⚠️ ממתין לאישור — לא מאומת. האישור הוא החלטה של הצוות.
    expect(created.status).toBe('pending')
    expect(created.id_number).toBe('123456789')
    // הכרטסת מצביעה עכשיו על הצומת שלו ולא על האב
    expect(bens[0].lineage_node_id).toBe(created.id)
  })

  it('⚠️ הרצה שנייה אינה יוצרת כפילות', async () => {
    const nodes = [{ ...father }]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    await ensureBeneficiaryNode(db, bens[0])
    const before = nodes.length
    const second = await ensureBeneficiaryNode(db, bens[0])

    expect(nodes.length).toBe(before)
    expect(second).toMatchObject({ ok: true, created: false })
  })

  it('⚠️ הת"ז שלו כבר בעץ במקום אחר — מתקשר אליו ולא נוצר חדש', async () => {
    // התרחיש: הוא נכנס לעץ כילד כשמשפחת הוריו אושרה.
    const nodes = [
      { ...father },
      { id: 'as-child', name: 'רבי יצחק דויטש', parent_id: 'father', generation: 8, status: 'verified', id_number: '123456789' },
    ]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: false, adopted: true, nodeId: 'as-child' })
    expect(nodes.length).toBe(2)
    expect(bens[0].lineage_node_id).toBe('as-child')
    // ⚠️ סטטוס קיים אינו נוגע — אימוץ לא מוריד צומת מאומת ל"ממתין"
    expect(nodes[1].status).toBe('verified')
  })

  it('⚠️ שם זהה תחת אותו אב — מאמץ ומסמן עליו את הת"ז', async () => {
    const nodes = [
      { ...father },
      { id: 'twin', name: 'רבי יצחק ומרת שרה דויטש', parent_id: 'father', generation: 8, status: 'pending', id_number: null },
    ]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: false, adopted: true, nodeId: 'twin' })
    expect(nodes.length).toBe(2)
    expect(nodes[1].id_number).toBe('123456789')
  })

  it('הצומת שהוא מקושר אליו הוא כבר שלו — אין פעולה', async () => {
    // כך נראה נרשם שהוסיף דורות ידנית: הצומת האחרון שנוצר הוא שלו.
    const nodes = [{ ...father, id_number: '123456789' }]
    const bens = [ben()]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, created: false, adopted: false, nodeId: 'father' })
    expect(nodes.length).toBe(1)
  })

  it('בלי שיוך לעץ או בלי שם — מדווח ואינו יוצר כלום', async () => {
    const nodes = [{ ...father }]
    const noLink = await ensureBeneficiaryNode(fakeDb(nodes, []), ben({ lineage_node_id: null }))
    expect(noLink).toEqual({ ok: false, reason: 'אין שיוך לעץ' })

    const noName = await ensureBeneficiaryNode(fakeDb(nodes, []), ben({ full_name: null, spouse_name: null, family_name: null }))
    expect(noName).toEqual({ ok: false, reason: 'אין שם לבניית צומת' })
    expect(nodes.length).toBe(1)
  })

  it('בת — הקשר מסומן כחתן (השושלת ממשיכה דרך הבעל)', async () => {
    const nodes = [{ ...father }]
    const bens = [ben({ gender: 'female' })]
    await ensureBeneficiaryNode(fakeDb(nodes, bens), bens[0])
    expect(nodes.find(n => n.id !== 'father')!.relation).toBe('son_in_law')
  })
})

describe('🔴 nodeIsSelf — הבדיקה שמונעת אלפי כפילויות', () => {
  // הרישום בפורטל יוצר צומת לנרשם (הוא נכלל ב-lineage_new_nodes) אבל **בלי
  // id_number**. זיהוי בעלות לפי ת"ז בלבד ראה אותו כ"חסר צומת", וההשלמה הייתה
  // יוצרת עותק שני *כילד של הצומת של עצמו*, דור אחד עמוק מדי.
  it('שם הצומת זהה לשם המחושב → הצומת הוא שלו', () => {
    expect(nodeIsSelf(ben(), 'רבי יצחק ומרת שרה דויטש')).toBe(true)
    expect(nodeIsSelf(ben(), 'רבי יצחק  ומרת שרה דויטש')).toBe(true) // רווח כפול
  })

  it('שם האב אינו שמו → אינו שלו', () => {
    expect(nodeIsSelf(ben(), 'רבי אברהם ניסן ומרת רבקה דויטש')).toBe(false)
  })

  it('⚠️ "זה אני" על צומת קיים שנוסח אחרת — מזוהה דרך שרשרת הייחוס', () => {
    // הנרשם סימן צומת קיים כ"זה אני", והניסוח שם שונה מהשם המחושב שלו.
    // בלי הסימן הזה היה נוצר לו עותק שני.
    const b = ben({ lineage_chain: [
      { generation: 6, name: 'רבי אברהם ניסן דויטש' },
      { generation: 7, name: 'רבי יצחק דויטש' },
    ] })
    expect(nodeIsSelf(b, 'רבי יצחק דויטש')).toBe(true)
  })

  it('שרשרת ריקה או חסרה אינה מפילה את הבדיקה', () => {
    expect(nodeIsSelf(ben({ lineage_chain: [] }), 'משהו אחר')).toBe(false)
    expect(nodeIsSelf(ben({ lineage_chain: null }), 'משהו אחר')).toBe(false)
    expect(nodeIsSelf(ben(), '')).toBe(false)
  })
})

describe('🔴 ensureBeneficiaryNode — הצומת שלו קיים בלי ת"ז', () => {
  it('מסמן את הת"ז על הצומת הקיים ואינו יוצר כפילות', async () => {
    // זה המצב של רוב הנרשמים בפועל: הצומת שלהם נוצר ברישום, בלי id_number,
    // ו-lineage_node_id מצביע עליו.
    const own = { id: 'own', name: 'רבי יצחק ומרת שרה דויטש', parent_id: 'father', generation: 8, status: 'pending', id_number: null }
    const nodes = [{ ...father }, own]
    const bens = [ben({ lineage_node_id: 'own' })]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    expect(res).toMatchObject({ ok: true, nodeId: 'own', created: false, claimed: true })
    // ⚠️ העיקר: לא נוצר צומת חדש
    expect(nodes.length).toBe(2)
    // והת"ז נחתמה, כך שהזיהוי יהיה מיידי מכאן והלאה
    expect(nodes[1].id_number).toBe('123456789')
    // הכרטסת נשארת על הצומת שלו
    expect(bens[0].lineage_node_id).toBe('own')
  })

  it('הרצה שנייה על אותו מצב — אידמפוטנטית', async () => {
    const own = { id: 'own', name: 'רבי יצחק ומרת שרה דויטש', parent_id: 'father', generation: 8, status: 'pending', id_number: null }
    const nodes = [{ ...father }, own]
    const bens = [ben({ lineage_node_id: 'own' })]
    const db = fakeDb(nodes, bens)

    await ensureBeneficiaryNode(db, bens[0])
    await ensureBeneficiaryNode(db, bens[0])

    expect(nodes.length).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הרגרסיה שעלתה מהשטח: "בכל כרטסת הוא מוסיף עוד דור אחרון".
//
// nodeIsSelf נכתב עם שני סימנים, והשני — שרשרת הייחוס — הוא היחיד שתופס מצב
// שבו הניסוח בעץ שונה מהשם המחושב. הוא נבדק ועבר, אבל בייצור הוא היה מת:
// הרישום הציבורי שלף את הנרשם *בלי* העמודה lineage_chain, ולכן ההשוואה נעשתה
// תמיד מול מחרוזת ריקה. אות אחת שונה בשם האישה הספיקה כדי שהמערכת תסיק
// "אינו בעץ" ותיצור לנרשם עותק שני כילד של עצמו.
//
// הבדיקות כאן נועלות את הפער בין מה שהפונקציה מקבלת לבין מה שקורא אמיתי
// מעביר — ולכן הן קוראות לה *בלי* השדה, כפי שהייצור עשה.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 דור אחרון כפול — הקורא לא הביא את שרשרת הייחוס', () => {
  const selfNode: Node = {
    id: 'self-node', name: 'רבי שלמה ומרת חנה רחל עקשטיין',
    parent_id: 'gramps', generation: 7, status: 'verified', id_number: null,
  }
  // הניסוח בעץ נכתב "חנה רחל"; בכרטסת נשמר "מנה רחל". אות אחת.
  const registrant = (over: Partial<Ben> = {}): Ben => ({
    id: 'b9', id_number: '203207923', full_name: 'שלמה', spouse_name: 'מנה רחל',
    family_name: 'עקשטיין', gender: 'male', lineage_node_id: 'self-node', ...over,
  })

  it('השם המחושב באמת שונה מהניסוח בעץ — זה מה שמפיל את הסימן הראשון', () => {
    expect(beneficiaryNodeName(registrant())).toBe('רבי שלמה ומרת מנה רחל עקשטיין')
    expect(beneficiaryNodeName(registrant())).not.toBe(selfNode.name)
  })

  it('הקורא לא הביא lineage_chain — הפונקציה משלימה אותו ואינה יוצרת דור מיותר', async () => {
    const nodes = [{ ...selfNode }]
    // כך נראתה השורה בייצור: השדה קיים במסד, אבל ה-select לא כלל אותו.
    const stored = registrant({ lineage_chain: [
      { generation: 6, name: 'רבי פסח ומרת טובה גיננדל לוי' },
      { generation: 7, name: 'רבי שלמה ומרת חנה רחל עקשטיין' },
    ] })
    const bens = [stored]
    const db = fakeDb(nodes, bens)

    // ⚠️ מועבר בלי lineage_chain — בדיוק כמו ה-select של הרישום הציבורי.
    const { lineage_chain, ...withoutChain } = stored
    void lineage_chain
    const res = await ensureBeneficiaryNode(db, withoutChain as Ben)

    expect(res).toMatchObject({ ok: true, created: false, claimed: true, nodeId: 'self-node' })
    expect(nodes.length).toBe(1)                  // 🔴 לא נוצר דור 8
    expect(nodes[0].id_number).toBe('203207923')  // הת"ז נרשמה על הצומת הקיים
  })

  it('שרשרת שנטענה ובאמת ריקה אינה מזוהה כ"לא נטענה" — ונוצר צומת כרגיל', async () => {
    const nodes = [{ ...selfNode }]
    const bens = [registrant({ lineage_chain: null })]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, bens[0])

    // אין ראיה שהצומת הוא הנרשם עצמו, ולכן ההתנהגות הישנה נשמרת במלואה.
    expect(res).toMatchObject({ ok: true, created: true })
    expect(nodes.length).toBe(2)
  })

  it('ההשלמה אינה דורסת שרשרת שהקורא כן הביא', async () => {
    const nodes = [{ ...selfNode }]
    // במסד יושבת שרשרת תואמת, אבל הקורא מוסר במפורש שרשרת ריקה.
    const bens = [registrant({ lineage_chain: [{ generation: 7, name: 'רבי שלמה ומרת חנה רחל עקשטיין' }] })]
    const db = fakeDb(nodes, bens)

    const res = await ensureBeneficiaryNode(db, { ...bens[0], lineage_chain: [] } as Ben)

    expect(res).toMatchObject({ ok: true, created: true })
  })
})
