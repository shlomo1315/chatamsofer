import { describe, it, expect, vi, beforeEach } from 'vitest'

// אחסון ו-ElevenLabs מדומים: קבצים בזיכרון, ומונה יצירות.
const stored = new Set<string>()
const gen = vi.fn(async () => ({ ok: true, audio: new ArrayBuffer(4) }))
const storage = {
  exists: vi.fn(async (p: string) => ({ data: stored.has(p), error: null })),
  upload: vi.fn(async (p: string) => { stored.add(p); return { error: null } }),
}
vi.mock('@/lib/apiAuth', () => ({
  getServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
    storage: { from: () => storage },
  }),
}))
vi.mock('@/lib/elevenTts', () => ({
  generateSpeech: (...a: unknown[]) => gen(...(a as [])),
  getElevenConfig: async () => ({ voiceId: 'v1', apiKey: 'k', modelId: 'm' }),
  listVoices: async () => ({ ok: true, voices: [] }),
  saveElevenConfig: async () => true,
}))

import { applyVoice, nameFile, resetNameVoiceState, voiceHash } from './voiceFiles'
import { fill } from './modules'
import type { TlFile } from './types'

const turn = () => applyVoice({ type: 'simpleMessage', files: fill('שלום וברכה בשם {name}', { name: nameFile('כהן משה') }) })
const files = async () => ((await turn()) as { files: TlFile[] }).files
const flush = () => new Promise((r) => setTimeout(r, 0))

// 🔴 24.11: מרגע שהקישורים לקבצים נכנסו המתקשרים לא שמעו כלום. בלי המתג — רק טקסט.
describe('השמעה מקבצים כבויה כברירת מחדל', () => {
  beforeEach(() => { stored.clear(); gen.mockClear(); resetNameVoiceState(); delete process.env.PHONE_VOICE_FILES })

  it('שיחה בלי המתג: טקסט בלבד, בלי קישור, בלי סימון שם ובלי יצירה', async () => {
    stored.add(`phone-voice/${voiceHash('v1', 'כהן משה')}.wav`)
    expect(await files()).toEqual([{ text: 'שלום וברכה בשם' }, { text: 'כהן משה' }])
    await flush()
    expect(gen).not.toHaveBeenCalled()
  })
})

describe('הקלטת שם המתקשר', () => {
  beforeEach(() => { stored.clear(); gen.mockClear(); resetNameVoiceState(); process.env.PHONE_VOICE_FILES = '1' })

  it('השם קטע נפרד מהפתיח הקבוע', () => {
    expect(fill('שלום וברכה בשם {name}', { name: nameFile('כהן משה') }).map((f) => 'text' in f && f.text))
      .toEqual(['שלום וברכה בשם', 'כהן משה'])
  })

  it('פעם ראשונה: טקסט מיד ויצירה ברקע של השם בלבד; פעם שנייה: ההקלטה, בלי יצירה נוספת', async () => {
    expect((await files())[1]).toEqual({ text: 'כהן משה' })
    await flush()
    expect(gen).toHaveBeenCalledTimes(1)
    expect(gen.mock.calls[0]).toEqual(['כהן משה', { voiceId: 'v1', outputFormat: 'pcm_8000' }])

    const h = voiceHash('v1', 'כהן משה')
    expect((await files())[1]).toEqual({ fileLink: expect.stringContaining(`/api/telephony/voice/${h}.wav`), fileName: `${h}.wav` })
    await files()
    expect(gen).toHaveBeenCalledTimes(1)
  })

  it('שיחות מקבילות לאותו שם יוצרות הקלטה אחת', async () => {
    let release!: () => void
    gen.mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true, audio: new ArrayBuffer(4) }) }))
    await Promise.all([turn(), turn(), turn()])
    await flush()
    release()
    await flush()
    expect(gen).toHaveBeenCalledTimes(1)
  })

  it('הקלטה שכבר באחסון (משרת אחר / אחרי הפעלה מחדש) מושמעת בלי יצירה', async () => {
    stored.add(`phone-voice/${voiceHash('v1', 'כהן משה')}.wav`)
    expect((await files())[1]).toHaveProperty('fileLink')
    expect(gen).not.toHaveBeenCalled()
  })

  it('כשל יצירה (מכסה) לא מנסה שוב בכל שיחה, והשם נשלח לטכנוליין בלי סימון', async () => {
    gen.mockResolvedValueOnce({ ok: false, error: 'quota' } as never)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await turn(); await flush()
    const again = await files(); await flush()
    expect(gen).toHaveBeenCalledTimes(1)
    expect(again[1]).toEqual({ text: 'כהן משה' })
  })
})
