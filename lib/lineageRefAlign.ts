// ─────────────────────────────────────────────────────────────────────────────
// 🔴 יישור דורות 2–5 של העץ לקובץ המאושר (12.10) — תיקון מהשורש.
//
// הרקע: דורות 2–5 מוגדרים *במלואם* ע"י lineage_approved_ref (233 שורות). בעץ
// עצמו הם נבנו מכמה מקורות, ונוצרו שלושה סוגי סטייה:
//   • צומת מאושר שיושב במקום הלא נכון (ענף פריי/פרידמן "מוסט" דור או שניים);
//   • דור מהקובץ שחסר בעץ — ומשפחות הקלידו אותו ידנית, כל אחת בנוסח שלה;
//   • עותקים ממתינים של אותו אדם, תחת הורים שונים.
// התוצאה: הבורר (שמציג רק את מה שבקובץ) לא הציע את הדור הנכון, המשפחה הקלידה
// ידנית, ושער 5 הדורות עצר את התיקון. (פרידמן 315287292.)
//
// התכנון כאן *טהור* — בלי מסד. מקבל את העץ והקובץ, מחזיר רשימת פעולות
// (הזזה / מיזוג / יצירה / אישור-ושם) ורשימת מקרים שלא הוכרעו. הביצוע נפרד.
//
// 🔴 הכללים (שמרניים במכוון — מיזוג שגוי מוחק אדם מהעץ):
//   1. עוברים על הקובץ מלמעלה למטה. לכל שורה R נקבע הצומת הקנוני תחת הקנוני
//      של ההורה שלה.
//   2. מועמדים: (א) ילדי ההורה הקנוני ששמם תואם ל-R; (ב) "צמתים תועים" —
//      צמתים בעומק 2–5 שאינם תקינים במקומם, ששמם תואם *לשורה אחת בלבד* בקובץ.
//      עומק 6+ לעולם אינו מועמד: שם יכולים להיות נכדים שנקראו על שם סבם.
//   3. הקנוני: מאושר קודם, ואז מי שכבר במקום. השאר ממוזגים לתוכו. שמו = שם הקובץ.
//   4. אין מועמד ⇒ נוצר צומת מאושר מהקובץ.
//   5. צומת בעומק 2–5 שאינו תואם אף שורה, או תואם כמה — לא נוגעים; מדווח.
// ─────────────────────────────────────────────────────────────────────────────
import { normalizeName } from './lineageChainDiff'
import { stripTitles } from './lineageNameFormat'
import { EARLY_DEPTH } from './lineageDeviation'

export interface AlignNode { id: string; name: string; parent_id: string | null; status: string | null }
export interface AlignRef { key: string; name: string; generation: number; parent_key: string | null }

export type AlignOp =
  | { op: 'move'; id: string; to: string; name: string }
  | { op: 'merge'; keep: string; ids: string[]; name: string }
  | { op: 'create'; tempId: string; parent: string; name: string; refKey: string }
  | { op: 'settle'; id: string; name: string; verify: boolean }

export interface AlignIssue { id: string; name: string; depth: number; reason: 'no_ref_match' | 'ambiguous' | 'conflict'; matches?: string[] }

export interface AlignPlan { ops: AlignOp[]; issues: AlignIssue[]; canonical: Record<string, string> }

const exactKey = (s: string) => normalizeName(s)

