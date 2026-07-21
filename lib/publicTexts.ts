// ─────────────────────────────────────────────────────────────────────────────
// קטלוג הטקסטים הניתנים לעריכה בממשק הציבורי.
//
// כל טקסט מקבל מפתח יציב, וברירת המחדל היא הנוסח שהיה בקוד. המפתח הוא
// החוזה: שינוי שמו מנתק את הנוסח הערוך ששמור ב-DB ומחזיר את ברירת המחדל.
// לכן — לא משנים מפתח קיים, גם אם הנוסח שלו השתנה לגמרי.
//
// זהו פיילוט: כרגע רק מודל בקשת ההלוואה. שאר המסכים יתווספו בהדרגה,
// אחרי שהמנגנון יוכיח את עצמו על מסך אחד.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_TEXTS_KEY = 'public_texts'

export type PublicTexts = Record<string, string>

export interface PublicTextEntry {
  key: string
  /** הנוסח שבקוד — מוצג כשאין ערך ערוך, ומשמש כ"שחזור לברירת מחדל". */
  fallback: string
  /** תיאור קצר למסך העריכה — היכן הטקסט מופיע. */
  hint?: string
  /** טקסט ארוך → תיבה רב-שורתית במסך העריכה. */
  multiline?: boolean
}

export interface PublicTextGroup {
  title: string
  entries: PublicTextEntry[]
}

