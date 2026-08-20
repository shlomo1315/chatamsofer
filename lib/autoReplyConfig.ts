import type { SupabaseClient } from '@supabase/supabase-js'
import { DEPARTMENTS, type DepartmentKey } from './departments'
import { escapeHtml } from './emailTemplates'

// ─────────────────────────────────────────────────────────────────────────────
// מענה אוטומטי — מנגנון אחד לכל התיבות.
//
// עד כה רצו כאן חמישה מנגנונים נפרדים: ארבעה מענים ייעודיים מקודדים-קשיח
// בתוך ה-webhook (yerid, inbox8, gemach, igud) ומענה גנרי אחד עם מסך הגדרות
// משלו. הם לא ידעו זה על זה, ומכאן נולד באג שבו שני מענים רצו על אותו מייל
// והגנרי אכל את מכסת המענים של הייעודי.
//
// ⚠️ התפיסה שהמנגנון הזה מממש: תיבות המייל הן *נקודות כניסה*, לא כלי עבודה.
// הפונה מקבל אישור קבלה והפניה לאגף הנכון — לא טפסים ולא נתונים אישיים.
// לכן המענה נבנה מהגדרות בלבד: אין שאילתות למאגר המוטבים, ואין תלות במי
// שולח. זו גם הסיבה ששער הבעלות שהיה ב-igud (ת"ז בנושא אינה הוכחת זהות)
// אינו נחוץ עוד — מייל שאינו מכיל נתונים אישיים אינו יכול לדלוף.
//
// ⚠️ שלוש ההגנות מפני לולאת מיילים נשארות ב-maintenanceReply ומשמשות כאן
// כמות שהן. הן מונעות לולאה, ואינן קשורות לתוכן המענה.
// ─────────────────────────────────────────────────────────────────────────────

export const AUTO_REPLY_KEY = 'auto_reply_config'

/**
 * קישורי הגשה מוכנים לבורר שבמסך ההגדרות.
 *
 * ⚠️ הנושא הוא מה שקובע: ה-webhook מזהה את סוג הבקשה לפי תחילת שורת
 * הנושא (detectReqType ב-emailRequestForms). שינוי הניסוח כאן מנתק את
 * הזיהוי — הבקשה תגיע לתיבה ולא תיקלט כבקשה.
 *
 * ⚠️ בלי ת"ז בנושא, בשונה מ-draftMailto: המענה האוטומטי נשלח גם למי
 * שאיננו מזהים, ואין ממה לגזור אותה. הגוף מנחה את הפונה להוסיף אותה.
 */
export const REQUEST_MAILTO_PRESETS: {
  label: string; subject: string; hint: string
  /** סוג הבקשה — הכפתור מפנה ל-/api/request-draft שבונה טיוטה עם כל השדות. */
  type: string
  /** תיבת האגף — כשקיימת, די בת"ז בנושא (ראו MAILBOX_REQUEST_TYPE). */
  mailbox?: string
}[] = [
  { label: 'להגשת בקשה לימי החלמה ומזון מוכן לאחר לידה', type: 'birth', subject: 'בקשת לידה', hint: 'עזר יולדות · y@', mailbox: 'y@chasamsofer.info' },
  { label: 'להגשת בקשת הלוואה (גמ״ח)', type: 'loan', subject: 'בקשת הלוואה', hint: 'גמ"ח · g@', mailbox: 'g@chasamsofer.info' },
  { label: 'להגשת בקשת סיוע רפואי', type: 'financial_aid', subject: 'בקשת סיוע רפואי', hint: 'סיוע רפואי · r@', mailbox: 'r@chasamsofer.info' },
  { label: 'להגשת בקשת סיוע לאלמנה', type: 'widow', subject: 'בקשת סיוע אלמנה', hint: 'אלמנות ויתומים · a@', mailbox: 'a@chasamsofer.info' },
  // ⚠️ לידה שקטה אין לה תיבה ייעודית — הנושא הוא שמבחין בינה לבין לידה
  // רגילה, ולכן היא נשלחת לאיגוד עם נושא מלא.
  { label: 'להגשת בקשה להחלמה ומזון לאחר לידה שקטה', type: 'silent_birth', subject: 'בקשת לידה שקטה', hint: 'עזר יולדות · דרך איגוד' },
]

/**
 * בונה קישור mailto להגשת בקשה — נושא מזוהה + הנחיה חדה בגוף.
 *
 * 🔴 סוג הבקשה *חייב* להישאר בשורת הנושא: detectReqType מזהה לפיו, ובלעדיו
 * הפנייה מגיעה לתיבה כמייל רגיל ואינה נקלטת כבקשה. לכן ההנחיה היא להחליף
 * את הסוגריים בת"ז — לא למחוק את השורה כולה.
 *
 * ⚠️ הסוגריים המרובעים הם מציין-מקום גלוי: שדה ריק אחרי "ת.ז" נשלח כפי
 * שהוא בלי שהפונה בכלל שם לב שחסר בו משהו.
 */
/**
 * קישור פתיחת חלון כתיבה — דרך Gmail ולא דרך mailto:.
 *
 * 🔴 Gmail חוסם mailto: שנלחץ מתוך גוף הודעה, והתוצאה היא **דף לבן**.
 * זו אינה תקלה נדירה: כל הקהל שלנו קורא את המייל בתוך Gmail.
 *
 * ⚠️ התוקן פעם אחת ידנית ב-CMS, אבל המחולל כאן המשיך לייצר mailto:
 * ולכן הבאג חזר בכל נוסח חדש. התיקון חייב לשבת במקור.
 */
function gmailComposeUrl(to: string, subject: string, body: string): string {
  // ⚠️ נושא/גוף ריקים אינם נשלחים כלל: su= ו-body= ריקים מופיעים למשתמש
  // כשדות שהוגדרו במפורש כריקים, וזה שונה מלא-להגדיר-אותם.
  const p = new URLSearchParams({ view: 'cm', fs: '1', to })
  if (subject) p.set('su', subject)
  if (body) p.set('body', body)
  return `https://mail.google.com/mail/u/0/?${p.toString()}`
}

