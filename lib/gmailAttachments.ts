// ─────────────────────────────────────────────────────────────────────────────
// הורדת צירופים מ-Gmail ושמירתם ב-Storage.
//
// 🔴 הבעיה שזה פותר: מסלול ה-Gmail שמר את גוף המייל ואת הכותרות, אבל
// **לא את הצירופים** — inbound_emails.attachments נשאר []. התוצאה:
// משפחה שצירפה אישור לידה ותעודות זהות כנדרש קיבלה דחייה "לא נמצא
// קובץ בשם אישור-לידה", כי מבחינת המערכת לא היו קבצים כלל.
//
// ⚠️ אותו דפוס בדיוק כמו ב-resend-inbound: העלאה ל-storage/documents
// והחזרת url ציבורי. הצינור (emailRequestIntake) מחפש a.url, ולכן
// צירוף בלי url שקול לצירוף שאינו קיים.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'

export interface GmailAttachmentRef {
  filename: string
  mimeType: string
  size?: number
  attachmentId?: string
  /** תוכן inline לקבצים קטנים — Gmail מחזיר אותו ישירות בלי attachmentId. */
  inlineData?: string
}

export interface StoredAttachment {
  filename: string
  mimeType: string
  size: number
  url?: string
}

/** base64url של Gmail → Buffer. ⚠️ שונה מ-base64 רגיל: -/_ במקום +/. */
function fromBase64Url(data: string): Buffer {
  return Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/**
 * מוריד את צירופי ההודעה ומעלה אותם ל-Storage.
 *
 * ⚠️ לא זורק: כשל בצירוף אחד אינו מפיל את קליטת המייל. צירוף שנכשל
 * מוחזר בלי url, והצינור יתייחס אליו כאילו לא צורף — וזו התנהגות
 * נכונה יותר מלאבד את המייל כולו.
 */
export async function downloadGmailAttachments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gmail: any,
  admin: SupabaseClient,
  messageId: string,
  refs: GmailAttachmentRef[],
): Promise<StoredAttachment[]> {
  const out: StoredAttachment[] = []
  if (!refs.length) return out

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i]
    const filename = ref.filename || `attachment-${i + 1}`
    const mimeType = ref.mimeType || 'application/octet-stream'
    let buffer: Buffer | null = null

    try {
      if (ref.inlineData) {
        buffer = fromBase64Url(ref.inlineData)
      } else if (ref.attachmentId) {
        const res = await gmail.users.messages.attachments.get({
          userId: 'me', messageId, id: ref.attachmentId,
        })
        const data = res?.data?.data
        if (data) buffer = fromBase64Url(String(data))
      }
    } catch (e) {
      console.error(`[gmail-att] הורדה נכשלה (${filename}):`, e instanceof Error ? e.message : e)
    }

    let url: string | undefined
    let size = ref.size ?? 0

    if (buffer) {
      try {
        size = buffer.length
        // ⚠️ שם הקובץ מנוקה לנתיב אך **אינו** משנה את filename שנשמר:
        // הצינור מזהה את הקובץ לפי השם המקורי ("אישור-לידה"), ונתיב
        // מנוקה שהיה נשמר כשם היה שובר את הזיהוי.
        const safe = filename.replace(/[^\w.\-]+/g, '_')
        const path = `mail/${String(messageId).replace(/[^\w.\-]+/g, '_')}/${i}_${safe}`
        const { error } = await admin.storage.from('documents')
          .upload(path, buffer, { contentType: mimeType, upsert: true })
        if (!error) {
          url = admin.storage.from('documents').getPublicUrl(path).data.publicUrl
        } else {
          console.error(`[gmail-att] העלאה נכשלה (${filename}):`, error.message)
        }
      } catch (e) {
        console.error(`[gmail-att] שגיאה (${filename}):`, e instanceof Error ? e.message : e)
      }
    }

    out.push({ filename, mimeType, size, url })
  }

  const withUrl = out.filter(a => a.url).length
  console.log(`[gmail-att] ${withUrl}/${out.length} צירופים נשמרו · הודעה ${messageId}`)
  return out
}
