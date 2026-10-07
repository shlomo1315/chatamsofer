import type { SupabaseClient } from '@supabase/supabase-js'
import { yemotToken, downloadFileFromYemot } from '@/lib/yemot'

// ─────────────────────────────────────────────────────────────────────────────
// הקלטות הפניות בשלוחת היריד (בקשת המשתמש 08.10: "הדפדפן לא הצליח לנגן").
//
// 🔴 השורש: הערך שחוזר מימות לפקודת ההקלטה ("120/9.wav") *אינו* נתיב
// הקובץ — הוא זהה לכל הפניות. מסך ההשמעה בנה ממנו "9/1209.wav.wav" וקיבל
// 404 בכל ניסיון. הקובץ האמיתי יושב בסל המיחזור של ימות בשם ייחודי:
//
//   Trash/ApiRecord — "Phone-0583273227-id---1791144139.wav"
//   Trash/ApiVoice  — "1791146389-DID-093130924-Phone-0548495636-Folder-9-in.wav"
//
// (אותו ממצא שתוקן בהקלטות ההזמנות ב-05.10 — ראו stashRecording בוובהוק.
// הפניות פשוט לא עברו באותו מסלול.)
//
// ⚠️ ימות מנקה את סל המיחזור, ולכן העותק נשמר אצלנו מיד בסיום השיחה.
// ⚠️ המפתח לפי call_id ולא לפי מזהה הפנייה: זה מה שידוע בשלוחה.
// ─────────────────────────────────────────────────────────────────────────────

const TRASH_FOLDERS = ['ivr2:/Trash/ApiRecord', 'ivr2:/Trash/ApiVoice'] as const
/** הפרש מקסימלי בין סיום ההקלטה לרישום הפנייה. */
const MAX_SKEW_SEC = 10 * 60

export function inquiryStorageKey(callId: string): string {
  return `book-fair/inquiries/${callId.replace(/[^\w.-]/g, '_')}.wav`
}

/** חותמת ה-unix (10 ספרות) שבשם הקובץ, או null. */
export function timestampOf(name: string): number | null {
  const m = name.match(/(?:^|\D)(1[7-9]\d{8})(?:\D|$)/)
  return m ? Number(m[1]) : null
}

/**
 * בחירת הקובץ של הפנייה מתוך רשימת שמות בסל המיחזור.
 *
 * ⚠️ לפי הטלפון *וגם* הזמן: למתקשר אחד יש לעיתים גם הקלטות שם וכתובת
 * מהזמנה, ופניות קודמות. הקרוב ביותר לרגע הרישום, בטווח של 10 דקות.
 *
 * @param atSec רגע רישום הפנייה (unix שניות)
 */
export function pickInquiryFile(names: string[], phone: string, atSec: number): string | null {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return null
  const tail = digits.replace(/^0/, '')
  let best: { name: string; d: number } | null = null
  for (const name of names) {
    if (!name.includes(tail)) continue
    const ts = timestampOf(name)
    if (ts === null) continue
    const d = Math.abs(ts - atSec)
    if (d > MAX_SKEW_SEC) continue
    if (!best || d < best.d) best = { name, d }
  }
  return best?.name ?? null
}

/** גודל הדף של GetIVR2Dir — ימות מחזירה לכל היותר 1,000 קבצים לבקשה. */
const PAGE = 1000
/** תקרת בטיחות — שלוחה חיה לא תמתין לרשימה אינסופית. */
const MAX_PAGES = 10

/**
 * כל שמות הקבצים בתיקייה בימות, על פני כל הדפים.
 *
 * 🔴 08.10: GetIVR2Dir מחזירה 1,000 קבצים בלבד, בלי סימן שיש עוד. בסל
 * המיחזור היו 1,543 — והקבצים שמעבר לדף הראשון (ממוינים לפי שם, כלומר
 * לפי טלפון) לא נמצאו לעולם. כך 29 מ-80 הפניות ו-~10% מהקלטות ההזמנות
 * נשארו בלי עותק. הדף הבא נקרא עם filesFrom.
 */
export async function listYemotFolder(folder: string): Promise<string[]> {
  const token = yemotToken('bookFair')
  if (!token) return []
  const out: string[] = []
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const r = await fetch(
        `https://www.call2all.co.il/ym/api/GetIVR2Dir?token=${encodeURIComponent(token)}` +
          `&path=${encodeURIComponent(folder)}&filesFrom=${page * PAGE}`,
        { cache: 'no-store' },
      )
      const j = await r.json().catch(() => null) as { files?: { name?: string }[] } | null
      const names = (j?.files ?? []).map(f => String(f.name ?? '')).filter(Boolean)
      out.push(...names)
      if (names.length < PAGE) break
    }
  } catch { /* תיקייה שאינה נגישה — מחזירים מה שנאסף */ }
  return out
}

/** איתור והורדה של ההקלטה מסל המיחזור של ימות. */
export async function findInquiryRecording(phone: string, at: Date): Promise<ArrayBuffer | null> {
  const atSec = Math.floor(at.getTime() / 1000)
  for (const folder of TRASH_FOLDERS) {
    const name = pickInquiryFile(await listYemotFolder(folder), phone, atSec)
    if (!name) continue
    for (const scope of ['bookFair', 'default'] as const) {
      const f = await downloadFileFromYemot(`${folder}/${name}`, scope)
      if (f.ok && f.data && f.data.byteLength > 1000) return f.data
    }
  }
  return null
}

/**
 * איתור ההקלטה ושמירת עותק אצלנו. מחזיר את הקובץ, או null.
 *
 * ⚠️ best-effort: כישלון לעולם אינו זורק — זו שיחה חיה או מסך ניהול.
 */
export async function archiveInquiryRecording(
  db: SupabaseClient, callId: string, phone: string, at: Date,
): Promise<ArrayBuffer | null> {
  try {
    const data = await findInquiryRecording(phone, at)
    if (!data) {
      console.warn(`[fair/inquiry-audio] ההקלטה לא נמצאה בסל של ימות · call=${callId}`)
      return null
    }
    const { error } = await db.storage.from('documents')
      .upload(inquiryStorageKey(callId), data, { contentType: 'audio/wav', upsert: true })
    if (error) console.warn('[fair/inquiry-audio] העלאה נכשלה:', error.message)
    return data
  } catch (e) {
    console.warn('[fair/inquiry-audio] נכשל:', e)
    return null
  }
}
