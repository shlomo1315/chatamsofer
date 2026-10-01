// ─────────────────────────────────────────────────────────────────────────────
// חלון האיסוף העצמי ביריד.
//
// 🔴 טהור לחלוטין — מקבל "עכשיו" כפרמטר ואינו קורא ל-new Date() בעצמו.
// זו הדרך היחידה לבדוק בטסטים "מה קורה ביום שני ב-18:01", וזה בדיוק
// הגבול שאי אפשר לאמת בפרודקשן בלי לחכות ליום שני.
//
// ⚠️ שעון ישראל ולא UTC: "שני ב-18:00" הוא שעה מקומית. חישוב ב-UTC היה
// סוגר את האיסוף בשעה הלא נכונה, ובשינוי שעון חורף/קיץ גם זז בשעה.
// ─────────────────────────────────────────────────────────────────────────────

/** הגדרות האיסוף, כפי שהן נשמרות ב-app_settings תחת 'book_fair_pickup'. */
export interface PickupConfig {
  /** האם האיסוף העצמי מוצע בכלל. */
  enabled: boolean
  /** אחרי כמה שעות מההזמנה הספרים מוכנים לאיסוף. */
  ready_hours: number
  /**
   * יום הסגירה — 0=ראשון, 1=שני … 6=שבת (כמו getDay).
   * ⚠️ null = אין סגירה שבועית.
   */
  closes_weekday: number | null
  /** השעה שבה האיסוף נסגר באותו יום (0-23). */
  closes_hour: number
}

export const PICKUP_CONFIG_KEY = 'book_fair_pickup'

export const DEFAULT_PICKUP: PickupConfig = {
  enabled: true,
  ready_hours: 3,
  closes_weekday: 1,   // יום שני
  closes_hour: 18,     // 18:00
}

/**
 * מיזוג ההגדרות השמורות על ברירות המחדל.
 *
 * ⚠️ ערך פגום נופל לברירת המחדל ולא מבטל את האיסוף: הגדרה שבורה אסור
 * לה לשנות בשקט את מה שהלקוח רואה בחנות.
 */
export function mergePickupConfig(raw: unknown): PickupConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PICKUP }
  const r = raw as Record<string, unknown>

  const hours = Number(r.ready_hours)
  const wd = r.closes_weekday
  const hour = Number(r.closes_hour)

  return {
    enabled: r.enabled === undefined ? DEFAULT_PICKUP.enabled : r.enabled !== false,
    ready_hours: Number.isFinite(hours) && hours >= 0 ? Math.round(hours) : DEFAULT_PICKUP.ready_hours,
    closes_weekday:
      wd === null ? null
      : Number.isInteger(Number(wd)) && Number(wd) >= 0 && Number(wd) <= 6 ? Number(wd)
      : DEFAULT_PICKUP.closes_weekday,
    closes_hour:
      Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_PICKUP.closes_hour,
  }
}

/**
 * שעה ויום-בשבוע לפי שעון ישראל.
 *
 * ⚠️ Intl ולא חישוב היסט ידני: היסט קבוע שובר בשינוי שעון קיץ/חורף,
 * ושעת הסגירה הייתה זזה בשעה פעמיים בשנה בלי שאיש שם לב.
 */
export function israelParts(now: Date): { weekday: number; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const wdName = parts.find(p => p.type === 'weekday')?.value ?? 'Sun'
  const hourRaw = parts.find(p => p.type === 'hour')?.value ?? '0'

  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  // ⚠️ hour12:false מחזיר 24 בחצות בחלק מהסביבות — ממופה ל-0.
  const hour = Number(hourRaw) % 24

  return { weekday: WD[wdName] ?? 0, hour }
}

export interface PickupStatus {
  /** האם ניתן לבחור איסוף עצמי כרגע. */
  available: boolean
  /** מה להציג ללקוח. */
  message: string
}

/**
 * האם האיסוף העצמי פתוח כרגע, ומה לכתוב ללקוח.
 *
 * 🔴 הסגירה היא *מהרגע הזה והלאה* באותו יום: ביום שני מ-18:00 ועד סוף
 * היום אין איסוף. אינה נמשכת לימים הבאים — ביום שלישי האיסוף חוזר.
 *
 * ⚠️ הכלל נבדק גם בשרת (validateCheckout) ולא רק כאן: לקוח שהשאיר
 * לשונית פתוחה מלפני הסגירה היה שולח הזמנת איסוף שעתיים אחרי שנסגר.
 */
export function pickupStatus(cfg: PickupConfig, now: Date): PickupStatus {
  if (!cfg.enabled) {
    return { available: false, message: 'איסוף עצמי אינו זמין כרגע' }
  }

  const { weekday, hour } = israelParts(now)

  if (cfg.closes_weekday !== null && weekday === cfg.closes_weekday && hour >= cfg.closes_hour) {
    return {
      available: false,
      message: `האיסוף העצמי סגור מ${hebrewDay(cfg.closes_weekday)} בשעה ${cfg.closes_hour}:00`,
    }
  }

  return {
    available: true,
    message: `הספרים יהיו מוכנים לאיסוף ${cfg.ready_hours} שעות לאחר ההזמנה`,
  }
}

/** שם היום בעברית, בצורה שמשתלבת במשפט ("משני בשעה 18:00"). */
export function hebrewDay(weekday: number): string {
  const NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
  return NAMES[weekday] ?? '';
}
