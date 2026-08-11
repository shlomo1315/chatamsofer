import { describe, it, expect } from 'vitest'
import { planApproveChain, type ApproveChainNode } from './lineageApproveChain'

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הפונקציה הזו מזינה גם את האזהרה שהמנהל רואה וגם את הפעולה עצמה. אם היא
// תטעה, המסך יבטיח דבר אחד והשרת יעשה אחר — במסך שכל תפקידו להזהיר. לכן
// הבדיקות נועלות בעיקר את הגבולות: איפה המפל עוצר, ובאיזה סדר הוא מדווח.
// ─────────────────────────────────────────────────────────────────────────────

const n = (id: string, parent: string | null, gen: number, status = 'pending'): ApproveChainNode =>
  ({ id, name: `צומת ${id}`, parent_id: parent, generation: gen, status })

const map = (list: ApproveChainNode[]) => new Map(list.map(x => [x.id, x]))

describe('planApproveChain', () => {
  it('שרשרת ממתינה שלמה — כולם מדווחים, מהקדום לחדש', () => {
    const nodes = map([
      n('root', null, 1, 'verified'),
      n('a', 'root', 2),
      n('b', 'a', 3),
      n('c', 'b', 4),
    ])
    const plan = planApproveChain(nodes, 'c')
    expect(plan.map(s => s.id)).toEqual(['a', 'b', 'c'])
    expect(plan.map(s => s.generation)).toEqual([2, 3, 4])
  })

  it('🔴 עוצר בצומת המאומת הראשון — אב שכבר אושר אינו נספר', () => {
    // בלי העצירה האזהרה הייתה מציגה עשרה דורות שרובם לא ישתנו, ומנהל שרואה
    // מספר מנופח לומד להתעלם ממנו.
    const nodes = map([
      n('root', null, 1, 'verified'),
      n('a', 'root', 2, 'verified'),
      n('b', 'a', 3, 'verified'),
      n('c', 'b', 4),
    ])
    expect(planApproveChain(nodes, 'c').map(s => s.id)).toEqual(['c'])
  })

  it('הנרשם מסומן isSelf, והאבות לא', () => {
    const nodes = map([n('root', null, 1, 'verified'), n('a', 'root', 2), n('b', 'a', 3)])
    const plan = planApproveChain(nodes, 'b')
    expect(plan.find(s => s.id === 'b')!.isSelf).toBe(true)
    expect(plan.find(s => s.id === 'a')!.isSelf).toBe(false)
  })

  it('הנרשם עצמו כבר מאומת — אין מה לאשר', () => {
    const nodes = map([n('root', null, 1, 'verified'), n('a', 'root', 2, 'verified')])
    expect(planApproveChain(nodes, 'a')).toEqual([])
  })

  it('בלי צומת מקושר — רשימה ריקה', () => {
    const nodes = map([n('a', null, 1)])
    expect(planApproveChain(nodes, null)).toEqual([])
    expect(planApproveChain(nodes, undefined)).toEqual([])
    expect(planApproveChain(nodes, '')).toEqual([])
  })

  it('צומת שאינו קיים אינו מפיל', () => {
    expect(planApproveChain(map([]), 'missing')).toEqual([])
  })

  it('שרשרת שנקטעת באמצע (אב חסר) נעצרת בשקט', () => {
    const nodes = map([n('b', 'missing-parent', 3)])
    expect(planApproveChain(nodes, 'b').map(s => s.id)).toEqual(['b'])
  })

  it('🔴 מעגל בעץ אינו מייצר לולאה אינסופית', () => {
    // מעגל אינו תיאורטי כאן — ראו lib/lineageForest.
    const nodes = map([n('x', 'y', 2), n('y', 'x', 3)])
    const plan = planApproveChain(nodes, 'x')
    expect(plan).toHaveLength(2)
    expect(new Set(plan.map(s => s.id)).size).toBe(2)
  })

  it('סטטוס חסר נחשב לא-מאומת ולכן ייכלל', () => {
    const nodes = map([{ ...n('a', null, 1), status: null }])
    expect(planApproveChain(nodes, 'a').map(s => s.id)).toEqual(['a'])
  })
})
