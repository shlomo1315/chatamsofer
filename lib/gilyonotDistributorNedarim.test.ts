import { describe, expect, it } from 'vitest'
import { mapDistributorRow, synagogueKey, validateDistConfig, type DistNedarimConfig } from './gilyonotDistributorNedarim'

const cfg: DistNedarimConfig = { tofesId: '12', nameField: 'Field1', phoneField: 'Field2', emailField: '', cityField: 'Field3', synagogueField: 'Field4', addressField: '', quantityField: 'Field5' }

describe('הרשמת מפיצים מנדרים', () => {
  it('אותו בית כנסת בכתיבים שונים = אותו מפתח', () => {
    const k = synagogueKey('בני ברק', 'אהל משה')
    expect(synagogueKey('בני ברק', 'בית הכנסת "אהל משה"')).toBe(k)
    expect(synagogueKey('בני ברק', 'ביהכ"נ אהל-משה')).toBe(k)
    expect(synagogueKey('אלעד', 'אהל משה')).not.toBe(k)
    expect(synagogueKey('בני ברק', '  ')).toBeNull()
  })

  it('רשומה מלאה עוברת, וחסרה נשלחת לבדיקה עם סיבה', () => {
    const ok = mapDistributorRow({ ID: '7', Field1: 'משה כהן', Field2: '052-1234567', Field3: 'בני ברק', Field4: 'אהל משה', Field5: '30' }, cfg)
    expect(ok.reason).toBeNull()
    expect(ok.value).toMatchObject({ full_name: 'משה כהן', phone: '0521234567', quantity: 30, sourceRef: 'nedarim-dist:12:7' })
    expect(mapDistributorRow({ ID: '8', Field1: 'משה', Field2: '12', Field4: 'אהל משה' }, cfg).reason).toBe('no_phone')
    expect(mapDistributorRow({ ID: '9', Field1: 'משה', Field2: '0521234567' }, cfg).reason).toBe('no_synagogue')
    expect(mapDistributorRow({ ID: '10', Field2: '0521234567', Field4: 'אהל משה' }, cfg).reason).toBe('no_name')
  })

  it('הגדרות: מספר טופס ועמודות החובה', () => {
    expect(validateDistConfig(cfg)).toBeNull()
    expect(validateDistConfig({ ...cfg, tofesId: 'abc' })).not.toBeNull()
    expect(validateDistConfig({ ...cfg, synagogueField: '' })).not.toBeNull()
    expect(validateDistConfig({ ...cfg, emailField: 'שם' })).not.toBeNull()
  })
})