// ─────────────────────────────────────────────────────────────────────────────
// פירוק שם צומת לבעל / אישה / משפחה — לצורך ההתאמה בלבד.
// ⚠️ כינוי ("בעל "שבט סופר"") ותוכן סוגריים מוסרים *לפני* הנרמול, כי הנרמול
// מוחק את המירכאות ואז הכינוי נראה כחלק מהשם ("ישעיהו בעל שבט סופר").
// ─────────────────────────────────────────────────────────────────────────────
export interface NameParts { husband: string[]; wife: string[]; surname: string; womanOnly: boolean }
export function nameParts(raw: string): NameParts {
  let s = String(raw ?? '').replace(/בעל\s*["״“”][^"״“”]*["״“”]/g, ' ')
  s = normalizeName(s).replace(/\([^)]*\)/g, ' ').replace(/\([^)]*$/, ' ').replace(/\s[-–]\s.*$/, ' ')
  const womanOnly = /^(מרת|הרבנית|הצדקנית)\s/.test(s.trim())
  s = stripTitles(s).replace(/\s+/g, ' ').trim()
  const w = s.split(' ').filter(Boolean)
  if (w.length < 2) return { husband: w, wife: [], surname: '', womanOnly }
  const surname = w[w.length - 1]
  const given = w.slice(0, -1)
  if (womanOnly) return { husband: [], wife: given, surname, womanOnly }
  const at = given.findIndex((x, i) => i > 0 && (x === 'ומרת' || /^ו/.test(x)))
  if (at < 0) return { husband: given, wife: [], surname, womanOnly }
  let wife = given.slice(at)
  if (wife[0] === 'ומרת') wife = wife.slice(1); else wife = [wife[0].replace(/^ו/, ''), ...wife.slice(1)]
  if (wife[0] === 'מרת') wife = wife.slice(1)
  return { husband: given.slice(0, at), wife, surname, womanOnly }
}

// כתיב יידי: "ענגלסראטה"/"ענגאלסראטה", "פרודיגער"/"פרוידיגר" — אותו שם.
const skel = (w: string) => w.replace(/[אויעה]/g, '')
function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}
// ⚠️ שלד בלי אמות-קריאה *וגם* אות ראשונה זהה: בלי האות הראשונה "עקיבא" ו"יעקב"
// הם אותו שלד (ק-ב) — וכך תוכנן לשנות את "רבי עקיבא וזלדה קרויס" ל"רבי יעקב".
const wordEq = (a: string, b: string) => a === b
  || (a[0] === b[0] && skel(a) === skel(b) && skel(a).length >= 2 && Math.abs(a.length - b.length) <= 2)
  || (a.length >= 5 && b.length >= 5 && a[0] === b[0] && lev(a, b) <= 1)
const wordsEq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => wordEq(x, b[i]))
/** שמות אישה מתיישבים: אחד ריק, או האחד מוכל בשני ("רחל" ⊂ "חוה רחל"). */
export function wivesCompatible(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return true
  const [s, l] = a.length <= b.length ? [a, b] : [b, a]
  return s.every(x => l.some(y => wordEq(x, y)))
}

/**
 * אותו אדם?
 * 🔴 שמרני: בעל + משפחה תואמים (כולל כתיב יידי), ושמות האישה אינם סותרים.
 * שתי נשים שונות ⇒ *לא* אותו צומת (ייתכנו נישואים שניים — הכרעת מנהל).
 * אישה בלבד בקובץ ("מרת רויזא גולדשטיין") ⇒ תואם לזוג שבו היא האישה.
 */
export function sameName(a: string, b: string): boolean {
  if (exactKey(a) === exactKey(b)) return true
  const pa = nameParts(a), pb = nameParts(b)
  if (!pa.surname || !pb.surname || !wordEq(pa.surname, pb.surname)) return false
  if (pa.womanOnly !== pb.womanOnly) {
    const [w, c] = pa.womanOnly ? [pa, pb] : [pb, pa]
    return c.wife.length > 0 && wordsEq(w.wife, c.wife)
  }
  if (pa.womanOnly) return wordsEq(pa.wife, pb.wife)
  return pa.husband.length > 0 && wordsEq(pa.husband, pb.husband) && wivesCompatible(pa.wife, pb.wife)
}

