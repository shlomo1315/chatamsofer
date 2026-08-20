import { describe, it, expect } from 'vitest'
import {
  sanitizeButtons, sanitizeSections, normalizeConfig, buildAutoReplyBody, requestMailtoUrl,
  defaultAutoReplyMap, activeReplyContent, MAX_BUTTONS, MAX_SECTIONS,
  type AutoReplySettings,
} from './autoReplyConfig'
import { DEPARTMENTS } from './departments'

// ─────────────────────────────────────────────────────────────────────────────
// המענה האוטומטי הוא הדבר היחיד שפונה מקבל מתיבה שאיש אינו קורא בה.
// אם הוא נשבר — הפנייה נעלמת בשקט. הבדיקות כאן מקבעות את מה שאסור שיישבר.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הודעת "אין להשיב" — נשמטה לגמרי בנרמול.
//
// normalizeConfig בנה אובייקט חדש עם message/buttons/sections/footnote ולא
// כלל את noReplyNotice. השדה נשלח מהדפדפן, הגיע לשרת, ונזרק בשקט: המנהל
// הקליד, שמר, וקיבל חזרה את ברירת המחדל.
//
// ⚠️ מחרוזת ריקה חייבת להישמר כמחרוזת ריקה ולא להיעלם: ב-renderAutoReply
// ריק פירושו "ברירת המחדל", אבל הבחנה זו נעשית שם — הנרמול רק מעביר.
// ─────────────────────────────────────────────────────────────────────────────
describe('הודעת "אין להשיב" — שמירה', () => {
  it('נוסח מותאם נשמר בנרמול', () => {
    const out = normalizeConfig({
      main: { enabled: true, noReplyNotice: 'נא לא להשיב\nהתיבה אינה מנוטרת' },
    })
    expect(out.main!.noReplyNotice).toBe('נא לא להשיב\nהתיבה אינה מנוטרת')
  })

  it('מחרוזת ריקה נשמרת כפי שהיא', () => {
    const out = normalizeConfig({ main: { enabled: true, noReplyNotice: '' } })
    expect(out.main!.noReplyNotice).toBe('')
  })

  it('כל תיבה שומרת נוסח משלה', () => {
    const out = normalizeConfig({
      main: { enabled: true, noReplyNotice: 'נוסח אופיס' },
      igud: { enabled: true, noReplyNotice: 'נוסח איגוד' },
    })
    expect(out.main!.noReplyNotice).toBe('נוסח אופיס')
    expect(out.igud!.noReplyNotice).toBe('נוסח איגוד')
  })

  // ⚠️ אותו באג בדיוק בשדה הכותרת — נמצא בסריקה אחרי noReplyNotice.
  it('כותרת ראשית מותאמת נשמרת בנרמול', () => {
    const out = normalizeConfig({ main: { enabled: true, title: 'ברוכים הבאים לאיגוד' } })
    expect(out.main!.title).toBe('ברוכים הבאים לאיגוד')
  })

  it('כותרת ריקה נשמרת כפי שהיא', () => {
    const out = normalizeConfig({ main: { enabled: true, title: '' } })
    expect(out.main!.title).toBe('')
  })

  it('שדה חסר אינו מפיל את הנרמול', () => {
    const out = normalizeConfig({ main: { enabled: true } })
    expect(out.main).toBeDefined()
  })
})

