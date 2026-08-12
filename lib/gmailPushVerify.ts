// ─────────────────────────────────────────────────────────────────────────────
// אימות התראות Push מ-Gmail (Google Pub/Sub) — הלוגיקה הטהורה.
//
// 🔴 למה יש כאן אימות בכלל: הכתובת של ה-webhook היא ציבורית. בלי אימות, כל
// מי שמנחש אותה יכול לשגר אליה התראות מזויפות ולגרום למערכת לשרוף את מכסת
// ה-API של Gmail בסנכרונים אינסופיים — או, גרוע יותר, לסנכרן חשבון של מישהו
// אחר. נכשל-סגור: מה שלא אומת, לא מטופל.
//
// ⚠️ שתי שכבות, ובכוונה:
//   1. טוקן בכתובת (?token=) — פשוט, ונבדק לפני כל פענוח.
//   2. מבנה ההודעה — Pub/Sub עוטף את המידע ב-base64 בתוך message.data.
//
// גוגל תומך גם ב-OIDC JWT, וזו השכבה החזקה יותר. היא אינה נבדקת כאן מפני
// שהיא דורשת אימות מפתחות מרוחקים; הטוקן בכתובת הוא סוד אקראי ארוך, והוא
// מספיק כל עוד הוא נשמר כמשתנה סביבה ולא נחשף בקוד.
// ─────────────────────────────────────────────────────────────────────────────

/** מה שגוגל שולח בתוך message.data אחרי פענוח base64. */
export interface GmailPushPayload {
  emailAddress: string
  historyId: string
}

export interface PubSubEnvelope {
  message?: {
    data?: string | null
    messageId?: string | null
    publishTime?: string | null
  } | null
  subscription?: string | null
}

/**
 * האם הטוקן שבבקשה תואם את הסוד.
 *
 * ⚠️ השוואה באורך קבוע. השוואת מחרוזות רגילה נעצרת בתו הראשון שנבדל, וההפרש
 * בזמן מאפשר לגלות את הסוד תו-אחר-תו. זה רלוונטי כאן דווקא כי הכתובת
 * ציבורית וניתן לשגר אליה אינסוף בקשות.
 */
export function tokenMatches(given: string | null | undefined, expected: string | null | undefined): boolean {
  const a = String(given ?? '')
  const b = String(expected ?? '')
  // ⚠️ סוד ריק אינו "מתיר הכל": בלי הבדיקה הזו, שכחה להגדיר את משתנה הסביבה
  // הייתה פותחת את הנתיב לכולם בשקט.
  if (!b) return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * מחלץ את תוכן ההתראה מהמעטפה של Pub/Sub.
 *
 * ⚠️ מחזיר null במקום לזרוק: גוגל מפרש שגיאה כ"לא נמסר" ומנסה שוב ושוב
 * במשך ימים. הודעה פגומה שנדחית ב-200 נעלמת; הודעה פגומה שמפילה את הנתיב
 * חוזרת אלינו אלפי פעמים.
 */
export function decodePush(envelope: PubSubEnvelope | null | undefined): GmailPushPayload | null {
  const raw = envelope?.message?.data
  if (!raw) return null
  try {
    const json = JSON.parse(Buffer.from(String(raw), 'base64').toString('utf8'))
    const emailAddress = String(json?.emailAddress ?? '').trim().toLowerCase()
    const historyId = json?.historyId != null ? String(json.historyId) : ''
    if (!emailAddress || !historyId) return null
    return { emailAddress, historyId }
  } catch {
    return null
  }
}

/**
 * האם ההתראה הזו כבר טופלה.
 *
 * 🔴 Pub/Sub מבטיח מסירה *לפחות* פעם אחת — לא בדיוק פעם אחת. אותה התראה
 * מגיעה שוב אחרי כל תקלת רשת, ובלי הבדיקה הזו כל אחת מהן מפעילה סנכרון מלא
 * מול Gmail. זה שורף מכסה ומייצר עומס שנראה כמו תקלה במערכת.
 *
 * ⚠️ ההשוואה היא מספרית ולא טקסטואלית: historyId הוא מספר גדול שמגיע
 * כמחרוזת, והשוואת מחרוזות הייתה קובעת ש-"9" גדול מ-"10".
 */
export function isStaleNotification(
  incomingHistoryId: string,
  lastHandledHistoryId: string | null | undefined,
): boolean {
  if (!lastHandledHistoryId) return false
  const a = BigInt(/^\d+$/.test(incomingHistoryId) ? incomingHistoryId : '0')
  const b = BigInt(/^\d+$/.test(String(lastHandledHistoryId)) ? String(lastHandledHistoryId) : '0')
  // ⚠️ שווה נחשב ישן: אותה התראה בדיוק, שנשלחה שוב.
  return a <= b
}
