// ─────────────────────────────────────────────────────────────────────────────
// כל סוגי השלוחות של ימות — כרשימה נבחרת בעברית.
//
// 🔴 המנהל אינו אמור לחפש פקודות בפורום של ימות כדי להגדיר תא קולי.
// כאן כל סוג מקבל שם עברי, הסבר, והפקודה נבנית מאליה.
//
// 🔴 השלוחה נוצרת בימות **אוטומטית** בשמירה: אנחנו מעלים ext.ini
// דרך UploadFile (ראו lib/yemotExtIni). המנהל אינו נוגע בימות כלל —
// אחרת לא הרווחנו דבר מהמסך הזה.
//
// ⚠️ ימות עדיין היא שמריצה את הסוג בזמן השיחה; אנחנו רק יוצרים את
// השלוחה ושולחים אליה את המתקשר ב-go_to_folder.
//
// ⚠️ לכל סוג פרמטרים משלו — fields. שם פרמטר שגוי נכתב לקובץ, ימות
// מתעלמת ממנו, והשלוחה עובדת חלקית בלי שום שגיאה.
//
// ⚠️ מקור: התיעוד הרשמי של ימות (f2.freeivr.co.il/topic/78, topic/17278).
// ערכי ה-type הם כפי שהם מופיעים שם.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * שדה הגדרה של סוג שלוחה.
 *
 * 🔴 לכל סוג בימות יש פרמטרים משלו. בלי השדות האלה המנהל בוחר
 * "תא קולי" ואין לו איך לומר לאן יישלח המייל.
 *
 * ⚠️ `key` הוא שם הפרמטר ב-ext.ini של ימות ואינו שרירותי — שם שגוי
 * נכתב לקובץ, ימות מתעלמת ממנו, והשלוחה עובדת חלקית בלי שום שגיאה.
 */
