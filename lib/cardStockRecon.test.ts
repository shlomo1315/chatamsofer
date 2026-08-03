import { describe, it, expect } from 'vitest'
import { reconcileStock, type ReconLedgerRow, type ReconAid } from './cardStockRecon'

const restock = (n: number) => ({ delta: n, reason: 'restock', aid_id: null })
const birth = (aidId: string) => ({ delta: -1, reason: 'birth_approval', aid_id: aidId })
const refund = (aidId: string) => ({ delta: 1, reason: 'adjust', aid_id: aidId })

const approved = (id: string, name = id) => ({ id, name, status: 'active', card_load_status: 'loaded' })

describe('reconcileStock', () => {
  it('מסביר מלאי תקין: 300 נכנסו, 2 אושרו, 298 נשארו', () => {
    const r = reconcileStock([restock(300), birth('a'), birth('b')], [approved('a'), approved('b')])
    expect(r.totalIn).toBe(300)
    expect(r.totalOut).toBe(2)
    expect(r.balance).toBe(298)
    expect(r.heldOk).toBe(2)
    expect(r.strayCards).toBe(0)
    expect(r.expectedBalance).toBe(298)
  })

  it('לידה שנדחתה אחרי הניכוי — הכרטיס מסומן כתלוי עם ההסבר', () => {
    const r = reconcileStock(
      [restock(300), birth('a'), birth('b')],
      [approved('a'), { id: 'b', name: 'כהן שרה', status: 'cancelled', card_load_status: 'loaded' }],
    )
    expect(r.strayCards).toBe(1)
    expect(r.expectedBalance).toBe(299)
    expect(r.strays[0]).toMatchObject({ aidId: 'b', name: 'כהן שרה', cards: 1, statusLabel: 'לא מאושר' })
    expect(r.strays[0].reason).toContain('נדחתה')
  })

  it('חזרה להמתנה, כשל הטענה ותיק שנמחק — כולם תלויים', () => {
    const r = reconcileStock(
      [restock(300), birth('p'), birth('f'), birth('gone')],
      [
        { id: 'p', name: 'ממתינה', status: 'pending', card_load_status: 'loaded' },
        { id: 'f', name: 'נכשלה', status: 'active', card_load_status: 'failed' },
      ],
    )
    expect(r.strayCards).toBe(3)
    expect(r.heldOk).toBe(0)
    expect(r.strays.map(s => s.aidId).sort()).toEqual(['f', 'gone', 'p'])
    expect(r.strays.find(s => s.aidId === 'gone')!.reason).toContain('נמחק')
    expect(r.strays.find(s => s.aidId === 'f')!.reason).toContain('נכשלה')
  })

  it('כרטיס שנוכה והוחזר אינו נספר כחסר', () => {
    const r = reconcileStock(
      [restock(300), birth('a'), refund('a')],
      [{ id: 'a', name: 'הוחזר', status: 'cancelled', card_load_status: 'unloaded' }],
    )
    expect(r.balance).toBe(300)
    expect(r.strayCards).toBe(0)
    expect(r.strays).toHaveLength(0)
  })

  it('ניכוי כפול לאותה לידה מדווח על העודף בלבד, עם הסבר שונה מדחייה', () => {
    const r = reconcileStock([restock(300), birth('a'), birth('a')], [approved('a', 'לוי רבקה')])
    expect(r.heldOk).toBe(1)
    expect(r.strayCards).toBe(1)
    expect(r.strays[0].reason).toContain('עודף')
    expect(r.strays[0].statusLabel).toBe('מאושר')
  })

  it('פריקה בתום שישה שבועות אינה פער — הכרטיס נוצל', () => {
    const r = reconcileStock([restock(300), birth('a')], [{ id: 'a', name: 'ותיקה', status: 'active', card_load_status: 'unloaded' }])
    expect(r.heldOk).toBe(1)
    expect(r.strayCards).toBe(0)
  })

  it('הורדה ידנית נכנסת לפילוח ואינה כרטיס תלוי', () => {
    const r = reconcileStock(
      [restock(300), { delta: -5, reason: 'manual_out', aid_id: null }, birth('a')],
      [approved('a')],
    )
    expect(r.balance).toBe(294)
    expect(r.strayCards).toBe(0)
    expect(r.byReason.find(l => l.reason === 'manual_out')).toMatchObject({ count: 1, total: -5 })
  })

  it('הפילוח מסכם כל תנועה, כולל התאמות', () => {
    const r = reconcileStock([restock(200), restock(100), birth('a'), refund('a')], [approved('a')])
    expect(r.byReason.find(l => l.reason === 'restock')).toMatchObject({ count: 2, total: 300 })
    expect(r.byReason.find(l => l.reason === 'adjust')).toMatchObject({ count: 1, total: 1 })
    expect(r.totalIn).toBe(301)
  })

  it('התרחיש שהמנהל דיווח עליו: 300 הוטענו, 48 אושרו, 247 במלאי — 5 תלויים', () => {
    const ledger: ReconLedgerRow[] = [restock(300)]
    const aids: ReconAid[] = []
    for (let i = 0; i < 48; i++) { ledger.push(birth(`ok${i}`)); aids.push(approved(`ok${i}`)) }
    // חמש לידות שנוכה בגינן כרטיס ואינן מאושרות עוד
    for (let i = 0; i < 5; i++) {
      ledger.push(birth(`stray${i}`))
      aids.push({ id: `stray${i}`, name: `תלויה ${i}`, status: i === 0 ? 'cancelled' : 'pending', card_load_status: 'loaded' })
    }
    const r = reconcileStock(ledger, aids)
    expect(r.balance).toBe(247)
    expect(r.heldOk).toBe(48)
    expect(r.strayCards).toBe(5)
    expect(r.expectedBalance).toBe(252)
  })
})