// ⚠️ הייתה כאן mailtoToGmail שהמירה כל mailto: לקישור Gmail. היא הוסרה:
// Gmail עוטף https בגוף הודעה ב-google.com/url?q= והעטיפה שוברת את הטיוטה,
// ולכן mailto: חייב להישמר כפי שהוא. אין להחזיר את ההמרה — ראו הטסטים
// "mailto נשמר כפי שהוא" ב-autoReplyConfig.test.ts.

export function requestMailtoUrl(subject: string, mailbox?: string): string {
  // ── הגשה לתיבת האגף: ת"ז בלבד בנושא ──
  //
  // ⚠️ התיבה כבר אומרת את סוג הבקשה, ולכן שורת הנושא נקייה לגמרי. זה
  // המסלול המועדף — אין ניסוח שהפונה עלול לשבור.
  if (mailbox) {
    // 🔴 שורת הנושא נשארת **ריקה**.
    //
    // ⚠️ קודם היה בה מציין-מקום בסוגריים ("[הקלידו כאן ת.ז…]"). התוצאה:
    // מי שלא מחק אותו במדויק שלח נושא שאינו ת"ז, והבקשה לא נקלטה — אבל
    // המייל כן נשלח, כך שהמשפחה בטוחה שהגישה. שדה ריק אינו יכול להישלח
    // בטעות: Gmail מציג "נושא" באפור והמשתמש חייב להקליד.
    //
    // ⚠️ ההוראה קצרה ובראש הגוף. ההסבר הארוך שהיה כאן דחק את שדות
    // המילוי מתחת לקפל, והמשפחה ראתה קיר טקסט במקום טופס.
    const body =
      `נא להקליד בשורת הנושא למעלה 9 ספרות תעודת זהות בלבד.\n` +
      `──────────────────────────\n\n` +
      `שם מלא: \n` +
      `מספר זהות: \n` +
      `טלפון: \n\n` +
      `יש לצרף להודעה את המסמכים הנדרשים.`
    return gmailComposeUrl(mailbox, '', body)
  }

  // ── נפילה-לאחור: הגשה לאיגוד, שם הנושא הוא שקובע את הסוג ──
  // ⚠️ כאן הנושא *חייב* להכיל את סוג הבקשה — detectReqType מזהה לפיו,
  // ולכן אי אפשר להשאירו ריק כמו במסלול התיבה. מה שכן: הסוגריים הוסרו
  // והנושא נגמר ב-"ת.ז " פתוח, כך שהסמן ממשיך ישירות למספר ואין מה
  // למחוק. מציין-מקום בסוגריים נשלח כפי שהוא אצל מי שלא הבין שצריך
  // למחוק אותו, והבקשה לא נקלטה — בעוד המייל כן נשלח.
  const body =
    `נא להשלים בשורת הנושא למעלה 9 ספרות תעודת זהות, בסוף השורה.\n` +
    `אין לשנות את שאר שורת הנושא.\n` +
    `──────────────────────────\n\n` +
    `שם מלא: \n` +
    `מספר זהות: \n` +
    `טלפון: \n\n` +
    `יש לצרף להודעה את המסמכים הנדרשים.`
  const subj = `${subject} · ת.ז `
  return gmailComposeUrl('igud@chasamsofer.info', subj, body)
}

export const MAX_BUTTONS = 8
/** מספר הסעיפים המרבי — מייל המפרט את אגפי הארגון הוא ארוך מטבעו. */
export const MAX_SECTIONS = 20
const MAX_MESSAGE_LEN = 4000
const MAX_LABEL_LEN = 120
const MAX_TITLE_LEN = 160
const MAX_TEXT_LEN = 1200
// 🔴 12,000 ולא 2,000: קישורי ההגשה האמיתיים גדולים בהרבה ממה שנראה.
//
// טופס ההלוואה המלא — הוראות, חמישה שדות ורשימת ארבעה צירופים — הוא
// כ-2,900 תווים אחרי קידוד URL (עברית תופחת פי 5.5). בתקרה של 2,000
// הוא נדחה במלואו, כלומר הכפתור נעלם מהמסך אחרי שמירה.
//
// ⚠️ הערך נגזר מהקישור הארוך ביותר שהמערכת מייצרת בפועל ולא ממגבלת
// דפדפן: הקישור נפתח בתוכנת המייל של הפונה, לא בשורת כתובת.
//
// ⚠️ התקרה עדיין נחוצה — היא שמונעת כתיבת ערך פגום למסד — אבל חייבת
// להיות מעל מה שהמערכת עצמה מייצרת, אחרת היא מוחקת תוכן תקין.
const MAX_URL_LEN = 12000
const DEFAULT_WEEKLY_CAP = 10
const MIN_WEEKLY_CAP = 1
const MAX_WEEKLY_CAP = 100

export interface AutoReplyButton {
  label: string
  url: string
}

/**
 * סעיף במייל — כותרת, תיאור, וקישורים.
 *
 * ⚠️ נדרש בגלל מייל המשרד הראשי: הוא אינו "טקסט + כפתור" אלא רשימת אגפים,
 * שלכל אחד כותרת, הסבר, וכתובת/קישור משלו. מבנה שטוח היה מאלץ לדחוס את
 * הכל לטקסט אחד ולאבד את ההיררכיה.
 */
export interface AutoReplySection {
  title: string
  text: string
  buttons: AutoReplyButton[]
}

