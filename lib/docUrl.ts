// כלי גישה מאובטחת למסמכים שמאוחסנים בדלי 'documents'.
// במקום URL ציבורי קבוע, הצפייה עוברת דרך פרוקסי מאומת (/api/files) שמייצר
// signed URL קצר-מועד בצד השרת. כך מסמכים רגישים (ת"ז, אישורי לידה, מסמכים
// רפואיים) אינם נגישים לכל מי שמשיג קישור.

// חילוץ נתיב האחסון מתוך URL (ציבורי/חתום) של Supabase, או החזרת הקלט אם הוא כבר נתיב.
export function storagePath(urlOrPath: string): string {
  if (!urlOrPath) return ''
  // כתובת פרוקסי שכבר נבנתה (/api/files?p=...) — חילוץ הנתיב מתוך הפרמטר,
  // כדי שאפשר יהיה להעביר אותה הלאה (למשל לתצוגה המקדימה) בלי לשבור.
  const proxied = urlOrPath.match(/^\/api\/files(?:\/thumb)?\?(.*)$/)
  if (proxied) {
    const p = new URLSearchParams(proxied[1]).get('p')
    if (p) return storagePath(p)
  }
  for (const marker of [
    '/object/public/documents/',
    '/object/sign/documents/',
    '/object/documents/',
    '/documents/',
  ]) {
    const i = urlOrPath.indexOf(marker)
    if (i !== -1) return decodeURIComponent(urlOrPath.slice(i + marker.length).split('?')[0])
  }
  return urlOrPath
}

// כתובת צפייה מאומתת למסמך — לשימוש ב-src/href במקום ה-URL הישיר.
// מקבל גם URL ציבורי ישן (תאימות לאחור) וגם נתיב אחסון.
export function docViewUrl(urlOrPath: string | null | undefined): string {
  if (!urlOrPath) return ''
  return `/api/files?p=${encodeURIComponent(urlOrPath)}`
}

// כתובת *תצוגה מקדימה כתמונה* — תמיד מחזירה PNG/תמונה, לעולם לא PDF.
// נטפרי מיירט תגובות application/pdf ומציג את דף החסימה שלו במקום המסמך (גם
// מהדומיין שלנו), ולכן תצוגות מקדימות חייבות לעבור דרך הנתיב הזה, שמרנדר את
// עמוד ה-PDF לתמונה בשרת. page = מספר העמוד, width = רוחב היעד בפיקסלים.
export function docThumbUrl(
  urlOrPath: string | null | undefined,
  { page = 1, width = 900 }: { page?: number; width?: number } = {},
): string {
  if (!urlOrPath) return ''
  return `/api/files/thumb?p=${encodeURIComponent(urlOrPath)}&page=${page}&w=${width}`
}

// בניית שם הורדה משמעותי למסמך מוטב: "סוג המסמך + שם ומשפחת המוטב" עם הסיומת
// המקורית של הקובץ. למשל: docType="תעודת זהות", person="משה כהן", original="scan123.pdf"
//   → "תעודת זהות משה כהן.pdf".
// אם אין שם מוטב — נופלים לסוג בלבד; אם אין גם סוג — לשם הקובץ המקורי.
// הסיומת נגזרת מהשם המקורי; אם השם המקורי חסר סיומת, /api/files ישלים אותה מנתיב האחסון.
export function docDownloadName(
  docType?: string | null,
  person?: string | null,
  original?: string | null,
): string {
  const ext = (original ?? '').match(/\.[^.\s]+$/)?.[0] ?? ''
  const base = [docType?.trim(), person?.trim()].filter(Boolean).join(' ').trim()
  const clean = (base || original || 'מסמך').replace(/[\\/:*?"<>|]+/g, '').trim()
  return /\.[^.\s]+$/.test(clean) ? clean : `${clean}${ext}`
}

// כתובת הורדה ישירה למחשב — מוסיפה dl=1 (Content-Disposition: attachment).
// name (לא חובה) קובע את שם הקובץ שיישמר.
export function docDownloadUrl(urlOrPath: string | null | undefined, name?: string | null): string {
  if (!urlOrPath) return ''
  const q = `p=${encodeURIComponent(urlOrPath)}&dl=1${name ? `&name=${encodeURIComponent(name)}` : ''}`
  return `/api/files?${q}`
}

// קישור חתום קצר-מועד לשימוש במיילים (ברירת מחדל 7 ימים) — נדרש כשהדלי פרטי.
// admin הוא לקוח service-role. בכישלון מוחזר ה-URL המקורי כדי לא לשבור את המייל.
export async function signedDocUrl(
  admin: { storage: { from: (b: string) => { createSignedUrl: (p: string, e: number) => Promise<{ data: { signedUrl: string } | null }> } } },
  urlOrPath: string,
  expiresIn = 7 * 24 * 60 * 60,
): Promise<string> {
  const path = storagePath(urlOrPath)
  if (!path) return urlOrPath
  try {
    const { data } = await admin.storage.from('documents').createSignedUrl(path, expiresIn)
    return data?.signedUrl || urlOrPath
  } catch {
    return urlOrPath
  }
}
