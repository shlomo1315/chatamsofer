// ─────────────────────────────────────────────────────────────────────────────
// השוואת שרשרת הדורות שהמשפחה ביקשה מול השרשרת הרשומה במאגר.
//
// 🔴 הבעיה שזה פותר: 145 משפחות שלחו מהאזור האישי את שרשרת הדורות המלאה
// שלהן (8-9 דורות כל אחת), והן נשמרו כ-kind='note' — כלומר טקסט חופשי.
// אישור של note לא עשה *שום דבר* בעץ ("'note' — אין שינוי בעץ"), ולכן
// המנהל היה צריך לפענח מהמלל מה השתנה ולבנות ידנית שרשרת של 8 דורות.
// אף בקשה לא טופלה — הוותיקה המתינה שלושה שבועות.
//
// הפונקציות כאן מפיקות את ההשוואה: איזה דור זהה, מה השתנה, מה נוסף ומה
// הוסר — כדי שהמנהל יראה במבט אחד מה המשפחה מבקשת, ויוכל לאשר בלחיצה.
//
// ⚠️ טהור לחלוטין (בלי Supabase) — כדי שיהיה בר-בדיקה וישמש גם את השרת
// וגם את הממשק בלי לגרור את קליינט המסד לבאנדל.
// ─────────────────────────────────────────────────────────────────────────────

export type Relation = 'son' | 'son_in_law' | null

export interface ChainRow {
  generation: number
  name: string
  relation?: Relation | string | null
}

export type DiffOp = 'same' | 'changed' | 'added' | 'removed'

export interface DiffRow {
  generation: number
  op: DiffOp
  /** השם הרשום אצלנו (null כשמדובר בדור שהמשפחה מוסיפה). */
  current: string | null
  /** השם שהמשפחה מבקשת (null כשמדובר בדור שהמשפחה מסירה). */
  proposed: string | null
  currentRelation: Relation
  proposedRelation: Relation
  /** האם ה*יחס* (בן/חתן) השתנה, גם כשהשם זהה. */
  relationChanged: boolean
}

export interface ChainDiff {
  rows: DiffRow[]
  /** הדור הראשון שבו יש הבדל — נקודת הפיצול. null אם השרשראות זהות. */
  firstDivergence: number | null
  identical: boolean
  counts: { same: number; changed: number; added: number; removed: number }
}

/**
 * נרמול שם לצורך *השוואה בלבד* (לא לתצוגה ולא לשמירה).
 *
 * ⚠️ בלי זה כמעט כל שורה נראית "שונה": השמות מוקלדים בידי אנשים שונים,
 * ו"רבי משה סופר" מול "רבי משה סופר " מול 'רבי משה סופר' (גרש אחר) הם
 * אותו אדם. מנוטרלים: רווחים כפולים, גרשיים/מרכאות מכל הסוגים, וניקוד.
 *
 * ⚠️ מכוון להיות סלחני *בכיוון אחד בלבד* — שני שמות שונים באמת לעולם לא
 * יתמזגו כאן, כי לא נוגעים באותיות עצמן.
 */
