// כלי גישה מאובטחת למסמכים שמאוחסנים בדלי 'documents'.
// במקום URL ציבורי קבוע, הצפייה עוברת דרך פרוקסי מאומת (/api/files) שמייצר
// signed URL קצר-מועד בצד השרת. כך מסמכים רגישים (ת"ז, אישורי לידה, מסמכים
// רפואיים) אינם נגישים לכל מי שמשיג קישור.

// חילוץ נתיב האחסון מתוך URL (ציבורי/חתום) של Supabase, או החזרת הקלט אם הוא כבר נתיב.
export function storagePath(urlOrPath: string): string {
  if (!urlOrPath) return ''
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
