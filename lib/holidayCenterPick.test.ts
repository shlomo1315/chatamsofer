import { describe, it, expect } from 'vitest'
import { evaluatePick, groupByRegion, pickMessage, centerLabel, FINAL_WARNING, REGIONS, type CenterRow, type PickState } from './holidayCenterPick'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הכללים כאן משותפים לטלפון ולממשק הדיגיטלי.
//
// ⚠️ זו כל הסיבה שהלוגיקה יושבת בפונקציה טהורה אחת: שני ערוצים שכל אחד
// אוכף כללים משלו נפרדים זה מזה ברגע שמשנים אחד מהם — והמשפחה מגלה
// שהטלפון מאפשר מה שהמסך חוסם.
// ─────────────────────────────────────────────────────────────────────────────

const base: PickState = {
  centersOpen: true,
  currentCenterId: null,
  centerExists: true,
  centerIsOpenInDistribution: true,
  centerTaken: 0,
  centerCapacity: null,
}

describe('evaluatePick — מתי מותר לבחור מוקד', () => {
  it('בחירה תקינה מתקבלת', () => {
    expect(evaluatePick(base)).toEqual({ ok: true })
  })

  it('🔴 בחירה נעולה אחרי שכבר נבחר מוקד', () => {
    // ההודעה למשפחות מבטיחה "לא ניתן יהיה לשנות את בחירתכם".
    // ⚠️ ההבטחה הזו היא גם מה ששומר על תקרות המוקדים.
    const r = evaluatePick({ ...base, currentCenterId: 'c1' })
    expect(r).toEqual({ ok: false, reason: 'locked' })
  })

  it('בחירת אותו מוקד שוב אינה שגיאה', () => {
    // ⚠️ הקשה כפולה בטלפון שכיחה. "כבר בחרת בזה" אינו כשל.
    const r = evaluatePick({ ...base, currentCenterId: 'c1' }, 'c1')
    expect(r).toEqual({ ok: true })
  })

  it('בחירה חסומה כשהמתג סגור', () => {
    expect(evaluatePick({ ...base, centersOpen: false }))
      .toEqual({ ok: false, reason: 'closed' })
  })

  it('מוקד שאינו קיים', () => {
    expect(evaluatePick({ ...base, centerExists: false }))
      .toEqual({ ok: false, reason: 'not_found' })
  })

  it('מוקד שאינו פתוח בחלוקה הזו', () => {
    // המוקד קיים במאגר הגלובלי אך לא נבחר לחלוקה הנוכחית.
    expect(evaluatePick({ ...base, centerIsOpenInDistribution: false }))
      .toEqual({ ok: false, reason: 'not_found' })
  })

  it('🔴 מוקד מלא נחסם', () => {
    expect(evaluatePick({ ...base, centerCapacity: 50, centerTaken: 50 }))
      .toEqual({ ok: false, reason: 'full' })
  })

  it('מוקד כמעט מלא עדיין פתוח', () => {
    expect(evaluatePick({ ...base, centerCapacity: 50, centerTaken: 49 }))
      .toEqual({ ok: true })
  })

  it('capacity ריק = ללא הגבלה', () => {
    expect(evaluatePick({ ...base, centerCapacity: null, centerTaken: 9999 }))
      .toEqual({ ok: true })
  })

  it('⚠️ הנעילה גוברת על התקרה', () => {
    // מי שכבר בחר מוקד מלא — נשאר בו. "מלא" אינו סיבה לשחרר נעילה.
    expect(evaluatePick({ ...base, currentCenterId: 'c1', centerCapacity: 1, centerTaken: 1 }))
      .toEqual({ ok: false, reason: 'locked' })
  })

  it('⚠️ מתג סגור גובר על הכול — גם לפני בדיקת קיום', () => {
    expect(evaluatePick({ ...base, centersOpen: false, centerExists: false }))
      .toEqual({ ok: false, reason: 'closed' })
  })
})

