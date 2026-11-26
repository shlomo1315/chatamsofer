// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'
import CardWallet from '../app/admin/maternity/[id]/CardWallet'

const settle = async (fn: () => void) => { flushSync(fn); for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) }

// הערכים בתיבה: [סכום הטעינה, נוצלו, נותרו בארנק]
const boxes = (el: HTMLElement) =>
  [...el.querySelectorAll('.grid > div')].map(d => d.querySelectorAll('p')[1].textContent?.replace(/\s/g, ' ').trim())

let root: Root | null = null
let host: HTMLElement
afterEach(() => { root?.unmount(); root = null; host?.remove(); vi.unstubAllGlobals() })

const mount = async (props: Parameters<typeof CardWallet>[0]) => {
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  await settle(() => root!.render(createElement(CardWallet, props)))
}

describe('CardWallet — כרטסת יולדת (הרשוביץ חנה: 600, קניות 220+12+74, בנדרים 294)', () => {
  it('נוצלו ונותרו לפי היתרה מנדרים, לא לפי card_balance שנשאר 600', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      available: true, balance: 294,
      purchases: [
        { id: '1', date: '24/11/26 20:20', store: 'גולדיס', amount: 220 },
        { id: '2', date: '24/11/26 19:34', store: 'פיצה אורי', amount: 12 },
        { id: '3', date: '24/11/26 19:30', store: 'פיצה אורי', amount: 74 },
      ],
    }), { status: 200 })))
    await mount({ aidId: 'a1', showActivity: true, aid: { card_load_amount: 600, card_balance: 600, live_balance: null } })
    expect(boxes(host)).toEqual(['600 ₪', '306 ₪', '294 ₪'])
    expect(host.textContent).toContain('יתרה עכשווית בנדרים')
  })

  it('לא מנהל (בלי שליפה חיה) — לפי live_balance מהרענון השעתי', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f)
    await mount({ aidId: 'a1', showActivity: false, aid: { card_load_amount: 600, card_balance: 600, live_balance: 294 } })
    expect(f).not.toHaveBeenCalled()
    expect(boxes(host)).toEqual(['600 ₪', '306 ₪', '294 ₪'])
  })

  it('השליפה מנדרים נכשלה — נשאר live_balance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })))
    await mount({ aidId: 'a1', showActivity: true, aid: { card_load_amount: 600, card_balance: 600, live_balance: 100 } })
    expect(boxes(host)).toEqual(['600 ₪', '500 ₪', '100 ₪'])
  })
})
