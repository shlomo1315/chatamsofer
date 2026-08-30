import { describe, it, expect } from 'vitest'
import { voiceRowState } from './voiceRowState'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 מצב ההקלטה של הודעה בשלוחה.
//
// ⚠️ ההבחנה המרכזית: "יש הקלטה" ו-"ההקלטה תואמת לטקסט" הם שני דברים
// שונים. מי שערך טקסט ולא הקליט מחדש — הקובץ בימות עדיין מקריא את
// הנוסח הישן, והמסך חייב לומר זאת. אחרת המנהל בטוח ששינה משהו,
// והמתקשרים ממשיכים לשמוע את הנוסח הקודם.
// ─────────────────────────────────────────────────────────────────────────────

describe('voiceRowState — אין הקלטה', () => {
  it('בלי קובץ — TTS בלבד', () => {
    const s = voiceRowState({ text: 'שלום', audio: null, recordedText: null })
    expect(s.kind).toBe('tts')
  })

  it('⚠️ מחרוזת ריקה נחשבת כאין קובץ', () => {
    expect(voiceRowState({ text: 'שלום', audio: '  ', recordedText: null }).kind).toBe('tts')
  })
})

describe('voiceRowState — יש הקלטה', () => {
  it('הקלטה שתואמת לטקסט', () => {
    const s = voiceRowState({ text: 'שלום', audio: 'tts_greeting', recordedText: 'שלום' })
    expect(s.kind).toBe('recorded')
  })

  it('🔴 טקסט שהשתנה מאז ההקלטה — הקובץ מקריא נוסח ישן', () => {
    const s = voiceRowState({ text: 'שלום וברכה', audio: 'tts_greeting', recordedText: 'שלום' })
    expect(s.kind).toBe('stale')
  })

  it('⚠️ רווחים בקצוות אינם נחשבים שינוי', () => {
    const s = voiceRowState({ text: '  שלום  ', audio: 'tts_greeting', recordedText: 'שלום' })
    expect(s.kind).toBe('recorded')
  })

  it('⚠️ בלי תיעוד מה הוקלט — לא מניחים שהוא מיושן', () => {
    // הקלטות שנוצרו לפני שהתיעוד נוסף. סימונן כמיושנות היה מציף את
    // המסך באזהרות שווא על הקלטות תקינות לחלוטין.
    const s = voiceRowState({ text: 'שלום', audio: 'tts_greeting', recordedText: null })
    expect(s.kind).toBe('recorded')
  })
})

describe('voiceRowState — 🔴 אפשר להשמיע?', () => {
  it('טקסט ריק — אין מה להשמיע', () => {
    expect(voiceRowState({ text: '', audio: null, recordedText: null }).canPreview).toBe(false)
    expect(voiceRowState({ text: '   ', audio: 'x', recordedText: null }).canPreview).toBe(false)
  })

  it('יש טקסט — אפשר', () => {
    expect(voiceRowState({ text: 'שלום', audio: null, recordedText: null }).canPreview).toBe(true)
  })
})