describe('groupByRegion — תפריט האזורים בשלוחה', () => {
  const rows: CenterRow[] = [
    { id: '1', city: 'ירושלים', name: 'נווה צבי', region: 'jerusalem', sort_order: 10 },
    { id: '2', city: 'ירושלים', name: 'מאה שערים', region: 'jerusalem', sort_order: 20 },
    { id: '3', city: 'בני ברק', name: 'סקולוב', region: 'center', sort_order: 10 },
    { id: '4', city: 'חיפה', name: 'חיפה', region: 'north', sort_order: 10 },
  ]

  it('מקבץ ערים לפי אזור', () => {
    const g = groupByRegion(rows)
    expect(g.jerusalem.map(c => c.city)).toEqual(['ירושלים'])
    expect(g.center.map(c => c.city)).toEqual(['בני ברק'])
    expect(g.north.map(c => c.city)).toEqual(['חיפה'])
  })

  it('🔴 עיר עם כמה מוקדים מופיעה פעם אחת ברשימת הערים', () => {
    // ⚠️ בירושלים 5 מוקדים. תפריט שמקריא "ירושלים" חמש פעמים חסר משמעות —
    // הבחירה בין המוקדים היא שלב נפרד אחרי בחירת העיר.
    const g = groupByRegion(rows)
    expect(g.jerusalem).toHaveLength(1)
    expect(g.jerusalem[0].centers).toHaveLength(2)
  })

  it('אזור בלי מוקדים מוחזר כרשימה ריקה ולא כחסר', () => {
    const g = groupByRegion(rows)
    expect(g.south).toEqual([])
  })

  it('כל האזורים מוגדרים', () => {
    expect(Object.keys(REGIONS)).toEqual(['jerusalem', 'center', 'north', 'south'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מי שכבר בחר מוקד ומתקשר שוב — רוצה לדעת *איזה*, לא לשמוע שנכשל.
// ─────────────────────────────────────────────────────────────────────────────
describe('pickMessage — "כבר בחרתם" היא הודעת אישור', () => {
  it('משבץ את שם המוקד בהודעת הנעילה', () => {
    expect(pickMessage('locked', 'ירושלים · אזור נווה צבי'))
      .toBe('כבר נרשמתם למוקד החלוקה בירושלים · אזור נווה צבי. לא ניתן לשנות את הבחירה')
  })

  it('⚠️ בלי שם מוקד — המשפט נשאר תקין ואינו מציג {center}', () => {
    const msg = pickMessage('locked', null)
    expect(msg).not.toContain('{center}')
    expect(msg).toBe('כבר נרשמתם למוקד החלוקה. לא ניתן לשנות את הבחירה')
  })

  it('הודעות שאינן נעילה אינן מושפעות', () => {
    expect(pickMessage('closed')).toBe('בחירת מוקד החלוקה אינה פתוחה כעת')
    expect(pickMessage('full')).toBe('המוקד שנבחר מלא. יש לבחור מוקד אחר')
  })
})

describe('centerLabel', () => {
  it('עיר ושם שונים — מציג את שניהם', () => {
    expect(centerLabel({ city: 'ירושלים', name: 'אזור נווה צבי' }))
      .toBe('ירושלים · אזור נווה צבי')
  })

  it('⚠️ עיר ששמה זהה לשם המוקד אינה מוצגת פעמיים', () => {
    // רוב הערים (חיפה, אלעד, ערד) הוזנו כך.
    expect(centerLabel({ city: 'חיפה', name: 'חיפה' })).toBe('חיפה')
  })

  it('null מוחזר כ-null ולא כמחרוזת "null"', () => {
    expect(centerLabel(null)).toBeNull()
  })
})

describe('FINAL_WARNING — אזהרת הסופיות לפני האישור', () => {
  it('🔴 שני הערוצים מזהירים שהבחירה סופית', () => {
    // ⚠️ האזהרה חייבת להופיע *לפני* האישור. אחריו אין מה לעשות עם המידע,
    // והמשפחה מגלה את הנעילה רק כשהיא כבר מנסה לשנות.
    expect(FINAL_WARNING.phone).toContain('סופית')
    expect(FINAL_WARNING.portal).toContain('סופית')
  })

  it('נוסח הטלפון כולל את ההוראה עצמה', () => {
    // בשלוחה אין "כפתור" — האזהרה וההוראה נשמעות ברצף אחד.
    expect(FINAL_WARNING.phone).toContain('הקישו 1')
    expect(FINAL_WARNING.phone).toContain('הקישו 2')
  })

  it('⚠️ נוסח הטלפון קצר דיו כדי שלא יאבד את המאזין', () => {
    expect(FINAL_WARNING.phone.length).toBeLessThan(160)
  })

  it('נוסח האתר מסביר את ההשלכה המעשית', () => {
    expect(FINAL_WARNING.portal).toContain('השובר')
  })
})
