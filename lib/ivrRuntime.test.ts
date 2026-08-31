import { describe, it, expect } from 'vitest'
import { ivrStep, nextNodeId, audioToken, ttsClean } from './ivrRuntime'
import { defaultIvrConfig, type IvrConfig, type IvrNodeDef } from './ivrBuilder'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מה שנבדק כאן הוא מה שהמתקשר *שומע*.
//
// זו הנקודה היחידה שבה אפשר לראות את זה: אחרי שהמתקשר ניתק, אין שום
// לוג שמספר שהוא שמע שקט, נתקע בלולאה, או קיבל הודעה של שלוחה אחרת.
// ─────────────────────────────────────────────────────────────────────────────

const node = (o: Partial<IvrNodeDef> & { id: string }): IvrNodeDef => ({
  name: o.id, type: 'message', prompt: { text: 'הודעה' }, ...o,
})

const cfg = (nodes: IvrNodeDef[], rootId = nodes[0]?.id ?? 'root'): IvrConfig =>
  ({ version: 1, rootId, nodes })

/** התשובה כפי שהיא נשלחת לימות. */
const reply = (c: IvrConfig, nodeId = '', digit = '') =>
  ivrStep(c, nodeId, digit).commands.join('&')

describe('ניקוי טקסט ל-TTS', () => {
  it('🔴 מסיר תווים שימות אינה סובלת', () => {
    // ⚠️ נקודה/מקף/גרשיים שוברים את הפרוטוקול עצמו — הם מפרידים אסימונים.
    for (const ch of ['.', '-', '"', "'", '&', '|', '׳', '״']) {
      expect(ttsClean(`שלום${ch}עולם`)).not.toContain(ch)
    }
  })

  it('רווחים כפולים מתמזגים', () => {
    expect(ttsClean('שלום   עולם')).toBe('שלום עולם')
  })

  it('⚠️ קובץ גובר על טקסט', () => {
    expect(audioToken({ text: 'טקסט', file: 'greeting' })).toBe('f-greeting')
    expect(audioToken({ text: 'טקסט' })).toBe('t-טקסט')
    expect(audioToken({ text: '' })).toBe('')
    expect(audioToken(null)).toBe('')
  })
})

describe('תחילת שיחה', () => {
  it('🔴 המתקשר שומע את תפריט הפתיחה', () => {
    const out = reply(defaultIvrConfig())
    expect(out).toContain('read=')
    expect(out).toContain('ברוכים הבאים')
  })

  it('🔴 התפריט מקבל בדיוק את המקשים שהוגדרו', () => {
    // ⚠️ ימות מקבלת רק את הספרות ברשימה; מקש שאינו שם נחשב שגוי.
    const out = reply(defaultIvrConfig())
    expect(out).toMatch(/1\.2\.9/)
  })
})

describe('🔴 ניווט בתפריט', () => {
  const c = cfg([
    node({ id: 'root', type: 'menu', prompt: { text: 'הקישו 1 או 2' }, keys: [
      { digit: '1', target: 'sub' },
      { digit: '2', target: 'bye' },
    ] }),
    node({ id: 'sub', type: 'menu', prompt: { text: 'תפריט משנה' }, keys: [
      { digit: '1', target: 'msg' },
    ] }),
    node({ id: 'msg', type: 'message', prompt: { text: 'ההודעה' } }),
    node({ id: 'bye', type: 'hangup', prompt: { text: 'להתראות' } }),
  ], 'root')

  it('הקשה מובילה לשלוחת היעד', () => {
    expect(reply(c, 'root', '1')).toContain('תפריט משנה')
  })

  it('🔴 המיקום נשמר — הקשה בתפריט משנה אינה חוזרת לראשי', () => {
    // ⚠️ ימות אינה שומרת מצב; בלי המיקום כל הקשה הייתה מתחילה מחדש.
    expect(nextNodeId(c, 'root', '1')).toBe('sub')
    expect(reply(c, 'sub', '1')).toContain('ההודעה')
  })

  it('🔴 הקשה שגויה — נשמעת אזהרה והתפריט חוזר', () => {
    const out = reply(c, 'root', '7')
    expect(out).toContain('שגויה')
    expect(out).toContain('הקישו 1 או 2')
    expect(out).toContain('read=')       // ממתין להקשה חדשה
  })

  it('⚠️ הקשה שגויה משאירה את המתקשר באותו תפריט', () => {
    expect(nextNodeId(c, 'root', '7')).toBe('root')
  })

  it('ניתוק מנתק', () => {
    const out = reply(c, 'root', '2')
    expect(out).toContain('להתראות')
    expect(out).toContain('go_to_folder=hangup')
  })
})

describe('🔴 הודעה חוזרת לתפריט ואינה מנתקת', () => {
  it('מי שבירר הודעה עדיין רוצה להירשם', () => {
    const c = cfg([
      node({ id: 'root', type: 'menu', prompt: { text: 'תפריט' }, keys: [{ digit: '9', target: 'n' }] }),
      node({ id: 'n', type: 'message', prompt: { text: 'אין הודעות' } }),
    ], 'root')
    const out = reply(c, 'root', '9')
    expect(out).toContain('אין הודעות')
    expect(out).toContain('read=')                  // התפריט חוזר
    expect(out).not.toContain('hangup')
    expect(nextNodeId(c, 'root', '9')).toBe('root')
  })

  it('⚠️ הודעה שהיא עצמה השורש — מנתקת ולא חוזרת לעצמה', () => {
    // אחרת המתקשר שומע את אותה הודעה בלולאה עד שינתק.
    const c = cfg([node({ id: 'only', type: 'message', prompt: { text: 'שלום' } })], 'only')
    expect(reply(c)).toContain('hangup')
  })
})

