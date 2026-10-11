// הגדרות אחידות להעלאת קבצים במערכת.
// סוגי הקבצים המותרים וגודל מרבי — מוצגים למשתמש בכל מקום שיש צירוף קובץ.

export const MAX_UPLOAD_MB = 10

// סוגי הקבצים המותרים: תמונה, מסמך Word או PDF.
export const UPLOAD_ACCEPT = 'image/*,.pdf,.doc,.docx'

// טקסט הסבר אחיד שמוצג ליד כל שדה העלאה.
export const UPLOAD_HINT = `ניתן להעלות תמונה, קובץ Word או PDF — עד ${MAX_UPLOAD_MB}MB`

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 רשימת הסיומות המותרות — מקור אחד ללקוח ולשרת.
//
// ⚠️ הבאג שזה סוגר: הפורטל הציג ליולדות "ניתן להעלות תמונה, קובץ Word או PDF"
// ובורר הקבצים הציע Word וכל סוג תמונה (image/*), אבל upload-docs החזיק רשימה
// פרטית משלו בלי Word, בלי jfif (מה ש-WhatsApp Web שומר), בלי heif/bmp/tif.
// הקובץ עלה במלואו (8–19 שניות בסלולר) ורק אז נדחה ב-400 — 24 דחיות בשבוע,
// ומשפחות שלא הצליחו "לעדכן מסמכים כנדרש".
//
// כל שרת שמקבל קבצים מהציבור בודק מול הרשימה הזו, ולא מול רשימה מקומית.
// ─────────────────────────────────────────────────────────────────────────────
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', jfif: 'image/jpeg', pjpeg: 'image/jpeg',
  png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp',
  heic: 'image/heic', heif: 'image/heif', tif: 'image/tiff', tiff: 'image/tiff',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

// סיומת לפי סוג ה-MIME — לקובץ שהגיע בלי סיומת בשם (נפוץ בצילום ישיר מהנייד).
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/pjpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/bmp': 'bmp', 'image/heic': 'heic', 'image/heif': 'heif',
  'image/tiff': 'tiff', 'application/pdf': 'pdf', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

/**
 * סיומת הקובץ המנורמלת, או '' אם אינה ידועה.
 *
 * ⚠️ שם בלי נקודה ("image") החזיר בעבר את השם כולו כסיומת, והקובץ נדחה
 * כ"סוג לא נתמך" — אף שה-MIME שלו תקין. במקרה כזה נשענים על ה-MIME.
 */
export function uploadExt(name: string, mime?: string | null): string {
  const dot = name.lastIndexOf('.')
  const fromName = dot > 0 ? name.slice(dot + 1).toLowerCase().trim() : ''
  if (fromName && ALLOWED_UPLOAD_TYPES[fromName]) return fromName
  const fromMime = EXT_BY_MIME[String(mime ?? '').toLowerCase()]
  return fromMime ?? fromName
}

/** הודעת שגיאה בעברית אם הקובץ אינו קביל, אחרת null. */
export function uploadFileError(file: { name: string; size: number; type?: string }): string | null {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `הקובץ "${file.name}" גדול מ-${MAX_UPLOAD_MB}MB. יש לצלם שוב באיכות נמוכה יותר או לכווץ את הקובץ.`
  }
  if (!ALLOWED_UPLOAD_TYPES[uploadExt(file.name, file.type)]) {
    return `סוג הקובץ "${file.name}" אינו נתמך. ניתן להעלות תמונה, קובץ Word או PDF.`
  }
  return null
}
