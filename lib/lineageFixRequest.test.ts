import { describe, it, expect } from 'vitest'
import { validateFixRequest, cleanFixText, MAX_FIX_TEXT } from './lineageFixRequest'

// ─────────────────────────────────────────────────────────────────────────────
// בקשת תיקון סדר דורות מהאזור האישי.
//
// עד כה ההצעות היו אפשריות רק דרך lineage_share_invites — קישור עם טוקן
// שהמזכירות שולחת ביוזמתה. צאצא שראה טעות בייחוס שלו לא יכול היה להודיע
// עליה, אלא אם המשרד פנה אליו קודם.
//
// ⚠️ הבקשה אינה משנה את העץ: היא נכנסת ל-lineage_review_suggestions
// וממתינה לאישור המנהל, כמו כל הצעה אחרת. הייחוס קובע זכאות, ועריכה
// ישירה בידי המבקש הייתה עוקפת את הבדיקה כולה.
// ─────────────────────────────────────────────────────────────────────────────

describe('validateFixRequest', () => {
  it('מקבל תיאור תקין', () => {
    expect(validateFixRequest('בדור 4 השם צריך להיות אברהם יהושע ולא אברהם')).toBeNull()
  })

  it('דוחה טקסט ריק — אין מה להעביר למנהל', () => {
    expect(validateFixRequest('')).toMatch(/לפרט/)
    expect(validateFixRequest('   ')).toMatch(/לפרט/)
  })

  it('דוחה טקסט קצר מדי', () => {
    // ⚠️ "טעות" או "לא נכון" אינם בקשת תיקון: המנהל אינו יכול לפעול
    // לפיהם, והפנייה חוזרת אליו כשאלה במקום כמשימה.
    expect(validateFixRequest('טעות')).toMatch(/לפרט/)
  })

  it('דוחה טקסט ארוך מדי', () => {
    expect(validateFixRequest('א'.repeat(MAX_FIX_TEXT + 1))).toMatch(/ארוך/)
  })
})

describe('cleanFixText', () => {
  it('מסיר רווחים מיותרים', () => {
    expect(cleanFixText('  יש טעות בדור 3  ')).toBe('יש טעות בדור 3')
  })

  it('חותך לאורך המרבי', () => {
    expect(cleanFixText('א'.repeat(5000)).length).toBe(MAX_FIX_TEXT)
  })

  it('מנטרל תגיות HTML — הטקסט מוצג במסך הניהול', () => {
    // ⚠️ ההצעה מוצגת למנהל ב-SuggestionsInbox. תגית שנשמרת כפי שהיא
    // היא הזרקה לכל דבר.
    expect(cleanFixText('<script>alert(1)</script>תיקון')).not.toContain('<')
  })

  it('שומר על עברית, ניקוד וסימני פיסוק', () => {
    expect(cleanFixText('ר׳ אברהם — בן, לא חתן')).toBe('ר׳ אברהם — בן, לא חתן')
  })
})