describe('סוגי שלוחה', () => {
  it('מעבר לשלוחה בימות', () => {
    const c = cfg([node({ id: 'a', type: 'transfer', folder: '/2', prompt: { text: '' } })], 'a')
    expect(reply(c)).toBe('go_to_folder=/2')
  })

  it('⚠️ מעבר בלי יעד מנתק ולא משאיר תקוע', () => {
    const c = cfg([node({ id: 'a', type: 'transfer', prompt: { text: '' } })], 'a')
    expect(reply(c)).toContain('hangup')
  })

  it('חיוג — routing_yemot ולא go_to_folder', () => {
    // 🔴 go_to_folder עם מספר טלפון נכשל בשקט.
    const c = cfg([node({ id: 'a', type: 'dial', phone: '02-123-4567', prompt: { text: 'מעבירים' } })], 'a')
    const out = reply(c)
    expect(out).toContain('routing_yemot=021234567')
    expect(out).toContain('מעבירים')
  })

  it('הקלטה מהמתקשר', () => {
    const c = cfg([node({ id: 'a', type: 'record', prompt: { text: 'השאירו הודעה' } })], 'a')
    expect(reply(c)).toContain('record=')
  })

  it('⚠️ הקלטה בלי טקסט מקבלת נוסח ברירת מחדל', () => {
    // שקט לפני צפצוף נשמע כתקלה.
    const c = cfg([node({ id: 'a', type: 'record', prompt: { text: '' } })], 'a')
    expect(reply(c)).toContain('הודעה')
  })
})

describe('⚠️ שלוחה כבויה', () => {
  const c = cfg([
    node({ id: 'root', type: 'menu', prompt: { text: 'תפריט' }, keys: [{ digit: '1', target: 'off' }] }),
    node({ id: 'off', type: 'message', prompt: { text: 'סודי' }, enabled: false }),
  ], 'root')

  it('🔴 הקשה אליה נחשבת שגויה ולא משמיעה שקט', () => {
    const out = reply(c, 'root', '1')
    expect(out).not.toContain('סודי')
    expect(out).toContain('שגויה')
  })
})

describe('⚠️ מצבי קצה שלא מפילים שיחה', () => {
  it('מזהה שלוחה שאינו קיים — חוזרים לשורש', () => {
    // קורה כשהמבנה השתנה באמצע שיחה. המתקשר לא עשה דבר רע.
    const c = defaultIvrConfig()
    expect(reply(c, 'nonexistent', '1')).toContain('read=')
    expect(nextNodeId(c, 'nonexistent', '1')).toBe(c.rootId)
  })

  it('הקשה על שלוחה שאינה תפריט', () => {
    const c = cfg([node({ id: 'a', type: 'message', prompt: { text: 'שלום' } })], 'a')
    expect(() => reply(c, 'a', '5')).not.toThrow()
  })

  it('🔴 התשובה לעולם אינה ריקה', () => {
    // ⚠️ תשובה ריקה = ימות מנתקת בלי שהמתקשר שמע דבר.
    const cases: IvrConfig[] = [
      defaultIvrConfig(),
      cfg([node({ id: 'a', type: 'menu', prompt: { text: 'x' }, keys: [] })], 'a'),
      cfg([node({ id: 'a', type: 'hangup', prompt: { text: '' } })], 'a'),
    ]
    for (const c of cases) {
      expect(reply(c).length).toBeGreaterThan(0)
      expect(reply(c, c.rootId, '5').length).toBeGreaterThan(0)
    }
  })

  // ── קליטת מספר מהמתקשר ──
  //
  // 🔴 השלב שהיה חסר לבניית שלוחה מלאה: בלעדיו אי אפשר לבנות מסלול
  // שמבקש ת"ז. כל שלוחה שדורשת נתון הייתה חייבת קוד ייעודי.
  it('🔴 קליטת מספר — read עם משתנה ייעודי', () => {
    const c = cfg([node({ id: 'a', type: 'input', prompt: { text: 'הקישו תעודת זהות' } })], 'a')
    const out = reply(c)
    expect(out).toContain('read=')
    expect(out).toContain('ivrInput')
  })

  it('⚠️ אורך ההקשה נגזר מההגדרה ולא קבוע', () => {
    const c = cfg([node({ id: 'a', type: 'input', prompt: { text: 'x' }, maxDigits: 9 })], 'a')
    expect(reply(c)).toContain(',9,')
  })

  it('טקסט עם תווים אסורים אינו שובר את הפרוטוקול', () => {
    const c = cfg([node({ id: 'a', type: 'message', prompt: { text: 'שלום. "עולם" & עוד' } })], 'a')
    const out = reply(c)
    // ⚠️ & הוא מפריד הפקודות — נוכחותו בטקסט הייתה יוצרת פקודה מזויפת.
    const cmdCount = out.split('&').length
    expect(cmdCount).toBeLessThanOrEqual(3)
  })
})
