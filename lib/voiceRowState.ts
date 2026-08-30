// ─────────────────────────────────────────────────────────────────────────────
// מצב ההקלטה של הודעה בשלוחה.
//
// 🔴 ההבחנה שזה קיים בשבילה: "יש הקלטה" ו-"ההקלטה תואמת לטקסט" הם שני
// דברים שונים. מי שערך טקסט ולא הקליט מחדש — הקובץ שיושב בימות ממשיך
// להקריא את הנוסח הישן, והמנהל בטוח ששינה משהו בזמן שהמתקשרים שומעים
// בדיוק כמו קודם.
//
// ⚠️ הפונקציה טהורה ואינה נוגעת ברשת: כך אפשר לבדוק את כל המצבים בלי
// ElevenLabs ובלי ימות.
// ─────────────────────────────────────────────────────────────────────────────

export type VoiceRowKind =
  /** אין קובץ — ימות תקריא את הטקסט ב-TTS שלה. */
  | 'tts'
  /** יש קובץ, והוא תואם לטקסט הנוכחי. */
  | 'recorded'
  /** 🔴 יש קובץ, אבל הטקסט השתנה מאז — הוא מקריא נוסח ישן. */
  | 'stale'

export interface VoiceRowState {
  kind: VoiceRowKind
  /** האם יש מה להשמיע בכלל. */
  canPreview: boolean
}

export function voiceRowState(input: {
  text: string
  /** שם קובץ ההקלטה בימות. null/ריק = אין. */
  audio: string | null | undefined
  /** הטקסט שממנו נוצרה ההקלטה. null = לא תועד. */
  recordedText: string | null | undefined
}): VoiceRowState {
  const text = String(input.text ?? '').trim()
  const audio = String(input.audio ?? '').trim()
  const canPreview = text.length > 0

  if (!audio) return { kind: 'tts', canPreview }

  // ⚠️ בלי תיעוד מה הוקלט אי אפשר לדעת אם הקובץ מיושן — והחזקה היא
  // שהוא תקין. הקלטות שנוצרו לפני שהתיעוד נוסף היו מסומנות כמיושנות
  // כולן, והמסך היה מוצף באזהרות שווא.
  const recorded = input.recordedText == null ? null : String(input.recordedText).trim()
  if (recorded !== null && recorded !== text) return { kind: 'stale', canPreview }

  return { kind: 'recorded', canPreview }
}
