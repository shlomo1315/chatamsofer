// תזמון המשיכה היומית של נרשמי הגיליונות מנדרים פלוס: 02:00 לפי שעון ישראל.
// השעה נקבעת לפי Asia/Jerusalem ולא לפי אזור הזמן של השרת, ולכן עמידה לשעון קיץ/חורף.
export const GILYONOT_PULL_HOUR = 2

/** האם הגיע הזמן למשוך: בשעה 02 בישראל, ופעם אחת ליום (לפי התאריך בישראל). */
export function isGilyonotPullDue(now: Date, lastDate: string): { due: boolean; date: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
    }).formatToParts(now).map(x => [x.type, x.value]),
  )
  const date = `${p.year}-${p.month}-${p.day}`
  return { due: Number(p.hour) % 24 === GILYONOT_PULL_HOUR && date !== lastDate, date }
}
