import { describe, it, expect } from 'vitest'
import { buildExtIni, extIniPath } from './yemotExtIni'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 יצירת שלוחות בימות אוטומטית — במקום שהמנהל יגדיר אותן שם ידנית.
//
// ⚠️ ext.ini הוא קובץ ההגדרות של שלוחה בימות. העלאתו דרך UploadFile
// יוצרת את השלוחה בפועל. קובץ שגוי אינו נכשל ברעש — הוא יוצר שלוחה
// שמשמיעה שקט, וזו תקלה שמתגלה רק מתלונה של מתקשר.
// ─────────────────────────────────────────────────────────────────────────────

describe('extIniPath — 🔴 הנתיב בימות', () => {
  it('שלוחה פשוטה', () => {
    expect(extIniPath('7')).toBe('ivr2:/7/ext.ini')
  })

  it('⚠️ לוכסן מוביל נחתך — "/7" ו-"7" הם אותה שלוחה', () => {
    expect(extIniPath('/7')).toBe('ivr2:/7/ext.ini')
  })

  it('שלוחה מקוננת', () => {
    expect(extIniPath('2/7')).toBe('ivr2:/2/7/ext.ini')
  })

  it('🔴 נתיב פסול → null. לא מעלים קובץ למקום לא ידוע', () => {
    expect(extIniPath('')).toBeNull()
    expect(extIniPath('../../etc')).toBeNull()
    expect(extIniPath('7; rm -rf')).toBeNull()
    expect(extIniPath('שלוחה')).toBeNull()
  })
})

describe('buildExtIni — תוכן הקובץ', () => {
  it('תא קולי', () => {
    const ini = buildExtIni({ type: 'voice_mail' })
    expect(ini).toContain('type=voice_mail')
  })

  it('🔴 כל שורה בצורה מפתח=ערך', () => {
    const ini = buildExtIni({ type: 'zmanim', extra: { city: 'ירושלים' } })
    for (const line of ini.split('\n').filter(Boolean)) {
      expect(line, line).toMatch(/^[a-zA-Z_][a-zA-Z0-9_]*=.*$/)
    }
  })

  it('פרמטרים נוספים נכללים', () => {
    const ini = buildExtIni({ type: 'voicemail_email', extra: { email: 'a@b.co' } })
    expect(ini).toContain('email=a@b.co')
  })

  it('⚠️ ערך ריק מדולג — שורה ריקה בימות מתפרשת כברירת מחדל שגויה', () => {
    const ini = buildExtIni({ type: 'zmanim', extra: { city: '', other: 'x' } })
    expect(ini).not.toContain('city=')
    expect(ini).toContain('other=x')
  })

  it('🔴 שורה חדשה בערך נחסמת — היא מזריקה הגדרה נוספת', () => {
    const ini = buildExtIni({ type: 'voice_mail', extra: { x: 'a\ntype=admin_login' } })
    expect(ini).not.toContain('admin_login')
  })

  it('⚠️ סוג פסול → מחרוזת ריקה, ולא קובץ שבור', () => {
    expect(buildExtIni({ type: '' })).toBe('')
    expect(buildExtIni({ type: 'לא חוקי' })).toBe('')
  })

  it('הקובץ מסתיים בשורה חדשה — ימות מצפה לכך', () => {
    expect(buildExtIni({ type: 'voice_mail' }).endsWith('\n')).toBe(true)
  })
})
