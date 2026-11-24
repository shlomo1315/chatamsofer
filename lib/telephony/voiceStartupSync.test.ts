/* eslint-disable @typescript-eslint/no-explicit-any -- בונה שאילתות דמה של Supabase */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// מסד דמה של app_settings (select, upsert, insert עם התנגשות, update מותנה, delete) ו-Storage
const rows: Record<string, string> = {}
const uploads: string[] = []
function fakeDb() {
  return {
    storage: { from: () => ({ upload: async (path: string) => { uploads.push(path); return { error: null } } }) },
    from() {
      const f: Record<string, string> = {}
      let op = ''
      let payload: any
      const q: any = {
        insert(p: any) { op = 'insert'; payload = p; return q },
        upsert(p: any) { op = 'upsert'; payload = p; return q },
        select() { if (!op) op = 'select'; return q },
        update(p: any) { op = 'update'; payload = p; return q },
        delete() { op = 'delete'; return q },
        eq(k: string, v: string) { f[k] = v; return q },
        maybeSingle() { return Promise.resolve({ data: f.key in rows ? { value: rows[f.key] } : null }) },
        then(res: any, rej: any) {
          let out: any
          if (op === 'insert') out = payload.key in rows ? { error: { code: '23505' } } : (rows[payload.key] = payload.value, { error: null })
          else if (op === 'upsert') { rows[payload.key] = payload.value; out = { error: null } }
          else if (op === 'update') out = { data: f.key in rows && rows[f.key] === f.value ? (rows[f.key] = payload.value, [{ key: f.key }]) : [] }
          else { delete rows[f.key]; out = {} }
          return Promise.resolve(out).then(res, rej)
        },
      }
      return q
    },
  }
}
const db = fakeDb()
vi.mock('@/lib/apiAuth', () => ({ getServiceClient: () => db }))

type Gen = (text: string, o?: unknown) => Promise<{ ok: boolean; audio?: ArrayBuffer; error?: string }>
const generateSpeech = vi.fn<Gen>(async () => ({ ok: true, audio: new ArrayBuffer(4) }))
vi.mock('@/lib/elevenTts', () => ({
  generateSpeech: (t: string, o: unknown) => generateSpeech(t, o),
  getElevenConfig: async () => ({ apiKey: 'k', voiceId: 'v1', modelId: 'm' }),
  listVoices: async () => ({ ok: true, voices: [] }),
  saveElevenConfig: async () => true,
}))
vi.mock('@/lib/holidayPhoneMessages', () => ({ getHolidayMessages: async () => ({}) }))
vi.mock('@/lib/maternityPhoneMessages', () => ({ getMaternityMessages: async () => ({}) }))

import { syncMainVoice, voiceHash } from './voiceFiles'
import { syncVoiceOnStartup, VOICE_SYNC_LOCK_KEY } from './voiceStartupSync'
import { MAIN_MENU_MESSAGE_META, MAIN_MENU_MSG_KEY } from '@/lib/mainMenuPhone'

const spoken = () => generateSpeech.mock.calls.map((c) => c[0])
const def = (key: string) => MAIN_MENU_MESSAGE_META.find((m) => m.key === key)!.defaultText
const SAVED_NOTICE = 'הודעה שנשמרה במסך הניהול'

beforeEach(() => {
  for (const k of Object.keys(rows)) delete rows[k]
  uploads.length = 0
  generateSpeech.mockClear()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  rows[MAIN_MENU_MSG_KEY] = JSON.stringify({ notice: { text: SAVED_NOTICE } })
  // "ברוכים הבאים" כבר מוקלט
  rows.phone_voice_index = JSON.stringify({ voiceId: 'v1', hashes: { [voiceHash('v1', def('welcome'))]: def('welcome') } })
})

describe('הקלטות חסרות בעליית השרת', () => {
  it('נוצרות רק הקלטות חסרות, לפי הנוסח השמור במסד', async () => {
    const r = await syncMainVoice()
    expect(r.ok).toBe(true)
    expect(spoken()).toContain(SAVED_NOTICE)
    expect(spoken()).toContain(def('temp_notice'))
    expect(spoken()).not.toContain(def('notice'))
    expect(spoken()).not.toContain(def('welcome'))
    const idx = JSON.parse(rows.phone_voice_index)
    expect(Object.values(idx.hashes)).toContain(SAVED_NOTICE)
    expect(Object.values(idx.hashes)).toContain(def('welcome'))
  })

  it('עלייה שנייה בלי שינוי בנוסחים לא פונה ל-ElevenLabs', async () => {
    expect(await syncVoiceOnStartup()).toBe('synced')
    generateSpeech.mockClear()
    expect(await syncVoiceOnStartup()).toBe('synced')
    expect(generateSpeech).not.toHaveBeenCalled()
  })

  it('שני מופעים במקביל: כל הקלטה נוצרת פעם אחת', async () => {
    const r = await Promise.all([syncVoiceOnStartup(), syncVoiceOnStartup()])
    expect(r.sort()).toEqual(['locked', 'synced'])
    expect(new Set(spoken()).size).toBe(spoken().length)
    expect(rows[VOICE_SYNC_LOCK_KEY]).toBeUndefined()
  })

  it('כשל במכסה נרשם ללוג ולא זורק, והנעילה משתחררת', async () => {
    generateSpeech.mockResolvedValueOnce({ ok: false, error: 'quota_exceeded' })
    expect(await syncVoiceOnStartup()).toBe('failed')
    expect(rows[VOICE_SYNC_LOCK_KEY]).toBeUndefined()
    // הקיים ממשיך להתנגן
    expect(Object.values(JSON.parse(rows.phone_voice_index).hashes)).toContain(def('welcome'))
  })

  it('חריגה (רשת) לא מפילה', async () => {
    generateSpeech.mockRejectedValueOnce(new Error('ECONNRESET'))
    await expect(syncVoiceOnStartup()).resolves.toBe('failed')
    expect(rows[VOICE_SYNC_LOCK_KEY]).toBeUndefined()
  })
})
