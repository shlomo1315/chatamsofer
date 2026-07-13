// ─────────────────────────────────────────────────────────────────────────────
// קטלוג המיילים — מקור האמת היחיד לכל מייל יוצא במערכת.
//
// כל מייל רשום כאן עם: מתי הוא נשלח, מאיזו מחלקה, ואילו טקסטים ניתנים לעריכה
// ממסך ההגדרות. מסך "הודעות מייל" נבנה מהרשימה הזו — כך שמייל חדש שנוסף כאן
// מופיע שם אוטומטית, בלי לגעת ב-UI.
//
// ⚠️ העריכה היא של *טקסטים* בלבד. העיצוב (צבעים, לוגו, מסגרות) נשאר בקוד
// ואחיד לכל המיילים — כדי שטעות עריכה לא תוכל לשבור מייל בפרודקשן.
// ─────────────────────────────────────────────────────────────────────────────

export type EmailGroup =
  | 'registration'    // רישום ואישור מוטבים
  | 'portal_requests' // בקשות דרך האתר
  | 'mail_requests'   // בקשות דרך המייל
  | 'maternity'       // יולדות
  | 'loans'           // הלוואות
  | 'aid'             // סיוע רפואי ואלמנות
  | 'gratitude'       // מכתבי ברכה ומשוב
  | 'auto_reply'      // מענים אוטומטיים
  | 'system'          // מערכת: אימות, סיסמאות, דוחות

export const GROUP_LABELS: Record<EmailGroup, string> = {
  registration: 'רישום ואישור מוטבים',
  portal_requests: 'בקשות דרך האתר',
  mail_requests: 'בקשות דרך המייל',
  maternity: 'יולדות',
  loans: 'הלוואות',
  aid: 'סיוע רפואי ואלמנות',
  gratitude: 'מכתבי ברכה ומשוב',
  auto_reply: 'מענים אוטומטיים',
  system: 'מערכת',
}

/** שדה טקסט הניתן לעריכה בתוך מייל. */
export interface EditableField {
  key: string
  label: string
  /** ברירת המחדל — הטקסט שבקוד כרגע. */
  default: string
  /** משתנים שמותר לשלב, למשל {name}. מוצגים למשתמש. */
  vars?: string[]
  multiline?: boolean
  /** הסבר קצר איפה הטקסט מופיע במייל. */
  hint?: string
}

export interface EmailSpec {
  /** מזהה יציב — משמש כמפתח בשמירה. אל תשנה אחרי שנשמרו עריכות. */
  id: string
  group: EmailGroup
  title: string
  /** מתי המייל נשלח — בשפה של המשתמש, לא של המפתח. */
  trigger: string
  /** מי מקבל אותו. */
  recipient: string
  /** המחלקה השולחת (DepartmentKey), לתצוגה. */
  department: string
  fields: EditableField[]
}

// ─────────────────────────────────────────────────────────────────────────────
// הקטלוג. 8 תבניות מתות (approvalEmail, emailIntakeConfirmedEmail,
// financialAidReceivedEmail, ו-5 ב-lib/email.ts) אינן מופיעות כאן במכוון —
// הן קיימות בקוד אך לעולם אינן נשלחות, ואין טעם לערוך אותן.
// ─────────────────────────────────────────────────────────────────────────────

