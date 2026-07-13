import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { EMAIL_CATALOG } from './emailCatalog'

// ─────────────────────────────────────────────────────────────────────────────
// שמירה על אמינות המסך: מייל שמופיע בו חייב להיות מייל שהעריכה בו באמת
// משפיעה. הצגת מייל שאינו מחובר מטעה — המשתמש עורך, שומר, ושום דבר לא קורה.
// ─────────────────────────────────────────────────────────────────────────────

const templates = readFileSync(join(__dirname, 'emailTemplates.ts'), 'utf8')

describe('קטלוג המיילים', () => {
  it('מזהים ייחודיים', () => {
    const ids = EMAIL_CATALOG.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('לכל מייל יש שדות לעריכה ותיאור מתי הוא נשלח', () => {
    for (const spec of EMAIL_CATALOG) {
      expect(spec.fields.length, `${spec.id}: אין שדות`).toBeGreaterThan(0)
      expect(spec.trigger.trim(), `${spec.id}: אין trigger`).not.toBe('')
      expect(spec.recipient.trim(), `${spec.id}: אין נמען`).not.toBe('')
    }
  })

  it('מפתחות שדה ייחודיים בתוך כל מייל', () => {
    for (const spec of EMAIL_CATALOG) {
      const keys = spec.fields.map(f => f.key)
      expect(new Set(keys).size, `${spec.id}: מפתח כפול`).toBe(keys.length)
    }
  })

  // הבדיקה החשובה: wired=true מבטיח למשתמש שהעריכה תשפיע. אם התבנית
  // אינה קוראת textFor עם המזהה הזה — ההבטחה שקרית.
  it('כל מייל שמסומן wired באמת קורא את הטקסטים הערוכים', () => {
    const wired = EMAIL_CATALOG.filter(e => e.wired)
    expect(wired.length, 'אף מייל אינו מחובר').toBeGreaterThan(0)

    for (const spec of wired) {
      const uses = templates.includes(`textFor('${spec.id}'`)
      expect(uses, `${spec.id}: מסומן wired אך emailTemplates.ts אינו קורא textFor('${spec.id}')`).toBe(true)
    }
  })

  it('כל שדה של מייל מחובר מופיע בתבנית', () => {
    for (const spec of EMAIL_CATALOG.filter(e => e.wired)) {
      for (const f of spec.fields) {
        const used = templates.includes(`'${f.key}'`)
        expect(used, `${spec.id}.${f.key}: שדה שניתן לערוך אך אינו בשימוש בתבנית`).toBe(true)
      }
    }
  })
})
