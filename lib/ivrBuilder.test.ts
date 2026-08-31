import { describe, it, expect } from 'vitest'
import {
  validateIvr, ivrIsValid, defaultIvrConfig, normalizeIvr,
  NODE_TYPE_LABEL, NODE_TYPE_HINT,
  type IvrConfig, type IvrNodeDef, type IvrNodeType,
} from './ivrBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מה שנבדק כאן הוא מה שהמתקשר שומע.
//
// מבנה שבור אינו מפיל שום מסך — הוא גורם למתקשר לשמוע שגיאה, להיתקע
// בלולאה, או לשמוע שקט. הוא פשוט מנתק, ואיש אצלנו לא יודע שזה קרה.
// ─────────────────────────────────────────────────────────────────────────────

const node = (o: Partial<IvrNodeDef> & { id: string }): IvrNodeDef => ({
  name: o.id, type: 'message', prompt: { text: 'הודעה' }, ...o,
})

const cfg = (nodes: IvrNodeDef[], rootId = nodes[0]?.id ?? 'root'): IvrConfig =>
  ({ version: 1, rootId, nodes })

const errors = (c: IvrConfig) => validateIvr(c).filter(p => p.level === 'error')
const warns = (c: IvrConfig) => validateIvr(c).filter(p => p.level === 'warn')

describe('ברירת המחדל', () => {
  it('🔴 תקינה — היא מה שרץ בפרודקשן', () => {
    const d = defaultIvrConfig()
    expect(errors(d)).toEqual([])
    expect(ivrIsValid(d)).toBe(true)
  })

  it('מכילה את שלושת השירותים הקיימים', () => {
    const ids = defaultIvrConfig().nodes.map(n => n.id)
    expect(ids).toContain('holiday')
    expect(ids).toContain('maternity')
    expect(ids).toContain('notice')
  })
})

describe('🔴 תפריט שלוכד את המתקשר', () => {
  it('תפריט בלי מקשים — שגיאה', () => {
    // המתקשר שומע "הקישו 1..." ואין מה להקיש. הוא יישאר תקוע.
    const c = cfg([node({ id: 'a', type: 'menu', keys: [] })])
    expect(errors(c).some(e => /בלי מקשים/.test(e.message))).toBe(true)
  })

  it('תפריט בלי הודעה — שגיאה', () => {
    // ⚠️ בלי הודעה המתקשר לא יודע מה להקיש. שקט אינו תפריט.
    const c = cfg([
      node({ id: 'a', type: 'menu', prompt: { text: '' }, keys: [{ digit: '1', target: 'b' }] }),
      node({ id: 'b' }),
    ])
    expect(errors(c).some(e => /בלי הודעה/.test(e.message))).toBe(true)
  })

  it('🔴 מקש שמפנה לשלוחה שאינה קיימת', () => {
    const c = cfg([node({ id: 'a', type: 'menu', keys: [{ digit: '1', target: 'nope' }] })])
    expect(errors(c).some(e => /שאינה קיימת/.test(e.message))).toBe(true)
  })

  it('🔴 אותו מקש פעמיים — רק הראשון יעבוד', () => {
    const c = cfg([
      node({ id: 'a', type: 'menu', keys: [
        { digit: '1', target: 'b' }, { digit: '1', target: 'c' },
      ] }),
      node({ id: 'b' }), node({ id: 'c' }),
    ])
    expect(errors(c).some(e => /פעמיים/.test(e.message))).toBe(true)
  })

  it('מקש לא חוקי', () => {
    const c = cfg([
      node({ id: 'a', type: 'menu', keys: [{ digit: 'X', target: 'b' }] }),
      node({ id: 'b' }),
    ])
    expect(errors(c).some(e => /לא חוקי/.test(e.message))).toBe(true)
  })

  it('⚠️ * ו-# חוקיים', () => {
    const c = cfg([
      node({ id: 'a', type: 'menu', keys: [
        { digit: '*', target: 'b' }, { digit: '#', target: 'b' },
      ] }),
      node({ id: 'b' }),
    ])
    expect(errors(c)).toEqual([])
  })

  it('⚠️ מקש שמחזיר לאותה שלוחה — אזהרה ולא חסימה', () => {
    // לגיטימי ("להשמעה חוזרת הקישו 0") אבל כמעט תמיד טעות.
    const c = cfg([node({ id: 'a', type: 'menu', keys: [{ digit: '0', target: 'a' }] })])
    expect(errors(c)).toEqual([])
    expect(warns(c).some(w => /אותה שלוחה/.test(w.message))).toBe(true)
  })
})