export const EMAIL_CATALOG: EmailSpec[] = [
  // ── רישום ואישור ──────────────────────────────────────────────────────────
  {
    id: 'registration_received',
    group: 'registration',
    title: 'אישור קליטת רישום',
    trigger: 'מיד עם סיום הרשמה חדשה בפורטל הציבורי',
    recipient: 'הנרשם',
    department: 'igud',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'פרטיך נקלטו בהצלחה — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'פרטיך נקלטו בהצלחה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'תודה על ההרשמה. פרטיך נקלטו במערכת ויעברו בדיקה.', multiline: true },
    ],
  },
  {
    id: 'docs_pending',
    group: 'registration',
    title: 'נדרשת השלמת מסמכים',
    trigger: 'כשמנהל משנה סטטוס מוטב ל"ממתין למסמכים"',
    recipient: 'המוטב',
    department: 'igud',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'נדרשת השלמת מסמכים — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'נדרשת השלמת מסמכים' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'כדי להשלים את הרישום נדרשים המסמכים הבאים:', multiline: true },
    ],
  },
  {
    id: 'request_blocked_rejected',
    group: 'registration',
    title: 'בקשה ממוטב שרישומו נדחה',
    trigger: 'כשמוטב שרישומו נדחה מנסה להגיש בקשה (בפורטל או במייל)',
    recipient: 'המוטב',
    department: 'igud',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'בנוגע לבקשתך — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'לא ניתן לטפל בבקשתך' },
      { key: 'intro', label: 'פסקת הסבר', default: 'הרישום שלך למערכת לא אושר, ולכן לא ניתן לקלוט בקשות.', multiline: true },
    ],
  },

  // ── בקשות דרך האתר ────────────────────────────────────────────────────────
  {
    id: 'request_received',
    group: 'portal_requests',
    title: 'אישור קבלת בקשה',
    trigger: 'מיד עם הגשת בקשה (לידה / הלוואה / סיוע רפואי / אלמנות) — בפורטל או במייל',
    recipient: 'המבקש',
    department: 'igud',
    fields: [
      { key: 'title', label: 'כותרת ראשית', default: 'הבקשה התקבלה', hint: 'שורת הנושא נבנית אוטומטית לפי סוג הבקשה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'בקשתך התקבלה במערכת ותטופל בהקדם.', multiline: true },
      { key: 'first_time_note', label: 'הערה למגיש בפעם הראשונה', default: 'הרישום שלך עדיין בבדיקה. הבקשה תטופל לאחר אישור הרישום.', multiline: true },
    ],
  },
  {
    id: 'benefits_link',
    group: 'portal_requests',
    title: 'רשימת הטבות וקישורי הגשה',
    trigger: 'בלחיצה על "שלח לי קישורים" בפורטל, וכמענה אוטומטי לפנייה לתיבת האיגוד',
    recipient: 'המוטב',
    department: 'igud',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'הגשת בקשות והטבות — איגוד הצאצאים' },
      { key: 'title', label: 'כותרת ראשית', default: 'הגשת בקשות והטבות' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'להלן ההטבות שניתן להגיש עבורן בקשה:', multiline: true },
    ],
  },

  // ── בקשות דרך המייל ───────────────────────────────────────────────────────
  {
    id: 'email_intake_rejected',
    group: 'mail_requests',
    title: 'הבקשה לא נקלטה',
    trigger: 'כשבקשה שהוגשה במייל נכשלה בבדיקה (פרט חסר / קובץ חסר / ת"ז שגויה / עברו 30 יום)',
    recipient: 'המגיש',
    department: 'igud',
    fields: [
      { key: 'title', label: 'כותרת ראשית', default: 'הבקשה לא נקלטה' },
      { key: 'errors_intro', label: 'כותרת רשימת השגיאות', default: 'הסיבות:' },
      { key: 'digital_note', label: 'המלצה על המערכת הדיגיטלית', default: 'מומלץ להגיש דרך המערכת הדיגיטלית שלנו (אם אינכם חסומים) — פשוט ומהיר:', multiline: true },
      { key: 'digital_button', label: 'טקסט הכפתור', default: 'הגשת בקשה במערכת הדיגיטלית' },
      { key: 'draft_note', label: 'הסבר על הגשה חוזרת במייל', default: 'להגשה חוזרת במייל — לחצו לפתיחת טיוטה מוכנה, מלאו וצרפו את הקובץ הנדרש:', multiline: true },
      { key: 'draft_button', label: 'טקסט קישור הטיוטה', default: 'פתיחת טיוטת {סוג} מוכנה במייל', vars: ['{סוג}'], hint: '{סוג} יוחלף ב"בקשת לידה" / "בקשת הלוואה" וכו׳' },
    ],
  },

  // ── יולדות ────────────────────────────────────────────────────────────────
  {
    id: 'birth_approved',
    group: 'maternity',
    title: 'בקשת ההבראה אושרה',
    trigger: 'כשמנהל מאשר בקשת לידה. מצורפים שוברי PDF (הבראה, וכרטיס מזון אם יש מלאי)',
    recipient: 'היולדת',
    department: 'maternity',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'בקשת ההבראה ליולדת אושרה — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'הבקשה אושרה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'בשמחה רבה — בקשת ההבראה שלך אושרה.', multiline: true },
      { key: 'no_stock_note', label: 'הודעה כשאין מלאי כרטיסים במוקד', default: 'כרטיס המזון יישלח אליכם בנפרד עם חידוש המלאי במוקד.', multiline: true },
    ],
  },
  {
    id: 'maternity_card',
    group: 'maternity',
    title: 'כרטיס המזון אושר',
    trigger: 'כשמנהל מסמן שהכרטיס אושר, או אוטומטית עם אישור הלידה כשיש מלאי',
    recipient: 'היולדת',
    department: 'maternity',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'כרטיס המזון אושר — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'כרטיס המזון אושר' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'כרטיס המזון שלך אושר וממתין לאיסוף במוקד.', multiline: true },
    ],
  },
  {
    id: 'card_stock_replenished',
    group: 'maternity',
    title: 'המלאי במוקד התחדש',
    trigger: 'כשמנהל מעדכן מלאי במוקד — נשלח לכל היולדות שהמתינו לכרטיס באותו מוקד',
    recipient: 'יולדות שהמתינו למלאי',
    department: 'maternity',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'המלאי התחדש — שובר כרטיס המזון מצורף — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'המלאי התחדש' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'המלאי במוקד התחדש. שובר כרטיס המזון מצורף להודעה זו.', multiline: true },
    ],
  },
  {
    id: 'recovery_voucher_update',
    group: 'maternity',
    title: 'עדכון שובר הבראה',
    trigger: 'כשמנהל משנה את מספר ימי הזכאות בבית ההחלמה',
    recipient: 'היולדת',
    department: 'maternity',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'עדכון שובר הבראה ליולדת — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'עדכון שובר ההבראה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'שובר ההבראה שלך עודכן. השובר המעודכן מצורף להודעה זו.', multiline: true },
    ],
  },

  // ── הלוואות ───────────────────────────────────────────────────────────────
  {
    id: 'loan_approved',
    group: 'loans',
    title: 'בקשת ההלוואה אושרה',
    trigger: 'כשמנהל מאשר בקשת הלוואה',
    recipient: 'הלווה',
    department: 'gemach',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'בקשת ההלוואה אושרה — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'ההלוואה אושרה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'בקשת ההלוואה שלך אושרה. להלן הפרטים:', multiline: true },
    ],
  },

  // ── סיוע רפואי ואלמנות ────────────────────────────────────────────────────
  {
    id: 'financial_aid_decision',
    group: 'aid',
    title: 'החלטה בבקשת סיוע רפואי',
    trigger: 'כשמנהל מכריע בבקשה, או אוטומטית כשהגורם המאשר משיב במייל',
    recipient: 'המבקש',
    department: 'medical',
    fields: [
      { key: 'subject_approved', label: 'נושא — אושר', default: 'בקשת הסיוע הרפואי אושרה — היכל החתם סופר' },
      { key: 'subject_rejected', label: 'נושא — נדחה', default: 'עדכון בנוגע לבקשת הסיוע הרפואי' },
      { key: 'title_approved', label: 'כותרת — אושר', default: 'הבקשה אושרה' },
      { key: 'title_rejected', label: 'כותרת — נדחה', default: 'עדכון בנוגע לבקשתך' },
      { key: 'intro_approved', label: 'פסקה — אושר', default: 'בקשת הסיוע הרפואי שלך אושרה.', multiline: true },
      { key: 'intro_rejected', label: 'פסקה — נדחה', default: 'לאחר בחינת הבקשה, לא ניתן לאשר אותה בשלב זה.', multiline: true },
    ],
  },

  // ── מכתבי ברכה ומשוב ──────────────────────────────────────────────────────
  {
    id: 'gratitude_request',
    group: 'gratitude',
    title: 'בקשת דברי ברכה לנדיב',
    trigger: '10 ימים לאחר אישור הלידה. תזכורת נשלחת יומיים אחר כך אם לא התקבל מכתב',
    recipient: 'היולדת',
    department: 'maternity',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'דברי ברכה לנדיב · היכל החתם סופר' },
      { key: 'subject_reminder', label: 'שורת הנושא — תזכורת', default: 'תזכורת · דברי ברכה לנדיב' },
      { key: 'title', label: 'כותרת ראשית', default: 'דברי ברכה לנדיב' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'נשמח אם תכתבי מילות ברכה לנדיב שבחר לתמוך בכם.', multiline: true },
      { key: 'button', label: 'טקסט הכפתור', default: 'לכתיבת דברי הברכה' },
      { key: 'print_note', label: 'הסבר על השובר המצורף', default: 'אפשר להדפיס, למלאות את רגשות ליבכן, לסרוק ולשלוח לנו במייל חוזר — יש להשיב דווקא בהשב למייל זה, כדי שהמערכת תזהה את המכתב שלכם.', multiline: true },
    ],
  },
  {
    id: 'recovery_feedback',
    group: 'gratitude',
    title: 'בקשת משוב על בית ההחלמה',
    trigger: '5 ימים לאחר שבית ההחלמה סימן שהיולדת הגיעה',
    recipient: 'היולדת',
    department: 'maternity',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'נשמח לשמוע ממך · היכל החתם סופר', hint: 'המילה "סקר" לא מופיעה כאן במכוון' },
      { key: 'title', label: 'כותרת ראשית', default: 'נשמח לשמוע ממך' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת בבית ההחלמה.', multiline: true },
      { key: 'button', label: 'טקסט הכפתור', default: 'למילוי הטופס' },
    ],
  },
  {
    id: 'gratitude_received',
    group: 'gratitude',
    title: 'אישור קבלת דברי הברכה',
    trigger: 'מיד עם קבלת מכתב הברכה — מהטופס באתר או מתשובה במייל',
    recipient: 'היולדת',
    department: 'maternity',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'קיבלנו את דברי הברכה — תודה רבה' },
      { key: 'title', label: 'כותרת ראשית', default: 'קיבלנו את דברי הברכה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'תודה רבה. דברי הברכה שלך יועברו לנדיב.', multiline: true },
    ],
  },

  // ── מענים אוטומטיים ───────────────────────────────────────────────────────
  {
    id: 'auto_reply_yerid',
    group: 'auto_reply',
    title: 'מענה אוטומטי — תיבת יריד',
    trigger: 'אוטומטית על כל פנייה חדשה לתיבת היריד',
    recipient: 'הפונה',
    department: 'yerid',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'פנייתך התקבלה — היכל החתם סופר · יריד' },
      { key: 'title', label: 'כותרת ראשית', default: 'פנייתך התקבלה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'תודה על פנייתך לאגף היריד. הודעתך התקבלה במערכת ותטופל בהקדם על ידי הצוות.', multiline: true },
    ],
  },
  {
    id: 'auto_reply_inbox8',
    group: 'auto_reply',
    title: 'מענה אוטומטי — תיבה 8 (הגרלת כרטיסי טיסה)',
    trigger: 'אוטומטית על כל פנייה חדשה לתיבה 8',
    recipient: 'הפונה',
    department: 'inbox8',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'הגרלת כרטיסי טיסה — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'הגרלת כרטיסי טיסה' },
      { key: 'body', label: 'גוף ההודעה', multiline: true, default: 'בעזרת ה\' בימים הקרובים יתקיימו הגרלות על כרטיסי טיסה לציונו הקדוש של רבינו מרן החתם סופר זי"ע בפרשבורג.\n\nההגרלה היא לכל מגידי השיעורים בתורתו של מרן החת"ס, וכן לכל המשתתפים הקבועים בשיעורים.' },
      { key: 'notice', label: 'הודעת "שימו לב"', multiline: true, default: 'כדי שנוכל לערוך את ההגרלה לכל משתתפי השיעור, עליכם לשלוח את שמות המשתתפים הקבועים בשיעורים לאימייל 8@chasamsofer.info' },
    ],
  },
  {
    id: 'existing_contact',
    group: 'auto_reply',
    title: 'מענה אוטומטי לצאצא רשום',
    trigger: 'סריקה אוטומטית של תיבת המשרד כל 15 דקות — לפניות שאינן בקשה',
    recipient: 'הפונה (רשום במערכת)',
    department: 'main',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'קיבלנו את פנייתך — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'קיבלנו את פנייתך' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'פנייתך התקבלה. להלן הפרטים הרשומים אצלנו:', multiline: true },
    ],
  },
  {
    id: 'registration_invite',
    group: 'auto_reply',
    title: 'הזמנה להרשמה (פונה שאינו רשום)',
    trigger: 'אותה סריקה אוטומטית — כשכתובת השולח אינה מוכרת במערכת',
    recipient: 'הפונה (לא רשום)',
    department: 'main',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'קיבלנו את פנייתך — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'קיבלנו את פנייתך' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'פנייתך התקבלה. לא נמצאת רשומה במערכת — נשמח אם תשלימו הרשמה.', multiline: true },
      { key: 'button', label: 'טקסט הכפתור', default: 'להרשמה למערכת' },
    ],
  },

  // ── מערכת ─────────────────────────────────────────────────────────────────
  {
    id: 'verify_code_email',
    group: 'system',
    title: 'קוד אימות למייל',
    trigger: 'כשמשתמש מבקש קוד לאימות כתובת המייל (בהרשמה). תקף 10 דקות',
    recipient: 'הנרשם',
    department: 'igud',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'קוד אימות כתובת מייל — היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'קוד אימות' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'להלן קוד האימות שלך. הקוד תקף ל-10 דקות.', multiline: true },
    ],
  },
  {
    id: 'portal_credentials',
    group: 'system',
    title: 'פרטי כניסה לפורטל',
    trigger: 'כשמנהל שולח סיסמה לבית החלמה או לגורם המבצע בהלוואות',
    recipient: 'בית החלמה / גורם מבצע',
    department: 'לפי הפורטל',
    fields: [
      { key: 'title', label: 'כותרת ראשית', default: 'פרטי כניסה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'להלן פרטי הכניסה שלך לפורטל:', multiline: true },
      { key: 'button', label: 'טקסט הכפתור', default: 'כניסה לפורטל' },
    ],
  },
  {
    id: 'weekly_loans_report',
    group: 'system',
    title: 'דוח הלוואות שבועי',
    trigger: 'אוטומטית בכל יום ראשון ב-08:00, וגם בלחיצה על "שלח עכשיו"',
    recipient: 'הכתובת שהוגדרה לדוחות',
    department: 'main',
    fields: [
      { key: 'title', label: 'כותרת ראשית', default: 'דוח הלוואות שבועי' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'להלן סיכום ההלוואות מהשבוע האחרון:', multiline: true },
      { key: 'button', label: 'טקסט הכפתור', default: 'לפורטל ההלוואות' },
    ],
  },
  {
    id: 'maintenance_reply',
    group: 'system',
    title: 'מענה אוטומטי — המערכת בהרצה',
    trigger: 'לפונה שאינו מזוהה, כשההגדרה מופעלת. פעם אחת בלבד לכל כתובת',
    recipient: 'הפונה',
    department: 'main',
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'קיבלנו את פנייתכם · היכל החתם סופר' },
      { key: 'title', label: 'כותרת ראשית', default: 'קיבלנו את פנייתכם' },
    ],
  },
]

/** מפתח ה-app_settings שבו נשמרות העריכות. */
export const EMAIL_TEXTS_KEY = 'email_texts'

export type EmailTexts = Record<string, Record<string, string>>

/** הטקסט האפקטיבי: מה שנערך, ובהיעדרו ברירת המחדל מהקטלוג. */
export function textOf(texts: EmailTexts | null | undefined, emailId: string, fieldKey: string): string {
  const edited = texts?.[emailId]?.[fieldKey]
  if (typeof edited === 'string' && edited.trim()) return edited
  const spec = EMAIL_CATALOG.find(e => e.id === emailId)
  return spec?.fields.find(f => f.key === fieldKey)?.default ?? ''
}

export function specById(id: string): EmailSpec | undefined {
  return EMAIL_CATALOG.find(e => e.id === id)
}
