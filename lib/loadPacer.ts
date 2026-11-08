// קצב טעינות מול נדרים בתור הממתינות.
// 🔴 7.11.2026: אחרי פריסה הסבב טען בבת אחת את כל התקועות, עבר את תקרת השומר
// (80 פניות בדקה), והערוץ נעצר באמצע. כל טעינה היא כ-3 פניות, ולכן אחרי כל
// קבוצה קטנה ממתינים דקה, כדי להישאר הרבה מתחת לתקרה.
export const LOAD_BATCH = 10
export const LOAD_PAUSE_MS = 60_000

export function createLoadPacer(
  batch = LOAD_BATCH, pauseMs = LOAD_PAUSE_MS,
  sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
) {
  let count = 0
  /** אחרי כל טעינה שיצאה לנדרים. בסוף קבוצה ממתין לפני הבאה. */
  return async function afterLoad(): Promise<void> {
    count++
    if (count % batch === 0) await sleep(pauseMs)
  }
}
