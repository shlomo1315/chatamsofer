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
  /**
   * האם התבנית בקוד באמת קוראת את הטקסטים הערוכים (textFor).
   * מיילים שאינם wired מוסתרים מהמסך — עריכה שלהם לא הייתה משפיעה על כלום,
   * וזה מטעה יותר מלא להציג אותם כלל.
   */
  wired?: boolean
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
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'פרטיך נקלטו בהצלחה — היכל החתם סופר' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'פרטיך נקלטו בהצלחה במערכת. ניתן כבר להיכנס ולהגיש בקשות.' },
      { key: 'title', label: 'כותרת ראשית', default: 'הפרטים נקלטו במערכת' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'היכל החתם סופר' },
      { key: 'kicker', label: 'תווית קטנה מעל הפתיח', default: 'אישור קבלה' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'תודה על פנייתך! פרטיך נקלטו בהצלחה במערכת <strong>איגוד הצאצאים</strong> של היכל החתם סופר.', multiline: true, hint: 'תגיות HTML פשוטות (strong) נתמכות' },
      { key: 'details_title', label: 'כותרת טבלת הפרטים', default: 'פרטי הרישום שלך:' },
      { key: 'buttons_title', label: 'משפט מעל הכפתורים', default: 'להגשת בקשה לאחת מההטבות, לחצו על הכפתור המתאים:' },
      { key: 'btn_birth', label: 'כפתור — בקשת לידה', default: 'להגשת בקשה לימי החלמה ומזון מוכן לאחר לידה — לחצו כאן' },
      { key: 'btn_loan', label: 'כפתור — בקשת הלוואה', default: 'להגשת בקשת הלוואה (גמ״ח) — לחצו כאן' },
      { key: 'btn_aid', label: 'כפתור — סיוע רפואי', default: 'להגשת בקשת סיוע רפואי — לחצו כאן' },
      { key: 'btn_widow', label: 'כפתור — אלמנות ויתומים', default: 'להגשת בקשה לאלמנות ויתומים — לחצו כאן' },
      { key: 'drafts_title', label: 'כותרת — הגשה במייל', default: 'חסומים לגלישה? אפשר להגיש ישירות מהמייל' },
      { key: 'drafts_note', label: 'הסבר — הגשה במייל', multiline: true, default: 'לחיצה על אחד הקישורים תפתח טיוטת מייל מוכנה עם כל השדות למילוי. יש למלא, לצרף את המסמכים הנדרשים, ולשלוח.' },
    ],
  },
  {
    id: 'docs_pending',
    group: 'registration',
    title: 'נדרשת השלמת מסמכים',
    trigger: 'כשמנהל משנה סטטוס מוטב ל"ממתין למסמכים"',
    recipient: 'המוטב',
    department: 'igud',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'נדרשת השלמת מסמכים — היכל החתם סופר' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'נדרשת השלמת מסמכים להמשך הטיפול.' },
      { key: 'title', label: 'כותרת ראשית', default: 'נדרשת השלמת מסמכים' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'עוד צעד אחד להשלמת התהליך' },
      { key: 'kicker', label: 'תווית קטנה מעל הפתיח', default: 'פעולה נדרשת' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'כדי להמשיך בטיפול בבקשתך, עליך <strong>להשלים את המסמכים הבאים</strong>.\n      ניתן להעלות אותם ישירות דרך המערכת הדיגיטלית שלנו — מהמחשב או מהנייד.', multiline: true, hint: 'תגיות HTML פשוטות (strong) נתמכות' },
      { key: 'docs_title', label: 'כותרת רשימת המסמכים', default: 'מסמכים נדרשים:' },
      { key: 'button', label: 'טקסט הכפתור', default: 'להעלאת המסמכים' },
      { key: 'footnote', label: 'הערה בתחתית', default: 'בלחיצה על הכפתור תתבקש/י להזין את מספר תעודת הזהות,<br/>\n      ואז תועבר/י ישירות למסך העלאת המסמכים.', multiline: true },
    ],
  },
  {
    id: 'request_blocked_rejected',
    group: 'registration',
    title: 'בקשה ממוטב שרישומו נדחה',
    trigger: 'כשמוטב שרישומו נדחה מנסה להגיש בקשה (בפורטל או במייל)',
    recipient: 'המוטב',
    department: 'igud',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'בנוגע לבקשתך — היכל החתם סופר' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'לא ניתן לטפל בבקשה — הרישום לא אושר.' },
      { key: 'title', label: 'כותרת ראשית', default: 'בנוגע לבקשתך' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'איגוד הצאצאים' },
      { key: 'box_title', label: 'כותרת ההודעה המודגשת', default: 'לא ניתן לטפל בבקשתך' },
      { key: 'box_text', label: 'גוף ההודעה המודגשת', default: 'הבקשה שהגשת התקבלה, אך לא ניתן לטפל בה כיוון שהרישום שלך לאיגוד הצאצאים <strong>לא אושר</strong>{סיבה}.', multiline: true, vars: ['{סיבה}'], hint: '{סיבה} יוחלף ב" — <הסיבה>" אם נרשמה סיבה, ואחרת יימחק' },
      { key: 'contact_note', label: 'שורת פנייה למשרד', default: 'לבירורים ניתן לפנות למשרד: {מייל}', multiline: true, vars: ['{מייל}'], hint: '{מייל} יוחלף בקישור לכתובת המשרד' },
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
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'התקבלה {סוג} — היכל החתם סופר', vars: ['{סוג}'], hint: '{סוג} יוחלף ב"בקשת הלוואה" / "בקשת הבראה ליולדת" וכו׳' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: '{סוג} התקבלה ומועברת לטיפול.', vars: ['{סוג}'] },
      { key: 'title', label: 'כותרת ראשית', default: 'הבקשה התקבלה', hint: 'כותרת המשנה היא סוג הבקשה, ונבנית אוטומטית' },
      { key: 'kicker', label: 'תווית קטנה מעל הפתיח', default: 'אישור קבלה' },
      { key: 'intro', label: 'פסקת פתיחה', default: '<strong>{סוג}</strong> שלך התקבלה במערכת היכל החתם סופר ומועברת לטיפול המזכירות.', multiline: true, vars: ['{סוג}'] },
      { key: 'first_time_title', label: 'כותרת ההודעה למגיש בפעם הראשונה', default: 'בקשתך התקבלה בהצלחה' },
      { key: 'first_time_note', label: 'הערה למגיש בפעם הראשונה', default: 'בקשתך וצילומי תעודת הזהות שצירפת נקלטו בהצלחה במערכת. נעדכן אותך בהמשך.', multiline: true },
      { key: 'repeat_note', label: 'הערה למגיש חוזר', default: 'הבקשה התקבלה והועברה לטיפול המזכירות.', multiline: true },
      { key: 'beneficiary_title', label: 'כותרת טבלת פרטי המבקש', default: 'פרטי המבקש:' },
      { key: 'request_title', label: 'כותרת טבלת פרטי הבקשה', default: 'פרטי הבקשה:' },
      { key: 'docs_title', label: 'כותרת רשימת המסמכים', default: 'מסמכים מצורפים:' },
      { key: 'footnote', label: 'הערה בתחתית', default: 'תקבל/י עדכון על המשך הטיפול בהמשך.', multiline: true },
    ],
  },
  {
    id: 'benefits_link',
    group: 'portal_requests',
    title: 'רשימת הטבות וקישורי הגשה',
    trigger: 'בלחיצה על "שלח לי קישורים" בפורטל, וכמענה אוטומטי לפנייה לתיבת האיגוד',
    recipient: 'המוטב',
    department: 'igud',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'הגשת בקשות והטבות — איגוד הצאצאים' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'קישורים להגשת בקשות לאיגוד הצאצאים' },
      { key: 'title', label: 'כותרת ראשית', default: 'איגוד הצאצאים' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'הגשת בקשות והטבות' },
      { key: 'details_title', label: 'כותרת טבלת הפרטים', default: 'הפרטים הרשומים אצלנו:' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'אתם נמנים עם רשומי <strong>"איגוד הצאצאים"</strong>. כדי להגיש בקשה לאחת מההטבות,\n      לחצו על הכפתור המתאים — תועברו להתחברות מאובטחת ולאחריה ייפתח טופס הבקשה שבחרתם:', multiline: true },
      { key: 'btn_birth', label: 'כפתור — בקשת לידה', default: 'להגשת בקשה לימי החלמה ומזון מוכן לאחר לידה — לחצו כאן' },
      { key: 'btn_loan', label: 'כפתור — בקשת הלוואה', default: 'להגשת בקשת הלוואה (גמ״ח) — לחצו כאן' },
      { key: 'btn_aid', label: 'כפתור — סיוע רפואי', default: 'להגשת בקשת סיוע רפואי — לחצו כאן' },
      { key: 'btn_widow', label: 'כפתור — אלמנות ויתומים', default: 'להגשת בקשה לאלמנות ויתומים — לחצו כאן' },
      { key: 'draft_title', label: 'כותרת בלוק ההגשה במייל', default: 'להגשה גם דרך האימייל:' },
      { key: 'draft_note', label: 'הסבר בלוק ההגשה במייל', default: 'רק באם אינכם מצליחים להיכנס למערכת הדיגיטלית שלנו, פיתחנו עבורכם אפשרות לשליחת טפסים גם דרך האימייל. עם זאת שימו לב! היות וגם הקליטה דרך המייל הינה במערכת אוטומטית — ייתכנו בה שיבושים, וככל שמתאפשר לכם מומלץ מאוד להגיש ישירות דרך המערכת הממוחשבת שלנו בהקשה על הלחצנים לעיל.', multiline: true },
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
    wired: true,
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
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'בקשת ההבראה ליולדת אושרה — היכל החתם סופר' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'בקשת ההבראה ליולדת שלך אושרה.' },
      { key: 'title', label: 'כותרת ראשית', default: 'הבקשה אושרה' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'היכל החתם סופר' },
      { key: 'vouchers_title', label: 'כותרת בלוק השוברים', default: 'מצורפים למייל זה שוברים למימוש ההטבה!' },
      { key: 'vouchers_note', label: 'הסבר בלוק השוברים', default: 'הדפיסו את השוברים והביאו אותם לבית החלמה ו/או למוקדים לצורך מימוש ההטבה.', multiline: true },
      { key: 'kicker', label: 'תווית קטנה מעל הכותרת', default: 'בשורה טובה!' },
      { key: 'heading_suffix', label: 'המשך הכותרת שאחרי הפנייה', default: 'בקשת ההבראה ליולדת אושרה' },
      { key: 'approved_note', label: 'ההודעה המודגשת על האישור', default: 'הבקשה שלכם טופלה ואושרה, מזל טוב!' },
      { key: 'next_title', label: 'כותרת "להמשך התהליך"', default: 'להמשך התהליך:' },
      { key: 'next_text', label: 'טקסט "להמשך התהליך"', default: 'עליכם לפנות אל בית ההחלמה שנרשמתם{בית_החלמה} ולהשלים מולם את הרישום ושאר הפרטים.', multiline: true, vars: ['{בית_החלמה}'], hint: '{בית_החלמה} יוחלף ב" — <שם בית ההחלמה>" אם נבחר, ואחרת יימחק' },
      { key: 'card_title', label: 'כותרת כרטיס המזון — יש מלאי', default: 'כרטיס מזון על סך 600 ₪' },
      { key: 'card_text', label: 'טקסט כרטיס המזון — יש מלאי', default: 'מצורף שובר לאיסוף כרטיס המזון. יש להדפיס את השובר ולהביאו ל<strong>מוקד שבחרתם</strong>:', multiline: true },
      { key: 'card_title_no_stock', label: 'כותרת כרטיס המזון — אין מלאי', default: 'כרטיס מזון על סך 600 ₪ — ממתין למלאי' },
      { key: 'no_stock_note', label: 'הודעה כשאין מלאי כרטיסים במוקד', default: 'שימו לב: במוקד שבחרתם{מוקד} אין כרגע כרטיסים זמינים.\n          ברגע שהמלאי יתחדש נשלח אליכם עדכון במייל עם שובר הכרטיס לאיסוף. (שובר ההבראה לבית ההחלמה מצורף כבר עכשיו.)', multiline: true, vars: ['{מוקד}'], hint: '{מוקד} יוחלף ב" (<שם המוקד>)" אם נבחר מוקד, ואחרת יימחק' },
      { key: 'birth_details_title', label: 'כותרת טבלת פרטי הלידה', default: 'פרטי הלידה:' },
      { key: 'ben_details_title', label: 'כותרת טבלת הפרטים שלך', default: 'הפרטים שלך:' },
    ],
  },
  {
    id: 'maternity_card',
    group: 'maternity',
    title: 'כרטיס המזון אושר',
    trigger: 'כשמנהל מסמן שהכרטיס אושר, או אוטומטית עם אישור הלידה כשיש מלאי',
    recipient: 'היולדת',
    department: 'maternity',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'כרטיס המזון אושר — היכל החתם סופר' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'כרטיס המזון שלך אושר וזמין לאיסוף.' },
      { key: 'title', label: 'כותרת ראשית', default: 'כרטיס המזון אושר' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'היכל החתם סופר' },
      { key: 'kicker', label: 'תווית קטנה מעל הכותרת', default: 'בשורה טובה!' },
      { key: 'heading_suffix', label: 'המשך הכותרת שאחרי הפנייה', default: 'כרטיס המזון אושר' },
      { key: 'intro', label: 'ההודעה המודגשת', default: 'כרטיס המזון שלך אושר וזמין לאיסוף.', multiline: true },
      { key: 'next_title', label: 'כותרת "להמשך התהליך"', default: 'להמשך התהליך:' },
      { key: 'next_text', label: 'טקסט "להמשך התהליך"', default: 'ניתן לאסוף את כרטיס המזון / השובר במוקד <strong>{מוקד}</strong>.', multiline: true, vars: ['{מוקד}'], hint: 'מוצג רק כשידוע שם המוקד' },
    ],
  },
  {
    id: 'card_stock_replenished',
    group: 'maternity',
    title: 'המלאי במוקד התחדש',
    trigger: 'כשמנהל מעדכן מלאי במוקד — נשלח לכל היולדות שהמתינו לכרטיס באותו מוקד',
    recipient: 'יולדות שהמתינו למלאי',
    department: 'maternity',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'המלאי התחדש — שובר כרטיס המזון מצורף — היכל החתם סופר' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'המלאי במוקד התחדש — שובר כרטיס המזון מצורף לאיסוף.' },
      { key: 'title', label: 'כותרת ראשית', default: 'המלאי התחדש' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'היכל החתם סופר' },
      { key: 'voucher_title', label: 'כותרת בלוק השובר', default: 'מצורף שובר לאיסוף כרטיס המזון!' },
      { key: 'voucher_note', label: 'הסבר בלוק השובר', default: 'הדפיסו את השובר והביאו אותו למוקד לצורך קבלת הכרטיס.', multiline: true },
      { key: 'heading_suffix', label: 'המשך הכותרת שאחרי הפנייה', default: 'המלאי במוקד התחדש' },
      { key: 'intro', label: 'ההודעה המודגשת', default: 'שימו לב — המלאי במוקד{מוקד} התחדש, וכעת ניתן לאסוף את כרטיס המזון.', multiline: true, vars: ['{מוקד}'], hint: '{מוקד} יוחלף בשם המוקד, ובהיעדרו ב" שבחרתם"' },
      { key: 'intro_note', label: 'שורת ההסבר מתחת להודעה', default: 'הדפיסו את השובר המצורף והביאו אותו למוקד לקבלת הכרטיס.', multiline: true },
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
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'בקשת ההלוואה אושרה — היכל החתם סופר' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'בקשת ההלוואה שלך אושרה.' },
      { key: 'title', label: 'כותרת ראשית', default: 'בקשת ההלוואה אושרה' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'היכל החתם סופר' },
      { key: 'kicker', label: 'תווית קטנה מעל הכותרת', default: 'בשורה טובה!' },
      { key: 'heading_suffix', label: 'המשך הכותרת שאחרי הפנייה', default: 'בקשת ההלוואה שלך אושרה' },
      { key: 'approved_note', label: 'ההודעה המודגשת על האישור', default: 'בקשת ההלוואה שלך טופלה ואושרה.' },
      { key: 'loan_details_title', label: 'כותרת טבלת פרטי ההלוואה', default: 'פרטי ההלוואה:' },
      { key: 'next_note', label: 'הודעת המשך הטיפול', default: 'בקשתכם הועברה לטיפול במזכירות גמ"ח חסדי אבות, ויצרו עמכם קשר בימים הקרובים.', multiline: true },
      { key: 'ben_details_title', label: 'כותרת טבלת הפרטים שלך', default: 'הפרטים שלך:' },
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
    wired: true,
    fields: [
      { key: 'subject_approved', label: 'נושא — אושר', default: 'בקשת הסיוע הרפואי אושרה — היכל החתם סופר' },
      { key: 'subject_rejected', label: 'נושא — נדחה', default: 'עדכון בנוגע לבקשת הסיוע הרפואי' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'סיוע רפואי' },
      { key: 'title_approved', label: 'כותרת — אושר', default: 'הבקשה אושרה' },
      { key: 'title_rejected', label: 'כותרת — נדחה', default: 'עדכון בקשה' },
      { key: 'preheader_rejected', label: 'תצוגה מקדימה — נדחה', default: 'עדכון בנוגע לבקשתך' },
      { key: 'kicker_approved', label: 'תווית קטנה — אושר', default: 'בשורה משמחת' },
      { key: 'kicker_rejected', label: 'תווית קטנה — נדחה', default: 'עדכון בנוגע לבקשתך' },
      { key: 'intro_approved', label: 'פסקה — אושר', default: 'שמחים לבשר כי בקשתך לסיוע רפואי <strong>אושרה</strong>.', multiline: true },
      { key: 'amount_label', label: 'תווית הסכום שאושר', default: 'הסכום שאושר' },
      { key: 'footer_approved', label: 'סיום — אושר', default: 'צוות המזכירות יצור עמך קשר להמשך התהליך. בברכה, היכל החתם סופר.', multiline: true },
      { key: 'intro_rejected', label: 'פסקה — נדחה', default: 'בקשתך לסיוע רפואי נבדקה, ולצערנו לא אושרה בשלב זה.', multiline: true },
      { key: 'footer_rejected', label: 'סיום — נדחה', default: 'לפרטים נוספים ניתן לפנות למזכירות. בברכה, היכל החתם סופר.', multiline: true },
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
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'דברי ברכה לנדיב · היכל החתם סופר' },
      { key: 'subject_reminder', label: 'שורת הנושא — תזכורת', default: 'תזכורת · דברי ברכה לנדיב' },
      { key: 'mazal_tov', label: 'שורת פתיחה', default: 'מזל טוב חוזר לרגל השמחה!' },
      { key: 'reminder_note', label: 'טקסט התזכורת', multiline: true, default: 'לפני מספר ימים שלחנו אליכם בקשה לכתוב דברי ברכה לנדיב. אולי המייל נשכח בין ההודעות? נשמח מאוד לשמוע מכם.' },
      { key: 'intro', label: 'פסקה ראשית', multiline: true, default: 'הסיוע שקיבלתם התאפשר בזכות נדיב לב שבחר לתמוך בכם — בעילום שם, בלי לבקש דבר בתמורה. נשמח מאוד אם תרצו לכתוב לו כמה מילות ברכה והכרת הטוב. מכתב קצר שיחמם את ליבו, ויראה לו שהתמיכה שלו הגיעה למקום הנכון.' },
      { key: 'highlight', label: 'המשפט המודגש', default: 'זו חובה שהיא זכות — להכיר טובה למי שפתח עבורכן את הלב!', multiline: true },
      { key: 'button', label: 'טקסט הכפתור', default: 'לכתיבת דברי ברכה' },
      { key: 'other_ways_title', label: 'כותרת "דרכים אחרות"', default: 'אפשר גם בדרכים אחרות:' },
      { key: 'way_reply', label: 'דרך 1 — תשובה במייל', multiline: true, default: 'להשיב ישירות למייל הזה — פשוט לכתוב את הברכה בגוף ההודעה, ואנחנו נדאג לשאר.' },
      { key: 'way_print', label: 'דרך 2 — הדפסה וסריקה', multiline: true, default: 'לכתוב בכתב יד — מצורף כאן דף מעוצב להדפסה. אפשר להדפיס אותו, למלא בו את רגשות ליבכן, לסרוק, ולשלוח לנו בחזרה.' },
    ],
  },
  {
    id: 'recovery_feedback',
    group: 'gratitude',
    title: 'בקשת משוב על בית ההחלמה',
    trigger: '5 ימים לאחר שבית ההחלמה סימן שהיולדת הגיעה',
    recipient: 'היולדת',
    department: 'maternity',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'נשמח לשמוע ממך · היכל החתם סופר', hint: 'המילה "סקר" לא מופיעה כאן במכוון' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'לצורך ייעול ושיפור השירות' },
      { key: 'title', label: 'כותרת ראשית', default: 'איך היה בבית ההחלמה?' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'לצורך ייעול ושיפור השירות' },
      { key: 'opening', label: 'משפט פתיחה', default: 'אנו מקווים שהשהות ב<strong>{בית_החלמה}</strong> הייתה נעימה ומרגיעה.', multiline: true, vars: ['{בית_החלמה}'], hint: '{בית_החלמה} יוחלף בשם בית ההחלמה, ובהיעדרו ב"בית ההחלמה"' },
      { key: 'intro', label: 'פסקת ההסבר', default: 'לצורך ייעול ושיפור השירות, נשמח לשמוע ממך על טיב השירות שקיבלת בבית ההחלמה.\n      זה ייקח פחות מדקה, ויעזור לנו לדאוג טוב יותר ליולדות הבאות.', multiline: true },
      { key: 'button', label: 'טקסט הכפתור', default: 'לשיתוף החוויה שלך' },
      { key: 'fallback_note', label: 'טקסט "חסום לכם הקישור?"', default: '<strong style="color:#334155;">חסום לכם הקישור?</strong><br/>\n          ניתן ללחוץ כאן לשליחת משוב דרך המייל:', multiline: true },
      { key: 'mail_button', label: 'טקסט כפתור המענה במייל', default: 'מענה מהיר במייל' },
      { key: 'footnote', label: 'הערה בתחתית', default: 'נפתחת טיוטת מייל מוכנה — רק למלא ציון מ־1 עד 10 לכל שאלה, ולשלוח.', multiline: true },
      { key: 'draft_intro', label: 'הוראות בטיוטת המייל', default: 'דרגי כל שאלה מ-1 (כלל לא מרוצה) עד 10 (מרוצה מאוד).\nכתבי את הציון אחרי הנקודתיים, ושלחי.', multiline: true, hint: 'שתי השורות הראשונות בטיוטת המייל שנפתחת' },
    ],
  },
  {
    id: 'gratitude_received',
    group: 'gratitude',
    title: 'אישור קבלת דברי הברכה',
    trigger: 'מיד עם קבלת מכתב הברכה — מהטופס באתר או מתשובה במייל',
    recipient: 'היולדת',
    department: 'maternity',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'קיבלנו את דברי הברכה — תודה רבה' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'דברי הברכה שלכם התקבלו' },
      { key: 'title', label: 'כותרת ראשית', default: 'תודה רבה!' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'דברי הברכה התקבלו' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'דברי הברכה שלכם התקבלו אצלנו, ואנו נדאג להעבירם לנדיב.', multiline: true },
      { key: 'thanks', label: 'פסקת התודה', default: 'תודה רבה מקרב לב — זה בדיוק מה שנותן כוח להמשיך ולסייע.', multiline: true },
      { key: 'attachment_note', label: 'הערה על הקובץ המצורף', default: 'מצורף עותק מעוצב של המכתב.', multiline: true },
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
  // existingContactEmail ו-registrationInviteEmail הוסרו מהקטלוג במכוון:
  // הם שרידי הארכיטקטורה הישנה שסרקה את תיבת Gmail. הדואר הנכנס עובר היום
  // דרך ה-webhook של Resend, והתפקיד שלהם הוחלף ב-benefits_link (לפונה רשום)
  // וב-maintenance_reply (ללא מזוהה). הראוט admin/gmail/auto-reply שקורא להם
  // אינו נקרא מאף מקום בקוד.

  // ── מערכת ─────────────────────────────────────────────────────────────────
  {
    id: 'verify_code_email',
    group: 'system',
    title: 'קוד אימות למייל',
    trigger: 'כשמשתמש מבקש קוד לאימות כתובת המייל (בהרשמה). תקף 10 דקות',
    recipient: 'הנרשם',
    department: 'igud',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'קוד אימות כתובת מייל — היכל החתם סופר' },
      { key: 'header', label: 'כותרת עליונה', default: 'היכל החתם סופר — אימות כתובת מייל' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'קוד האימות לכתובת המייל שלך:', multiline: true },
      { key: 'ttl_note', label: 'הערת תוקף הקוד', default: 'הקוד תקף ל-<strong>10 דקות</strong>.', multiline: true },
      { key: 'ignore_note', label: 'הערת "לא ביקשת"', default: 'אם לא ביקשת קוד זה, ניתן להתעלם מהודעה זו.', multiline: true },
      { key: 'footer', label: 'שורת התחתית', default: 'מייל זה נשלח ממערכת אוטומטית, אין להשיב למייל זה.', multiline: true },
    ],
  },
  {
    id: 'portal_credentials',
    group: 'system',
    title: 'פרטי כניסה לפורטל',
    trigger: 'כשמנהל שולח סיסמה לבית החלמה או לגורם המבצע בהלוואות',
    recipient: 'בית החלמה / גורם מבצע',
    department: 'לפי הפורטל',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'פרטי כניסה — {פורטל} · היכל החתם סופר', vars: ['{פורטל}'], hint: '{פורטל} יוחלף בשם הפורטל, למשל "פורטל בתי החלמה"' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: 'פרטי הכניסה ל{פורטל}', vars: ['{פורטל}'] },
      { key: 'subtitle', label: 'כותרת משנה', default: 'היכל החתם סופר', hint: 'הכותרת הראשית היא שם הפורטל, ונקבעת לפי מקום השליחה' },
      { key: 'kicker', label: 'תווית קטנה מעל הכותרת', default: 'פרטי כניסה' },
      { key: 'url_label', label: 'תווית כתובת הפורטל', default: 'כתובת הפורטל' },
      { key: 'password_label', label: 'תווית הסיסמה', default: 'הסיסמה שלכם' },
      { key: 'button', label: 'טקסט הכפתור', default: 'כניסה לפורטל' },
      { key: 'security_note', label: 'הערת אבטחה בתחתית', default: 'יש לשמור את פרטי הכניסה במקום בטוח ולא להעבירם לגורם לא מורשה. אם לא ביקשתם גישה זו — ניתן להתעלם מהודעה זו.', multiline: true },
    ],
  },
  {
    id: 'weekly_loans_report',
    group: 'system',
    title: 'דוח הלוואות שבועי',
    trigger: 'אוטומטית בכל יום ראשון ב-08:00, וגם בלחיצה על "שלח עכשיו"',
    recipient: 'הכתובת שהוגדרה לדוחות',
    department: 'main',
    wired: true,
    fields: [
      { key: 'subject', label: 'שורת הנושא', default: 'דוח הלוואות — {ממתינות} ממתינות לאישור', vars: ['{ממתינות}'], hint: '{ממתינות} יוחלף במספר ההלוואות הממתינות' },
      { key: 'preheader', label: 'שורת התצוגה המקדימה', default: '{ממתינות} הלוואות ממתינות לאישור', vars: ['{ממתינות}'] },
      { key: 'title', label: 'כותרת ראשית', default: 'דוח הלוואות' },
      { key: 'subtitle', label: 'כותרת משנה', default: 'היכל החתם סופר' },
      { key: 'intro', label: 'פסקת פתיחה', default: 'ריכוז בקשות ההלוואה במערכת.<br/>\n      להלן מצב ההלוואות נכון להיום:', multiline: true },
      { key: 'stat_awaiting', label: 'תווית — מאושרות וממתינות לביצוע', default: 'מאושרות וממתינות לביצוע' },
      { key: 'stat_pending', label: 'תווית — ממתינות לאישור', default: 'ממתינות לאישור' },
      { key: 'stat_disbursed', label: 'תווית — בוצעו השבוע', default: 'בוצעו השבוע' },
      { key: 'new_loans_title', label: 'כותרת טבלת ההלוואות החדשות', default: 'הלוואות מאושרות מאז הדוח הקודם{תאריך} — {מספר}', vars: ['{תאריך}', '{מספר}'], hint: '{תאריך} = " (dd/mm/yyyy)" של הדוח הקודם, {מספר} = כמות ההלוואות' },
      { key: 'col_family', label: 'כותרת עמודה — משפחה', default: 'משפחה' },
      { key: 'col_amount', label: 'כותרת עמודה — סכום', default: 'סכום' },
      { key: 'col_status', label: 'כותרת עמודה — סטטוס', default: 'סטטוס' },
      { key: 'col_date', label: 'כותרת עמודה — תאריך', default: 'תאריך' },
      { key: 'empty_note', label: 'הודעה כשאין הלוואות חדשות', default: 'אין הלוואות מאושרות מאז הדוח הקודם{תאריך}', vars: ['{תאריך}'] },
      { key: 'button', label: 'טקסט הכפתור', default: 'לחץ כאן לכניסה לאישור ההלוואות ' },
      { key: 'footnote', label: 'הערה בתחתית', default: 'במערכת ניתן לצפות בפרטי כל הלוואה ולסמן את ביצועה.', multiline: true },
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
