// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { flushSync } from 'react-dom'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }))

import KvitelClient from '../app/admin/kvitel/KvitelClient'
import type { KvitelRequestRow } from './kvitelQuery'

const settle = async (fn: () => void) => { flushSync(fn); for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) }

let root: Root | null = null
let host: HTMLElement
afterEach(() => { root?.unmount(); root = null; host?.remove(); vi.restoreAllMocks() })

const line = (id: string, name: string) => ({ id, position: 0, name, relation: 'ben', parent_name: 'לאה', request_type: 'refua', request_note: null, flagged: false, flag_reason: null })
const base = { status: 'pending' as const, contact_phone: null, contact_email: null, raw_text: null, note: null, submitted_at: '2026-11-25T10:00:00Z', done_at: null }
const rows: KvitelRequestRow[] = [
  { ...base, id: 'rec', channel: 'email', contact_name: 'משה כהן', recording_url: '/rec.mp3', kvitel_request_lines: [line('l1', 'ישראל')] },
  { ...base, id: 'plain', channel: 'nedarim', contact_name: 'יעקב לוי', recording_url: null, kvitel_request_lines: [line('l2', 'אברהם')] },
]

async function mount() {
  host = document.createElement('div'); document.body.appendChild(host)
  root = createRoot(host)
  await settle(() => root!.render(createElement(KvitelClient, {
    allRows: rows, canEdit: true, onReload: () => {},
    filters: { from: null, to: null, status: 'all', channel: null, type: null, q: '' },
  })))
}
const plays = (who: string) => [...host.querySelectorAll('button[data-play]')].filter(b => b.getAttribute('aria-label')?.includes(who))

describe('משולש השמעת ההקלטה ברשימת הקוויטלאך', () => {
  it('מופיע רק בשורה עם הקלטה, בטבלה ובכרטיס במובייל', async () => {
    await mount()
    expect(plays('משה כהן')).toHaveLength(2)
    expect(plays('יעקב לוי')).toHaveLength(0)
    // בכרטיס של הבקשה עם ההקלטה המשולש בא במקום החץ; בבקשה בלי הקלטה החץ נשאר
    const cards = [...host.querySelectorAll('li')]
    const recCard = cards.find(li => li.textContent?.includes('משה כהן'))!
    const plainCard = cards.find(li => li.textContent?.includes('יעקב לוי'))!
    expect(recCard.querySelector('.lucide-chevron-left')).toBeNull()
    expect(plainCard.querySelector('.lucide-chevron-left')).not.toBeNull()
  })

  it('לחיצה מנגנת את ההקלטה בשורה בלי לפתוח אותה', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('play')); return Promise.resolve()
    })
    await mount()
    const btn = plays('משה כהן')[0] as HTMLButtonElement
    await settle(() => btn.click())
    expect(play).toHaveBeenCalledTimes(1)
    expect(host.querySelector('audio')?.getAttribute('src')).toBe('/rec.mp3')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(btn.closest('tr')?.nextElementSibling?.querySelector('audio[controls]')).toBeFalsy()
  })
})