export function normalizeName(raw: string | null | undefined): string {
  return String(raw ?? '')
    // ניקוד וטעמים
    .replace(/[֑-ׇ]/g, '')
    // גרש/גרשיים בכל הווריאציות שמופיעות בפועל במאגר
    .replace(/["'`´׳״“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const rel = (r: Relation | string | null | undefined): Relation =>
  r === 'son' || r === 'son_in_law' ? r : null

// ─────────────────────────────────────────────────────────────────────────────
// שם הבעל בלבד, מתוך שם צומת.
//
// 🔴 למה זה נחוץ: 8,315 מתוך 10,505 הצמתים (79%) כתובים בצורת
// "רבי X ומרת Y" — בעל ואישה יחד. משפחה שכותבת "רבי עקיבא ומרת רייזל
// קורניצר" מתכוונת לאותו אדם שרשום אצלנו כ"רבי עקיבא קורניצר", והשוואת
// מחרוזות מלאה הייתה מחמיצה אותו ו*יוצרת כפילות* — בעץ שכבר סובל מכפילויות.
//
// מסירים: תארים בפתיח, סוגריים והערות, והחלק שמתחיל ב"ומרת"/"ואשתו".
//
// ⚠️ זו התאמה עוזרת בלבד ולעולם אינה מספיקה להחלטה אוטומטית — ראו
// matchChild: כשיותר מצומת אחד מתאים, ההכרעה חוזרת למנהל.
// ─────────────────────────────────────────────────────────────────────────────
const TITLE_PREFIX = /^(רבי|הרב|הרה"ג|הרהג|הגאון|רב|מרן|מרת|האדמו"ר|האדמור)\s+/
const WIFE_JOIN = /\s+(ומרת|ואשתו|ורעייתו)\s+(.*)$/

export function husbandName(raw: string | null | undefined): string {
  let s = normalizeName(raw)
  if (!s) return ''
  s = s.replace(/\s*\(.*$/, '')          // סוגריים והלאה — הערות ומקורות
  s = s.replace(/\s*[-–]\s*.*$/, '')     // מקף והסבר אחריו

  // 🔴 שם המשפחה שייך *לשניהם* ויושב בסוף המחרוזת: "רבי עקיבא ומרת רייזל
  // קורניצר". חיתוך גורף מ"ומרת" ואילך היה משאיר "עקיבא" בלבד — וכך
  // "רבי משה ומרת שרה קורניצר" ו"רבי משה ומרת שרה סופר" הופכים לאותו מפתח,
  // כלומר *מיזוג שני אנשים שונים*. לכן שומרים את המילה האחרונה כשם משפחה.
  const m = WIFE_JOIN.exec(s)
  if (m) {
    const wifePart = m[2].trim().split(/\s+/)
    const surname = wifePart.length > 1 ? wifePart[wifePart.length - 1] : ''
    s = s.slice(0, m.index).trim()
    if (surname) s = `${s} ${surname}`
  }

  s = s.replace(TITLE_PREFIX, '')
  return s.trim()
}

/** תוצאת חיפוש צומת בין ילדי אב מסוים. */
export interface ChildMatch<T> {
  node: T | null
  /** exact = שם מלא זהה · husband = התאמה לפי שם הבעל · none/ambiguous */
  how: 'exact' | 'husband' | 'ambiguous' | 'none'
  /** המועמדים, כשההתאמה מעורפלת — להצגה למנהל. */
  candidates: T[]
}

/**
 * איתור צומת בין ילדי אב, לפי שם מבוקש.
 *
 * סדר הניסיונות: התאמה מלאה → התאמה לפי שם הבעל. אם יותר ממועמד אחד
 * מתאים בשלב השני — 'ambiguous', ו*אין* בחירה אוטומטית.
 *
 * 🔴 העדפת "אין החלטה" על ניחוש: בחירה שגויה מצמידה משפחה לענף לא לה,
 * וזו בדיוק הטעות שהמשפחה ביקשה לתקן.
 */
export function matchChild<T extends { name: string }>(
  siblings: T[], wanted: string,
): ChildMatch<T> {
  const target = normalizeName(wanted)
  if (!target) return { node: null, how: 'none', candidates: [] }

  const exact = siblings.filter(n => normalizeName(n.name) === target)
  if (exact.length === 1) return { node: exact[0], how: 'exact', candidates: exact }
  // ⚠️ גם התאמה מלאה יכולה להיות כפולה (כפילות אמיתית בעץ) — אז זו הכרעה
  // של המנהל, לא של הקוד.
  if (exact.length > 1) return { node: null, how: 'ambiguous', candidates: exact }

  const h = husbandName(wanted)
  if (!h) return { node: null, how: 'none', candidates: [] }
  const byHusband = siblings.filter(n => husbandName(n.name) === h)
  if (byHusband.length === 1) return { node: byHusband[0], how: 'husband', candidates: byHusband }
  if (byHusband.length > 1) return { node: null, how: 'ambiguous', candidates: byHusband }

  return { node: null, how: 'none', candidates: [] }
}

/** מסדר שרשרת לפי דור עולה, בלי לשנות את המקור. */
const sorted = (c: ChainRow[]) => [...c].sort((a, b) => a.generation - b.generation)

/**
 * השוואת שתי שרשראות דורות.
 *
 * ההשוואה היא *לפי מיקום הדור* ולא התאמה חכמה: השרשרת היא מסלול מהחתם סופר
 * ומטה, ודור 5 אצלנו מול דור 5 אצלם הם אותה נקודה במסלול. חיפוש התאמות
 * מוזזות (LCS) היה מסתיר בדיוק את מה שחשוב — שהמשפחה טוענת שבדור 5 עומד
 * אדם אחר.
 */
export function diffChains(current: ChainRow[], proposed: ChainRow[]): ChainDiff {
  const cur = sorted(current)
  const pro = sorted(proposed)
  const maxGen = Math.max(
    cur.length ? cur[cur.length - 1].generation : 0,
    pro.length ? pro[pro.length - 1].generation : 0,
  )
  const byGen = (list: ChainRow[]) => {
    const m = new Map<number, ChainRow>()
    for (const r of list) m.set(r.generation, r)
    return m
  }
  const cm = byGen(cur)
  const pm = byGen(pro)

  const rows: DiffRow[] = []
  const counts = { same: 0, changed: 0, added: 0, removed: 0 }
  let firstDivergence: number | null = null

  for (let g = 1; g <= maxGen; g++) {
    const c = cm.get(g)
    const p = pm.get(g)
    if (!c && !p) continue

    const cName = c?.name ?? null
    const pName = p?.name ?? null
    const cRel = rel(c?.relation)
    const pRel = rel(p?.relation)

    let op: DiffOp
    if (c && !p) op = 'removed'
    else if (!c && p) op = 'added'
    else op = normalizeName(cName) === normalizeName(pName) ? 'same' : 'changed'

    // ⚠️ שינוי היחס (בן↔חתן) נחשב הבדל אמיתי גם כששני השמות זהים: הוא
    // משנה את משמעות הייחוס לחלוטין, וזו טעות שמשפחות מתקנות בפועל.
    // ⚠️ אבל *רק* כששני הצדדים הצהירו יחס — יחס חסר אצלנו (null) אינו
    // "שונה", הוא פשוט לא תועד, ולולא זה כל שרשרת ותיקה הייתה נצבעת אדום.
    const relationChanged = op === 'same' && cRel !== null && pRel !== null && cRel !== pRel
    if (relationChanged) op = 'changed'

    counts[op]++
    if (op !== 'same' && firstDivergence === null) firstDivergence = g

    rows.push({
      generation: g, op,
      current: cName, proposed: pName,
      currentRelation: cRel, proposedRelation: pRel,
      relationChanged,
    })
  }

  return {
    rows,
    firstDivergence,
    identical: counts.changed === 0 && counts.added === 0 && counts.removed === 0,
    counts,
  }
}

/**
 * חילוץ השרשרת המבוקשת מתוך ההצעה.
 *
 * ⚠️ עדיפות ל-payload.chain (מובנה) ורק בהיעדרו פענוח מהטקסט: בקשות
 * מהאזור האישי נשמרות עם מערך chain, אבל בקשות ותיקות/ידניות הן טקסט
 * בלבד. פענוח הטקסט מכוון בדיוק לפורמט שהמערכת עצמה מייצרת
 * ("דור 3: רבי עקיבא ומרת רייזל קורניצר (בן)").
 */
export function extractProposedChain(payload: unknown): ChainRow[] {
  const p = payload as { chain?: unknown; text?: unknown } | null
  if (p && Array.isArray(p.chain)) {
    const rows = (p.chain as ChainRow[])
      .filter(r => r && typeof r.name === 'string' && r.name.trim())
      .map(r => ({
        generation: Number(r.generation) || 0,
        name: String(r.name).trim(),
        relation: rel(r.relation),
      }))
      .filter(r => r.generation > 0)
    if (rows.length) return rows
  }
  if (p && typeof p.text === 'string') return parseChainText(p.text)
  return []
}

/** "דור 5: רבי שלמה ומרת חיה שרה שפירא (חתן)" → שורת שרשרת. */
const LINE = /^\s*דור\s+(\d{1,2})\s*[:.]\s*(.+?)\s*$/
const REL_SUFFIX = /\s*\((בן|חתן)\)\s*$/

export function parseChainText(text: string): ChainRow[] {
  const out: ChainRow[] = []
  const seen = new Set<number>()
  for (const line of String(text ?? '').split('\n')) {
    const m = LINE.exec(line)
    if (!m) continue
    const generation = parseInt(m[1], 10)
    // ⚠️ הופעה ראשונה בלבד: בטקסט הבקשה מופיעה לעתים גם "הערת המבקש"
    // שמצטטת דורות, וכפילות הייתה יוצרת שרשרת שבורה.
    if (!Number.isFinite(generation) || seen.has(generation)) continue
    let name = m[2].trim()
    let relation: Relation = null
    const rm = REL_SUFFIX.exec(name)
    if (rm) {
      relation = rm[1] === 'חתן' ? 'son_in_law' : 'son'
      name = name.replace(REL_SUFFIX, '').trim()
    }
    if (!name) continue
    seen.add(generation)
    out.push({ generation, name, relation })
  }
  return out.sort((a, b) => a.generation - b.generation)
}

/** ההערה החופשית שהמבקש הוסיף, אם יש. משמשת לתצוגה בכרטיס הבקשה. */
export function extractRequesterNote(payload: unknown): string | null {
  const p = payload as { text?: unknown } | null
  const text = typeof p?.text === 'string' ? p.text : ''
  const i = text.indexOf('הערת המבקש:')
  if (i < 0) return null
  const note = text.slice(i + 'הערת המבקש:'.length).trim()
  return note || null
}

/** שם המבקש מתוך כותרת הבקשה ("בקשת תיקון סדר הדורות מהאזור האישי — X:"). */
export function extractRequesterName(payload: unknown): string | null {
  const p = payload as { text?: unknown } | null
  const text = typeof p?.text === 'string' ? p.text : ''
  const m = /—\s*(.+?)\s*:/.exec(text.split('\n')[0] ?? '')
  return m ? m[1].trim() : null
}
