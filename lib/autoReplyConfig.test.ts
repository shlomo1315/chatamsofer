import { describe, it, expect } from 'vitest'
import {
  sanitizeButtons, sanitizeSections, normalizeConfig, buildAutoReplyBody,
  defaultAutoReplyMap, MAX_BUTTONS, MAX_SECTIONS,
} from './autoReplyConfig'
import { DEPARTMENTS } from './departments'

// ─────────────────────────────────────────────────────────────────────────────
// המענה האוטומטי הוא הדבר היחיד שפונה מקבל מתיבה שאיש אינו קורא בה.
// אם הוא נשבר — הפנייה נעלמת בשקט. הבדיקות כאן מקבעות את מה שאסור שיישבר.
// ─────────────────────────────────────────────────────────────────────────────

describe('כפתורים — ניקוי קישורים', () => {
  it('כתובת https תקינה עוברת', () => {
    const out = sanitizeButtons([{ label: 'לאגף יולדות', url: 'https://chasamsofer.info/maternity' }])
    expect(out).toEqual([{ label: 'לאגף יולדות', url: 'https://chasamsofer.info/maternity' }])
  })

  it('mailto מותר — ההפניה למחלקה היא לרוב כתובת מייל', () => {
    const out = sanitizeButtons([{ label: 'עזר יולדות', url: 'mailto:y@chasamsofer.info' }])
    expect(out).toHaveLength(1)
  })

  // 🔴 javascript: בגוף מייל אינו מסוכן בלקוח מייל רגיל, אבל התצוגה
  // המקדימה מרנדרת את אותו HTML בדפדפן של המנהל — שם הוא כן מסוכן.
  it('javascript: נחסם', () => {
    expect(sanitizeButtons([{ label: 'x', url: 'javascript:alert(1)' }])).toEqual([])
  })

  it('data: נחסם', () => {
    expect(sanitizeButtons([{ label: 'x', url: 'data:text/html,<script>' }])).toEqual([])
  })

  it('http רגיל נחסם — קישור לא מוצפן במייל יוצא', () => {
    expect(sanitizeButtons([{ label: 'x', url: 'http://example.com' }])).toEqual([])
  })

  it('כפתור בלי טקסט או בלי כתובת מושמט', () => {
    const out = sanitizeButtons([
      { label: '', url: 'https://a.com' },
      { label: 'ריק', url: '' },
      { label: 'תקין', url: 'https://b.com' },
    ])
    expect(out).toEqual([{ label: 'תקין', url: 'https://b.com' }])
  })

  it('מספר הכפתורים מוגבל', () => {
    const many = Array.from({ length: MAX_BUTTONS + 5 }, (_, i) => ({ label: `כ${i}`, url: `https://x.com/${i}` }))
    expect(sanitizeButtons(many)).toHaveLength(MAX_BUTTONS)
  })

  it('קלט שאינו מערך אינו מפיל', () => {
    expect(sanitizeButtons(undefined)).toEqual([])
    expect(sanitizeButtons('לא מערך' as unknown as [])).toEqual([])
  })
})

