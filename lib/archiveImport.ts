// ייבוא תיקיית Drive לאירוע בארכיון: רץ ברקע בשרת, עם התקדמות שהמסך שואל עליה.
// הלוגיקה מקבלת את הפעולות החיצוניות (Drive, מסד) כפרמטר, כדי שאפשר לבדוק אותה בלי רשת.
import { detectKind, UUID_RE } from '@/lib/archive'
import type { DriveMedia } from '@/lib/googleDrive'

export interface ImportDeps {
  /** העתקת קובץ לתיקיית האירוע ב-Drive; מחזיר את המזהה החדש */
  copy(f: DriveMedia): Promise<string>
  /** שמירת רשומה במסד; מחזיר את מזהה הרשומה */
  save(f: DriveMedia, kind: 'image' | 'video', driveId: string): Promise<string>
  /** יצירת מוקטן (best-effort) */
  thumb(recordId: string, driveId: string, kind: 'image' | 'video'): Promise<void>
  /** סיום: חישוב ספירות וקאברים */
  finish(): Promise<void>
}

export interface ImportJob {
  id: string; eventId: string
  state: 'running' | 'done' | 'error'
  total: number; done: number; failed: number; skipped: number
  error: string | null; lastError: string | null
  updatedAt: number
}

/** מפתח כפילות: אותו שם ואותו גודל באותו אירוע נחשבים אותו קובץ. */
export const dupKey = (name: string, size: number | null) => `${name}\u0000${size ?? ''}`

export function planImport(files: DriveMedia[], existing: Set<string>) {
  const todo: DriveMedia[] = []
  let skipped = 0
  const seen = new Set(existing)
  for (const f of files) {
    const k = dupKey(f.name, f.size)
    if (seen.has(k) || !detectKind(f.name, f.mime)) { skipped++; continue }
    seen.add(k)
    todo.push(f)
  }
  return { todo, skipped }
}

const CONCURRENCY = 3

export async function runImport(job: ImportJob, todo: DriveMedia[], deps: ImportDeps): Promise<void> {
  const queue = [...todo]
  const touch = () => { job.updatedAt = Date.now() }
  const worker = async () => {
    for (let f = queue.shift(); f; f = queue.shift()) {
      try {
        const kind = detectKind(f.name, f.mime)!
        const driveId = await deps.copy(f)
        const recordId = await deps.save(f, kind, driveId)
        await deps.thumb(recordId, driveId, kind).catch(() => {})
      } catch (e) {
        job.failed++
        job.lastError = `${f.name}: ${e instanceof Error ? e.message : String(e)}`
      }
      job.done++; touch()
    }
  }
  try {
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    await deps.finish()
    job.state = 'done'
  } catch (e) {
    job.state = 'error'
    job.error = e instanceof Error ? e.message : String(e)
  }
  touch()
}

// ───── מאגר משימות בזיכרון השרת (שרת יחיד). הקבצים שכבר יובאו נשמרים במסד גם אם השרת יתאפס.
const jobs = new Map<string, ImportJob>()
const TTL_MS = 60 * 60 * 1000

export function createJob(eventId: string, total: number): ImportJob {
  for (const [k, j] of jobs) if (j.state !== 'running' && Date.now() - j.updatedAt > TTL_MS) jobs.delete(k)
  const job: ImportJob = {
    id: crypto.randomUUID(), eventId, state: 'running', total, done: 0, failed: 0, skipped: 0,
    error: null, lastError: null, updatedAt: Date.now(),
  }
  jobs.set(job.id, job)
  return job
}

export function getJob(id: string): ImportJob | null {
  return UUID_RE.test(id) ? jobs.get(id) ?? null : null
}

/** משימה פעילה של האירוע (מונע שתי שאיבות במקביל לאותו אירוע). */
export function activeJobFor(eventId: string): ImportJob | null {
  for (const j of jobs.values()) if (j.eventId === eventId && j.state === 'running') return j
  return null
}

