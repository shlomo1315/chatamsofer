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
