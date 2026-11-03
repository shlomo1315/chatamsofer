// שכבת Interaction API המשותפת של טכנוליין (https://api.tlivr.com/) לשלוש המערכות.
// כל קריאה נבדקת: status === "OK" (ivrFilesApi, campaignApi) או ok === true (accountApi).
//
// ⚠️ ה-IP היוצא של השרת חייב להיות מאושר ב"אבטחת API" (campaignApi/ivrFilesApi), אחרת errorCode -99.
// ⚠️ מפתחות לא נרשמים בלוג ולא מוחזרים בשגיאות.
import { accountConfig, getSystem } from './systems'
import type { TelephonySystemId } from './types'

const BASE = 'https://api.tlivr.com'

export type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string; code?: string }

type Json = Record<string, unknown>

function failFrom(json: Json | null, http: number): { ok: false; error: string; code?: string } {
  if (!json) return { ok: false, error: `HTTP ${http}` }
  const code = json.errorCode !== undefined ? String(json.errorCode) : json.error !== undefined ? String(json.error) : undefined
  const note = String(json.messige ?? json.message ?? json.note ?? json.error ?? '')
  return { ok: false, code, error: `${code ? `שגיאה ${code}` : 'שגיאה'}${note && note !== code ? `: ${note}` : ''}` }
}

async function send(url: string, init: RequestInit, kind: 'status' | 'ok'): Promise<ApiResult<Json>> {
  try {
    const res = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(20_000) })
    const json = await res.json().catch(() => null) as Json | null
    const good = kind === 'status' ? json?.status === 'OK' : json?.ok === true
    if (!json || !good) return failFrom(json, res.status)
    return { ok: true, data: json }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

function keyOf(system: TelephonySystemId): string | null {
  return getSystem(system).apiKey
}

/** ivrFilesApi.php — שלוחות, תיקיות וקבצים. query = פרמטרי action, form = גוף (extensionSet). */
export async function ivrApi(
  system: TelephonySystemId, action: string, query: Record<string, string> = {}, form?: Record<string, string> | FormData,
): Promise<ApiResult<Json>> {
  const apiKey = keyOf(system)
  if (!apiKey) return { ok: false, error: 'חסר מפתח API למערכת', code: 'not_configured' }
  const q = new URLSearchParams({ action, ...query, apiKey })
  const init: RequestInit = { method: form ? 'POST' : 'GET' }
  if (form instanceof FormData) init.body = form
  else if (form) init.body = new URLSearchParams(form)
  return send(`${BASE}/ivrFilesApi.php?${q}`, init, 'status')
}

/** campaignApi.php — תמיד POST ב-JSON, ודורש IP מורשה. */
export async function campaignApi(system: TelephonySystemId, action: string, body: Json = {}): Promise<ApiResult<Json>> {
  const apiKey = keyOf(system)
  if (!apiKey) return { ok: false, error: 'חסר מפתח API למערכת', code: 'not_configured' }
  return send(`${BASE}/campaignApi.php`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, action, apiKey }),
  }, 'status')
}

/** accountApi.php — מפתח חשבון בכותרת (לא ב-URL). */
export async function accountApi(action: string, body?: Json): Promise<ApiResult<Json>> {
  const { accountKey } = accountConfig()
  if (!accountKey) return { ok: false, error: 'חסר מפתח חשבון טכנוליין', code: 'not_configured' }
  const headers: Record<string, string> = { 'X-Account-Key': accountKey }
  if (body) headers['Content-Type'] = 'application/json'
  return send(`${BASE}/accountApi.php?action=${encodeURIComponent(action)}`, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
  }, 'ok')
}