export function planRefAlignment(input: AlignNode[], refRows: AlignRef[]): AlignPlan {
  // מודל בזיכרון שמשתנה לפי הפעולות המתוכננות — כל החלטה רואה את מצב העץ
  // *אחרי* הפעולות הקודמות (כמו בביצוע).
  const nodes = new Map(input.map(n => [n.id, { ...n }]))
  const root = input.find(n => !n.parent_id)
  if (!root) return { ops: [], issues: [], canonical: {} }
  const ops: AlignOp[] = []
  const canonical = new Map<string, string>()          // ref key → node id
  const claimed = new Set<string>([root.id])          // צמתים שכבר נקבעו כקנוניים
  const refRoot = refRows.find(r => !r.parent_key)
  if (refRoot) canonical.set(refRoot.key, root.id)

  const childrenOf = (id: string) => [...nodes.values()].filter(n => n.parent_id === id)
  const depthOf = (id: string): number => {
    let d = 0; let cur = nodes.get(id); const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); d++; cur = cur.parent_id ? nodes.get(cur.parent_id) : undefined }
    return d
  }
  const isAncestor = (anc: string, of: string) => {
    let cur = nodes.get(of)?.parent_id ?? null; const seen = new Set<string>()
    while (cur && !seen.has(cur)) { if (cur === anc) return true; seen.add(cur); cur = nodes.get(cur)?.parent_id ?? null }
    return false
  }
  // לכל צומת — שורות הקובץ ששמן תואם (מדויק קודם; אם אין — רופף).
  const refMatches = (name: string): AlignRef[] => {
    const ex = refRows.filter(r => r.parent_key && exactKey(r.name) === exactKey(name))
    if (ex.length) return ex
    return refRows.filter(r => r.parent_key && sameName(r.name, name))
  }

  const byGen = refRows.filter(r => r.parent_key).sort((a, b) => a.generation - b.generation || a.key.localeCompare(b.key))
  let tmp = 0
  // צמתים שלא מוזגו/נוצרו בגלל סתירה — מדווחים כ"conflict" ולא כ"no_ref_match".
  const blocked = new Map<string, string>()
  for (const R of byGen) {
    const parentId = R.parent_key ? canonical.get(R.parent_key) : undefined
    if (!parentId) continue   // ההורה עצמו לא הוכרע — אין על מה לתלות

    // (א) ילדי ההורה הקנוני — כל שם תואם.
    const local = childrenOf(parentId).filter(n => !claimed.has(n.id) && n.status !== 'rejected' && sameName(n.name, R.name))
    // (ב) צמתים תועים: עומק 2–5, לא קנוניים, שמם תואם לשורה הזו *בלבד*.
    const stray = [...nodes.values()].filter(n => {
      if (claimed.has(n.id) || n.status === 'rejected' || n.parent_id === parentId) return false
      // 🔴 רק צומת שתלוי *ישירות* תחת צומת שכבר אומת מול הקובץ. בלי זה נכד
      // שנקרא על שם סבו ("רבי יהודה פרידמן" תחת "רבי צבי ופייגא מלכה") נראה
      // בעומק 5 — כי כל הענף מוסט שני דורות למעלה — והיה ממוזג לתוך סבו.
      // הטסט תפס את זה.
      if (!n.parent_id || !claimed.has(n.parent_id)) return false
      const d = depthOf(n.id)
      if (d < 2 || d > EARLY_DEPTH) return false
      if (!sameName(n.name, R.name)) return false
      const m = refMatches(n.name)
      return m.length === 1 && m[0].key === R.key
    })
      // ⚠️ לא מזיזים אב-קדמון של ההורה הקנוני אל מתחתיו — לולאה.
      .filter(n => n.id !== parentId && !isAncestor(n.id, parentId))

    const cands = [...local, ...stray]
    // 🔴 לפני יצירה: אח עם אותו שם בעל שלא הותאם (אישה סותרת / בלי משפחה) — לא
    // יוצרים לידו עותק נוסף. מדווח, להכרעת מנהל.
    if (!cands.length) {
      const rp = nameParts(R.name)
      const near = childrenOf(parentId).filter(n => !claimed.has(n.id) && rp.husband.length > 0 && wordsEq(nameParts(n.name).husband, rp.husband))
      if (near.length) { for (const n of near) blocked.set(n.id, R.name); continue }
    }
    if (!cands.length) {
      const tempId = `new:${++tmp}`
      nodes.set(tempId, { id: tempId, name: R.name, parent_id: parentId, status: 'verified' })
      ops.push({ op: 'create', tempId, parent: parentId, name: R.name, refKey: R.key })
      canonical.set(R.key, tempId); claimed.add(tempId)
      continue
    }
    const rank = (n: AlignNode) => (n.status === 'verified' ? 0 : 2) + (n.parent_id === parentId ? 0 : 1)
    const keep = cands.slice().sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))[0]
    if (keep.parent_id !== parentId) {
      ops.push({ op: 'move', id: keep.id, to: parentId, name: keep.name })
      nodes.get(keep.id)!.parent_id = parentId
    }
    // 🔴 אישה סותרת לשורד (נישואים שניים / שני אנשים) — לא ממוזג. נשאר כאח,
    // ויופיע בסקירת הכפילויות להכרעת מנהל.
    // ⚠️ הבדיקה מצטברת: מול השורד *וגם* מול כל מי שכבר צורף. "רבי משה שרייבר"
    // (בלי אישה) תואם גם ל"ומרת פריידא" וגם ל"ומרת מלכה" — אבל הן סותרות זו את זו.
    let wife = nameParts(keep.name).wife.length ? nameParts(keep.name).wife : nameParts(R.name).wife
    const others: AlignNode[] = []
    for (const c of cands.filter(c => c.id !== keep.id).sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))) {
      const cw = nameParts(c.name).wife
      if (!wivesCompatible(cw, wife)) { blocked.set(c.id, R.name); continue }
      if (!wife.length && cw.length) wife = cw
      others.push(c)
    }
    // 🔴 השם: של הקובץ, אלא אם בקובץ חסר בן הזוג ואצל אחד המועמדים הוא קיים —
    // אז השם המלא (החלטת המשתמש: "השם המלא עם האשה במידה ויש"). כינויים
    // מהקובץ ("בעל דעת סופר") נשמרים, כי אז לקובץ יש כבר אישה ואין החלפה.
    const rp = nameParts(R.name)
    const complete = (p: NameParts) => p.husband.length > 0 && p.wife.length > 0
    const donor = !complete(rp) ? [keep, ...others].map(c => nameParts(c.name)).filter(complete).sort((x, y) => y.wife.join(' ').length - x.wife.join(' ').length)[0] : undefined
    // הכתיב של הקובץ נשמר; רק בן הזוג החסר נלקח מהעץ. שם עם סוגריים/כינוי
    // בקובץ — נשאר כמו שהוא (הרכבה הייתה מאבדת את הכינוי).
    const plainRef = !/[()"״]/.test(R.name)
    const finalName = donor && rp.surname && plainRef
      ? (rp.womanOnly
        ? `רבי ${donor.husband.join(' ')} ומרת ${rp.wife.join(' ')} ${rp.surname}`
        : `רבי ${rp.husband.join(' ')} ומרת ${donor.wife.join(' ')} ${rp.surname}`)
      : R.name
    if (others.length) {
      ops.push({ op: 'merge', keep: keep.id, ids: others.map(o => o.id), name: finalName })
      for (const o of others) {
        for (const k of childrenOf(o.id)) k.parent_id = keep.id
        nodes.delete(o.id)
      }
    }
    if (keep.name !== finalName || keep.status !== 'verified') {
      ops.push({ op: 'settle', id: keep.id, name: finalName, verify: keep.status !== 'verified' })
      keep.name = finalName; keep.status = 'verified'
      const live = nodes.get(keep.id); if (live) { live.name = finalName; live.status = 'verified' }
    }
    canonical.set(R.key, keep.id); claimed.add(keep.id)
  }

  // מה שנשאר בעומק 2–5 ואינו קנוני — לא נוגעים, מדווחים.
  const issues: AlignIssue[] = []
  for (const n of nodes.values()) {
    if (claimed.has(n.id) || n.status === 'rejected') continue
    const d = depthOf(n.id)
    if (d < 2 || d > EARLY_DEPTH) continue
    const b = blocked.get(n.id)
    if (b) { issues.push({ id: n.id, name: n.name, depth: d, reason: 'conflict', matches: [b] }); continue }
    const m = refMatches(n.name)
    issues.push(m.length > 1
      ? { id: n.id, name: n.name, depth: d, reason: 'ambiguous', matches: m.map(x => `${x.generation}:${x.name}`) }
      : { id: n.id, name: n.name, depth: d, reason: 'no_ref_match' })
  }
  return { ops, issues, canonical: Object.fromEntries(canonical) }
}
