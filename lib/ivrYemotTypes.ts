// ─────────────────────────────────────────────────────────────────────────────
// כל סוגי השלוחות של ימות — כרשימה נבחרת בעברית.
//
// 🔴 המנהל אינו אמור לחפש פקודות בפורום של ימות כדי להגדיר תא קולי.
// כאן כל סוג מקבל שם עברי, הסבר, והפקודה נבנית מאליה.
//
// ⚠️ הסוגים כאן מגיעים לימות דרך go_to_folder אל שלוחה שמוגדרת שם
// בסוג המתאים. זה *לא* אותו דבר כמו לבנות את הסוג אצלנו: ימות היא
// שמריצה אותו, ואנחנו רק שולחים אליה את המתקשר.
//
// 🔴 ההבחנה הזו חשובה ואסור להסתיר אותה מהמנהל: שלוחה שאינה קיימת
// בצד של ימות תשמיע שקט. לכן כל סוג כאן אומר במפורש מה צריך להגדיר
// שם, ו-setupHint מוצג במסך ליד השדה.
//
// ⚠️ מקור: התיעוד הרשמי של ימות (f2.freeivr.co.il/topic/78, topic/17278).
// ערכי ה-type הם כפי שהם מופיעים שם.
// ─────────────────────────────────────────────────────────────────────────────

export interface YemotTypeDef {
  /** ערך ה-type בימות. */
  key: string
  /** השם בעברית — מה שהמנהל בוחר מהרשימה. */
  label: string
  /** מה זה עושה, במשפט. */
  what: string
  /**
   * מה להגדיר בצד של ימות.
   *
   * 🔴 חובה: בלי ההגדרה שם השלוחה תשמיע שקט, וזו תקלה שקשה לאבחן.
   */
  setupHint: string
  /** קטגוריה — לקיבוץ ברשימה. */
  group: 'שירות' | 'מידע' | 'תוכן' | 'ניהול'
}

/**
 * הסוגים שנבחרו.
 *
 * ⚠️ אינם *כל* מה שימות מציעה (יש שם 80+, כולל מכירות, טריוויה,
 * חלוקת תהילים ושערי מט"ח). נבחרו אלה שיש להם שימוש אמיתי בארגון
 * כמו זה; רשימה של 80 פריטים אינה ניתנת לסריקה, ורובה רעש.
 *
 * ⚠️ לכל סוג אחר יש את "פקודה חופשית" — ראו lib/ivrRawCommand.
 */
export const YEMOT_TYPES: YemotTypeDef[] = [
  // ── שירות למתקשר ──
  {
    key: 'voicemail_email', label: 'תא קולי (עם עותק למייל)', group: 'שירות',
    what: 'המתקשר משאיר הודעה, וההקלטה נשלחת גם לכתובת מייל.',
    setupHint: 'בימות: שלוחה מסוג voicemail_email, ובה כתובת המייל לקבלת ההודעות.',
  },
  {
    key: 'voice_mail', label: 'תא קולי', group: 'שירות',
    what: 'המתקשר משאיר הודעה. ההקלטה נשמרת בימות.',
    setupHint: 'בימות: שלוחה מסוג voice_mail.',
  },
  {
    key: 'access_filter', label: 'פילטר לפי שעות ותאריכים', group: 'שירות',
    what: 'חוסם או מאפשר כניסה לפי שעה ותאריך — למשל מוקד שסגור בלילה.',
    setupHint: 'בימות: שלוחה מסוג access_filter, ובה טווחי השעות והתאריכים המותרים.',
  },
  {
    key: 'send_fax', label: 'שליחת פקס', group: 'שירות',
    what: 'שולח מסמך בפקס למספר שהמתקשר מקיש.',
    setupHint: 'בימות: שלוחה מסוג send_fax, ובה הקובץ לשליחה.',
  },
  {
    key: 'template_add_number', label: 'הרשמה לרשימת תפוצה', group: 'שירות',
    what: 'מוסיף את מספר המתקשר לרשימת תפוצה להודעות.',
    setupHint: 'בימות: שלוחה מסוג template_add_number, ובה שם רשימת התפוצה.',
  },
  {
    key: 'template_remove_number', label: 'הסרה מרשימת תפוצה', group: 'שירות',
    what: 'מסיר את מספר המתקשר מרשימת התפוצה.',
    setupHint: 'בימות: שלוחה מסוג template_remove_number, ובה שם רשימת התפוצה.',
  },

  // ── מידע ──
  {
    key: 'zmanim', label: 'זמני היום בהלכה', group: 'מידע',
    what: 'מקריא זמני היום — נץ, שקיעה, זמני תפילה.',
    setupHint: 'בימות: שלוחה מסוג zmanim, ובה יישוב ברירת המחדל.',
  },
  {
    key: 'say_hour_and_minute', label: 'השעה כעת', group: 'מידע',
    what: 'מקריא את השעה הנוכחית.',
    setupHint: 'בימות: שלוחה מסוג say_hour_and_minute.',
  },
  {
    key: 'exchange_rates', label: 'שערי מטבע', group: 'מידע',
    what: 'מקריא שערי מטבע עדכניים.',
    setupHint: 'בימות: שלוחה מסוג exchange_rates.',
  },

  // ── תוכן ──
  {
    key: 'playfile', label: 'השמעת קבצים', group: 'תוכן',
    what: 'משמיע קובץ או תיקיית קבצים שהועלו לימות.',
    setupHint: 'בימות: שלוחה מסוג playfile, ובה הקבצים להשמעה.',
  },
  {
    key: 'folder_play_random', label: 'השמעה אקראית', group: 'תוכן',
    what: 'משמיע קובץ אקראי מתוך תיקייה.',
    setupHint: 'בימות: שלוחה מסוג folder_play_random, ובה התיקייה.',
  },
  {
    key: 'last_play', label: 'האזנה אחרונה', group: 'תוכן',
    what: 'ממשיך מהמקום שבו המתקשר עצר בפעם הקודמת.',
    setupHint: 'בימות: שלוחה מסוג last_play.',
  },
  {
    key: 'confbridge', label: 'ועידה או שידור חי', group: 'תוכן',
    what: 'חדר ועידה משותף, או האזנה לשידור חי.',
    setupHint: 'בימות: שלוחה מסוג confbridge, ובה הגדרות החדר.',
  },

  // ── ניהול ──
  {
    key: 'admin_login', label: 'כניסה לניהול', group: 'ניהול',
    what: 'כניסת מנהל למערכת הטלפונית באמצעות סיסמה.',
    setupHint: 'בימות: שלוחה מסוג admin_login.',
  },
  {
    key: 'time_keeper', label: 'שמירת סדרים', group: 'ניהול',
    what: 'רישום נוכחות והקדשת זמן לימוד.',
    setupHint: 'בימות: שלוחה מסוג time_keeper.',
  },
]

const BY_KEY = new Map(YEMOT_TYPES.map(t => [t.key, t]))

export const yemotTypeByKey = (key: string): YemotTypeDef | null =>
  BY_KEY.get(String(key ?? '').trim()) ?? null

/** הקבוצות בסדר התצוגה. ⚠️ נגזר מהרשימה — קבוצה חדשה מופיעה מאליה. */
export function yemotTypeGroups(): { group: string; types: YemotTypeDef[] }[] {
  const out: { group: string; types: YemotTypeDef[] }[] = []
  for (const t of YEMOT_TYPES) {
    const g = out.find(x => x.group === t.group)
    if (g) g.types.push(t)
    else out.push({ group: t.group, types: [t] })
  }
  return out
}