describe('כפתורים — ניקוי קישורים', () => {
  it('כתובת https תקינה עוברת', () => {
    const out = sanitizeButtons([{ label: 'לאגף יולדות', url: 'https://chasamsofer.info/maternity' }])
    expect(out).toEqual([{ label: 'לאגף יולדות', url: 'https://chasamsofer.info/maternity' }])
  })

  it('mailto מותר — ההפניה למחלקה היא לרוב כתובת מייל', () => {
    const out = sanitizeButtons([{ label: 'עזר יולדות', url: 'mailto:y@chasamsofer.info' }])
    expect(out).toHaveLength(1)
  })

  // ── 🔴 mailto: נשמר כפי שהוא ואינו מומר ל-Gmail ──
  //
  // הניקוי המיר בעבר כל mailto: לקישור https של Gmail. זה נראה כמו שיפור,
  // אבל Gmail עוטף כל https בגוף הודעה ב-google.com/url?q= — והעטיפה
  // שוברת את הטיוטה. mailto: עצמו אינו נעטף, ולכן הוא חייב לשרוד את
  // השמירה בדיוק כפי שהוקלד.
  //
  // ⚠️ ההמרה גם גרמה לכך שמנהל שהקליד mailto: ראה במסך משהו אחר לגמרי,
  // ונראה היה שההגדרות אינן נשמרות.
  it('mailto נשמר כפי שהוא — ללא המרה ל-Gmail', () => {
    const out = sanitizeButtons([{ label: 'הגשה', url: 'mailto:8@chasamsofer.info' }])
    expect(out).toEqual([{ label: 'הגשה', url: 'mailto:8@chasamsofer.info' }])
  })

  it('mailto עם נושא וגוף נשמר על כל פרמטריו', () => {
    const url = 'mailto:igud@chasamsofer.info?subject=%D7%9C%D7%99%D7%93%D7%94&body=%D7%A9%D7%9D'
    const out = sanitizeButtons([{ label: 'בקשת לידה', url }])
    expect(out).toEqual([{ label: 'בקשת לידה', url }])
  })

  it('אף כתובת שנשמרת אינה מצביעה ל-mail.google.com', () => {
    const out = sanitizeButtons([{ label: 'הגשה', url: 'mailto:office@chasamsofer.info' }])
    expect(out[0].url).not.toContain('mail.google.com')
  })

  // ── 🔴 חיתוך אורך לא ייצור קידוד פגום ──
  //
  // MAX_URL_LEN גזם באמצע רצף %D7%90 של עברית, והתוצאה הייתה קישור
  // שנגמר ב-'%D7' — טיוטה שנפתחת עם ג'יבריש או לא נפתחת כלל. עברית
  // תופחת פי 5.5 בקידוד URL, ולכן נושא עברי קצר חוצה את התקרה בקלות.
  //
  // הכלל: קישור ארוך מדי נדחה במלואו ולא נשמר חתוך. חצי קישור גרוע
  // מכפתור חסר — הפונה לוחץ ונוחת על שגיאה.
  // ⚠️ הקישור האמיתי של טופס ההלוואה (~2,900 תווים) חייב לעבור: תקרה
  // שנמוכה ממנו מוחקת את הכפתור מהמסך אחרי שמירה.
  it('קישור הגשה אמיתי באורך מלא נשמר ואינו נמחק', () => {
    const real = 'mailto:g@chasamsofer.info?subject=' + '%D7%90'.repeat(80) + '&body=' + '%D7%91'.repeat(400)
    const out = sanitizeButtons([{ label: 'בקשת הלוואה', url: real }])
    expect(out).toHaveLength(1)
    expect(out[0].url).toBe(real)
  })

  it('קישור ארוך מדי נדחה ואינו נשמר חתוך', () => {
    const long = 'mailto:y@chasamsofer.info?subject=' + '%D7%90'.repeat(2500)
    const out = sanitizeButtons([{ label: 'בקשה', url: long }])
    expect(out).toEqual([])
  })

  it('קישור שנשמר לעולם אינו נגמר בקידוד חלקי', () => {
    const long = 'mailto:y@chasamsofer.info?subject=' + '%D7%90'.repeat(2500)
    for (const out of [sanitizeButtons([{ label: 'א', url: long }])]) {
      for (const b of out) expect(b.url).not.toMatch(/%[0-9A-Fa-f]?$/)
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// הודעה זמנית — נוסח קצר שיוצא בזמן שהמענה הראשי עדיין נבנה.
//
// 🔴 הסיכון המרכזי כאן הוא *שקט*: תיבה שהמנהל חושב שהיא עונה ואינה עונה,
// או נוסח שנשלח בפועל ואינו זה שהוצג לו במסך.
// ─────────────────────────────────────────────────────────────────────────────
describe('בחירת הנוסח הפעיל', () => {
  const base = (over: Partial<AutoReplySettings> = {}): AutoReplySettings => ({
    enabled: true, mode: 'full',
    tempSubject: 'נושא זמני', tempMessage: 'טקסט זמני',
    subject: 'נושא ראשי', message: 'טקסט ראשי',
    buttons: [{ label: 'כפתור', url: 'https://x.co' }],
    sections: [{ title: 'סעיף', text: 'תיאור', buttons: [] }],
    footnote: 'הערה', weeklyCap: 10, ...over,
  })

  it('מצב מלא — יוצא הנוסח הראשי על כל חלקיו', () => {
    const a = activeReplyContent(base({ mode: 'full' }))
    expect(a.subject).toBe('נושא ראשי')
    expect(a.message).toBe('טקסט ראשי')
    expect(a.sections).toHaveLength(1)
    expect(a.isTemp).toBe(false)
  })

  it('מצב זמני — יוצא הנוסח הזמני', () => {
    const a = activeReplyContent(base({ mode: 'temp' }))
    expect(a.subject).toBe('נושא זמני')
    expect(a.message).toBe('טקסט זמני')
    expect(a.isTemp).toBe(true)
  })

  // 🔴 זו כל התכלית: אפשר להדליק זמני בזמן שהראשי עדיין ריק לגמרי.
  it('זמני פעיל גם כשהמענה הראשי עדיין לא נכתב', () => {
    const a = activeReplyContent(base({ mode: 'temp', message: '', subject: '', sections: [] }))
    expect(a.message).toBe('טקסט זמני')
    expect(a.isTemp).toBe(true)
  })

  // ⚠️ ההודעה הזמנית היא "קיבלנו, נחזור אליכם" — כל המידע המפורט שייך לראשי.
  it('הזמני אינו גורר סעיפים, כפתורים והערת סיום מהראשי', () => {
    const a = activeReplyContent(base({ mode: 'temp' }))
    expect(a.buttons).toEqual([])
    expect(a.sections).toEqual([])
    expect(a.footnote).toBe('')
  })

  it('זמני בלי נושא משלו — נופל לנושא הראשי ולא נשלח בלי נושא', () => {
    const a = activeReplyContent(base({ mode: 'temp', tempSubject: '  ' }))
    expect(a.subject).toBe('נושא ראשי')
  })

  // 🔴 מצב חצי-גמור: 'זמני' בלי טקסט. מייל ריק גרוע מהנוסח המלא.
  it('זמני ריק נופל לנוסח המלא ולא שולח מייל ריק', () => {
    const a = activeReplyContent(base({ mode: 'temp', tempMessage: '   ' }))
    expect(a.message).toBe('טקסט ראשי')
    expect(a.isTemp).toBe(false)
  })

  it('שני הנוסחים נשמרים במקביל — מעבר בין מצבים אינו מוחק', () => {
    const s = base({ mode: 'temp' })
    expect(activeReplyContent(s).message).toBe('טקסט זמני')
    expect(activeReplyContent({ ...s, mode: 'full' }).message).toBe('טקסט ראשי')
  })
})

describe('נרמול המצבים', () => {
  // 🔴 ההגדרות בפרודקשן נשמרו לפני שהמצבים נוספו ואינן מכילות `mode`.
  // ברירת מחדל שאינה 'full' הייתה משנה בשקט את המייל שפונים מקבלים.
  it('הגדרות ישנות בלי mode נקראות כמענה ראשי', () => {
    const map = normalizeConfig({ gemach: { enabled: true, message: 'נוסח קיים' } })
    expect(map.gemach?.mode).toBe('full')
    expect(activeReplyContent(map.gemach!).message).toBe('נוסח קיים')
  })

  it('mode לא מוכר נופל למענה ראשי', () => {
    expect(normalizeConfig({ main: { mode: 'bogus' } }).main?.mode).toBe('full')
  })

  it('mode תקין נשמר', () => {
    expect(normalizeConfig({ main: { mode: 'temp' } }).main?.mode).toBe('temp')
    expect(normalizeConfig({ main: { mode: 'off' } }).main?.mode).toBe('off')
  })

  // ⚠️ מנהל שמחק את ההודעה הזמנית התכוון לכך — שחזור שקט היה מחזיר
  // לאוויר נוסח שהוא בכוונה הסיר.
  it('הודעה זמנית שנמחקה במפורש אינה משוחזרת', () => {
    expect(normalizeConfig({ main: { tempMessage: '' } }).main?.tempMessage).toBe('')
  })

  it('הודעה זמנית חסרה לגמרי נופלת לברירת המחדל', () => {
    expect(normalizeConfig({ main: { enabled: true } }).main?.tempMessage.trim()).toBeTruthy()
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

  // ⚠️ כולל את שש התיבות שהוגדרו ידנית (main/yerid/inbox8/gemach/maternity/
  // igud): הן דורסות את מה שהלולאה בנתה, ובלי פריסת הבסיס הן היו נולדות
  // בלי הודעה זמנית כלל.
  it('כל אגף נולד עם הודעה זמנית מוכנה ובמצב מענה ראשי', () => {
    for (const key of Object.keys(DEPARTMENTS)) {
      const d = defaults[key as keyof typeof defaults]
      expect(d?.mode, `mode חסר ב-${key}`).toBe('full')
      expect(d?.tempSubject.trim(), `נושא זמני חסר ב-${key}`).toBeTruthy()
      expect(d?.tempMessage.trim(), `הודעה זמנית חסרה ב-${key}`).toBeTruthy()
    }
  })

  it('ברירות המחדל שורדות נרמול בלי לאבד תוכן', () => {
    const normalized = normalizeConfig(defaults as unknown as Record<string, unknown>)
    expect(normalized.igud?.message).toBe(defaults.igud?.message)
    expect(normalized.yerid?.enabled).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כפתור ההגשה חייב להיות קישור Gmail ולא mailto:
//
// Gmail חוסם mailto: שנלחץ מתוך גוף הודעה — התוצאה היא דף לבן, וכל הקהל
// שלנו קורא בתוך Gmail. תוקן פעם אחת ידנית ב-CMS, אבל המחולל המשיך לייצר
// mailto: והבאג חזר. הטסט נועל את המקור.
// ─────────────────────────────────────────────────────────────────────────────
describe('requestMailtoUrl — קישור Gmail, לא mailto', () => {
  it('הגשה לתיבת אגף אינה מייצרת mailto:', () => {
    const url = requestMailtoUrl('בקשת הלוואה', 'g@chasamsofer.info')
    expect(url.startsWith('mailto:')).toBe(false)
    expect(url).toContain('mail.google.com/mail/')
    expect(url).toContain('view=cm')
  })

  it('נפילה-לאחור לאיגוד אף היא אינה mailto:', () => {
    const url = requestMailtoUrl('בקשת הלוואה')
    expect(url.startsWith('mailto:')).toBe(false)
    expect(url).toContain('mail.google.com/mail/')
  })

  it('הנמען, הנושא והגוף נשמרים בקישור', () => {
    const url = requestMailtoUrl('בקשת הלוואה', 'g@chasamsofer.info')
    const q = new URL(url).searchParams
    expect(q.get('to')).toBe('g@chasamsofer.info')
    // 🔴 הנושא ריק במכוון — מציין-מקום בסוגריים נשלח כפי שהוא אצל מי
    // שלא מחק אותו, והבקשה לא נקלטה בעוד המייל כן נשלח.
    expect(q.get('su')).toBeNull()
    expect(q.get('body')).toContain('תעודת זהות')
  })
})
