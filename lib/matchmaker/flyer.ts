import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type { MailAttachment } from '@/lib/sendMail'

// דף הפרסום שמצורף למייל "נרשמתם בהצלחה". להחלפה: מניחים את הקובץ החדש בנתיב הזה
// (או משנים כאן את השם/הסוג), ואין צורך לגעת בשאר הקוד. אם הקובץ חסר, המייל נשלח בלי צירוף.
export const FLYER_FILE = 'public/matchmakers/flyer.pdf'
export const FLYER_NAME = 'פרסום פרויקט המלגות.pdf'
export const FLYER_MIME = 'application/pdf'

export async function loadFlyer(): Promise<MailAttachment | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), FLYER_FILE))
    return { filename: FLYER_NAME, mimeType: FLYER_MIME, contentB64: buf.toString('base64') }
  } catch {
    return null
  }
}
