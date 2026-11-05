import { describe, expect, it } from 'vitest'
import { EXTS, MAP, extId, findExt } from './catalog'
import { SYSTEM_EXTS } from './tree'

describe('קטלוג השלוחות', () => {
  it('כל שלוחה בקטלוג קיימת בעץ הבנייה ולהפך', () => {
    const catalog = EXTS.map(extId).sort()
    const tree = Object.entries(SYSTEM_EXTS).flatMap(([sys, list]) => list.map((e) => `${sys}/${e.ext}`)).sort()
    expect(catalog).toEqual(tree)
  })
  it('כל הפניה במפה מצביעה לשלוחה קיימת', () => {
    const refs: string[] = []
    const walk = (n: { ext?: string; kids?: unknown[] }) => { if (n.ext) refs.push(n.ext); (n.kids as typeof n[] | undefined)?.forEach(walk) }
    for (const m of Object.values(MAP)) { walk(m.root); refs.push(...m.direct) }
    for (const r of refs) expect(findExt(r), r).toBeTruthy()
  })
})
