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

  // ── בחירת מוקד ─────────────────────────────────────────────────────────
  {
    key: 'centers_closed', label: 'בחירת המוקדים סגורה', allowAudio: true,
    defaultText: 'בחירת מוקד החלוקה אינה פתוחה כעת',
    hint: 'מושמע כשמתג בחירת המוקדים סגור — נפרד מהודעת "הרישום סגור"',
  },
  {
    key: 'centers_intro', label: 'הסבר לפני בחירת המוקד', allowAudio: true,
    defaultText: 'לתשומת לב, לאחר בחירת מוקד, בהמשך החודש לקראת ימי החלוקה, ' +
      'תקבלו שובר במייל אותו תתבקשו להדפיס ולהביא איתכם למוקד החלוקה. ' +
      'על גבי השובר יופיעו הימים והשעות והכתובת המדוייקת בהם יהיה ניתן לאסוף את הכרטיס',
  },
  {
    key: 'ask_region', label: 'בחירת אזור', allowAudio: true,
    defaultText: 'שימו לב, המתגוררים בערים שבהן אין מוקד חלוקה עליהם לבחור מוקד בעיר אחרת. ' +
      'לירושלים והסביבה הקישו 1 למרכז הקישו 2 לצפון הקישו 3 לדרום הקישו 4',
  },
  {
    key: 'ask_city', label: 'בחירת עיר', allowAudio: false, placeholders: ['list'],
    defaultText: 'לבחירת עיר הקישו את מספר העיר כדלהלן {list}',
    hint: 'רשימת הערים נבנית מהמוקדים הפתוחים ומשתנה בין חלוקות',
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
    defaultText: 'נרשמתם בהצלחה למוקד החלוקה ב{center}. ' +
      'לקראת ימי הסליחות תקבלו שובר במייל עם פרטי המוקד והשעות לאיסוף. ' +
      'לא ניתן יהיה לקבלו במוקד אחר ולא ניתן יהיה לשנות את בחירתכם. ' +
      'שימו לב, לא יינתן מענה במייל בנושא זה. בברכת חג כשר ושמח',
  },
  {
    // ⚠️ הודעת אישור ולא שגיאה: מי שמתקשר שוב רוצה לדעת איזה מוקד בחר.
    //
    // 🔴 {hours} נוסף כי זו הסיבה השכיחה לשיחה החוזרת: המשפחה יודעת
    // איזה מוקד בחרה ורוצה לדעת *מתי* לבוא. בלי השעות היא מנתקת ומחפשת
    // את המידע במקום אחר.
    // ⚠️ ריק כשלא הוגדרו שעות — המשפט נקטע בטבעיות ולא נשמע "מתי לבוא: ".
    key: 'center_already', label: 'כבר נבחר מוקד', allowAudio: false,
    placeholders: ['center', 'hours'],
    defaultText: 'כבר נרשמתם למוקד החלוקה ב{center}. {hours} לא ניתן לשנות את הבחירה',
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