/**
 * מצב המענה של התיבה.
 *
 * 🔴 `temp` קיים כדי שאפשר יהיה להפעיל תיבה *לפני* שהנוסח המלא מוכן.
 * בלעדיו היו רק שתי אפשרויות: להשאיר את התיבה שותקת עד שכל הסעיפים
 * והכפתורים נכתבו, או לפרסם נוסח חלקי ולערוך אותו על אנשים חיים. שתיהן
 * גרועות — הראשונה משאירה פונים בלי אישור קבלה, השנייה שולחת להם מייל
 * שיודעים שאינו נכון.
 *
 * ⚠️ שני הנוסחים נשמרים במקביל תמיד, וזו כל הנקודה: המעבר בין זמני
 * למלא הוא החלפת מצב, לא כתיבה מחדש. הנוסח המלא נבנה ברקע בלי לגעת
 * במה שיוצא בפועל, והזמני נשאר שמור אחרי המעבר — למקרה הבא.
 */
export type AutoReplyMode = 'off' | 'temp' | 'full'

/**
 * ברירות המחדל לטקסטים הניתנים לעריכה פר-תיבה.
 *
 * ⚠️ שדה ריק בהגדרות נופל לכאן במקום להישמר משוכפל ב-11 התיבות. כך שינוי
 * הנוסח הכללי נעשה במקום אחד, ותיבה ששינתה במפורש שומרת על השינוי שלה.
 */
export const AUTO_REPLY_DEFAULT_TITLE = 'ברוכים הבאים'
export const AUTO_REPLY_DEFAULT_NO_REPLY =
  'מייל זה נשלח ממערכת אוטומטית — אין להשיב עליו\n'
  + 'הודעות הנשלחות לכתובת זו אינן נקראות. במידת הצורך ניתן לפנות לכל אגף בנפרד.'

export interface AutoReplySettings {
  /**
   * ⚠️ נשאר כמקור האמת ל"האם התיבה עונה בכלל", ואינו נגזר מ-mode בזמן
   * קריאה: הגדרות שנשמרו לפני שהמצבים נוספו אינן מכילות `mode`, והפיכת
   * `enabled` לשדה נגזר הייתה משתיקה כל תיבה פעילה ברגע הפריסה.
   */
  enabled: boolean
  /**
   * איזה נוסח יוצא בפועל כשהתיבה פעילה.
   * ⚠️ 'off' כאן שקול ל-enabled=false — שניהם נשמרים כדי שכיבוי לא ימחק
   * את הידיעה איזה נוסח היה פעיל, והדלקה מחדש תחזיר אותו.
   */
  mode: AutoReplyMode
  /** נושא ההודעה הזמנית. */
  tempSubject: string
  /**
   * גוף ההודעה הזמנית — טקסט בלבד.
   *
   * ⚠️ בלי סעיפים וכפתורים במכוון: ההודעה הזמנית היא "קיבלנו, נחזור
   * אליכם". כל המידע המפורט — ההפניות לאגפים והקישורים — שייך לנוסח
   * המלא, ושכפול המבנה כאן היה יוצר שני מקומות לתחזק את אותו מידע.
   */
  tempMessage: string
  subject: string
  /** פסקת פתיחה — לפני הסעיפים. */
  message: string
  /** כפתורים כלליים — מתחת לפסקת הפתיחה, לפני הסעיפים. */
  buttons: AutoReplyButton[]
  /** סעיפי המייל — כל אגף/נושא בנפרד. */
  sections: AutoReplySection[]
  /** הערת סיום — מתחת לסעיפים (למשל "בכתובת זו לא יינתן מענה בנושאים דלעיל"). */
  footnote: string
  /**
   * כותרת המייל — הכיתוב הגדול בראש ההודעה.
   *
   * ⚠️ ריק = ברירת המחדל שבקוד (AUTO_REPLY_DEFAULT_TITLE). כך תיבה שלא
   * נגעו בה ממשיכה להציג את הנוסח הרגיל, ואין צורך למלא אותו ידנית
   * בכל אחת מ-11 התיבות רק כדי לשמור על המצב הקיים.
   */
  title?: string
  /**
   * הודעת "אין להשיב" בתחתית המייל — הבלוק האדום.
   *
   * ⚠️ ריק = ברירת המחדל. תיבה שכן קוראת את התשובות יכולה לרוקן אותו
   * (מחרוזת של רווח) ואז הבלוק לא יוצג כלל — קודם הוא הוצג תמיד, גם
   * בתיבות שבהן ההודעה פשוט אינה נכונה.
   */
  noReplyNotice?: string
  /** מכסת מענים שבועית לאותו שולח — הבולם האחרון מפני לולאה. */
  weeklyCap: number
}

/**
 * הנוסח שיוצא בפועל — מכריע בין הזמני למלא לפי המצב.
 *
 * 🔴 נקודת ההכרעה היחידה. השולח, התצוגה המקדימה ובדיקת "הנוסח ריק"
 * חייבים לשאול אותה ולא להסיק בעצמם — ברגע ששניים מהם מחליטים בנפרד,
 * המנהל רואה בתצוגה המקדימה נוסח אחד ופונה מקבל אחר.
 *
 * ⚠️ נופל לנוסח המלא כשההודעה הזמנית ריקה: מצב 'temp' בלי טקסט הוא
 * הגדרה חצי-גמורה, ושליחת מייל ריק גרועה משליחת הנוסח המלא.
 */
export function activeReplyContent(s: AutoReplySettings): {
  subject: string; message: string; buttons: AutoReplyButton[]
  sections: AutoReplySection[]; footnote: string; isTemp: boolean
  noReplyNotice?: string
} {
  if (s.mode === 'temp' && s.tempMessage.trim()) {
    return {
      subject: s.tempSubject.trim() || s.subject,
      message: s.tempMessage,
      buttons: [], sections: [], footnote: '',
      // ⚠️ עובר גם לנוסח הזמני: הכפתורים והסעיפים אמנם יורדים בו, אבל
      // "אין להשיב" הוא מאפיין של *התיבה* ולא של הנוסח. תיבה שבה כן
      // קוראים תשובות הייתה מציגה את הבלוק האדום ברגע המעבר לזמני.
      noReplyNotice: s.noReplyNotice,
      isTemp: true,
    }
  }
  return {
    subject: s.subject, message: s.message, buttons: s.buttons,
    sections: s.sections, footnote: s.footnote,
    noReplyNotice: s.noReplyNotice, isTemp: false,
  }
}

