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
