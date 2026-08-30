import { describe, it, expect } from 'vitest'
import { babyNamePatch, babiesOf, babyNamesPatch, type AidNameFields } from './babyNames'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הבאג: ליולדת תאומים נשלחה בקשת תיקון שם על תינוק *אחד* בלבד.
//
// שלוש השכבות כתבו תמיד ל-babies[0]: הטופס הציבורי (שדה קלט יחיד), ה-API
// (babyNamePatch בלי index), ומסך העריכה. התוצאה בשטח: 3 מתוך 5 תיקי
// התאומים במסד עם תינוק אחד בעל שם והשני null — התאום השני אבד.
//
// ⚠️ babyNamePatch תמך ב-index מלכתחילה; פשוט אף קורא לא העביר אותו.
// ─────────────────────────────────────────────────────────────────────────────

const twins: AidNameFields = {
  is_twins: true,
  baby_name_pending: true,
  babies: [
    { name: null, gender: 'female', id_type: 'id', id_number: '246483283' },
    { name: null, gender: 'male', id_type: 'id', id_number: '246483291' },
  ],
}

describe('babyNamePatch — כתיבה לתאום מסוים לפי index', () => {
  it('index=1 כותב לתאום השני ואינו דורס את הראשון', () => {
    const orig = twins.babies as { name: string | null }[]
    const withFirst: AidNameFields = { ...twins, babies: [{ ...orig[0], name: 'שרה' }, orig[1]] }
    const patch = babyNamePatch(withFirst, 'יעקב', 1)
    const arr = patch.babies as { name: string | null }[]
    expect(arr[0].name).toBe('שרה')
    expect(arr[1].name).toBe('יעקב')
  })

  it('השדה הסקלרי משקף תמיד את התאום הראשון', () => {
    const patch = babyNamePatch(twins, 'יעקב', 1)
    expect(patch.baby_name).toBeNull()
  })
})

describe('babyNamesPatch — שמירת כל התאומים בפעולה אחת', () => {
  it('כותב שם לכל תאום בנפרד', () => {
    const patch = babyNamesPatch(twins, ['שרה', 'יעקב'])
    const arr = patch.babies as { name: string | null; id_number?: string }[]
    expect(arr.map(b => b.name)).toEqual(['שרה', 'יעקב'])
    // ⚠️ הת"ז של כל תאום נשמרת — היא מה שמאפשר ליולדת לזהות מי מי.
    expect(arr[0].id_number).toBe('246483283')
    expect(arr[1].id_number).toBe('246483291')
  })

  it('הדגל נכבה רק כששני התאומים קיבלו שם', () => {
    expect(babyNamesPatch(twins, ['שרה', 'יעקב']).baby_name_pending).toBe(false)
    // תאום אחד בלבד קיבל שם — התיק עדיין ממתין, אחרת הוא נעלם מרשימת
    // "ממתין לתיקונים" והתאום השני לא יושלם לעולם.
    expect(babyNamesPatch(twins, ['שרה', '']).baby_name_pending).toBe(true)
  })

  it('שם ריק לתאום אחד אינו מוחק שם קיים של האחר', () => {
    const patch = babyNamesPatch(twins, ['שרה', ''])
    const arr = patch.babies as { name: string | null }[]
    expect(arr[0].name).toBe('שרה')
    expect(arr[1].name).toBeNull()
  })

  it('השדה הסקלרי משקף את התאום הראשון', () => {
    expect(babyNamesPatch(twins, ['שרה', 'יעקב']).baby_name).toBe('שרה')
  })

  it('לידה בודדת — התנהגות זהה לקודם', () => {
    const single: AidNameFields = { babies: [{ name: null, id_number: '111' }], baby_name_pending: true }
    const patch = babyNamesPatch(single, ['משה'])
    expect((patch.babies as { name: string }[])[0].name).toBe('משה')
    expect(patch.baby_name).toBe('משה')
    expect(patch.baby_name_pending).toBe(false)
  })
})

describe('babiesOf — מקור התצוגה לטופס התיקון', () => {
  it('מחזיר את שני התאומים עם הת"ז והמין שלהם', () => {
    const list = babiesOf(twins)
    expect(list).toHaveLength(2)
    expect(list[0].id_number).toBe('246483283')
    expect(list[1].gender).toBe('male')
  })
})