export type AutoReplyMap = Partial<Record<DepartmentKey, AutoReplySettings>>

/**
 * ניקוי כתובות הכפתורים.
 *
 * 🔴 https ו-mailto בלבד. javascript: ו-data: אינם מסוכנים בלקוח מייל, אבל
 * התצוגה המקדימה במסך ההגדרות מרנדרת בדיוק את אותו HTML בדפדפן של המנהל —
 * ושם הם כן מסוכנים. http רגיל נחסם כדי שלא נשלח קישור לא מוצפן.
 */
export function sanitizeButtons(input: unknown): AutoReplyButton[] {
  if (!Array.isArray(input)) return []
  const out: AutoReplyButton[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const label = String((raw as AutoReplyButton).label ?? '').trim().slice(0, MAX_LABEL_LEN)
    const url = String((raw as AutoReplyButton).url ?? '').trim()
    if (!label || !url) continue
    // 🔴 קישור ארוך מדי נדחה במלואו — ולא נחתך.
    //
    // החיתוך גזם באמצע רצף %D7%90 של עברית והותיר קידוד פגום ('…%D7'),
    // כלומר טיוטה שנפתחת עם ג'יבריש או לא נפתחת כלל. עברית תופחת פי 5.5
    // בקידוד URL, ולכן נושא עברי קצר חוצה את התקרה בקלות.
    //
    // ⚠️ חצי קישור גרוע מכפתור חסר: הפונה לוחץ ונוחת על שגיאה, במקום
    // לראות שאין כפתור ולפנות בדרך אחרת.
    if (url.length > MAX_URL_LEN) {
      // ⚠️ לוג ולא כישלון שקט: הכפתור פשוט נעלם מהמסך אחרי שמירה, וזה
      // נראה בדיוק כמו "ההגדרות לא נשמרות". בלי השורה הזו אין שום דרך
      // לדעת שזו הסיבה.
      console.warn(`[autoReplyConfig] כפתור "${label}" נדחה — הקישור באורך ${url.length} חורג מ-${MAX_URL_LEN}`)
      continue
    }
    if (!/^(https:\/\/|mailto:)/i.test(url)) continue
    // 🔴 הכתובת נשמרת **כפי שהוקלדה**. אין כאן שום המרה.
    //
    // בעבר כל mailto: הומר כאן לקישור https של Gmail. זה היה הפוך מהנדרש:
    // Gmail עוטף כל https בגוף הודעה ב-google.com/url?q=, והעטיפה שוברת את
    // הטיוטה — הפונה נוחת על דף במקום על חלון כתיבה. mailto: עצמו אינו נעטף,
    // ולכן הוא זה שחייב לשבת בכפתור.
    //
    // ⚠️ ההמרה גם דרסה בשקט את מה שהמנהל הקליד: הוא שמר mailto:, קיבל חזרה
    // קישור Gmail, והסיק שההגדרות אינן נשמרות כלל.
    out.push({ label, url })
    if (out.length >= MAX_BUTTONS) break
  }
  return out
}

/** ניקוי סעיפים — כותרת, תיאור וקישורים, כל אחד מוגבל באורך. */
export function sanitizeSections(input: unknown): AutoReplySection[] {
  if (!Array.isArray(input)) return []
  const out: AutoReplySection[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue
    const rec = raw as Record<string, unknown>
    const title = String(rec.title ?? '').trim().slice(0, MAX_TITLE_LEN)
    const text = String(rec.text ?? '').trim().slice(0, MAX_TEXT_LEN)
    const buttons = sanitizeButtons(rec.buttons)
    // סעיף בלי שום תוכן אינו נשמר
    if (!title && !text && !buttons.length) continue
    out.push({ title, text, buttons })
    if (out.length >= MAX_SECTIONS) break
  }
  return out
}

/** טקסט חופשי → HTML בטוח. מנטרל *ואז* ממיר שורות. */
function textToHtml(s: string): string {
  // ⚠️ הסדר קריטי: ניטרול לפני המרת השורות. ההפך היה מאפשר להזריק HTML
  // דרך הנוסח שנערך במסך ההגדרות.
  return escapeHtml(s.trim()).replace(/\r?\n/g, '<br/>')
}

