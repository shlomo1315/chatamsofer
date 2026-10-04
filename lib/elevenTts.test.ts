import { describe, it, expect } from 'vitest'
import { pcmToWav } from './elevenTts'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 הפורמט שימות מנגנת: PCM 8kHz מונו 16 ביט.
//
// ElevenLabs החזיר MP3 ב-44.1kHz, הקובץ נשמר בימות, הופיע ברשימת
// התיקייה וניתן להורדה — אבל לא התנגן. התוצאה: כל אסימון f- הפיל את
// השיחה, בלי שום שגיאה בצד שלנו (מחזירים 200 תקין). ⚠️ זה עלה שעות
// של ניחושים, ולכן הכותרת נאכפת בטסט.
// ─────────────────────────────────────────────────────────────────────────────

/** קורא ערך little-endian מהכותרת. */
const u16 = (b: ArrayBuffer, off: number) => new DataView(b).getUint16(off, true)
const u32 = (b: ArrayBuffer, off: number) => new DataView(b).getUint32(off, true)
const str = (b: ArrayBuffer, off: number, len: number) =>
  String.fromCharCode(...new Uint8Array(b, off, len))

describe('🔴 pcmToWav — הכותרת שהופכת PCM לקובץ מתנגן', () => {
  const pcm = new Uint8Array(1000).fill(7).buffer

  it('מוסיף כותרת RIFF/WAVE תקנית', () => {
    const wav = pcmToWav(pcm)
    expect(str(wav, 0, 4)).toBe('RIFF')
    expect(str(wav, 8, 4)).toBe('WAVE')
    expect(str(wav, 12, 4)).toBe('fmt ')
    expect(str(wav, 36, 4)).toBe('data')
  })

  it('🔴 PCM מונו 16 ביט ב-8kHz — מה שימות דורשת', () => {
    const wav = pcmToWav(pcm)
    expect(u16(wav, 20)).toBe(1)      // format = PCM
    expect(u16(wav, 22)).toBe(1)      // מונו
    expect(u32(wav, 24)).toBe(8000)   // קצב דגימה
    expect(u16(wav, 34)).toBe(16)     // ביטים לדגימה
  })

  it('אורכי הכותרת תואמים לנתונים', () => {
    const wav = pcmToWav(pcm)
    expect(wav.byteLength).toBe(44 + 1000)
    expect(u32(wav, 4)).toBe(36 + 1000)   // RIFF size
    expect(u32(wav, 40)).toBe(1000)        // data size
    expect(u32(wav, 28)).toBe(8000 * 2)    // byte rate
    expect(u16(wav, 32)).toBe(2)           // block align
  })

  it('הנתונים עצמם נשמרים אחרי הכותרת', () => {
    const wav = pcmToWav(pcm)
    const body = new Uint8Array(wav, 44)
    expect(body.length).toBe(1000)
    expect(body[0]).toBe(7)
    expect(body[999]).toBe(7)
  })

  it('קצב דגימה אחר נכתב נכון', () => {
    const wav = pcmToWav(pcm, 16000)
    expect(u32(wav, 24)).toBe(16000)
    expect(u32(wav, 28)).toBe(16000 * 2)
  })
})
