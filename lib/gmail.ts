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
  isRead: boolean
  labelIds: string[]
}

function decodeBase64(data: string) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
}

function getBody(payload: any): string {
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
  }
}