function renderButtons(buttons: AutoReplyButton[], accent: string, small = false): string {
  if (!buttons.length) return ''
  const pad = small ? '9px 18px' : '13px 28px'
  const size = small ? '14px' : '15px'
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:${small ? '10px 0 0' : '24px 0 0'};">
      <tr><td align="${small ? 'right' : 'center'}">
        ${buttons.map(b => `
        <a href="${escapeHtml(b.url)}"
           style="display:inline-block;margin:0 0 8px 8px;padding:${pad};background:${accent};
                  color:#ffffff;font-size:${size};font-weight:700;text-decoration:none;border-radius:10px;
                  font-family:'Heebo',Arial,sans-serif;">${escapeHtml(b.label)}</a>`).join('')}
      </td></tr>
    </table>`
}

/** בונה את גוף המייל: פתיחה, כפתורים כלליים, סעיפים, והערת סיום. */
export function buildAutoReplyBody(
  settings: Pick<AutoReplySettings, 'message' | 'buttons'> & Partial<Pick<AutoReplySettings, 'sections' | 'footnote' | 'noReplyNotice'>>,
  accent: string,
): string {
  const intro = settings.message.trim()
    ? `<p style="margin:0 0 20px;color:#334155;font-size:15px;line-height:1.9;">${textToHtml(settings.message)}</p>`
    : ''

  const sections = (settings.sections ?? []).map(s => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
      <tr><td style="background:#f8fafc;border-right:4px solid ${accent};border-radius:0 12px 12px 0;padding:16px 20px;">
        ${s.title ? `<p style="margin:0 0 8px;color:#0f172a;font-size:16px;font-weight:900;line-height:1.6;">${textToHtml(s.title)}</p>` : ''}
        ${s.text ? `<p style="margin:0;color:#475569;font-size:14px;line-height:1.9;">${textToHtml(s.text)}</p>` : ''}
        ${renderButtons(s.buttons, accent, true)}
      </td></tr>
    </table>`).join('')

  const footnote = (settings.footnote ?? '').trim() ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
      <tr><td style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:14px 18px;">
        <p style="margin:0;color:#92400e;font-size:13px;line-height:1.8;">${textToHtml(settings.footnote ?? '')}</p>
      </td></tr>
    </table>` : ''

  // 🔴 ההבהרה נבנית כאן ולא מסתמכת על התוספת האוטומטית של מסלול Gmail:
  // אחרת מייל שיוצא דרך Resend היה מגיע בלי שום הבהרה, ורק נמעני Gmail
  // היו רואים אותה. אותו מייל, שתי התנהגויות.
  //
  // ⚠️ בלי כתובת מייל: ההפניות לאגפים נמצאות בסעיפים שהמנהל הגדיר, וכתובת
  // נוספת כאן סתרה אותן ("פנו לאגף X" ומיד "לפניות: office@").
  // ⚠️ ניתן לעריכה פר-תיבה (noReplyNotice). מחרוזת ריקה = ברירת המחדל;
  // רווח בלבד = הבלוק לא מוצג כלל — לתיבות שבהן כן קוראים תשובות,
  // ושבהן ההודעה הזו פשוט אינה נכונה.
  const noReplyText = settings.noReplyNotice === undefined || settings.noReplyNotice === ''
    ? AUTO_REPLY_DEFAULT_NO_REPLY
    : settings.noReplyNotice
  const noReplyLines = noReplyText.trim()
    ? noReplyText.trim().split(/\n+/)
    : []
  const noReply = noReplyLines.length ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
      <tr><td style="background:#fef2f2;border:2px solid #fecaca;border-radius:12px;padding:16px 20px;">
        <p style="margin:0 0 4px;color:#991b1b;font-size:15px;font-weight:900;line-height:1.6;text-align:center;">
          ${textToHtml(noReplyLines[0])}
        </p>
        ${noReplyLines.length > 1 ? `<p style="margin:0;color:#b91c1c;font-size:13px;line-height:1.8;text-align:center;">
          ${textToHtml(noReplyLines.slice(1).join('\n'))}
        </p>` : ''}
      </td></tr>
    </table>` : ''

  return `${intro}${renderButtons(settings.buttons, accent)}${sections ? `<div style="margin:22px 0 0;">${sections}</div>` : ''}${footnote}${noReply}`
}

/**
 * ברירות המחדל — הנוסחים שרצו בפרודקשן עד המעבר.
 *
 * 🔴 האגפים שהיה להם מענה פעיל נשארים פעילים. אילו נולדו כבויים, פונים
 * שקיבלו מענה עד אתמול היו מפסיקים לקבל — בלי שאיש יבחין, כי אלה תיבות
 * שאיש אינו קורא בהן.
 *
 * שאר התיבות נולדות כבויות עם נוסח מוכן: המנהל מדליק כשהוא רוצה.
 */
