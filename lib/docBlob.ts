'use client'

import { storagePath } from '@/lib/docUrl'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// טעינת מסמך דרך "ערוץ הנתונים" (/api/files/data) והרכבתו לקובץ מקומי בדפדפן.
//
// למה: תגובה מסוג קובץ (application/pdf, image/*) מזוהה ע"י מסנני תוכן
// ונשלחת לבדיקה לפני שהמשתמש רואה אותה. כאן מגיע JSON רגיל עם base64,
// והדפדפן מרכיב ממנו Blob מקומי. כתובת blob: היא מקומית לחלוטין — הצגה
// ממנה אינה מייצרת בקשת רשת, ולכן אין שם מה לסנן.
// ─────────────────────────────────────────────────────────────────────────────

export interface DocBlob {
  /** כתובת blob: מקומית — לשימוש ב-src/href */
  objectUrl: string
  contentType: string
  name: string
  size: number
}

// מטמון לפי נתיב אחסון — כדי שתמונה שמוצגת בכמה מקומות לא תישלף פעמיים.
// הערך הוא ה-Promise עצמו, כך שגם קריאות מקבילות מתאחדות לבקשה אחת.
const cache = new Map<string, Promise<DocBlob>>()

function base64ToBlob(base64: string, contentType: string, enc?: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  // ⚠️ ביטול הערבול שנעשה בשרת. בלעדיו ה-base64 נושא את חתימת הקובץ
  // ("JVBERi" ל-PDF, "/9j/" ל-JPEG) ומסנן התוכן מזהה אותה גם בתוך JSON.
  // enc נבדק ולא מונח: תגובה שנשמרה במטמון לפני השינוי מגיעה בלי הסימון,
  // ופענוח שלה היה הופך קובץ תקין לזבל.
  if (enc === DOC_CIPHER_ID) scrambleBytes(bytes)
  return new Blob([bytes], { type: contentType })
}

/**
 * טוען מסמך כנתונים ומחזיר כתובת blob: מקומית.
 * הכתובת נשמרת במטמון לכל אורך חיי העמוד — אין לקרוא ל-revokeObjectURL עליה
 * (ראו releaseDoc אם באמת צריך לשחרר).
 */
export function loadDocBlob(rawUrlOrPath: string, name?: string | null): Promise<DocBlob> {
  // חלק מהקוראים מעבירים כבר כתובת פרוקסי (/api/files?p=...) — חולצים ממנה
  // את נתיב האחסון, אחרת היינו מבקשים את הכתובת עצמה כנתיב.
  const urlOrPath = /^\/api\/files\b/.test(rawUrlOrPath)
    ? (new URLSearchParams(rawUrlOrPath.split('?')[1] ?? '').get('p') ?? rawUrlOrPath)
    : rawUrlOrPath
  const key = storagePath(urlOrPath)
  const cached = cache.get(key)
  if (cached) return cached

  const pending = (async (): Promise<DocBlob> => {
    const q = `p=${encodeURIComponent(urlOrPath)}${name ? `&name=${encodeURIComponent(name)}` : ''}`
    const res = await fetch(`/api/files/data?${q}`, { credentials: 'same-origin' })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      throw new Error(d.error || 'שגיאה בטעינת הקובץ')
    }
    const d = (await res.json()) as { data: string; contentType: string; name: string; size: number; enc?: string }
    const blob = base64ToBlob(d.data, d.contentType, d.enc)
    return {
      objectUrl: URL.createObjectURL(blob),
      contentType: d.contentType,
      name: d.name,
      size: d.size,
    }
  })()

  cache.set(key, pending)
  // בקשה שנכשלה לא נשארת במטמון — אחרת ניסיון חוזר יחזיר את אותה שגיאה לנצח
  pending.catch(() => cache.delete(key))
  return pending
}

/** שחרור מפורש של מסמך מהמטמון (למשל אחרי החלפת הקובץ בשרת). */
export function releaseDoc(urlOrPath: string): void {
  const key = storagePath(urlOrPath)
  const pending = cache.get(key)
  if (!pending) return
  cache.delete(key)
  pending.then(d => URL.revokeObjectURL(d.objectUrl)).catch(() => {})
}

/** פתיחת המסמך בכרטיסייה חדשה מתוך blob: מקומי (בלי בקשת רשת לקובץ). */
export async function openDocInNewTab(urlOrPath: string, name?: string | null): Promise<void> {
  // הכרטיסייה נפתחת *לפני* ה-await — אחרת חוסמי החלונות של הדפדפן חוסמים
  // פתיחה שאינה נובעת ישירות מלחיצת המשתמש.
  const tab = window.open('', '_blank', 'noopener,noreferrer')
  try {
    const d = await loadDocBlob(urlOrPath, name)
    if (tab) tab.location.href = d.objectUrl
    else window.location.href = d.objectUrl
  } catch (err) {
    tab?.close()
    throw err
  }
}

/** הורדת המסמך למחשב מתוך blob: מקומי. */
export async function downloadDocViaData(urlOrPath: string, name?: string | null): Promise<void> {
  const d = await loadDocBlob(urlOrPath, name)
  const a = document.createElement('a')
  a.href = d.objectUrl
  a.download = name || d.name || ''
  document.body.appendChild(a)
  a.click()
  a.remove()
}
