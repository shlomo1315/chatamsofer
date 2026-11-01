// מוקטני הארכיון: נשמרים בדיסק של השרת (לא ב-Drive), כדי שיוגשו מהדומיין שלנו ויטענו מיד גם בנטפרי.
// נוצרים בדפדפן בזמן ההעלאה; אם הקובץ חסר (למשל volume חדש) — תמונה נוצרת מחדש עצלה מ-Drive.
import { promises as fs } from 'fs'
import path from 'path'
import { UUID_RE } from '@/lib/archive'
import { openDriveFileStream } from '@/lib/googleDrive'

export const THUMB_MAX = 480

function thumbsDir(): string {
  return process.env.ARCHIVE_THUMBS_DIR || '/data/archive-thumbs'
}

function thumbPath(fileId: string): string | null {
  return UUID_RE.test(fileId) ? path.join(thumbsDir(), `${fileId}.jpg`) : null
}

export async function saveThumb(fileId: string, data: Buffer): Promise<boolean> {
  const p = thumbPath(fileId)
  if (!p) return false
  await fs.mkdir(thumbsDir(), { recursive: true })
  await fs.writeFile(p, data)
  return true
}

export async function readThumb(fileId: string): Promise<Buffer | null> {
  const p = thumbPath(fileId)
  if (!p) return null
  try { return await fs.readFile(p) } catch { return null }
}

export async function deleteThumb(fileId: string): Promise<void> {
  const p = thumbPath(fileId)
  if (p) await fs.rm(p, { force: true })
}

/** יוצר מוקטן JPEG מתמונה ב-Drive ושומר בדיסק. null אם נכשל (סרטון, פורמט לא נתמך). */
export async function generateThumbFromDrive(fileId: string, driveFileId: string): Promise<Buffer | null> {
  try {
    const stream = await openDriveFileStream(driveFileId)
    if (!stream) return null
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(Buffer.from(c))
    const { createCanvas, loadImage } = await import('@napi-rs/canvas')
    const img = await loadImage(Buffer.concat(chunks))
    const scale = Math.min(1, THUMB_MAX / Math.max(img.width, img.height))
    const canvas = createCanvas(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const out = canvas.toBuffer('image/jpeg', 78)
    await saveThumb(fileId, out)
    return out
  } catch {
    return null
  }
}