export function defaultAutoReplyMap(): AutoReplyMap {
  const generic = (label: string) =>
    `תודה על פנייתכם ל${label} של היכל החתם סופר.\n\n` +
    `הודעתכם התקבלה במערכת ותטופל בהקדם על ידי הצוות.\n\n` +
    `לפנייה בנושא ספציפי, ניתן לפנות ישירות לאגף הרלוונטי בקישורים שלהלן.`

  // ⚠️ נוסח זמני מוכן לכל תיבה, ולא שדה ריק: המצב הזמני נועד לשימוש
  // מיידי ("תפעיל בינתיים משהו"), ותיבה שנולדת עם זמני ריק מאלצת לכתוב
  // נוסח ברגע שבו רוצים רק להדליק.
  const genericTemp = (label: string) =>
    `תודה על פנייתכם ל${label} של היכל החתם סופר.\n\n` +
    `הודעתכם התקבלה במערכת ותטופל בהקדם על ידי הצוות.`

  const map: AutoReplyMap = {}
  for (const d of Object.values(DEPARTMENTS)) {
    map[d.key] = {
      enabled: false,
      mode: 'full',
      tempSubject: `פנייתכם התקבלה · ${d.label}`,
      tempMessage: genericTemp(d.label),
      subject: `פנייתכם התקבלה · ${d.label}`,
      message: generic(d.label),
      buttons: [],
      sections: [],
      footnote: '',
      weeklyCap: DEFAULT_WEEKLY_CAP,
    }
  }

  // ── המשרד הראשי — דרכי הפנייה לאגפי הארגון ──
  // ⚠️ מקומות שסומנו "---" בנוסח שנמסר הם קישורים שטרם נמסרו. סעיף בלי
  // קישור מוצג כטקסט בלבד, כדי שלא ייווצר כפתור שמוביל לשום מקום.
  map.main = {
    ...map.main!,
    enabled: true,
    subject: 'דרכי פנייה לאגפי היכל החתם סופר',
    message:
      'שלום וברכה!\n\n' +
      'להלן דרכי פנייה לאגפי "היכל החתם סופר".\n\n' +
      'שימו לב: כתובת זו היא רק לאגפי היכל החתם סופר שאינם קשורים ל"איגוד הצאצאים".\n' +
      'לפניות לאגפי "איגוד הצאצאים", פנו: igud@chasamsofer.info',
    buttons: [{ label: 'פנייה לאיגוד הצאצאים', url: 'mailto:igud@chasamsofer.info' }],
    sections: [
      {
        title: 'אגף הוצאה לאור',
        text: 'גיליון שבועי \'היכל החתם סופר\', קובץ חודשי \'היכלות\', ספר שבת בהיכלו ועוד.\n' +
              'להצטרפות לקבלת הגיליון במייל, או להצטרפות לרשת המפיצים באזור מגוריכם.',
        buttons: [{ label: 'הצטרפות לרשת המפיצים', url: 'mailto:10@chasamsofer.info' }],
      },
      {
        title: 'מדור "לחידודי" בגיליון השבועי',
        text: 'לשליחת תשובות למדור זה.\nניתן להשיב גם בעמדות נדרים פלוס.',
        buttons: [{ label: 'שליחת תשובה למדור', url: 'mailto:ch3131325@gmail.com' }],
      },
      {
        title: '"בתורתו" — רשת שיעורים בתורת רבינו החתם סופר',
        text: 'להצטרפות ורישום שיעור חדש, לשאלות ובירורים.',
        buttons: [{ label: 'שאלות ובירורים', url: 'mailto:9@chasamsofer.info' }],
      },
      {
        title: 'מבצע "חלוקת הש"ס"',
        text: 'לימוד הש"ס העולמי לטובת נשמת החתם סופר.\n' +
              'להצטרפות והרשמה — ניתן להירשם גם בעמדות נדרים פלוס.',
        buttons: [{ label: 'שאלות ובירורים', url: 'mailto:8@chasamsofer.info' }],
      },
      {
        title: 'מבצע "עולם הבא מסכתא"',
        text: 'מבחנים על מסכת עולם הבא לטו"נ רבינו החתם סופר.\n' +
              'להצטרפות והרשמה — ניתן להירשם גם בעמדות נדרים פלוס.',
        buttons: [{ label: 'שאלות ובירורים', url: 'mailto:8@chasamsofer.info' }],
      },
      {
        title: 'קויטל לציון הקדוש',
        text: 'לשליחת קויטל לציון הקדוש חינם אין כסף מדי שבוע בשבוע.\n' +
              'ניתן למלא קויטל גם בעמדות \'נדרים פלוס\'.',
        buttons: [{ label: 'שאלות ובירורים', url: 'mailto:k6056157010@gmail.com' }],
      },
      {
        title: 'הקו הטלפוני "קו ההיכל"',
        text: 'שיעורי תורה בתורתו ומשנתו של החתם סופר זיע"א.\nלפניות בענייני הקו הטלפוני.',
        buttons: [],
      },
      {
        title: 'נושאים אחרים',
        text: 'פניות בנושאים אחרים הקשורים להנהלת "היכל החתם סופר", שאינם מופיעים לעיל.',
        buttons: [{ label: 'פנייה להנהלה', url: 'mailto:M@chasamsofer.info' }],
      },
    ],
    footnote:
      'שימו לב: במייל זה לא יינתן שום מענה בנושאים דלעיל — ' +
      'לשם כך יש דרך פנייה לכל אגף בנפרד!',
    weeklyCap: DEFAULT_WEEKLY_CAP,
  }

  // ── התיבות שהיה להן מענה פעיל עד המעבר ──
  map.yerid = {
    ...map.yerid!,
    enabled: true,
    subject: 'פנייתך התקבלה — היכל החתם סופר · יריד',
    message:
      'תודה על פנייתך לאגף היריד של היכל החתם סופר.\n\n' +
      'הודעתך התקבלה במערכת ותטופל בהקדם על ידי הצוות.\n\n' +
      'זהו מענה אוטומטי — אין צורך להשיב להודעה זו.',
    buttons: [],
    sections: [],
    footnote: '',
    weeklyCap: DEFAULT_WEEKLY_CAP,
  }

  map.inbox8 = {
    ...map.inbox8!,
    enabled: true,
    subject: 'הגרלת כרטיסי טיסה — היכל החתם סופר',
    message:
      'בעזרת ה\' בימים הקרובים יתקיימו הגרלות על כרטיסי טיסה ' +
      'לציונו הקדוש של רבינו מרן החתם סופר זי"ע בפרשבורג.\n\n' +
      'ההגרלה היא לכל מגידי השיעורים בתורתו של מרן החת"ס, ' +
      'וכן לכל המשתתפים הקבועים בשיעורים.\n\n' +
      'שימו לב! כדי שנוכל לערוך את ההגרלה לכל משתתפי השיעור, ' +
      'יש לשלוח את שמות המשתתפים הקבועים בשיעורים לכתובת 8@chasamsofer.info.\n\n' +
      'בברכת התורה,\nהיכל החתם סופר',
    buttons: [{ label: 'שליחת שמות המשתתפים', url: 'mailto:8@chasamsofer.info' }],
    sections: [],
    footnote: '',
    weeklyCap: DEFAULT_WEEKLY_CAP,
  }

  map.gemach = {
    ...map.gemach!,
    enabled: true,
    subject: 'פנייתכם התקבלה · גמ"ח',
    message:
      'תודה על פנייתכם לגמ"ח של היכל החתם סופר.\n\n' +
      'הודעתכם התקבלה במערכת ותטופל בהקדם על ידי הצוות.',
    buttons: [],
    sections: [],
    footnote: '',
    weeklyCap: DEFAULT_WEEKLY_CAP,
  }

  // ⚠️ תיבת הבירורים של עזר יולדות — אינה תיבת הרשמה. הרישום נעשה בטופס
  // ממוחשב, ולכן המענה מפנה אליו ומבהיר שכאן ניתן מענה לבירורים בלבד.
  map.maternity = {
    ...map.maternity!,
    enabled: true,
    subject: 'הגעתם לאגף עזר יולדות · היכל החתם סופר',
    message:
      'שלום וברכה!\n\n' +
      'במייל זה תקבלו מענה רק לבירורים ושאלות שאינן קשורות לרישום לקבלת ההטבה.\n' +
      'הרישום נעשה בצורה ממוחשבת:',
    buttons: [],
    sections: [
      {
        title: 'לשאר אגפי היכל החתם סופר',
        text: 'היכל החתם סופר (משרד ראשי):',
        buttons: [{ label: 'office@chasamsofer.info', url: 'mailto:office@chasamsofer.info' }],
      },
      {
        title: 'איגוד הצאצאים',
        text: 'לפניות בענייני איגוד הצאצאים:',
        buttons: [{ label: 'igud@chasamsofer.info', url: 'mailto:igud@chasamsofer.info' }],
      },
    ],
    footnote: '',
    weeklyCap: DEFAULT_WEEKLY_CAP,
  }

  // ⚠️ igud היא תיבת הכניסה של איגוד הצאצאים. עד המעבר היא החזירה לפונה
  // מזוהה את פרטיו וקישורי הגשה חתומים; זה הוסר בכוונה — התיבה מפנה לאגף
  // הנכון, ואינה משמשת להגשת בקשות.
  map.igud = {
    ...map.igud!,
    enabled: true,
    subject: 'דרכי פנייה לאגפי איגוד הצאצאים',
    message:
      'שלום וברכה!\n\n' +
      'להלן דרכי פנייה לאגפי "איגוד הצאצאים".\n\n' +
      'שימו לב: כתובת זו היא רק לאגפי "איגוד הצאצאים". ' +
      'לשאר אגפי "היכל החתם סופר" המיועדים לכלל הציבור, פנו: office@chasamsofer.info',
    buttons: [{ label: 'פנייה להיכל החתם סופר', url: 'mailto:office@chasamsofer.info' }],
    sections: [
      {
        title: 'איגוד הצאצאים',
        text: 'מיועד לנכדי רבינו החתם סופר בלבד!\n' +
              'שימו לב: רישום לכלל ההטבות דלהלן הוא אך ורק לרשומים ב"איגוד הצאצאים".\n' +
              'להרשמה לאיגוד הצאצאים — או הירשמו בעמדות "נדרים פלוס" בקופת היכל החתם סופר.',
        buttons: [],
      },
      {
        title: 'גמ"ח הלוואות לנכדי החתם סופר',
        text: 'קבלת הלוואה עד 10,000$ עם החזר של עד 60 תשלומים, בכפוף לאישור הוועדה וחתימת ערבים כנדרש.\n' +
              'שימו לב: נדרש לצרף צילומי ת.ז. וספח + טופס בקשה חתום.\n' +
              'לבירורים ושאלות בלבד שאינם קשורים לרישום להלוואה:',
        buttons: [{ label: 'בירורים ושאלות', url: 'mailto:G@chasamsofer.info' }],
      },
      {
        title: 'עזר יולדות',
        text: 'הגשת בקשה לקבלת שני ימי החלמה — ניתן להגיש רק אחרי הלידה, ורק לפני הקבלה בפועל לבית ההחלמה. ' +
              'וכן בקשה לקבלת כרטיס לרכישת מזון מוכן (לשימוש תוך 6 שבועות מהלידה).\n' +
              'שימו לב: נדרש לצרף בעת הבקשה צילומי ת.ז. וספח + אישור לידה.\n' +
              'לבירורים או שאלות שאינם קשורים לרישום לקבלת ההטבה:',
        buttons: [{ label: 'בירורים ושאלות', url: 'mailto:Y@chasamsofer.info' }],
      },
      {
        title: 'אגף סיוע אלמנות ויתומים',
        text: 'סיוע לאלמנות ויתומים בזמני שמחה במעונם, או הוצאה חריגה אחרת המצריכה סיוע כלכלי.\n' +
              'שימו לב: נדרש צילומי ת.ז. + ספח + המלצת רב ועסקן + מסמכים המוכיחים על אמיתות ונחיצות המקרה + ' +
              'דפי חשבון בנק 3 חודשים אחרונים.\n' +
              'לשאלות ובירורים:',
        buttons: [{ label: 'שאלות ובירורים', url: 'mailto:R@chasamsofer.info' }],
      },
      {
        title: 'אגף סיוע רפואי',
        text: 'סיוע במקרים רפואיים חריגים, בהם אין מימון של קופ"ח או גורם אחר.\n' +
              'שימו לב: נדרש לצרף צילומי ת.ז. + ספח + מסמכים רפואיים + המלצת רב המכיר את המקרה + ' +
              'דפי חשבון בנק 3 חודשים אחרונים.\n' +
              'לשאלות ובירורים:',
        buttons: [{ label: 'שאלות ובירורים', url: 'mailto:A@chasamsofer.info' }],
      },
      {
        title: 'אגף עזר לחגים',
        text: 'עזרה וסיוע לנכדי החתם סופר לקראת חגים ומועדים.\n' +
              'מיועד רק לאלו שקיבלו הודעה על זכאותם.\n' +
              'הגשת בקשה פעילה בימי הרישום לפני החגים, בהתאם להודעה שנשלחה לזכאים.\n' +
              'לשאלות ובירורים — אך ורק בעת פעילות האגף בתקופת הרישום לחלוקת חגים:',
        buttons: [{ label: 'שאלות ובירורים', url: 'mailto:CHAGIM@chasamsofer.info' }],
      },
      {
        title: 'אגף עזר לשמחות — קייטרינג מסובסד לנכדי החת"ס',
        text: 'לרישום וקבלת תפריטים.\n' +
              'לשאלות ישירות למשרדי הקייטרינג — בטלפון: 02-555-8888',
        buttons: [],
      },
      {
        title: 'נושאים כלליים',
        text: 'לשאלות אחרות או נושאים כלליים לחברי "איגוד הצאצאים" שאינם מופיעים ברשימה הנ"ל.',
        buttons: [{ label: 'פנייה בנושא כללי', url: 'mailto:M@chasamsofer.info' }],
      },
    ],
    footnote:
      'שימו לב: במייל זה לא יינתן שום מענה בנושאים דלעיל — ' +
      'לשם כך יש דרך פנייה לכל אגף בנפרד!',
    weeklyCap: DEFAULT_WEEKLY_CAP,
  }

  return map
}

