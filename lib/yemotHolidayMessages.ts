// ─────────────────────────────────────────────────────────────────────────────
// הודעות שלוחת חלוקות החגים בימות — טקסט ניתן לעריכה, ואפשרות הקלטה אנושית.
//
// נשמר ב-app_settings תחת 'yemot_holiday_messages' (JSON של key → { text, audio }).
// אותו דפוס בדיוק כמו שלוחת היולדות, כדי שמסך ההגדרות יעבוד באותה צורה ולא
// יהיו שני מנגנונים שונים לאותו דבר.
//
// ⚠️ ההודעות הדינמיות (עם {name} / {distribution}) אינן ניתנות להקלטה: שם
// המשפחה ושם החלוקה משתנים בכל שיחה, והקלטה קבועה הייתה מקריאה נתון שגוי.
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from '@/lib/apiAuth'

export const HOLIDAY_MSG_KEY = 'yemot_holiday_messages'

export type HolidayMsg = { text: string; audio?: string | null }
export type HolidayMessages = Record<string, HolidayMsg>

export type HolidayMsgMeta = {
  key: string
  label: string
  defaultText: string
  allowAudio: boolean
  placeholders?: string[]
  hint?: string
}

export const HOLIDAY_MESSAGE_META: HolidayMsgMeta[] = [
  // ⚠️ הזיהוי הוא לפי תעודת זהות שמוקשת בשיחה, ולא לפי מספר הטלפון שממנו
  // התקשרו: על אותו מספר יכולים להיות רשומים כמה נרשמים (הורים וילדים
  // נשואים באותו בית), וזיהוי לפי טלפון היה רושם את הכרטסת הלא נכונה.
  {
    key: 'ask_id', label: 'בקשת תעודת זהות', allowAudio: true,
    defaultText: 'להרשמה לחלוקה הקישו את 9 ספרות תעודת הזהות של הנרשם ולאחר מכן הקישו סולמית',
  },
  {
    key: 'id_invalid', label: 'תעודת זהות לא תקינה', allowAudio: true,
    defaultText: 'תעודת הזהות אינה תקינה יש להקיש 9 ספרות',
  },
  {
    key: 'identify', label: 'זיהוי המשפחה', allowAudio: false, placeholders: ['name'],
    defaultText: 'שלום וברכה המערכת זיהתה אתכם בשם {name}',
    hint: 'הודעה דינמית — חובה לכלול {name}. אין אפשרות הקלטה.',
  },
  // ⚠️ שלב א' — רישום בלבד. שיוך הכרטיס נעשה בשלב הבא, ולכן אין כאן תפריט:
  // תפריט בן אפשרות אחת מאריך את השיחה ומבלבל, במיוחד למי שאינו גולש.
  {
    key: 'ask_confirm', label: 'בקשת אישור הרישום', allowAudio: false, placeholders: ['distribution'],
    defaultText: 'לרישום לחלוקת {distribution} הקישו 1',
    hint: 'הודעה דינמית — חובה לכלול {distribution} (שם החלוקה הפעילה).',
  },
  {
    key: 'success', label: 'הרישום נקלט', allowAudio: false, placeholders: ['name', 'distribution'],
    defaultText: 'רישומכם לחלוקת {distribution} נקלט בהצלחה בעזרת השם במהלך חודש אלול תקבלו עדכון מדויק על אופן החלוקה',
  },
  {
    key: 'already', label: 'כבר רשומים', allowAudio: false, placeholders: ['name', 'distribution'],
    defaultText: 'רישומכם לחלוקת {distribution} כבר נקלט אין צורך בפעולה נוספת',
    hint: 'נשמע למי שנרשם כבר — בטלפון, באתר, במייל או בטופס נדרים.',
  },
  // ⚠️ "אינה רשומה" ולא "שגיאה": הרישום פתוח רק למי שיש לו כרטסת משלו באיגוד
  // הצאצאים. מי שמופיע כילד בכרטסת של הוריו אינו רשום באיגוד בעצמו, ולכן ת"ז
  // שלו לא תימצא — ההודעה אומרת לו מה לעשות ולא רק שנכשל.
  {
    key: 'not_found', label: 'תעודת זהות לא נמצאה', allowAudio: true,
    defaultText: 'תעודת הזהות שהקשתם אינה רשומה באיגוד הצאצאים יש להירשם קודם לאיגוד ולאחר מכן לחייג שוב',
  },
  {
    key: 'not_eligible', label: 'כרטסת שאינה פעילה', allowAudio: true,
    defaultText: 'הכרטסת שלכם באיגוד הצאצאים אינה פעילה לרישום כרגע לפרטים נוספים ניתן לפנות למשרד',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 "ממתין לאישור" נפרד מ"כרטסת שאינה פעילה".
  //
  // ⚠️ שתי המשמעויות נאמרו באותה הודעה, וזו טעות שנשמעה ל-6,048 משפחות:
  // מי שנרשם כראוי וממתין לאישור שמע "הכרטסת שלכם אינה פעילה... פנו
  // למשרד" — כלומר נשלח להתקשר בגלל בעיה שאינה קיימת. ההמתנה לאישור היא
  // המצב *התקין* בשלב הזה, ולא תקלה בכרטסת.
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: 'pending_approval', label: 'הבקשה ממתינה לאישור', allowAudio: true,
    defaultText: 'בקשתכם לחלוקת החגים נקלטה וממתינה לאישור לאחר האישור תוכלו לבחור את מוקד החלוקה אין צורך בפעולה נוספת',
    hint: 'נשמע למי שרשום ומאושר טרם — מצב תקין, ולא תקלה בכרטסת.',
  },
  {
    key: 'closed', label: 'הרישום סגור', allowAudio: true,
    defaultText: 'הרישום לחלוקת החגים אינו פתוח כרגע נשמח לעמוד לרשותכם במועד הרישום',
  },
  { key: 'cancelled', label: 'המשתמש לא אישר', allowAudio: true, defaultText: 'הרישום לא בוצע תודה ולהתראות' },
  { key: 'failed', label: 'תקלה ברישום', allowAudio: true, defaultText: 'אירעה תקלה ברישום אנא נסו שוב מאוחר יותר או פנו למשרד' },

  // ── תפריט ראשי ─────────────────────────────────────────────────────────
  // 🔴 התפריט ממומש כאן ולא כ-type=menu בימות: שלוחה 6 נשארת כפי שהיא,
  // ואיננו נוגעים בהגדרה של מסלול רישום שעובד.
  {
    key: 'main_menu', label: 'תפריט ראשי', allowAudio: true,
    defaultText: 'לרישום לחלוקה הקישו 1 לחיבור הכרטיס הקישו 2 ' +
      'לבחירת מוקד החלוקה הקישו 3 לשמיעת המוקד שבחרתם הקישו 4',
  },

  // ── מקש 2: חיבור כרטיס נדרים ────────────────────────────────────────────
  // 🔴 סדר הפעולות: קודם מוקד, אחר כך כרטיס. הכרטיס נמסר *במוקד*, ולכן
  // מי שטרם בחר מוקד אין לו כרטיס ביד — ובקשה להקיש מספר הייתה שולחת
  // אותו לחפש משהו שאינו קיים.
  {
    key: 'card_no_center', label: 'טרם נבחר מוקד — לפני חיבור כרטיס', allowAudio: true,
    defaultText: 'עדיין לא בחרתם מוקד לקבלת הכרטיס יש לבחור קודם מוקד במערכת ' +
      'לבחירת מוקד הקישו 3 בתפריט הראשי',
    hint: 'נשמע במקש 2 כשהמשפחה טרם בחרה מוקד. הכרטיס נמסר במוקד, ולכן זהו הסדר.',
  },
  {
    key: 'card_ask', label: 'בקשת מספר כרטיס נדרים', allowAudio: true,
    defaultText: 'הקישו את מספר הכרטיס של נדרים שקיבלתם ולאחר מכן הקישו סולמית',
  },
  {
    key: 'card_invalid', label: 'מספר כרטיס לא תקין', allowAudio: true,
    defaultText: 'מספר הכרטיס אינו תקין יש להקיש את הספרות המופיעות על גבי הכרטיס',
  },
  {
    // ⚠️ דינמית — מקריאה את הספרות שהוקשו לאישור, כמו בשלוחת היולדות.
    key: 'card_readback', label: 'הקראת מספר הכרטיס לאישור', allowAudio: false,
    placeholders: ['card'],
    defaultText: '{card} לאישור הקישו 1 לתיקון הקישו 2',
    hint: 'הודעה דינמית — חובה לכלול {card}. אין אפשרות הקלטה.',
  },
  {
    key: 'card_success', label: 'הכרטיס חובר בהצלחה', allowAudio: true,
    defaultText: 'הכרטיס חובר בהצלחה וההטענה בוצעה שיהיה חג שמח',
  },
  {
    key: 'card_already', label: 'כרטיס כבר מחובר', allowAudio: true,
    defaultText: 'כרטיס כבר מחובר לרישום שלכם לא ניתן לחבר כרטיס נוסף אם יש צורך בעדכון אנא פנו למשרד',
  },
  {
    // 🔴 סיבת הכישלון נאמרת ולא רק "נכשל": מי ששומע "אירעה תקלה" מתקשר
    // למשרד, ומי ששומע "הכרטיס כבר משויך למשפחה אחרת" יודע לבדוק שלקח
    // את הכרטיס הנכון מהמוקד.
    key: 'card_failed', label: 'חיבור הכרטיס נכשל (עם סיבה)', allowAudio: false,
    placeholders: ['reason'],
    defaultText: 'חיבור הכרטיס לא הושלם {reason} ניתן לנסות שוב או לפנות למשרד',
    hint: 'הודעה דינמית — {reason} מוחלף בסיבת הכישלון. אין אפשרות הקלטה.',
  },

  // ── בחירת מוקד ─────────────────────────────────────────────────────────
  {
    key: 'centers_closed', label: 'בחירת המוקדים סגורה', allowAudio: true,
    defaultText: 'בחירת מוקד החלוקה אינה פתוחה כעת',
    hint: 'מושמע כשמתג בחירת המוקדים סגור — נפרד מהודעת "הרישום סגור"',
  },
  {
    // 🔴 המועד חלף — נפרד מ"סגור": מי ששומע "אינה פתוחה כעת" מניח
    // שייפתח שוב ומתקשר מחר. כאן נאמר במפורש שהמועד הסתיים.
    key: 'centers_deadline_over', label: 'המועד לבחירת מוקד הסתיים', allowAudio: true,
    defaultText: 'המועד לבחירת מוקד החלוקה הסתיים. לפרטים נוספים ניתן לפנות למשרד',
  },
  {
    // 🔴 הספירה לאחור — מושמעת לפני הבחירה.
    //
    // ⚠️ דינמית ולכן ללא הקלטה: {left} מוחלף ב"יומיים ו-3 שעות" ומשתנה
    // בכל שיחה. הקלטה קבועה הייתה מקריאה זמן שגוי.
    key: 'centers_countdown', label: 'זמן שנותר לבחירה', allowAudio: false,
    placeholders: ['left'],
    defaultText: 'שימו לב, המערכת תיסגר לבחירת המוקד בעוד {left}',
    hint: 'מושמע רק כשהוגדר מועד אחרון לחלוקה. {left} מוחלף אוטומטית.',
  },
  {
    key: 'centers_intro', label: 'הסבר לפני בחירת המוקד', allowAudio: true,
    // ⚠️ אין שוברים ואין הדפסה — המשפחה מגיעה למוקד ומקבלת את הכרטיס.
    defaultText: 'לתשומת לב, המוקד שתבחרו הוא המוקד היחיד שבו תוכלו לקבל את הכרטיס. ' +
      'כרטיס שיילקח ממוקד אחר לא ניתן יהיה להטעין. ' +
      'כשהכרטיס יהיה מוכן תקבלו על כך הודעה בטלפון ובמייל, ' +
      'ואז תוכלו להגיע למוקד שבחרתם ולקבל אותו. ' +
      'אין טעם לפנות בענין זה במייל או בטלפון',
  },
  {
    key: 'ask_region', label: 'בחירת אזור', allowAudio: true,
    defaultText: 'שימו לב, המתגוררים בערים שבהן אין מוקד חלוקה עליהם לבחור מוקד בעיר אחרת. ' +
      'לירושלים והסביבה הקישו 1 למרכז הקישו 2 לצפון הקישו 3 לדרום הקישו 4',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 🔴 ההקדמה הופרדה מהרשימה — כדי שאפשר יהיה להקליט אותה בקול טבעי.
  //
  // ⚠️ רשימת הערים עצמה חייבת להישאר TTS: היא נבנית מהמוקדים הפתוחים
  // ומשתנה בכל פתיחה או סגירה של מוקד. הקלטה קבועה שלה הייתה אומרת
  // "לחיפה הקישו 8" בזמן שמקש 8 מוביל לעיר אחרת — כלומר שולחת משפחות
  // למקום הלא נכון. זה בדיוק מה שאסור לתת לערוך ידנית.
  //
  // ⚠️ ההפרדה היא הפשרה הנכונה: המנהל שולט בטון, בפסיקים ובניסוח של
  // המשפט הקבוע, והמספרים נשארים נגזרים מהמוקדים בפועל.
  // ─────────────────────────────────────────────────────────────────────────
  {
    key: 'ask_city_intro', label: 'הקדמה לפני רשימת הערים', allowAudio: true,
    defaultText: 'לבחירת עיר הקישו את מספר העיר כדלהלן',
    hint: '🎙️ ניתן להקליט או ליצור קול טבעי. הרשימה עצמה נאמרת אחריה אוטומטית.',
  },
  {
    key: 'ask_city', label: 'רשימת הערים (נבנית אוטומטית)', allowAudio: false, placeholders: ['list'],
    defaultText: '{list}',
    hint: '⚠️ נבנית מהמוקדים הפתוחים — "לירושלים הקישו 1, לבני ברק הקישו 2…". '
      + 'המספרים נגזרים מהמוקדים עצמם ולכן אינם ניתנים לעריכה. '
      + 'לשינוי הניסוח שלפני הרשימה — ראו "הקדמה לפני רשימת הערים".',
  },
  {
    key: 'ask_center', label: 'בחירת מוקד בעיר', allowAudio: false, placeholders: ['list'],
    defaultText: 'בעיר זו מספר מוקדי חלוקה {list}',
    hint: 'מושמע רק בערים עם יותר ממוקד אחד (ירושלים, בני ברק, בית שמש)',
  },
  {
    // 🔴 האזהרה לפני האישור, לא אחריו. אחרי הלחיצה אין מה לעשות עם המידע.
    key: 'center_confirm', label: 'אישור המוקד (אזהרת סופיות)', allowAudio: false,
    placeholders: ['center'],
    defaultText: 'בחרתם במוקד {center}. שימו לב, בחירת המוקד היא סופית ואינה ניתנת לשינוי. ' +
      'לאישור הרישום למוקד זה הקישו 1 לחזרה לרשימה הקישו 2',
  },
  {
    key: 'center_success', label: 'הרישום למוקד הצליח', allowAudio: false, placeholders: ['center'],
    // 🔴 אין שוברים. ההודעה הזו היא כל מה שהמשפחה מקבלת בשלב הבחירה,
    // ולכן היא חייבת לומר גם איפה וגם *למה רק שם*.
    //
    // ⚠️ האזהרה חוזרת גם כאן וגם בהודעת האיסוף: המטרה היא שאיש לא
    // יגיע למוקד שלא בחר, ואמירה פעם אחת בלבד אינה נזכרת בעוד חודש.
    defaultText: 'נרשמתם בהצלחה למוקד החלוקה ב{center}. ' +
      'שימו לב, ניתן יהיה לקבל את הכרטיס רק במוקד זה. ' +
      'כרטיס שיילקח ממוקד אחר לא ניתן יהיה להטעין. ' +
      'לא ניתן יהיה לשנות את בחירתכם. ' +
      'כשהכרטיס יהיה מוכן תקבלו הודעה מסודרת בטלפון ובמייל ' +
      'עם השעות והמיקום המדויק של המוקד. ' +
      // 🔴 האזהרה על השעות — אותה אמירה בדיוק כמו בפורטל. המוקדים הם
      // משפחות שפתחו את ביתן בהתנדבות, והגעה מחוץ לשעות שנמסרו מטילה
      // עליהן טורח שאין להן דרך להתמודד איתו.
      'שימו לב, אין לבוא בשום אופן בשעות וימים אחרים מכפי שיצוין בהודעה. ' +
      'זה גורם עגמת נפש וטרחה למשפחות המוקדים שפתחו את ביתם בהתנדבות. ' +
      'אין טעם לפנות בענין זה במייל או בטלפון. ' +
      'בברכת חג כשר ושמח',
  },
  {
    // ⚠️ הודעת אישור ולא שגיאה: מי שמתקשר שוב רוצה לדעת איזה מוקד בחר.
    //
    // 🔴 בלי שעות ובלי תאריכים — במכוון.
    //
    // מועדי החלוקה בכל מוקד טרם נקבעו, ולכן הקראתם עכשיו הייתה מוסרת
    // מידע שישתנה. המשפחה תקבל הודעה מסודרת בנפרד; אמירת זה במפורש
    // עדיפה על שתיקה, שמשאירה אותה מחפשת.
    //
    // ⚠️ {hours} הוסר מרשימת ה-placeholders: השארתו הייתה מאפשרת
    // להחזיר אותו בעריכת הנוסח בלי לשים לב.
    key: 'center_already', label: 'כבר נבחר מוקד', allowAudio: false,
    placeholders: ['center'],
    defaultText: 'כבר נרשמתם למוקד החלוקה ב{center}. לא ניתן לשנות את הבחירה. '
      + 'שימו לב, ניתן יהיה לקבל את הכרטיס רק במוקד זה. '
      + 'כרטיס שיילקח ממוקד אחר לא ניתן יהיה להטעין. '
      + 'כשהכרטיס יהיה מוכן תקבלו על כך הודעה בטלפון ובמייל. '
      + 'אין טעם לפנות בענין זה במייל או בטלפון',
  },
  {
    // 🔴 מושמע אחרי הטעינה, למי שמתקשר בעקבות הצינתוק.
    //
    // ⚠️ זו ההודעה המרכזית בשלב הזה: אין שובר, ולכן היא כל מה שהמשפחה
    // מקבלת. חייבת לומר גם איפה וגם למה רק שם.
    key: 'card_ready', label: 'הכרטיס מוכן לאיסוף', allowAudio: false,
    placeholders: ['center'],
    defaultText: 'הכרטיס שלכם מוכן לאיסוף במוקד {center}. ' +
      'שימו לב, ניתן לקבל את הכרטיס רק במוקד זה. ' +
      'כרטיס שיילקח ממוקד אחר לא ניתן יהיה להטעין. ' +
      'בעזרת השם תישלח הודעה מסודרת לגבי הימים והשעות',
    hint: 'מושמע למי שכבר נטען לו הכרטיס — במקום הודעת "כבר נבחר מוקד"',
  },
  {
    key: 'center_full', label: 'המוקד מלא', allowAudio: true,
    defaultText: 'המוקד שבחרתם מלא יש לבחור מוקד אחר',
  },
  {
    key: 'center_none', label: 'אין מוקד שנבחר', allowAudio: true,
    defaultText: 'טרם נבחר עבורכם מוקד חלוקה',
  },
]

const META_BY_KEY = new Map(HOLIDAY_MESSAGE_META.map(m => [m.key, m]))

function defaultMessages(): HolidayMessages {
  const out: HolidayMessages = {}
  for (const m of HOLIDAY_MESSAGE_META) out[m.key] = { text: m.defaultText, audio: null }
  return out
}

/** ההודעות — ברירות המחדל ממוזגות עם מה שנשמר בהגדרות. */
export async function getHolidayMessages(): Promise<HolidayMessages> {
  const merged = defaultMessages()
  const admin = getServiceClient()
  if (!admin) return merged
  const { data } = await admin.from('app_settings').select('value').eq('key', HOLIDAY_MSG_KEY).maybeSingle()
  if (data?.value) {
    try {
      const saved = JSON.parse(data.value) as HolidayMessages
      for (const key of Object.keys(merged)) {
        const s = saved[key]
        if (!s) continue
        merged[key] = {
          text: typeof s.text === 'string' && s.text.trim() ? s.text : merged[key].text,
          audio: META_BY_KEY.get(key)?.allowAudio ? (s.audio ?? null) : null,
        }
      }
    } catch { /* value אינו JSON תקין */ }
  }
  return merged
}

/** שמירה — ממזג מעל ברירות המחדל; הקלטה נשמרת רק להודעות שמותר בהן. */
export async function saveHolidayMessages(input: HolidayMessages): Promise<boolean> {
  const admin = getServiceClient()
  if (!admin) return false
  const current = await getHolidayMessages()
  for (const key of Object.keys(current)) {
    const i = input[key]
    if (!i) continue
    const newText = typeof i.text === 'string' && i.text.trim() ? i.text.trim() : current[key].text
    const audio = META_BY_KEY.get(key)?.allowAudio ? (i.audio ?? current[key].audio ?? null) : null
    current[key] = { text: newText, audio }
  }
  const { error } = await admin.from('app_settings').upsert(
    { key: HOLIDAY_MSG_KEY, value: JSON.stringify(current) },
    { onConflict: 'key' },
  )
  if (error) { console.error('[yemotHolidayMessages] save failed:', error.message); return false }
  return true
}

/**
 * קביעת/הסרת הקלטה להודעה. null = חזרה ל-TTS.
 *
 * ⚠️ מוגן ב-allowAudio: הודעה דינמית (עם {name}/{distribution}) אינה יכולה
 * להישמע מהקלטה קבועה — היא הייתה מקריאה שם משפחה או שם חלוקה שגויים.
 */
export async function setHolidayMessageAudio(key: string, audio: string | null): Promise<boolean> {
  if (!META_BY_KEY.get(key)?.allowAudio) return false
  const msgs = await getHolidayMessages()
  if (!msgs[key]) return false
  msgs[key] = { ...msgs[key], audio }
  return saveHolidayMessages(msgs)
}