export const PUBLIC_TEXT_GROUPS: PublicTextGroup[] = [
  {
    title: 'מסך פתיחה — זיהוי',
    entries: [
      { key: 'welcome.title', fallback: 'ברוכים הבאים', hint: 'הכותרת הראשית' },
      {
        key: 'welcome.notice',
        fallback: 'לעת עתה הרישום לאיגוד הצאצאים הוא לתושבי ארץ הקודש בלבד',
        hint: 'הודעת ההדגשה הצהובה',
        multiline: true,
      },
      { key: 'welcome.tab.id', fallback: 'תעודת זהות', hint: 'לשונית ת"ז' },
      { key: 'welcome.tab.passport', fallback: 'דרכון', hint: 'לשונית דרכון' },
      { key: 'welcome.id.label', fallback: 'מספר תעודת זהות', hint: 'תווית שדה ת"ז' },
      { key: 'welcome.id.hint', fallback: 'הזן 9 ספרות כולל ספרת ביקורת', hint: 'שורת העזרה מתחת לת"ז' },
      { key: 'welcome.passport.label', fallback: 'מספר דרכון', hint: 'תווית שדה הדרכון' },
      { key: 'welcome.submit', fallback: 'כניסה למערכת', hint: 'כפתור הכניסה' },
      { key: 'welcome.submitting', fallback: 'מחפש...', hint: 'הכפתור בזמן חיפוש' },
      { key: 'welcome.footer', fallback: 'מערכת מאובטחת · כל הפרטים מוצפנים', hint: 'שורת התחתית' },
    ],
  },
  {
    title: 'אימות כניסה',
    entries: [
      { key: 'auth.title.login', fallback: 'כניסה לאזור האישי', hint: 'כותרת — כניסה' },
      { key: 'auth.title.setup', fallback: 'הגדרת סיסמה', hint: 'כותרת — הגדרה ראשונה' },
      { key: 'auth.title.reset', fallback: 'איפוס סיסמה', hint: 'כותרת — איפוס' },
      {
        key: 'auth.phone.choose',
        fallback: 'בחר/י מספר טלפון אליו נצלצל ונקריא את קוד הכניסה:',
        hint: 'הנחיה לבחירת טלפון', multiline: true,
      },
      { key: 'auth.call.incoming', fallback: 'בקרוב תתקבל אצלך שיחה מהמערכת שלנו', hint: 'הודעה אחרי שליחה' },
      { key: 'auth.call.valid', fallback: 'הקוד תקף ל-5 דקות', hint: 'תוקף הקוד' },
      { key: 'auth.code.label', fallback: 'קוד מהשיחה', hint: 'תווית שדה הקוד' },
      { key: 'auth.code.hint', fallback: '6 ספרות שהוקראו בשיחה', hint: 'שורת עזרה לקוד' },
      { key: 'auth.call.again', fallback: 'התקשרו אליי שוב', hint: 'קישור לשיחה חוזרת' },
      { key: 'auth.back', fallback: 'חזרה', hint: 'קישור חזרה' },
      { key: 'auth.emailcode.label', fallback: 'קוד מהמייל', hint: 'תווית קוד מהמייל' },
      { key: 'auth.emailcode.hint', fallback: '6 ספרות שנשלחו למייל', hint: 'שורת עזרה לקוד מהמייל' },
      { key: 'auth.emailcode.submit', fallback: 'כניסה', hint: 'כפתור הכניסה' },
      { key: 'auth.emailcode.again', fallback: 'שלחו לי קוד חדש', hint: 'קישור לקוד חדש' },
    ],
  },

  {
    title: 'כבר רשומים (איגוד הצאצאים)',
    entries: [
      { key: 'already.title', fallback: 'שים לב — אתם כבר רשומים אצלנו', hint: 'כותרת ההודעה' },
      { key: 'already.benefits', fallback: 'קבלת קישור להגשת בקשות למייל', hint: 'כפתור קבלת קישור' },
      { key: 'already.status', fallback: 'צפייה בסטטוס הבקשה שלי (יישלח למייל)', hint: 'כפתור בדיקת סטטוס' },
    ],
  },

  {
    title: 'לא נמצא במערכת',
    entries: [
      { key: 'notfound.title', fallback: 'לא מופיע במערכת', hint: 'כותרת המסך' },
      { key: 'notfound.register', fallback: 'רישום למערכת', hint: 'כפתור הרישום' },
      { key: 'notfound.back', fallback: 'חזרה לכניסה', hint: 'כפתור חזרה' },
    ],
  },

  {
    title: 'טופס רישום',
    entries: [
      { key: 'register.title', fallback: 'טופס רישום', hint: 'כותרת המסך' },
      { key: 'register.once.title', fallback: 'יש להירשם פעם אחת בלבד', hint: 'כותרת ההודעה האדומה' },
      // ⚠️ מפוצל לשלושה — ההדגשות (bold) הן חלק מהמבנה, ועריכה של
      // פסקה אחת שלמה הייתה מוחקת אותן (הסניטייזר מסיר תגיות HTML).
      {
        key: 'register.once.body1',
        fallback: 'מי שברשותו גם תעודת זהות וגם דרכון — יירשם עם',
        hint: 'ההודעה האדומה — תחילת המשפט', multiline: true,
      },
      { key: 'register.once.bold1', fallback: 'אמצעי זיהוי אחד בלבד', hint: 'ההודעה האדומה — מודגש' },
      {
        key: 'register.once.body2',
        fallback: ', והוא ישמש אותו לאורך כל התהליך.',
        hint: 'ההודעה האדומה — המשך', multiline: true,
      },
      {
        key: 'register.once.warn',
        fallback: 'הירשמות פעם שנייה תגרום לחסימת החשבון לצמיתות.',
        hint: 'ההודעה האדומה — אזהרה מודגשת', multiline: true,
      },
      { key: 'register.marital.title', fallback: 'מצב משפחתי', hint: 'כותרת הכרטיס' },
      { key: 'register.heads.title', fallback: 'שימו לב — הרישום מיועד לראשי משפחה בלבד', hint: 'כותרת ההודעה הצהובה' },
      {
        key: 'register.heads.body',
        fallback: 'אין רישום כלל לבחורים או לילדים.',
        hint: 'ההודעה הצהובה — גוף', multiline: true,
      },
      {
        key: 'register.heads.warn',
        fallback: 'רישום של בחור או ילד יגרום לחסימת הרישום שלו בעתיד.',
        hint: 'ההודעה הצהובה — אזהרה מודגשת', multiline: true,
      },
      { key: 'register.marital.married', fallback: 'נשואים', hint: 'כפתור נשואים' },
      { key: 'register.marital.other', fallback: 'אחר', hint: 'כפתור אחר' },
    ],
  },

  {
    title: 'אזור אישי — פרטים',
    entries: [
      { key: 'dash.field.id', fallback: 'ת.ז.', hint: 'תווית תעודת זהות' },
      { key: 'dash.field.phone', fallback: 'טלפון', hint: 'תווית טלפון' },
      { key: 'dash.field.email', fallback: 'מייל', hint: 'תווית מייל' },
      { key: 'dash.field.marital', fallback: 'מצב משפחתי', hint: 'תווית מצב משפחתי' },
      { key: 'dash.field.spouse', fallback: 'שם בן/בת הזוג', hint: 'תווית שם בן/בת הזוג' },
      { key: 'dash.field.spouseId', fallback: 'ת.ז בן/בת הזוג', hint: 'תווית ת.ז בן/בת הזוג' },
      { key: 'dash.field.address', fallback: 'כתובת', hint: 'תווית כתובת' },
      { key: 'dash.field.children', fallback: 'מספר ילדים', hint: 'תווית מספר ילדים' },
      { key: 'dash.field.lineage', fallback: 'סדר הייחוס', hint: 'תווית סדר הייחוס' },
      { key: 'dash.status.title', fallback: 'סטטוס הבקשות שלי', hint: 'כותרת מקטע הסטטוס' },
    ],
  },

  {
    title: 'דיווח לידה',
    entries: [
      { key: 'birth.title', fallback: 'בקשת הבראה ליולדת', hint: 'כותרת המסך' },
      { key: 'birth.details.title', fallback: 'פרטי הלידה', hint: 'כותרת מקטע הפרטים' },
      { key: 'birth.date.label', fallback: 'תאריך הלידה', hint: 'תווית תאריך' },
      { key: 'birth.type.label', fallback: 'סוג לידה', hint: 'תווית סוג הלידה' },
      {
        key: 'birth.twins.note',
        fallback: 'בלידת תאומים יש למלא את פרטי שני התינוקות בנפרד. הזכאות בבית ההחלמה תהיה 4 ימים.',
        hint: 'הערה בלידת תאומים', multiline: true,
      },
      { key: 'birth.home.label', fallback: 'בית החלמה', hint: 'תווית בית ההחלמה' },
      { key: 'birth.notes.label', fallback: 'הערות', hint: 'תווית הערות' },
      { key: 'birth.cert.label', fallback: 'אישור לידה', hint: 'תווית אישור הלידה' },
    ],
  },

  {
    title: 'בקשה נשלחה',
    entries: [
      { key: 'sent.title', fallback: 'הבקשה נשלחה!', hint: 'כותרת המסך' },
      { key: 'sent.body1', fallback: 'הבקשה התקבלה במערכת ותטופל בהקדם.', hint: 'שורה ראשונה', multiline: true },
      { key: 'sent.body2', fallback: 'יישלח אליכם הודעה.', hint: 'שורה שנייה' },
      { key: 'sent.back', fallback: 'חזרה לאזור האישי', hint: 'כפתור חזרה' },
      { key: 'sent.exit', fallback: 'יציאה', hint: 'כפתור יציאה' },
    ],
  },

  {
    title: 'השלמת מסמכים',
    entries: [
      { key: 'docs.title', fallback: 'השלמת מסמכים', hint: 'כותרת המסך' },
      { key: 'docs.lineage.title', fallback: 'תיקון סדר הדורות', hint: 'כותרת תיקון הדורות' },
      {
        key: 'docs.lineage.body',
        fallback: 'המשרד מצא אי-דיוק בשרשרת הדורות שמסרת ומבקש לעדכן אותה.',
        hint: 'הסבר תיקון הדורות', multiline: true,
      },
    ],
  },

  {
    title: 'אזור אישי — השלמת שם הילד',
    entries: [
      { key: 'babyname.title', fallback: 'השלמת שם הילד — חובה', hint: 'כותרת החלון' },
      {
        key: 'babyname.subtitle',
        fallback: 'כדי להמשיך ולהגיש בקשה חדשה (לידה, הלוואה, סיוע רפואי ועוד) יש להשלים תחילה את שם הילד',
        hint: 'הסבר מתחת לכותרת', multiline: true,
      },
    ],
  },

  {
    title: 'בקשת הלוואה',
    entries: [
      { key: 'loan.modal.title', fallback: 'בקשת הלוואה', hint: 'כותרת החלון' },
      { key: 'loan.purpose.label', fallback: 'מטרת ההלוואה', hint: 'תווית בורר המטרה' },
      { key: 'loan.purpose.placeholder', fallback: 'בחר מטרה...', hint: 'ברירת המחדל בבורר' },
      { key: 'loan.purposeDetails.label', fallback: 'פירוט הבקשה', hint: 'תווית תיבת הפירוט' },
      { key: 'loan.purposeDetails.placeholder', fallback: 'פרט/י את מטרת ההלוואה...', hint: 'טקסט מוצע בתיבת הפירוט' },
      { key: 'loan.amount.label', fallback: 'סכום מבוקש (₪)', hint: 'תווית שדה הסכום' },
      { key: 'loan.amount.hint', fallback: 'עד 30,000 ₪', hint: 'שורת העזרה מתחת לסכום' },
      { key: 'loan.installments.label', fallback: 'מספר תשלומים', hint: 'תווית שדה התשלומים' },
      { key: 'loan.installments.hint', fallback: 'עד 60 תשלומים', hint: 'שורת העזרה מתחת לתשלומים' },
      {
        key: 'loan.currency.notice',
        fallback: 'שים לב: ההלוואה מתבצעת במטבע דולר ($).',
        hint: 'הודעת ההדגשה הצהובה',
        multiline: true,
      },
      { key: 'loan.monthly.label', fallback: 'תשלום חודשי משוער:', hint: 'לפני הסכום המחושב' },
      { key: 'loan.declaration.label', fallback: 'האם פנית בעבר לגמ"ח חתם סופר?', hint: 'שאלת ההצהרה' },
      { key: 'loan.notes.label', fallback: 'הערות נוספות', hint: 'תווית תיבת ההערות' },
      { key: 'loan.notes.placeholder', fallback: 'כל מידע רלוונטי נוסף...', hint: 'טקסט מוצע בתיבת ההערות' },
      { key: 'loan.submit', fallback: 'שלח בקשה', hint: 'כפתור השליחה' },
      { key: 'loan.submitting', fallback: 'שולח...', hint: 'הכפתור בזמן שליחה' },
      { key: 'loan.cancel', fallback: 'ביטול', hint: 'כפתור הביטול' },
    ],
  },
]

/** כל הערכים בשטוח — לחיפוש מפתח יחיד. */
export const PUBLIC_TEXT_ENTRIES: PublicTextEntry[] = PUBLIC_TEXT_GROUPS.flatMap(g => g.entries)

const FALLBACKS: Record<string, string> = Object.fromEntries(
  PUBLIC_TEXT_ENTRIES.map(e => [e.key, e.fallback]),
)

/** ברירת המחדל שבקוד עבור מפתח. מחרוזת ריקה אם המפתח לא מוכר. */
export function fallbackOf(key: string): string {
  return FALLBACKS[key] ?? ''
}

/**
 * הטקסט האפקטיבי: הנוסח הערוך אם קיים ואינו ריק, אחרת ברירת המחדל שבקוד.
 *
 * ⚠️ נוסח ערוך שהוא מחרוזת ריקה נחשב "לא נערך" בכוונה — אחרת מחיקה בטעות
 * במסך העריכה הייתה מעלימה טקסט מהאתר בלי שאיש ישים לב.
 */
export function textOf(texts: PublicTexts | null | undefined, key: string): string {
  const edited = texts?.[key]
  if (typeof edited === 'string' && edited.trim() !== '') return edited
  return fallbackOf(key)
}