export interface YemotTypeField {
  /** שם הפרמטר ב-ext.ini. */
  key: string
  /** התווית בעברית. */
  label: string
  /** סוג הקלט. */
  // ⚠️ 'template' = רשימת תפוצה/צינתוקים בימות. הוא אינו טקסט חופשי
  // במכוון: שם שאינו קיים בימות אינו נכשל — הוא נכתב לקובץ, ימות אינה
  // מוצאת רשימה בשם הזה, והשלוחה פשוט לא רושמת איש. הממשק מציג בורר
  // של הרשימות הקיימות (ראו api/admin/yemot-templates/lists).
  kind: 'text' | 'number' | 'email' | 'time' | 'select' | 'template'
  /** לאפשרויות סגורות (kind='select'). */
  options?: { value: string; label: string }[]
  /** הסבר קצר מתחת לשדה. */
  hint?: string
  /** 🔴 חובה — שמירה תיחסם בלעדיו. */
  required?: boolean
  placeholder?: string
}

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
  /**
   * הפרמטרים של הסוג.
   *
   * ⚠️ ריק = הסוג עובד בלי הגדרות נוספות (למשל "השעה כעת").
   */
  fields?: YemotTypeField[]
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
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם כתובת המייל שתזין.',
    fields: [
      { key: 'email', label: 'כתובת המייל לקבלת ההודעות', kind: 'email',
        required: true, placeholder: 'office@example.co.il',
        hint: 'לכאן תישלח כל הודעה שיושארו בתא הקולי.' },
      { key: 'max_seconds', label: 'אורך הקלטה מרבי (שניות)', kind: 'number',
        placeholder: '120', hint: 'ריק = ברירת המחדל של ימות.' },
    ]
  },
  {
    key: 'voice_mail', label: 'תא קולי', group: 'שירות',
    what: 'המתקשר משאיר הודעה. ההקלטה נשמרת בימות.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית.',
    fields: [
      { key: 'max_seconds', label: 'אורך הקלטה מרבי (שניות)', kind: 'number',
        placeholder: '120', hint: 'ריק = ברירת המחדל של ימות.' },
    ]
  },
  {
    key: 'access_filter', label: 'פילטר לפי שעות ותאריכים', group: 'שירות',
    what: 'חוסם או מאפשר כניסה לפי שעה ותאריך — למשל מוקד שסגור בלילה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם טווח השעות שתגדיר.',
    fields: [
      { key: 'start_time', label: 'פתוח משעה', kind: 'time', required: true,
        placeholder: '08:00' },
      { key: 'end_time', label: 'פתוח עד שעה', kind: 'time', required: true,
        placeholder: '20:00',
        hint: 'מחוץ לטווח המתקשר ישמע את ההודעה שהגדרת למעלה.' },
      { key: 'days', label: 'ימים', kind: 'select', options: [
        { value: '1234567', label: 'כל השבוע' },
        { value: '123456', label: 'ראשון עד שישי' },
        { value: '12345', label: 'ראשון עד חמישי' },
      ], hint: 'ריק = כל השבוע.' },
    ]
  },
  {
    key: 'send_fax', label: 'שליחת פקס', group: 'שירות',
    what: 'שולח מסמך בפקס למספר שהמתקשר מקיש.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית. את הקובץ לשליחה יש להעלות בימות.',
    fields: [
      { key: 'file', label: 'שם הקובץ לשליחה', kind: 'text',
        placeholder: 'doc.pdf', hint: 'הקובץ חייב להיות מועלה בימות.' },
    ]
  },
  {
    key: 'template_add_number', label: 'הרשמה לרשימת תפוצה', group: 'שירות',
    what: 'מוסיף את מספר המתקשר לרשימת תפוצה להודעות.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם רשימת התפוצה שתציין.',
    fields: [
      { key: 'template', label: 'שם רשימת התפוצה', kind: 'template', required: true,
        hint: 'כפי שהיא מוגדרת בימות.' },
    ]
  },
  {
    key: 'template_remove_number', label: 'הסרה מרשימת תפוצה', group: 'שירות',
    what: 'מסיר את מספר המתקשר מרשימת התפוצה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם רשימת התפוצה שתציין.',
    fields: [
      { key: 'template', label: 'שם רשימת התפוצה', kind: 'template', required: true,
        hint: 'כפי שהיא מוגדרת בימות.' },
    ]
  },

  {
    key: 'tzintuk', label: 'צינתוק', group: 'שירות',
    what: 'המערכת מצלצלת למתקשר ומנתקת — הוא נרשם לרשימת הצינתוקים ומקבל שיחה חוזרת.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם רשימת הצינתוקים שתציין.',
    fields: [
      { key: 'template', label: 'שם רשימת הצינתוקים', kind: 'template', required: true,
        hint: 'הרשימה שאליה נרשם המתקשר. כפי שהיא מוגדרת בימות.' },
      { key: 'action', label: 'הפעולה', kind: 'select', options: [
        { value: 'add', label: 'הוספה לרשימה' },
        { value: 'remove', label: 'הסרה מהרשימה' },
      ], hint: 'ריק = הוספה.' },
    ],
  },
  {
    key: 'missed_calls', label: 'התראה על שיחה שלא נענתה', group: 'שירות',
    what: 'שולח SMS או מייל על כל שיחה שלא נענתה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם היעד להתראות.',
    fields: [
      { key: 'email', label: 'כתובת מייל להתראות', kind: 'email',
        placeholder: 'office@example.co.il' },
      { key: 'sms', label: 'מספר לקבלת SMS', kind: 'text', placeholder: '0501234567',
        hint: 'אפשר למלא מייל, SMS, או שניהם.' },
    ],
  },
  {
    key: 'queue', label: 'תור המתנה', group: 'שירות',
    what: 'המתקשרים ממתינים בתור עד שנציג מתפנה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם מספרי הנציגים.',
    fields: [
      { key: 'phones', label: 'מספרי הנציגים', kind: 'text', required: true,
        placeholder: '0501234567,0507654321',
        hint: 'מופרדים בפסיק. השיחה תעבור לראשון שפנוי.' },
      { key: 'max_wait', label: 'זמן המתנה מרבי (שניות)', kind: 'number', placeholder: '300' },
    ],
  },
  {
    key: 'routing', label: 'ניתוב למספר טלפון', group: 'שירות',
    what: 'מעביר את השיחה למספר טלפון ישראלי.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם המספר שתזין.',
    fields: [
      { key: 'phone', label: 'מספר הטלפון', kind: 'text', required: true,
        placeholder: '0501234567' },
    ],
  },
  {
    key: 'sip', label: 'חשבון SIP', group: 'שירות',
    what: 'מאפשר חיבור מכשיר או תוכנת SIP למערכת.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית.',
  },

  // ── מידע ──
  {
    key: 'zmanim', label: 'זמני היום בהלכה', group: 'מידע',
    what: 'מקריא זמני היום — נץ, שקיעה, זמני תפילה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם היישוב שתבחר.',
    fields: [
      { key: 'city', label: 'יישוב', kind: 'select', required: true, options: [
        { value: 'jerusalem', label: 'ירושלים' },
        { value: 'bneibrak', label: 'בני ברק' },
        { value: 'beitshemesh', label: 'בית שמש' },
        { value: 'ashdod', label: 'אשדוד' },
        { value: 'haifa', label: 'חיפה' },
        { value: 'telaviv', label: 'תל אביב' },
      ], hint: 'הזמנים מחושבים לפי היישוב שנבחר.' },
    ]
  },
  {
    key: 'say_hour_and_minute', label: 'השעה כעת', group: 'מידע',
    what: 'מקריא את השעה הנוכחית.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית. אין הגדרות נוספות.',
  },
  {
    key: 'exchange_rates', label: 'שערי מטבע', group: 'מידע',
    what: 'מקריא שערי מטבע עדכניים.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית.',
  },

  // ── תוכן ──
  {
    key: 'playfile', label: 'השמעת קבצים', group: 'תוכן',
    what: 'משמיע קובץ או תיקיית קבצים שהועלו לימות.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית. את הקבצים יש להעלות בימות.',
    fields: [
      { key: 'folder', label: 'תיקיית הקבצים בימות', kind: 'text',
        placeholder: 'ivr2:/9', hint: 'התיקייה שבה נמצאים הקבצים להשמעה.' },
    ]
  },
  {
    key: 'folder_play_random', label: 'השמעה אקראית', group: 'תוכן',
    what: 'משמיע קובץ אקראי מתוך תיקייה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית. את הקבצים יש להעלות בימות.',
    fields: [
      { key: 'folder', label: 'תיקיית הקבצים בימות', kind: 'text',
        placeholder: 'ivr2:/9', hint: 'ייבחר קובץ אקראי מתוכה.' },
    ]
  },
  {
    key: 'last_play', label: 'האזנה אחרונה', group: 'תוכן',
    what: 'ממשיך מהמקום שבו המתקשר עצר בפעם הקודמת.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית.',
  },
  {
    key: 'confbridge', label: 'ועידה או שידור חי', group: 'תוכן',
    what: 'חדר ועידה משותף, או האזנה לשידור חי.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית.',
    fields: [
      { key: 'room', label: 'מספר החדר', kind: 'text', required: true,
        placeholder: '1', hint: 'כל המתקשרים לאותו מספר חדר שומעים זה את זה.' },
      { key: 'listen_only', label: 'מצב', kind: 'select', options: [
        { value: '', label: 'ועידה — כולם מדברים' },
        { value: 'yes', label: 'שידור חי — האזנה בלבד' },
      ] },
    ]
  },

  // ── ניהול ──
  {
    key: 'admin_login', label: 'כניסה לניהול', group: 'ניהול',
    what: 'כניסת מנהל למערכת הטלפונית באמצעות סיסמה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית.',
    fields: [
      { key: 'password', label: 'סיסמת הכניסה', kind: 'text', required: true,
        hint: '🔴 מי שיודע אותה יכול לשנות את כל המערכת הטלפונית.' },
    ]
  },
  {
    key: 'donation_campaign', label: 'קמפיין התרמה', group: 'ניהול',
    what: 'קבלת תרומות בטלפון, כולל חיוב אשראי.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית. חשבון הסליקה מוגדר בימות.',
    fields: [
      { key: 'campaign', label: 'שם הקמפיין', kind: 'text', required: true },
    ],
  },
  {
    key: 'examination', label: 'מבחן', group: 'ניהול',
    what: 'מבחן טלפוני עם שאלות ותשובות בהקשה.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית. את השאלות יש להגדיר בימות.',
  },
  {
    key: 'api', label: 'שלוחת API (למערכת חיצונית)', group: 'ניהול',
    what: 'מעביר את השיחה לשרת חיצוני — כמו השלוחות של החגים והיולדות.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית עם הכתובת שתזין.',
    fields: [
      { key: 'api_url', label: 'כתובת ה-API', kind: 'text', required: true,
        placeholder: 'https://chasamsofer.co.il/api/webhooks/yemot',
        hint: '🔴 רק אם אתה יודע בדיוק מה אתה עושה — כתובת שגויה משתיקה את השלוחה.' },
    ],
  },
  {
    key: 'time_keeper', label: 'שמירת סדרים', group: 'ניהול',
    what: 'רישום נוכחות והקדשת זמן לימוד.',
    setupHint: 'השלוחה תיווצר בימות אוטומטית.',
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
