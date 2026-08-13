import { describe, it, expect } from 'vitest'
import { reconcileStock, approvedCardCoverage, type ReconLedgerRow, type ReconAid } from './cardStockRecon'

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
    // ⚠️ הפילוח לפי סיבה עדיין מציג *כל* תנועה, כולל ההחזרה — הוא נועד
    // לתחקור ולא לספירה.
    expect(r.byReason.find(l => l.reason === 'adjust')).toMatchObject({ count: 1, total: 1 })
  })

  it('🔴 "נקנו" סופר רכישות בלבד — החזרה אינה קנייה', () => {
    // הוכנסו 300 כרטיסים. אחד נוכה ללידה, נכשל, והוחזר.
    // totalIn חייב להישאר 300: ההחזרה מבטלת ניכוי, היא אינה רכישה.
    //
    // 🔴 זה קרה בייצור: ארבעה תיקי דרכון נוכו והוחזרו כל שעה במשך יממה,
    // וכל החזרה הוסיפה ל"נקנו". המנהל הכניס 300 וראה 295 — מספר שאינו
    // קיים בשום מקום במציאות.
    const r = reconcileStock([restock(200), restock(100), birth('a'), refund('a')], [approved('a')])
    expect(r.totalIn).toBe(300)
  })

  it('🔴 החזרה מקזזת את הניכוי ואינה מנפחת את "נמסרו"', () => {
    // ניכוי + החזרה = אפס נטו. שניהם חייבים להתאזן, אחרת "נמסרו" מדווח
    // כרטיסים שלא נמסרו לאיש.
    const r = reconcileStock([restock(300), birth('a'), refund('a')], [approved('a')])
    expect(r.totalIn).toBe(300)
    expect(r.totalOut).toBe(0)
    expect(r.balance).toBe(300)
  })

  it('הזהות "פתיחה + נכנס − יצא = מלאי" נשמרת גם עם החזרות', () => {
    const r = reconcileStock([restock(300), birth('a'), refund('a'), birth('b')], [approved('a'), approved('b')])
    expect(r.opening + r.totalIn - r.totalOut).toBe(r.balance)
  })

  it('ניכוי לידה שאיבד את הקישור לתיק (התיק נמחק) נספר בנפרד ומסכם את הפער', () => {
    const r = reconcileStock(
      [restock(300), { delta: -1, reason: 'birth_approval', aid_id: null }, { delta: -1, reason: 'birth_approval', aid_id: null }],
      [],
    )
    expect(r.balance).toBe(298)
    expect(r.deletedAidCards).toBe(2)
    expect(r.strayCards).toBe(2)          // כלול בפער, גם בלי שם להציג
    expect(r.strays).toHaveLength(0)
    expect(r.expectedBalance).toBe(300)
  })

  it('החזרה שאיבדה את הקישור מקזזת ניכוי מחוסר-תיק', () => {
    const r = reconcileStock(
      [restock(300), { delta: -1, reason: 'birth_approval', aid_id: null }, { delta: 1, reason: 'adjust', aid_id: null }],
      [],
    )
    expect(r.deletedAidCards).toBe(0)
    expect(r.strayCards).toBe(0)
  })

  // ── מלאי פתיחה (ספירה פיזית) ────────────────────────────────────────────
  describe('מלאי פתיחה', () => {
    const at = (s: string) => `2026-08-0${s}T10:00:00.000Z`

    it('התאמה נמדדת מנקודת הספירה בלבד — תנועות הבדיקות אינן נכנסות לחישוב', () => {
      const r = reconcileStock([
        { delta: 683, reason: 'restock', aid_id: null, created_at: at('1') },
        { delta: -436, reason: 'manual_out', aid_id: null, created_at: at('2') },
        // ספירה פיזית: 300 בפועל מול 247 מחושבים → תנועת התאמה של +53
        { delta: 53, reason: 'baseline', aid_id: null, created_at: at('3') },
        { delta: -1, reason: 'birth_approval', aid_id: 'a', created_at: at('4') },
      ], [approved('a')])

      expect(r.balance).toBe(299)          // תמיד סכום כל היומן
      expect(r.opening).toBe(300)          // מלאי הפתיחה שנקבע
      expect(r.totalIn).toBe(0)
      expect(r.totalOut).toBe(1)
      expect(r.baselineAt).toBe(at('3'))
      // הזהות שהמנהל בודק: פתיחה + נכנס − יצא = מלאי
      expect(r.opening + r.totalIn - r.totalOut).toBe(r.balance)
      // הפילוח מציג רק את מה שקרה מאז הספירה
      expect(r.byReason.map(l => l.reason)).toEqual(['birth_approval'])
    })

    it('כרטיסים שנתקעו לפני הספירה אינם מוצגים כפער — הספירה כבר כוללת אותם', () => {
      const r = reconcileStock([
        { delta: 300, reason: 'restock', aid_id: null, created_at: at('1') },
        { delta: -1, reason: 'birth_approval', aid_id: 'old', created_at: at('2') },
        { delta: 0, reason: 'baseline', aid_id: null, created_at: at('3') },
      ], [{ id: 'old', name: 'לידה שנדחתה', status: 'cancelled', card_load_status: 'loaded' }])

      expect(r.balance).toBe(299)
      expect(r.opening).toBe(299)
      expect(r.strayCards).toBe(0)
      expect(r.strays).toHaveLength(0)
    })

    it('פער שנוצר אחרי הספירה כן מדווח', () => {
      const r = reconcileStock([
        { delta: 300, reason: 'baseline', aid_id: null, created_at: at('1') },
        { delta: -1, reason: 'birth_approval', aid_id: 'x', created_at: at('2') },
      ], [{ id: 'x', name: 'נדחתה אחרי הספירה', status: 'cancelled', card_load_status: 'loaded' }])

      expect(r.opening).toBe(300)
      expect(r.balance).toBe(299)
      expect(r.strayCards).toBe(1)
      expect(r.expectedBalance).toBe(300)
    })

    it('ספירה חדשה גוברת על קודמת', () => {
      const r = reconcileStock([
        { delta: 100, reason: 'baseline', aid_id: null, created_at: at('1') },
        { delta: -1, reason: 'birth_approval', aid_id: 'x', created_at: at('2') },
        { delta: 201, reason: 'baseline', aid_id: null, created_at: at('3') },
        { delta: -1, reason: 'birth_approval', aid_id: 'y', created_at: at('4') },
      ], [approved('x'), approved('y')])

      expect(r.baselineAt).toBe(at('3'))
      expect(r.opening).toBe(300)
      expect(r.balance).toBe(299)
      expect(r.totalOut).toBe(1)
    })

    it('בלי ספירה — מלאי הפתיחה 0 וההתאמה מכסה את כל היומן', () => {
      const r = reconcileStock([restock(300), birth('a')], [approved('a')])
      expect(r.opening).toBe(0)
      expect(r.baselineAt).toBeNull()
      expect(r.totalIn).toBe(300)
    })
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

  it('כרטיס תלוי שעדיין טעון מסומן — אחרת החזרתו למלאי הייתה יוצרת כרטיס פנטום', () => {
    const r = reconcileStock(
      [restock(300), birth('a'), birth('b')],
      [
        { id: 'a', name: 'טעונה', status: 'pending', card_load_status: 'loaded' },
        { id: 'b', name: 'נכשלה', status: 'pending', card_load_status: 'failed' },
      ],
    )
    expect(r.strays.find(s => s.aidId === 'a')!.loaded).toBe(true)
    expect(r.strays.find(s => s.aidId === 'b')!.loaded).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('approvedCardCoverage', () => {
  const held = ['a', 'b']

  it('מאושרות שמחזיקות כרטיס נספרות, ולא נוצר פער מדומה', () => {
    const c = approvedCardCoverage(
      [{ id: 'a', name: 'ראשונה', card_load_status: 'loaded' }, { id: 'b', name: 'שנייה', card_load_status: 'loaded' }],
      held,
    )
    expect(c).toMatchObject({ total: 2, withCard: 2 })
    expect(c.missing).toHaveLength(0)
  })

  it('מאושרת שההטענה שלה נכשלה מדווחת כמאושרת בלי כרטיס, עם הסיבה', () => {
    const c = approvedCardCoverage(
      [{ id: 'a', name: 'ראשונה', card_load_status: 'loaded' }, { id: 'z', name: 'כשל', card_load_status: 'failed' }],
      held,
    )
    expect(c).toMatchObject({ total: 2, withCard: 1 })
    expect(c.missing).toEqual([{ aidId: 'z', name: 'כשל', reason: 'ההטענה נכשלה — לא יצא כרטיס' }])
  })

  it('מאושרת שממתינה למלאי אינה "כרטיס אבוד" אלא תור', () => {
    const c = approvedCardCoverage([{ id: 'w', name: 'ממתינה', card_load_status: null, awaitingStock: true }], [])
    expect(c.missing[0].reason).toContain('ממתינה למלאי')
  })

  it('כרטיס שנפרק בתום הזכאות נחשב כמי שקיבלה כרטיס', () => {
    const c = approvedCardCoverage([{ id: 'old', name: 'ותיקה', card_load_status: 'unloaded' }], [])
    expect(c.withCard).toBe(1)
    expect(c.missing).toHaveLength(0)
  })

  it('התרחיש שהמנהל שאל עליו: 48 מאושרות, 46 עם כרטיס — שתיים בשם ובסיבה', () => {
    const aids = Array.from({ length: 46 }, (_, i) => ({ id: `k${i}`, name: `מאושרת ${i}`, card_load_status: 'loaded' }))
    aids.push({ id: 'x', name: 'ההטענה נכשלה', card_load_status: 'failed' })
    aids.push({ id: 'y', name: 'טרם נטענה', card_load_status: 'pending' })
    const c = approvedCardCoverage(aids, aids.slice(0, 46).map(a => a.id))
    expect(c.total).toBe(48)
    expect(c.withCard).toBe(46)
    expect(c.missing.map(m => m.name)).toEqual(['ההטענה נכשלה', 'טרם נטענה'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ הבדיקה הזו קיימת כדי שהמספר "נמסרו" יישאר זהה בדשבורד ובמסך הכרטיסים.
// הם הציגו 54 מול 49 מפני שכל אחד חישב בדרך משלו: הדשבורד לפי card_load_status
// בלי לבדוק wants_food_card, והמסך לפי קישור היומן. עכשיו שניהם על אותה הגדרה.
// ─────────────────────────────────────────────────────────────────────────────
describe('הגדרה אחת ל"נמסרו" בשני המסכים', () => {
  const aids = [
    { id: 'a', name: 'נטענה', card_load_status: 'loaded' },
    { id: 'b', name: 'נפרקה בתום הזכאות', card_load_status: 'unloaded' },
    { id: 'c', name: 'ביקשה בית החלמה בלבד', card_load_status: 'loaded', wants_food_card: false },
    { id: 'd', name: 'ההטענה נכשלה', card_load_status: 'failed' },
    { id: 'e', name: 'יש ניכוי ביומן אך לא נטענה', card_load_status: null },
  ]

  it('מסך הכרטיסים: רק מי שנטען לה כרטיס נספרת', () => {
    // ⚠️ 'e' מופיעה ב-heldIds ובכל זאת אינה נספרת: ניכוי ביומן בלי הטענה
    // פירושו שהכרטיס לא יצא מהמגירה.
    const c = approvedCardCoverage(aids.filter(a => a.wants_food_card !== false), ['e'])
    expect(c.withCard).toBe(2)
    expect(c.missing.map(m => m.aidId).sort()).toEqual(['d', 'e'])
  })

  it('הדשבורד סופר בדיוק את אותו הדבר', async () => {
    const { holdsCard } = await import('./awaitingFilter')
    expect(aids.filter(holdsCard).length).toBe(2)
  })

  it('לידה שביקשה בית החלמה בלבד אינה "נמסרה" גם כשיש לה טעינה', async () => {
    const { holdsCard } = await import('./awaitingFilter')
    expect(holdsCard({ card_load_status: 'loaded', wants_food_card: false })).toBe(false)
    expect(holdsCard({ card_load_status: 'loaded' })).toBe(true)
  })
})
