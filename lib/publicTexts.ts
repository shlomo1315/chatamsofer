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
  /**
   * קבוצה שלא ניתן להגיע אליה בעריכה במקום — הודעות שגיאה מופיעות רק
   * בתנאים מסוימים (ת"ז שגויה, שדה חסר), ולכן הן נערכות מרשימה בסרגל.
   */
  listOnly?: boolean
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
    title: 'טופס רישום — שדות',
    entries: [
      { key: 'reg.wife.title', fallback: 'פרטי האשה', hint: 'כותרת מקטע האשה' },
      { key: 'reg.contact.title', fallback: 'פרטי קשר', hint: 'כותרת מקטע פרטי הקשר' },
      { key: 'reg.address.title', fallback: 'כתובת', hint: 'כותרת מקטע הכתובת' },
      { key: 'reg.children.title', fallback: 'ילדים', hint: 'כותרת מקטע הילדים' },
      { key: 'reg.firstName', fallback: 'שם פרטי', hint: 'תווית שם פרטי' },
      { key: 'reg.lastName', fallback: 'שם משפחה', hint: 'תווית שם משפחה' },
      { key: 'reg.birthDate', fallback: 'תאריך לידה', hint: 'תווית תאריך לידה' },
      { key: 'reg.wife.birthDate', fallback: 'תאריך לידה של האשה', hint: 'תווית תאריך לידה — אשה' },
      { key: 'reg.wife.docType', fallback: 'סוג מסמך זיהוי של האשה', hint: 'תווית סוג מסמך — אשה' },
      { key: 'reg.community', fallback: 'השתייכות קהילתית', hint: 'תווית השתייכות קהילתית' },
      {
        key: 'reg.community.hint',
        fallback: 'לא חובה, אולם מומלץ לצורך היערכות ורישום להטבות בהמשך בעז״ה',
        hint: 'שורת עזרה — השתייכות קהילתית', multiline: true,
      },
      { key: 'reg.phone.husband', fallback: 'טלפון בעל', hint: 'תווית טלפון בעל' },
      { key: 'reg.phone.main', fallback: 'טלפון ראשי', hint: 'תווית טלפון ראשי (רווק/אלמן)' },
      { key: 'reg.phone.hint', fallback: 'מספר נייד ישראלי המתחיל ב-05', hint: 'שורת עזרה לטלפון' },
      { key: 'reg.phone.wife', fallback: 'טלפון אשה', hint: 'תווית טלפון אשה' },
      { key: 'reg.phone.extra', fallback: 'טלפון נוסף', hint: 'תווית טלפון נוסף' },
      { key: 'reg.optional', fallback: 'לא חובה', hint: 'שורת עזרה — שדה לא חובה' },
      { key: 'reg.email', fallback: 'דואר אלקטרוני', hint: 'תווית מייל' },
      { key: 'reg.children.count', fallback: 'מספר ילדים', hint: 'תווית מספר ילדים' },
      { key: 'reg.lineage.title', fallback: 'סדר הדורות — שיוך לחתם סופר', hint: 'כותרת מקטע סדר הדורות' },
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

  // ─── הודעות שגיאה ─────────────────────────────────────────────────────────
  // listOnly: מופיעות רק בתנאים מסוימים (ת"ז שגויה, שדה חסר), ולכן אי אפשר
  // ללחוץ עליהן במסך. נערכות מרשימה בסרגל.
  {
    title: 'הודעות שגיאה — זיהוי וכניסה',
    listOnly: true,
    entries: [
      { key: 'err.id.empty', fallback: 'אנא הזן מספר תעודת זהות' },
      { key: 'err.id.invalid', fallback: 'תעודת הזהות שהזנתם אינה תקינה' },
      { key: 'err.passport.empty', fallback: 'אנא הזן מספר דרכון' },
      { key: 'err.code.call', fallback: 'אנא הזן את הקוד שהוקרא בשיחה' },
      { key: 'err.code.email', fallback: 'אנא הזן את הקוד שנשלח למייל' },
      { key: 'err.password.mismatch', fallback: 'הסיסמאות אינן תואמות' },
      {
        key: 'err.nophone',
        fallback: 'לא נמצא מספר טלפון במערכת עבור משתמש זה. אנא היכנס עם סיסמה או פנה למשרד.',
        multiline: true,
      },
      { key: 'err.network', fallback: 'שגיאת רשת' },
      { key: 'err.network.retry', fallback: 'שגיאת רשת. אנא נסה שוב.' },
    ],
  },

  {
    title: 'הודעות שגיאה — טופס הרשמה',
    listOnly: true,
    entries: [
      { key: 'err.required', fallback: 'אנא מלא את כל שדות החובה' },
      { key: 'err.required.name', fallback: 'אנא מלא את כל שדות החובה: שם פרטי, שם משפחה וטלפון' },
      { key: 'err.form.fix', fallback: 'אנא תקן את שגיאות הטופס' },
      { key: 'err.city.empty', fallback: 'אנא בחר עיר מגורים' },
      { key: 'err.street.empty', fallback: 'אנא הזן שם רחוב' },
      { key: 'err.house.empty', fallback: 'אנא הזן מספר בית' },
      { key: 'err.birthdate.empty', fallback: 'אנא הזן תאריך לידה' },
      { key: 'err.birthdate.wife', fallback: 'אנא הזן תאריך לידה של האשה' },
      { key: 'err.phone.atleastone', fallback: 'אנא הזן לפחות מספר טלפון אחד' },
      {
        key: 'err.phone.invalid',
        fallback: 'טלפון נוסף אינו תקין — יש להזין מספר נייד ישראלי המתחיל ב-05',
        multiline: true,
      },
      { key: 'err.phone.dupWife', fallback: 'טלפון נוסף זהה לטלפון האשה — יש להזין מספר אחר', multiline: true },
      { key: 'err.phone.dupHusband', fallback: 'טלפון נוסף זהה לטלפון הבעל — יש להזין מספר אחר', multiline: true },
      {
        key: 'err.phone.verify',
        fallback: 'יש לאמת לפחות מספר טלפון אחד — לחצו על "קבלת קוד אימות בשיחה" ליד אחד הטלפונים.',
        multiline: true,
      },
      {
        key: 'err.email.verify',
        fallback: 'יש לאמת את כתובת המייל בקוד שנשלח אליה (כפתור "שליחת קוד אימות למייל").',
        multiline: true,
      },
      { key: 'err.email.verifyNew', fallback: 'יש לאמת את כתובת המייל החדשה בקוד שנשלח אליה.', multiline: true },
      { key: 'err.phone.verifyNew', fallback: 'יש לאמת את מספר הטלפון החדש בקוד שיוקרא בשיחה.', multiline: true },
      { key: 'err.declaration', fallback: 'אנא אשר את ההצהרה' },
      { key: 'err.lineage.declare', fallback: 'יש לאשר את הצהרת הייחוס לפני בחירת סדר הדורות', multiline: true },
      {
        key: 'err.lineage.incomplete',
        fallback: 'יש להשלים את סדר הדורות עד הדור שלך, לסמן בן/חתן בכל דור וללחוץ "הוסף אותי"',
        multiline: true,
      },
      {
        key: 'err.lineage.chain',
        fallback: 'יש להשלים את שרשרת הדורות — כולל הוספת עצמך כדור האחרון וסימון בן/חתן.',
        multiline: true,
      },
      {
        key: 'err.benefits.select',
        fallback: 'בשאלה על הטבות שהתקבלו בעבר — יש לסמן לפחות אפשרות אחת, או לסמן "לא קיבלתי הטבות בעבר".',
        multiline: true,
      },
      {
        key: 'err.benefits.holidays',
        fallback: 'סימנתם "מענק לקראת החגים" — יש לבחור באילו חגים קיבלתם אותו.',
        multiline: true,
      },
      { key: 'err.upload.id', fallback: 'שגיאה בהעלאת תעודת הזהות. אנא נסה שוב.' },
    ],
  },

  {
    title: 'הודעות שגיאה — בקשות',
    listOnly: true,
    entries: [
      { key: 'err.request.type', fallback: 'בחר סוג בקשה' },
      { key: 'err.married.only', fallback: 'בקשה זו זמינה לרשומים במצב נשואים בלבד.', multiline: true },
      {
        key: 'err.married.birth',
        fallback: 'בקשת הבראה ליולדת זמינה לרשומים במצב נשואים בלבד.',
        multiline: true,
      },
      { key: 'err.docs.pending', fallback: 'נדרשת השלמת מסמכים. בדוק את המייל שנשלח אליך.', multiline: true },
      { key: 'err.loan.purpose', fallback: 'אנא פרט את מטרת ההלוואה' },
      { key: 'err.loan.wedding', fallback: 'יש לצרף הזמנה של החתונה' },
      { key: 'err.loan.max', fallback: 'הסכום המרבי הוא 30,000 ₪' },
      { key: 'err.loan.installments', fallback: 'מספר התשלומים המרבי הוא 60' },
      { key: 'err.aid.reason', fallback: 'אנא פרט את סיבת הבקשה' },
      { key: 'err.doc.attach', fallback: 'אנא צרף מסמך' },
      { key: 'err.doc.approval', fallback: 'אנא צרף מסמך אישור' },
      { key: 'err.upload.doc', fallback: 'שגיאה בהעלאת המסמך. אנא נסה שוב.' },
    ],
  },

  {
    title: 'הודעות שגיאה — דיווח לידה',
    listOnly: true,
    entries: [
      { key: 'err.birth.home', fallback: 'אנא בחר בית החלמה' },
      { key: 'err.birth.cert', fallback: 'אנא צרף אישור לידה' },
      { key: 'err.birth.babyId', fallback: 'אנא הזן תעודת זהות או דרכון של הנולד/ת' },
      { key: 'err.birth.babyIdInvalid', fallback: 'תעודת הזהות של הנולד/ת אינה תקינה' },
      { key: 'err.birth.baby2Gender', fallback: 'אנא בחר בן או בת עבור התינוק השני' },
      { key: 'err.birth.baby2Id', fallback: 'אנא הזן תעודת זהות או דרכון של התינוק השני' },
      { key: 'err.birth.baby2IdInvalid', fallback: 'תעודת הזהות של התינוק השני אינה תקינה' },
      { key: 'err.birth.twinsSameId', fallback: 'שני התאומים חייבים להיות עם תעודות זהות שונות', multiline: true },
      {
        key: 'err.birth.window',
        fallback: 'ניתן להגיש בקשה עד 30 יום מתאריך הלידה. אם קיימות נסיבות מיוחדות, נשמח לסייע — אנא פנו למשרד.',
        multiline: true,
      },
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

// ─── הודעות שגיאה: מיפוי לפי הנוסח המקורי ───────────────────────────────────
// ⚠️ ב-127 מקומות בקוד נקרא setError('<נוסח>'). במקום לגעת בכל אחד מהם
// (ולסכן טעות באחד), הנוסח עצמו משמש כמפתח: errorText() מוצא את המפתח
// המתאים ומחזיר את הנוסח הערוך, ואם אין — את המקורי כפי שהוא.
//
// המשמעות: הודעה שאינה בקטלוג עדיין עובדת — היא פשוט לא ניתנת לעריכה.
const KEY_BY_FALLBACK: Record<string, string> = Object.fromEntries(
  PUBLIC_TEXT_GROUPS.filter(g => g.listOnly)
    .flatMap(g => g.entries)
    .map(e => [e.fallback, e.key]),
)

/** הנוסח האפקטיבי של הודעת שגיאה, לפי הנוסח המקורי שבקוד. */
export function errorText(texts: PublicTexts | null | undefined, original: string): string {
  const key = KEY_BY_FALLBACK[original]
  return key ? textOf(texts, key) : original
}