/**
 * נרמול ההגדרות שנקראו מהמאגר.
 *
 * ⚠️ נכשל-בטוח בכל שדה: ערך פגום נופל לברירת המחדל ולא מפיל את המענה כולו.
 * ⚠️ קורא גם את הפורמט הישן של maintenance_reply (enabled/message/contactEmail)
 * כדי שנוסח שהמנהל כבר הזין לא ייעלם במעבר.
 */
export function normalizeConfig(raw: Record<string, unknown> | null | undefined): AutoReplyMap {
  const map = defaultAutoReplyMap()
  if (!raw || typeof raw !== 'object') return map

  for (const d of Object.values(DEPARTMENTS)) {
    const v = raw[d.key]
    if (!v || typeof v !== 'object') continue
    const rec = v as Record<string, unknown>
    const base = map[d.key]!

    const capRaw = Number(rec.weeklyCap)
    const weeklyCap = Number.isFinite(capRaw) && capRaw > 0
      ? Math.min(MAX_WEEKLY_CAP, Math.max(MIN_WEEKLY_CAP, Math.round(capRaw)))
      : DEFAULT_WEEKLY_CAP

    const message = typeof rec.message === 'string' && rec.message.trim()
      ? rec.message.slice(0, MAX_MESSAGE_LEN)
      : base.message

    // ⚠️ הגדרות שנשמרו לפני שהמצבים נוספו אינן מכילות `mode`. נפילה
    // ל-'full' ולא ל-'off': הן נשמרו כשהנוסח המלא היה היחיד שקיים, וזה
    // מה שיצא מהן עד עכשיו. ברירת מחדל אחרת הייתה משנה בשקט את המייל
    // שפונים מקבלים, בלי שאיש נגע בהגדרות.
    const mode: AutoReplyMode =
      rec.mode === 'temp' || rec.mode === 'off' || rec.mode === 'full'
        ? rec.mode
        : 'full'

    map[d.key] = {
      // ⚠️ enabled === true בלבד: מחרוזת 'yes' או ערך חסר נקראים ככבוי.
      enabled: rec.enabled === true,
      mode,
      tempSubject: typeof rec.tempSubject === 'string' && rec.tempSubject.trim()
        ? rec.tempSubject.trim().slice(0, 200)
        : base.tempSubject,
      // ⚠️ בשונה מ-message: מחרוזת ריקה מפורשת מכובדת ואינה נופלת
      // לברירת המחדל. מנהל שמחק את ההודעה הזמנית התכוון לכך, ושחזור
      // שקט של נוסח שהוא מחק היה שולח מייל שהוא בכוונה הסיר.
      tempMessage: typeof rec.tempMessage === 'string'
        ? rec.tempMessage.slice(0, MAX_MESSAGE_LEN)
        : base.tempMessage,
      subject: typeof rec.subject === 'string' && rec.subject.trim()
        ? rec.subject.trim().slice(0, 200)
        : base.subject,
      message,
      buttons: sanitizeButtons(rec.buttons),
      // ⚠️ סעיפים שנשמרו כמערך ריק הם בחירה מפורשת של המנהל (הוא מחק את
      // כולם) ולכן מכובדים. רק היעדר גמור של השדה נופל לברירת המחדל.
      sections: Array.isArray(rec.sections) ? sanitizeSections(rec.sections) : base.sections,
      footnote: typeof rec.footnote === 'string' ? rec.footnote.slice(0, MAX_TEXT_LEN) : base.footnote,
      // 🔴 גם title נשמט כאן — הכותרת שהמנהל הקליד נזרקה בכל שמירה.
      // ⚠️ ריק נשמר כריק: ההכרעה מול AUTO_REPLY_DEFAULT_TITLE נעשית ברינדור.
      title: typeof rec.title === 'string' ? rec.title.slice(0, MAX_TITLE_LEN) : base.title,
      // 🔴 השדה הזה נשמט כאן לגמרי, והנוסח שהמנהל הקליד נזרק בשקט בכל שמירה.
      //
      // ⚠️ מחרוזת ריקה נשמרת כפי שהיא ואינה נופלת לברירת המחדל: ההבחנה בין
      // ריק ל"לא הוגדר" נעשית ב-renderAutoReply (ריק ⇒ הנוסח הסטנדרטי),
      // והנרמול רק מעביר את מה שנשמר. נפילה לברירת מחדל כאן הייתה מונעת
      // מהמנהל למחוק את הבלוק.
      noReplyNotice: typeof rec.noReplyNotice === 'string'
        ? rec.noReplyNotice.slice(0, MAX_TEXT_LEN)
        : base.noReplyNotice,
      weeklyCap,
    }
  }
  return map
}

export async function getAutoReplyConfig(db: SupabaseClient): Promise<AutoReplyMap> {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', AUTO_REPLY_KEY).maybeSingle()
    if (!data?.value) {
      // ⚠️ טרם נשמרו הגדרות חדשות — נופלים לנוסחים הישנים של maintenance_reply
      // כדי שהמעבר לא ישתיק תיבה שהמנהל הגדיר בעבר.
      const { data: legacy } = await db.from('app_settings').select('value').eq('key', 'maintenance_reply').maybeSingle()
      if (!legacy?.value) return defaultAutoReplyMap()
      return normalizeConfig(JSON.parse(String(legacy.value)))
    }
    return normalizeConfig(JSON.parse(String(data.value)))
  } catch {
    return defaultAutoReplyMap()
  }
}

export async function saveAutoReplyConfig(db: SupabaseClient, map: AutoReplyMap): Promise<boolean> {
  const { error } = await db.from('app_settings').upsert({
    key: AUTO_REPLY_KEY,
    value: JSON.stringify(normalizeConfig(map as unknown as Record<string, unknown>)),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })
  return !error
}
