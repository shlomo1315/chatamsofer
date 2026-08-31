import { describe, it, expect } from 'vitest'
import { YEMOT_TYPES, yemotTypeByKey, yemotTypeGroups } from './ivrYemotTypes'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הרישום הוא מה שהמנהל רואה. פריט שגוי כאן שולח אותו להגדיר
// שלוחה שאינה קיימת, והמתקשרים שומעים שקט.
// ─────────────────────────────────────────────────────────────────────────────

describe('YEMOT_TYPES — שלמות הרישום', () => {
  it('לכל סוג יש מפתח, שם, הסבר והוראת הגדרה', () => {
    for (const t of YEMOT_TYPES) {
      expect(t.key, 'מפתח חסר').toBeTruthy()
      expect(t.label, `שם חסר ל-${t.key}`).toBeTruthy()
      expect(t.what, `הסבר חסר ל-${t.key}`).toBeTruthy()
      // 🔴 בלי הוראת הגדרה המנהל בוחר סוג ולא יודע שצריך להגדיר
      // אותו גם בימות — והשלוחה משמיעה שקט.
      expect(t.setupHint, `הוראת הגדרה חסרה ל-${t.key}`).toBeTruthy()
    }
  })

  it('🔴 אין מפתח כפול — שניים באותו מפתח מסתירים זה את זה ברשימה', () => {
    const keys = YEMOT_TYPES.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('⚠️ המפתחות באותיות לטיניות בלבד — כך ימות מצפה להם', () => {
    for (const t of YEMOT_TYPES) {
      expect(t.key, t.key).toMatch(/^[a-z_][a-z0-9_]*$/)
    }
  })

  it('⚠️ הוראת ההגדרה מזכירה את ימות — היא כל תכליתה', () => {
    for (const t of YEMOT_TYPES) {
      expect(t.setupHint, t.key).toContain('ימות')
    }
  })

  it('הסוגים שהמשתמש ביקש נמצאים', () => {
    for (const k of ['voicemail_email', 'access_filter', 'send_fax', 'zmanim']) {
      expect(yemotTypeByKey(k), k).not.toBeNull()
    }
  })
})

describe('yemotTypeByKey', () => {
  it('מוצא לפי מפתח', () => {
    expect(yemotTypeByKey('zmanim')?.label).toContain('זמני')
  })

  it('⚠️ רווחים נחתכים — הדבקה מהתיעוד גוררת אותם', () => {
    expect(yemotTypeByKey('  zmanim  ')?.key).toBe('zmanim')
  })

  it('מפתח שאינו קיים → null ולא קריסה', () => {
    expect(yemotTypeByKey('לא קיים')).toBeNull()
    expect(yemotTypeByKey('')).toBeNull()
  })
})

describe('yemotTypeGroups — הקיבוץ לרשימה', () => {
  it('כל הסוגים מופיעים, אחד בדיוק בכל קבוצה', () => {
    const flat = yemotTypeGroups().flatMap(g => g.types)
    expect(flat).toHaveLength(YEMOT_TYPES.length)
  })

  it('⚠️ אין קבוצה ריקה', () => {
    for (const g of yemotTypeGroups()) expect(g.types.length).toBeGreaterThan(0)
  })
})