describe('גוף המייל', () => {
  it('טקסט הפונה מנוטרל — אין הזרקת HTML', () => {
    const html = buildAutoReplyBody({ message: '<script>alert(1)</script>', buttons: [] }, '#000')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('טקסט הכפתור מנוטרל', () => {
    const html = buildAutoReplyBody(
      { message: 'שלום', buttons: [{ label: '<img onerror=x>', url: 'https://a.com' }] }, '#000')
    expect(html).not.toContain('<img onerror')
  })

  it('שורות ריקות בטקסט הופכות לפסקאות', () => {
    const html = buildAutoReplyBody({ message: 'שורה א\nשורה ב', buttons: [] }, '#000')
    expect(html).toContain('<br')
  })

  it('הכפתורים מופיעים עם הקישור שלהם', () => {
    const html = buildAutoReplyBody(
      { message: 'פנו לאגף', buttons: [{ label: 'עזר יולדות', url: 'https://x.com/y' }] }, '#ec4899')
    expect(html).toContain('https://x.com/y')
    expect(html).toContain('עזר יולדות')
  })

  it('בלי כפתורים — אין אזור כפתורים ריק', () => {
    const html = buildAutoReplyBody({ message: 'טקסט בלבד', buttons: [] }, '#000')
    expect(html).not.toContain('<a ')
  })
})

describe('סעיפים', () => {
  it('סעיף מלא נשמר', () => {
    const out = sanitizeSections([{ title: 'אגף הוצאה לאור', text: 'גיליון שבועי', buttons: [{ label: 'הצטרפות', url: 'mailto:10@chasamsofer.info' }] }])
    expect(out).toHaveLength(1)
    expect(out[0].title).toBe('אגף הוצאה לאור')
    expect(out[0].buttons).toHaveLength(1)
  })

  it('סעיף בלי קישור נשמר כטקסט — לא כל אגף מסר קישור', () => {
    const out = sanitizeSections([{ title: 'קו ההיכל', text: 'שיעורי תורה', buttons: [] }])
    expect(out).toHaveLength(1)
    expect(out[0].buttons).toEqual([])
  })

  it('סעיף ריק לגמרי מושמט', () => {
    expect(sanitizeSections([{ title: '', text: '', buttons: [] }])).toEqual([])
  })

  it('מספר הסעיפים מוגבל', () => {
    const many = Array.from({ length: MAX_SECTIONS + 3 }, (_, i) => ({ title: `ס${i}`, text: 'x', buttons: [] }))
    expect(sanitizeSections(many)).toHaveLength(MAX_SECTIONS)
  })

  it('קלט שאינו מערך אינו מפיל', () => {
    expect(sanitizeSections(undefined)).toEqual([])
  })

  it('הסעיפים מרונדרים בגוף המייל', () => {
    const html = buildAutoReplyBody({
      message: 'פתיחה', buttons: [],
      sections: [{ title: 'אגף הוצאה לאור', text: 'גיליון שבועי', buttons: [{ label: 'הצטרפות', url: 'mailto:10@chasamsofer.info' }] }],
      footnote: 'לא יינתן מענה כאן',
    }, '#64748b')
    expect(html).toContain('אגף הוצאה לאור')
    expect(html).toContain('גיליון שבועי')
    expect(html).toContain('mailto:10@chasamsofer.info')
    expect(html).toContain('לא יינתן מענה כאן')
  })

  it('כותרת סעיף מנוטרלת', () => {
    const html = buildAutoReplyBody({
      message: '', buttons: [],
      sections: [{ title: '<script>x</script>', text: '', buttons: [] }],
    }, '#000')
    expect(html).not.toContain('<script>')
  })
})

describe('מייל המשרד הראשי', () => {
  const main = defaultAutoReplyMap().main!

  it('מופעל — זו התיבה הכללית', () => {
    expect(main.enabled).toBe(true)
  })

  it('מפנה את פניות האיגוד לכתובת הנכונה', () => {
    const html = buildAutoReplyBody(main, '#64748b')
    expect(html).toContain('igud@chasamsofer.info')
  })

  it('כל האגפים שנמסרו מופיעים', () => {
    const titles = main.sections.map(s => s.title).join(' | ')
    for (const t of ['הוצאה לאור', 'לחידודי', 'בתורתו', 'חלוקת הש"ס', 'עולם הבא', 'קויטל', 'קו ההיכל']) {
      expect(titles, `חסר סעיף: ${t}`).toContain(t)
    }
  })

  it('הערת הסיום קיימת', () => {
    expect(main.footnote).toContain('לא יינתן')
  })
})

describe('מייל איגוד הצאצאים', () => {
  const igud = defaultAutoReplyMap().igud!

  it('מופעל', () => {
    expect(igud.enabled).toBe(true)
  })

  it('מפנה את הפניות הכלליות למשרד', () => {
    expect(buildAutoReplyBody(igud, '#6366f1')).toContain('office@chasamsofer.info')
  })

  it('כל אגפי האיגוד מופיעים', () => {
    const titles = igud.sections.map(s => s.title).join(' | ')
    for (const t of ['איגוד הצאצאים', 'גמ"ח הלוואות', 'עזר יולדות', 'אלמנות ויתומים', 'סיוע רפואי', 'עזר לחגים', 'עזר לשמחות']) {
      expect(titles, `חסר סעיף: ${t}`).toContain(t)
    }
  })

  it('הערת הסיום קיימת', () => {
    expect(igud.footnote).toContain('לא יינתן')
  })
})

describe('נרמול ההגדרות', () => {
  it('כל 11 האגפים מקבלים רשומה', () => {
    const map = normalizeConfig({})
    expect(Object.keys(map).sort()).toEqual(Object.keys(DEPARTMENTS).sort())
  })

  it('אגף לא מוכר בהגדרות השמורות מושמט', () => {
    const map = normalizeConfig({ notADept: { enabled: true, message: 'x' } })
    expect(map).not.toHaveProperty('notADept')
  })

  it('enabled שאינו boolean נקרא ככבוי — ברירת מחדל בטוחה', () => {
    const map = normalizeConfig({ main: { enabled: 'yes', message: 'x' } })
    expect(map.main?.enabled).toBe(false)
  })

  it('מכסה שבועית מחוץ לתחום נחתכת', () => {
    expect(normalizeConfig({ main: { weeklyCap: 0 } }).main?.weeklyCap).toBeGreaterThanOrEqual(1)
    expect(normalizeConfig({ main: { weeklyCap: 9999 } }).main?.weeklyCap).toBeLessThanOrEqual(100)
  })

  it('מכסה חסרה — ברירת מחדל 10, כמו הבולם הקיים', () => {
    expect(normalizeConfig({ main: { enabled: true, message: 'x' } }).main?.weeklyCap).toBe(10)
  })

  // ⚠️ הפורמט הישן של maintenance_reply נשמר תחת אותו רעיון: enabled/message/
  // contactEmail. אסור שהגדרות שהמנהל כבר הזין ייעלמו במעבר.
  it('הפורמט הישן נקרא — נוסח קיים אינו אובד', () => {
    const map = normalizeConfig({ gemach: { enabled: true, message: 'נוסח ישן', contactEmail: 'g@chasamsofer.info' } })
    expect(map.gemach?.enabled).toBe(true)
    expect(map.gemach?.message).toBe('נוסח ישן')
  })
})

describe('ברירות המחדל', () => {
  const defaults = defaultAutoReplyMap()

  it('כל אגף מקבל נושא ונוסח — אף תיבה אינה נולדת ריקה', () => {
    for (const key of Object.keys(DEPARTMENTS)) {
      const d = defaults[key as keyof typeof defaults]
      expect(d?.subject.trim(), `נושא חסר ב-${key}`).toBeTruthy()
      expect(d?.message.trim(), `נוסח חסר ב-${key}`).toBeTruthy()
    }
  })

  // 🔴 המענים שרצו עד היום ב-yerid/inbox8/gemach/igud היו *פעילים* בפרודקשן.
  // אם המעבר משאיר אותם כבויים, פונים שקיבלו מענה מפסיקים לקבל — בשקט.
  it('האגפים שהיה להם מענה פעיל נשארים פעילים', () => {
    for (const key of ['yerid', 'inbox8', 'gemach', 'igud'] as const) {
      expect(defaults[key]?.enabled, `${key} כבוי אחרי המעבר`).toBe(true)
    }
  })

  it('ברירות המחדל שורדות נרמול בלי לאבד תוכן', () => {
    const normalized = normalizeConfig(defaults as unknown as Record<string, unknown>)
    expect(normalized.igud?.message).toBe(defaults.igud?.message)
    expect(normalized.yerid?.enabled).toBe(true)
  })
})
