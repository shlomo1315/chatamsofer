// בית החלמה חריג (אישור מנהל) — בדיקות הקלט המשותפות לנתיב ה-API.

export const RECEIPT_MAX_MB = 15

export const RECEIPT_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

// שם בית ההחלמה / המלון: חובה, עד 120 תווים, בלי רווחים כפולים.
export function cleanExceptionHome(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.replace(/\s+/g, ' ').trim()
  if (!s || s.length > 120) return null
  return s
}

// בדיקת קובץ הקבלה. מחזיר את הסיומת, או הודעת שגיאה בעברית.
export function checkReceipt(type: string, size: number): { ext: string } | { error: string } {
  const ext = RECEIPT_TYPES[type]
  if (!ext) return { error: 'סוג קובץ לא נתמך. אפשר PDF או תמונה.' }
  if (!size) return { error: 'הקובץ ריק' }
  if (size > RECEIPT_MAX_MB * 1024 * 1024) return { error: `הקובץ גדול מדי (עד ${RECEIPT_MAX_MB}MB)` }
  return { ext }
}

// שם הקובץ להצגה/הורדה — בלי תווים שעלולים לשבור כותרות.
export function receiptDisplayName(name: string, ext: string): string {
  const clean = (name || '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 120)
  return clean || `קבלה.${ext}`
}