describe('סוגי שלוחה', () => {
  it('הפניה בלי יעד — שגיאה', () => {
    const c = cfg([node({ id: 'a', type: 'transfer' })])
    expect(errors(c).some(e => /שלוחת יעד/.test(e.message))).toBe(true)
  })

  it('חיוג בלי מספר — שגיאה', () => {
    const c = cfg([node({ id: 'a', type: 'dial' })])
    expect(errors(c).some(e => /מספר לחיוג/.test(e.message))).toBe(true)
  })

  it('⚠️ מספר קצר מדי — אזהרה', () => {
    const c = cfg([node({ id: 'a', type: 'dial', phone: '123' })])
    expect(errors(c)).toEqual([])
    expect(warns(c).some(w => /קצר/.test(w.message))).toBe(true)
  })

  it('מספר עם מקפים ורווחים תקין', () => {
    const c = cfg([node({ id: 'a', type: 'dial', phone: '02-123-4567' })])
    expect(errors(c)).toEqual([])
    expect(warns(c).filter(w => /קצר/.test(w.message))).toEqual([])
  })

  it('⚠️ הודעה ריקה — אזהרה, המתקשר ישמע שקט', () => {
    const c = cfg([node({ id: 'a', type: 'message', prompt: { text: '' } })])
    expect(warns(c).some(w => /שקט/.test(w.message))).toBe(true)
  })

  it('קובץ שמע מספיק במקום טקסט', () => {
    const c = cfg([node({ id: 'a', type: 'message', prompt: { text: '', file: '/f/1.wav' } })])
    expect(warns(c).filter(w => /שקט/.test(w.message))).toEqual([])
  })
})

