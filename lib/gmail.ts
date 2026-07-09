import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI,
  )
}

export function getAuthUrl() {
  const client = getOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify',
      // הרשאת Drive — לגיבוי אוטומטי לתיקיית Drive של החשבון
      'https://www.googleapis.com/auth/drive',
    ],
  })
}

export async function getGmailClient() {
  const db = getAdminDb()
  const { data } = await db.from('app_settings').select('value').eq('key', 'gmail_refresh_token').maybeSingle()
  if (!data?.value) throw new Error('Gmail not connected')

  const oauth = getOAuthClient()
  oauth.setCredentials({ refresh_token: data.value })
  return google.gmail({ version: 'v1', auth: oauth })
}

export async function saveRefreshToken(token: string) {
  const db = getAdminDb()
  await db.from('app_settings').upsert({ key: 'gmail_refresh_token', value: token, updated_at: new Date().toISOString() })
}

function _encodeHeader(text: string): string {
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

export async function sendGmailMessage(gmail: any, opts: { to: string; subject: string; html: string; threadId?: string }) {
  const from = process.env.GMAIL_EMAIL ?? 'office@chasamsofer.info'
  const fromName = 'היכל החתם סופר משרד ראשי'
  const bodyB64 = Buffer.from(opts.html ?? '', 'utf8').toString('base64')
  const raw = [
    `From: ${_encodeHeader(fromName)} <${from}>`,
    `To: ${opts.to}`,
    `Subject: ${_encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyB64,
  ].join('\r\n')
  const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded, threadId: opts.threadId || undefined },
  })
}

export async function ensureLabel(gmail: any, name: string): Promise<string> {
  const list = await gmail.users.labels.list({ userId: 'me' })
  const existing = (list.data.labels ?? []).find((l: any) => l.name === name)
  if (existing?.id) return existing.id
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name, labelListVisibility: 'labelHide', messageListVisibility: 'show' },
  })
  return created.data.id as string
}

export interface Attachment {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
  inlineData?: string  // base64url — present for small attachments (< 25KB) that Gmail embeds inline
  url?: string         // public URL — present for inbound (Resend) attachments stored in Supabase storage
}

export interface ParsedMessage {
  id: string
  threadId: string
  subject: string
  from: string
  fromEmail: string
  to: string
  toEmail: string
  date: string
  snippet: string
  body: string
  bodyText?: string | null
  isRead: boolean
  labelIds: string[]
  attachments: Attachment[]
  isSpam?: boolean
  followUpAt?: string | null
  scheduledAt?: string | null
  beneficiaryId?: string | null
}

function decodeBase64(data: string) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

export function getBody(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    const text = decodeBase64(payload.body.data)
    return `<pre style="white-space:pre-wrap;font-family:inherit">${text}</pre>`
  }
  if (payload.parts) {
    const html = payload.parts.find((p: any) => p.mimeType === 'text/html')
    if (html?.body?.data) return decodeBase64(html.body.data)
    const plain = payload.parts.find((p: any) => p.mimeType === 'text/plain')
    if (plain?.body?.data) {
      const text = decodeBase64(plain.body.data)
      return `<pre style="white-space:pre-wrap;font-family:inherit">${text}</pre>`
    }
    for (const part of payload.parts) {
      const nested = getBody(part)
      if (nested) return nested
    }
  }
  return ''
}

function getPartFilename(part: any): string {
  // filename may be on the part directly, or inside Content-Type / Content-Disposition headers
  if (part.filename) return part.filename
  const headers: { name: string; value: string }[] = part.headers ?? []
  for (const h of headers) {
    const val = h.value ?? ''
    // Content-Disposition: attachment; filename="foo.pdf"
    const cdMatch = /filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i.exec(val)
    if (cdMatch) return decodeURIComponent(cdMatch[1].trim())
    // Content-Type: application/pdf; name="foo.pdf"
    const ctMatch = /name\*?=(?:UTF-8'')?["']?([^"';\n]+)/i.exec(val)
    if (ctMatch) return decodeURIComponent(ctMatch[1].trim())
  }
  return ''
}

function isAttachmentPart(part: any): boolean {
  const filename = getPartFilename(part)
  if (!filename) return false
  // Must have either an attachmentId (large) or body.data (small inline)
  return !!(part.body?.attachmentId || part.body?.data)
}

function getAttachments(payload: any): Attachment[] {
  const attachments: Attachment[] = []
  if (!payload) return attachments

  const scanParts = (parts: any[]) => {
    for (const part of parts) {
      if (isAttachmentPart(part)) {
        attachments.push({
          attachmentId: part.body?.attachmentId ?? '',
          filename: getPartFilename(part),
          mimeType: part.mimeType ?? 'application/octet-stream',
          size: part.body?.size ?? (part.body?.data ? Buffer.from(part.body.data, 'base64').length : 0),
          // inline data for small attachments (< 25KB)
          inlineData: part.body?.attachmentId ? undefined : part.body?.data,
        })
      }
      if (part.parts) scanParts(part.parts)
    }
  }

  if (payload.parts) scanParts(payload.parts)
  return attachments
}

function getHeader(headers: any[], name: string) {
  return headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeRFC2047(str: string): string {
  return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (_, _charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf8')
      } else {
        return text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_: string, h: string) => String.fromCharCode(parseInt(h, 16)))
      }
    } catch { return str }
  })
}

function extractEmail(from: string) {
  const m = from.match(/<(.+?)>/)
  return m ? m[1] : from
}

export function parseMessage(msg: any): ParsedMessage {
  const headers = msg.payload?.headers ?? []
  const from = decodeRFC2047(getHeader(headers, 'from'))
  const to   = decodeRFC2047(getHeader(headers, 'to'))
  return {
    id: msg.id,
    threadId: msg.threadId,
    subject: decodeRFC2047(getHeader(headers, 'subject')) || '(ללא נושא)',
    from,
    fromEmail: extractEmail(from),
    to,
    toEmail: extractEmail(to),
    date: getHeader(headers, 'date'),
    snippet: msg.snippet ?? '',
    body: getBody(msg.payload),
    isRead: !msg.labelIds?.includes('UNREAD'),
    labelIds: msg.labelIds ?? [],
    attachments: getAttachments(msg.payload),
  }
}

const LEGACY_TOKEN_KEY = 'gmail_legacy_refresh_token'

// OAuth2 client לתיבה הישנה — עם ה-redirect הייעודי שלה (לא של office).
export function getLegacyOAuthClient() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
  return new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    `${base}/api/auth/gmail-legacy/callback`,
  )
}

// URL הרשאה לתיבה הישנה — קריאה בלבד (לא שולחים ממנה). redirect ייעודי כדי
// להבחין מחיבור ה-office הראשי.
export function getLegacyAuthUrl(): string {
  const oauth = getLegacyOAuthClient()
  return oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/gmail.readonly'],
  })
}

export async function saveLegacyRefreshToken(token: string) {
  const db = getAdminDb()
  await db.from('app_settings').upsert({ key: LEGACY_TOKEN_KEY, value: token, updated_at: new Date().toISOString() })
}

export async function getLegacyRefreshToken(): Promise<string | null> {
  const db = getAdminDb()
  const { data } = await db.from('app_settings').select('value').eq('key', LEGACY_TOKEN_KEY).maybeSingle()
  return data?.value ?? null
}

export async function getLegacyGmailClient() {
  const token = await getLegacyRefreshToken()
  if (!token) throw new Error('Legacy Gmail not connected')
  const oauth = getLegacyOAuthClient()
  oauth.setCredentials({ refresh_token: token })
  return google.gmail({ version: 'v1', auth: oauth })
}
