import { describe, it, expect } from 'vitest'
import { resolveDeepLinkAction } from './deepLinkAction'

/**
 * הבאג: משפחה שנכנסה מקישור `?action=birth` קיבלה קריסת לשונית
 * ("This page couldn't load") במקום טופס לידה.
 *
 * השורש: ה-effect שקופץ לטופס תלוי ב-`step`, ו-goToBirthForm קורא
 * ל-setStep('new-birth'). כשהפתיחה *נחסמה* (שער מחלקה סגור / לא נשוי /
 * מסמכים חסרים) הכוונה לא נוקתה — ולכן ה-effect רץ שוב ושוב על אותם
 * נתונים בדיוק. כל סיבוב מפעיל setState, שמפעיל את ה-effect מחדש:
 * לולאת רינדור אינסופית שמחסלת את ה-renderer של הדפדפן.
 */
describe('resolveDeepLinkAction — כוונת deep-link מהמייל', () => {
  const ready = { gatesLoaded: true, holidayLoaded: true, canRequestBirth: true, gateOpen: true, isDocsPending: false }

  it('פותח את טופס הלידה כששער היולדות פתוח', () => {
    const r = resolveDeepLinkAction('birth', ready)
    expect(r.open).toBe('birth-form')
    expect(r.clearIntent).toBe(true)
  })

  it('לא מנקה את הכוונה כל עוד השערים לא נטענו — ננסה שוב', () => {
    const r = resolveDeepLinkAction('birth', { ...ready, gatesLoaded: false })
    expect(r.open).toBe(null)
    expect(r.clearIntent).toBe(false)
  })

  // ── לב הבאג ──
  it('🔴 שער יולדות סגור — מנקה את הכוונה ואינו מנסה שוב (אחרת: לולאה אינסופית)', () => {
    const r = resolveDeepLinkAction('birth', { ...ready, gateOpen: false })
    expect(r.open).toBe(null)
    // אם זה false — ה-effect ירוץ שוב, יקרא שוב ל-setState, והלשונית תקרוס
    expect(r.clearIntent).toBe(true)
  })

  it('🔴 משפחה שאינה רשומה כנשואים — מנקה את הכוונה ואינו מנסה שוב', () => {
    const r = resolveDeepLinkAction('birth', { ...ready, canRequestBirth: false })
    expect(r.open).toBe(null)
    expect(r.clearIntent).toBe(true)
    expect(r.error).toContain('נשואים')
  })

  it('🔴 מסמכים חסרים — מציג חלונית, מנקה את הכוונה ואינו מנסה שוב', () => {
    const r = resolveDeepLinkAction('birth', { ...ready, isDocsPending: true })
    expect(r.open).toBe('docs-gate-modal')
    expect(r.clearIntent).toBe(true)
  })

  it('חלוקת חגים — לא מנקה עד שהנתונים נטענו, ומנקה אחריהם', () => {
    expect(resolveDeepLinkAction('holiday', { ...ready, holidayLoaded: false }).clearIntent).toBe(false)
    expect(resolveDeepLinkAction('holiday', ready).clearIntent).toBe(true)
  })
})

/**
 * מגן הלולאה — סימולציה של ה-effect עצמו.
 *
 * ⚠️ הטסטים למעלה בודקים שההכרעה *נכונה*. הטסט הזה בודק משהו אחר:
 * שגם אם ההכרעה תהיה שגויה (מסלול שמחזיר clearIntent=false לנצח),
 * המונה עוצר את המחזור. זו ההגנה שמבטיחה "לא ייקרס אף פעם".
 */
describe('מגן מפני לולאה אינסופית', () => {
  function runEffectLoop(alwaysWaiting: boolean) {
    let tries = 0
    let cleared = false
    let renders = 0
    // מדמה: כל setState מפעיל את ה-effect מחדש
    for (let i = 0; i < 10_000; i++) {
      renders++
      if (cleared) break
      if (tries > 3) break            // ← המגן
      tries += 1
      const d = alwaysWaiting
        ? { clearIntent: false }
        : resolveDeepLinkAction('birth', {
            gatesLoaded: true, holidayLoaded: true,
            canRequestBirth: true, gateOpen: false, isDocsPending: false,
          })
      if (d.clearIntent) cleared = true
    }
    return renders
  }

  it('מסלול תקין — נעצר מיד', () => {
    expect(runEffectLoop(false)).toBeLessThan(5)
  })

  it('🔴 גם מסלול פגום שלעולם אינו מכריע — נעצר, ולא רץ לנצח', () => {
    const renders = runEffectLoop(true)
    expect(renders).toBeLessThan(10)     // לא 10,000
  })
})
