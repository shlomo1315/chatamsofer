// פענוח קישור של Google Drive למזהה תיקייה. לוגיקה טהורה, כדי שאפשר לבדוק אותה.

const ID = '[A-Za-z0-9_-]{10,}'
const PATTERNS = [
  new RegExp(`/folders/(${ID})`),            // drive.google.com/drive/folders/ID, גם /u/0/ ו-?usp=sharing
  new RegExp(`[?&]id=(${ID})`),              // drive.google.com/open?id=ID
]

/** מזהה תיקייה מקישור Drive (או מזהה חשוף). null אם זה לא נראה כמו תיקייה. */
export function parseDriveFolderId(input: string): string | null {
  const s = input.trim()
  if (!s) return null
  if (new RegExp(`^${ID}$`).test(s)) return s
  let url: URL
  try { url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`) } catch { return null }
  if (url.hostname !== 'drive.google.com' && !url.hostname.endsWith('.google.com')) return null
  const full = url.pathname + url.search
  for (const re of PATTERNS) {
    const m = re.exec(full)
    if (m) return m[1]
  }
  return null
}