describe('⚠️ שלוחות מנותקות', () => {
  it('שלוחה שאי אפשר להגיע אליה — אזהרה', () => {
    // אינה שוברת דבר, אבל כמעט תמיד סימן למקש שנמחק.
    const c = cfg([
      node({ id: 'root', type: 'menu', keys: [{ digit: '1', target: 'a' }] }),
      node({ id: 'a' }),
      node({ id: 'lost' }),
    ], 'root')
    expect(errors(c)).toEqual([])
    expect(warns(c).some(w => w.nodeId === 'lost')).toBe(true)
  })

  it('שלוחה עמוקה נחשבת נגישה', () => {
    const c = cfg([
      node({ id: 'root', type: 'menu', keys: [{ digit: '1', target: 'a' }] }),
      node({ id: 'a', type: 'menu', keys: [{ digit: '1', target: 'b' }] }),
      node({ id: 'b', type: 'menu', keys: [{ digit: '1', target: 'c' }] }),
      node({ id: 'c' }),
    ], 'root')
    expect(warns(c).filter(w => /להגיע/.test(w.message))).toEqual([])
  })

  it('🔴 מעגל בין תפריטים אינו מקפיא את הבדיקה', () => {
    // בלי מגן ביקור, סריקת הנגישות הייתה נתקעת בלולאה אינסופית.
    const c = cfg([
      node({ id: 'root', type: 'menu', keys: [{ digit: '1', target: 'a' }] }),
      node({ id: 'a', type: 'menu', keys: [{ digit: '1', target: 'root' }] }),
    ], 'root')
    const t0 = Date.now()
    validateIvr(c)
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})

describe('שלוחה כבויה', () => {
  it('אינה נבדקת', () => {
    const c = cfg([
      node({ id: 'root', type: 'menu', keys: [{ digit: '1', target: 'a' }] }),
      node({ id: 'a', type: 'dial', enabled: false }),  // בלי מספר, אבל כבויה
    ], 'root')
    expect(errors(c)).toEqual([])
  })

  it('⚠️ מקש שמפנה אליה — אזהרה', () => {
    const c = cfg([
      node({ id: 'root', type: 'menu', keys: [{ digit: '1', target: 'a' }] }),
      node({ id: 'a', enabled: false }),
    ], 'root')
    expect(warns(c).some(w => /כבויה/.test(w.message))).toBe(true)
  })
})

describe('שלמות בסיסית', () => {
  it('מבנה ריק', () => {
    expect(errors(cfg([])).length).toBeGreaterThan(0)
  })

  it('שלוחת פתיחה שאינה קיימת', () => {
    const c = cfg([node({ id: 'a' })], 'nope')
    expect(errors(c).some(e => /שלוחת הפתיחה/.test(e.message))).toBe(true)
  })

  it('🔴 מזהה כפול', () => {
    const c = cfg([node({ id: 'a' }), node({ id: 'a' })])
    expect(errors(c).some(e => /כפול/.test(e.message))).toBe(true)
  })
})

describe('⚠️ נרמול מבנה שנשמר', () => {
  it('קלט פגום נופל לברירת המחדל', () => {
    // app_settings היא עמודת text; מה שחוזר ממנה עלול להיות כל דבר.
    for (const bad of [null, undefined, 'string', 42, {}, { nodes: [] }]) {
      const n = normalizeIvr(bad)
      expect(ivrIsValid(n)).toBe(true)
      expect(n.nodes.length).toBeGreaterThan(0)
    }
  })

  it('סוג לא מוכר הופך ל-message', () => {
    const n = normalizeIvr({ version: 1, rootId: 'a', nodes: [{ id: 'a', type: 'weird' }] })
    expect(n.nodes[0].type).toBe('message')
  })

  it('שורש שאינו קיים מתוקן לצומת הראשון', () => {
    const n = normalizeIvr({ version: 1, rootId: 'nope', nodes: [{ id: 'a', type: 'message' }] })
    expect(n.rootId).toBe('a')
  })

  it('מקשים פגומים מסוננים', () => {
    const n = normalizeIvr({ version: 1, rootId: 'a', nodes: [
      { id: 'a', type: 'menu', keys: [
        { digit: '1', target: 'b' }, null, { digit: '2' }, { target: 'c' },
      ] },
    ] })
    expect(n.nodes[0].keys).toHaveLength(1)
  })

  it('⚠️ enabled ברירת מחדל true — שלוחה קיימת אינה נכבית בשקט', () => {
    const n = normalizeIvr({ version: 1, rootId: 'a', nodes: [{ id: 'a', type: 'message' }] })
    expect(n.nodes[0].enabled).toBe(true)
  })

  it('מבנה תקין נשמר כמו שהוא', () => {
    const src = defaultIvrConfig()
    const n = normalizeIvr(JSON.parse(JSON.stringify(src)))
    expect(n.rootId).toBe(src.rootId)
    expect(n.nodes.map(x => x.id)).toEqual(src.nodes.map(x => x.id))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ מגבלת 12 מקשים — לא שרירותית.
//
// הפרוטוקול של ימות מקבל את הספרות המותרות כרשימה ("1.2.9"), וזה עובד
// לספרה בודדת. שלוחה דו-ספרתית דורשת הגדרה אחרת בימות שטרם אומתה,
// ובנייה עליה הייתה מסתכנת בשלוחות שלא עונות.
// ─────────────────────────────────────────────────────────────────────────────
describe('⚠️ מגבלת המקשים בתפריט', () => {
  const menuWith = (n: number): IvrConfig => {
    const digits = ['1','2','3','4','5','6','7','8','9','0','*','#','x','y']
    const targets = Array.from({ length: n }, (_, i) => node({ id: `t${i}` }))
    return cfg([
      node({ id: 'root', type: 'menu', prompt: { text: 'תפריט' },
        keys: targets.map((t, i) => ({ digit: digits[i], target: t.id })) }),
      ...targets,
    ], 'root')
  }

  it('12 מקשים — תקין', () => {
    expect(errors(menuWith(12)).filter(e => /מקשים בתפריט אחד/.test(e.message))).toEqual([])
  })

  it('🔴 13 מקשים — שגיאה שמפנה לפתרון', () => {
    // ⚠️ ההודעה אומרת *מה לעשות* (תפריט משנה), לא רק שנכשל.
    const errs = errors(menuWith(13))
    expect(errs.some(e => /תפריט משנה/.test(e.message))).toBe(true)
  })

  it('⚠️ ספרה דו-ספרתית נדחית כמקש לא חוקי', () => {
    const c = cfg([
      node({ id: 'root', type: 'menu', prompt: { text: 'x' }, keys: [{ digit: '10', target: 'a' }] }),
      node({ id: 'a' }),
    ], 'root')
    expect(errors(c).some(e => /לא חוקי/.test(e.message))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 כל סוג שה-runtime מיישם חייב להיות בר-בחירה במסך.
//
// ⚠️ 'input' היה מוגדר במודל, נתמך במלואו ב-lib/ivrRuntime, ופשוט
// נשמט מרשימת הסוגים במסך — כך שאי אפשר היה לבנות שלוחה שקולטת ת"ז,
// בדיוק מה שהשלוחות הקיימות עושות. שום דבר לא נכשל; האפשרות פשוט
// לא הייתה שם.
// ─────────────────────────────────────────────────────────────────────────────
describe('🔴 כיסוי סוגי השלוחות', () => {
  it('לכל סוג יש תווית והסבר', () => {
    const types: IvrNodeType[] =
      ['menu', 'message', 'transfer', 'dial', 'record', 'input', 'hangup']
    for (const t of types) {
      expect(NODE_TYPE_LABEL[t], `חסרה תווית ל-${t}`).toBeTruthy()
      expect(NODE_TYPE_HINT[t], `חסר הסבר ל-${t}`).toBeTruthy()
    }
  })

  it('⚠️ אין סוג עם תווית אך בלי הסבר, ולהפך', () => {
    expect(Object.keys(NODE_TYPE_LABEL).sort()).toEqual(Object.keys(NODE_TYPE_HINT).sort())
  })
})
