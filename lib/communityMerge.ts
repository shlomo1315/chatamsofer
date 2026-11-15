// איחוד ומיזוג שמות קהילות בדוח הנדיב.
// המיפוי נשמר בנפרד (donor_community_merges) ולא משנה את נתוני היולדות.
export const UNKNOWN_COMMUNITY = 'לא צוין'

/** מפתח השוואה: בלי רווחים כפולים, גרשיים, מקפים ופיסוק. */
export function normalizeCommunity(name: string): string {
  return String(name ?? '')
    .replace(/["'`׳״’‘”“\-–־.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** מפתח "גזע": בלי סיומות ריבוי (ים/ות) ובלי אותיות סופיות, להצעת מיזוג קרוב. */
function stem(key: string): string {
  return key.split(' ').map(w => {
    let s = w
    if (s.length > 3 && /(ים|ות)$/.test(s)) s = s.slice(0, -2)
    return s.replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ך/g, 'כ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ')
  }).join(' ')
}

function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  const [s, l] = a.length < b.length ? [a, b] : [b, a]
  return s.slice(i) === l.slice(i + 1)
}

export interface CommunityCount { name: string; count: number }
export interface CommunityGroup { names: CommunityCount[]; total: number }

/** מאחד שמות זהים (אחרי ניקוי) לפריט אחד: שם התצוגה הוא הצורה השכיחה ביותר. */
export function unifyIdentical(items: CommunityCount[]): CommunityCount[] {
  const byKey = new Map<string, { best: CommunityCount; count: number }>()
  for (const it of items) {
    const key = normalizeCommunity(it.name)
    if (!key) continue
    const cur = byKey.get(key)
    if (!cur) byKey.set(key, { best: { ...it }, count: it.count })
    else { cur.count += it.count; if (it.count > cur.best.count) cur.best = { ...it } }
  }
  return [...byKey.values()].map(v => ({ name: normalizeCommunity(v.best.name), count: v.count }))
}

/** מציע קבוצות של שמות דומים (ריבוי, שוני של אות אחת) שעדיין לא אוחדו. */
export function suggestGroups(items: CommunityCount[]): CommunityGroup[] {
  const list = unifyIdentical(items).filter(i => i.name !== UNKNOWN_COMMUNITY)
  const parent = list.map((_, i) => i)
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])))
  const stems = list.map(i => stem(i.name))
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const near = stems[i] === stems[j] || (stems[i].length >= 4 && stems[j].length >= 4 && withinOneEdit(stems[i], stems[j]))
      if (near) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, CommunityCount[]>()
  list.forEach((it, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), it]) })
  return [...groups.values()]
    .filter(g => g.length > 1)
    .map(g => ({ names: g.sort((a, b) => b.count - a.count), total: g.reduce((s, x) => s + x.count, 0) }))
    .sort((a, b) => b.total - a.total)
}

/** מפתח מנורמל → שם מאוחד. */
export type CommunityMap = Record<string, string>

/** מחיל איחוד אוטומטי של זהים ואת המיפוי הידני על שם קהילה בודד, לפי ספירת הצורות. */
export function buildResolver(rawNames: string[], map: CommunityMap): (raw: string) => string {
  const counts = new Map<string, Map<string, number>>()
  for (const n of rawNames) {
    const key = normalizeCommunity(n)
    const forms = counts.get(key) ?? new Map<string, number>()
    forms.set(n, (forms.get(n) ?? 0) + 1)
    counts.set(key, forms)
  }
  const display = new Map<string, string>()
  for (const [key, forms] of counts) {
    display.set(key, [...forms.entries()].sort((a, b) => b[1] - a[1])[0][0].trim() || key)
  }
  return raw => {
    const key = normalizeCommunity(raw)
    if (!key) return raw
    return map[key] ?? display.get(key) ?? raw
  }
}

/** מחשב את המיפוי החדש אחרי מיזוג: כל חברי הקבוצה, וגם מי שכבר מאוחד לאחד מהם, מצביעים ליעד. */
export function mergeInto(map: CommunityMap, members: string[], target: string): CommunityMap {
  const targetName = target.trim()
  const memberKeys = new Set(members.map(normalizeCommunity).filter(Boolean))
  memberKeys.add(normalizeCommunity(targetName))
  const memberNames = new Set(members.map(m => m.trim()))
  const next: CommunityMap = {}
  for (const [k, v] of Object.entries(map)) {
    next[k] = memberNames.has(v) || memberKeys.has(normalizeCommunity(v)) ? targetName : v
  }
  for (const k of memberKeys) next[k] = targetName
  return next
}
