// עץ השלוחות והקלטות בטכנוליין, לכל מערכת בנפרד (ivrFilesApi: extensionSet, uploadFile).
// כל שלוחת webhook מצביעה על /api/webhooks/technoline/<system>/<secret>/<ext> של אותה מערכת בלבד.
import { ivrApi, type ApiResult } from './interaction'
import { getSystem } from './systems'
import type { TelephonySystemId } from './types'

/** שלוחות ה-webhook של כל מערכת (השם הוא החלק האחרון בכתובת). */
export const SYSTEM_EXTS: Record<TelephonySystemId, { ext: string; label: string; digit: string }[]> = {
  main: [
    { ext: 'menu', label: 'תפריט ראשי', digit: '' },
    { ext: 'maternity', label: 'יולדות', digit: '1' },
    { ext: 'holidays', label: 'חגים', digit: '2' },
    { ext: 'otp', label: 'קוד אימות', digit: '3' },
  ],
  yerid: [
    { ext: 'menu', label: 'תפריט יריד הספרים', digit: '' },
    { ext: 'orders', label: 'מצב הזמנה', digit: '1' },
    { ext: 'inquiry', label: 'פנייה לשירות', digit: '2' },
  ],
  distributors: [
    { ext: 'menu', label: 'תפריט מפיצים', digit: '' },
  ],
}

// סוג השלוחה שקוראת ל-webhook ומפתח ההגדרה של הכתובת — ניתנים לשינוי אם טכנוליין משנה (ראו getExtensionTypes).
const API_TYPE = process.env.TECHNOLINE_API_EXT_TYPE?.trim() || 'api'
const API_URL_KEY = process.env.TECHNOLINE_API_EXT_URL_KEY?.trim() || 'url'

export function webhookUrl(baseUrl: string, system: TelephonySystemId, secret: string, ext: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/webhooks/technoline/${system}/${secret}/${ext}`
}

/** כתובות להצגה במסך הניהול — הסוד ממוסך. */
export function maskedUrls(baseUrl: string, system: TelephonySystemId) {
  return SYSTEM_EXTS[system].map((e) => ({ ...e, url: webhookUrl(baseUrl, system, '<סוד>', e.ext) }))
}

export type TreeStep = { ext: string; label: string; ok: boolean; error?: string }

/** יוצר/מעדכן את שלוחות ה-webhook של המערכת מתחת לשלוחה rootId. */
export async function applyTree(system: TelephonySystemId, rootId: string, baseUrl: string): Promise<TreeStep[]> {
  const cfg = getSystem(system)
  if (!cfg.secret) return [{ ext: '-', label: 'סוד', ok: false, error: 'לא הוגדר סוד למערכת' }]
  if (!/^\d+$/.test(rootId)) return [{ ext: '-', label: 'שלוחה', ok: false, error: 'מזהה שלוחת אב לא תקין' }]
  const steps: TreeStep[] = []
  for (const e of SYSTEM_EXTS[system]) {
    const isRoot = e.ext === 'menu'
    const form: Record<string, string> = {
      extensionId: isRoot ? rootId : 'NEW', name: e.label, type: API_TYPE,
      [`settings[${API_URL_KEY}]`]: webhookUrl(baseUrl, system, cfg.secret, e.ext),
    }
    if (!isRoot) { form.belowExtension = rootId; if (e.digit) form.extension = e.digit }
    const res = await ivrApi(system, 'extensionSet', { extensionId: form.extensionId }, form)
    steps.push({ ext: e.ext, label: e.label, ok: res.ok, error: res.ok ? undefined : res.error })
  }
  return steps
}

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024

/** מעלה הקלטה (עד 2MB) לשלוחה. קבצים גדולים יותר דורשים העלאה במקטעים (uploadInit) — לא נתמך כאן. */
export async function uploadRecording(
  system: TelephonySystemId, extensionId: string, name: string, bytes: ArrayBuffer, fileName: string,
): Promise<ApiResult> {
  if (!/^\d+$/.test(extensionId)) return { ok: false, error: 'מזהה שלוחה לא תקין' }
  if (bytes.byteLength === 0) return { ok: false, error: 'הקובץ ריק' }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, error: 'הקובץ גדול מ-2MB' }
  const form = new FormData()
  form.set('file', new Blob([bytes]), fileName)
  form.set('extensionId', extensionId)
  form.set('name', name)
  form.set('checkDuplicate', 'yes')
  return ivrApi(system, 'uploadFile', {}, form)
}

/** רשימת הקבצים של שלוחה (הקלטות שנשמרו/הועלו). */
export function listRecordings(system: TelephonySystemId, extensionId: string) {
  return ivrApi(system, 'filesList', { extensionId })
}
