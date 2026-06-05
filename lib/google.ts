// אינטגרציית Gmail (Google Workspace) לתיבת הדואר — שליחה וקבלה דרך ה-REST API של Gmail.
// משתמש בחשבון משותף יחיד (office@…) שמחובר פעם אחת ב-OAuth. הטוקנים נשמרים ב-DB
// ונגישים רק דרך service-role (לעולם לא נחשפים לדפדפן).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.modify'].join(' ')

// ----- תשתית -----

function svc(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export function isGoogleOAuthConfigured(): boolean {
  return !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET
}

interface GoogleAccount {
  email: string | null
  refresh_token: string | null
  access_token: string | null
  token_expiry: string | null
  last_history_id: string | null
}

export async function getGoogleAccount(): Promise<GoogleAccount | null> {
  const db = svc()
  if (!db) return null
  const { data } = await db
    .from('mail_google_account')
    .select('email, refresh_token, access_token, token_expiry, last_history_id')
    .eq('id', true)
    .maybeSingle()
  return (data as GoogleAccount) ?? null
}

// סטטוס חיבור לתצוגה (ללא טוקנים)
export async function getGoogleStatus(): Promise<{ connected: boolean; email: string | null }> {
  const acc = await getGoogleAccount()
  return { connected: !!acc?.refresh_token, email: acc?.email ?? null }
}

export async function disconnectGoogle(): Promise<void> {
  const db = svc()
  if (db) await db.from('mail_google_account').delete().eq('id', true)
}

// ----- OAuth -----

export function buildAuthUrl(redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  return `${AUTH_URL}?${p.toString()}`
}

interface TokenResp {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  id_token?: string
  error?: string
  error_description?: string
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { email?: string }
    return typeof json.email === 'string' ? json.email : null
  } catch {
    return null
  }
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!r.ok) return null
    const j = (await r.json()) as { email?: string }
    return j.email ?? null
  } catch {
    return null
  }
}

// החלפת קוד ההרשאה בטוקנים ושמירתם. דורש refresh_token (access_type=offline).
export async function exchangeCode(code: string, redirectUri: string, connectedBy: string | null): Promise<{ email: string }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const json = (await res.json()) as TokenResp
  if (!res.ok || !json.refresh_token) {
    throw new Error(json.error_description ?? json.error ?? 'החלפת הקוד נכשלה (ודא שאישרת גישה לא־מקוונת)')
  }
  const email = emailFromIdToken(json.id_token) ?? (json.access_token ? await fetchEmail(json.access_token) : null)
  const expiry = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString()
  const db = svc()
  if (!db) throw new Error('Supabase אינו מוגדר בשרת')
  await db.from('mail_google_account').upsert({
    id: true,
    email,
    refresh_token: json.refresh_token,
    access_token: json.access_token ?? null,
    token_expiry: expiry,
    connected_by: connectedBy,
    updated_at: new Date().toISOString(),
  })
  return { email: email ?? '' }
}

// טוקן גישה תקף (מרענן אוטומטית בעת הצורך)
export async function getAccessToken(): Promise<string> {
  const db = svc()
  if (!db) throw new Error('Supabase אינו מוגדר בשרת')
  const acc = await getGoogleAccount()
  if (!acc?.refresh_token) throw new Error('Gmail אינו מחובר')
  if (acc.access_token && acc.token_expiry && new Date(acc.token_expiry).getTime() > Date.now() + 60_000) {
    return acc.access_token
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: acc.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const json = (await res.json()) as TokenResp
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? 'רענון טוקן Gmail נכשל')
  }
  const expiry = new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString()
  await db.from('mail_google_account').update({
    access_token: json.access_token,
    token_expiry: expiry,
    updated_at: new Date().toISOString(),
  }).eq('id', true)
  return json.access_token
}

// ----- בניית MIME ושליחה -----

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function chunk76(b64: string): string {
  return b64.replace(/(.{76})/g, '$1\r\n')
}
// RFC2047 — קידוד כותרת עם תווים לא־ASCII (עברית)
function encodeWord(s: string): string {
  if (/^[\x00-\x7F]*$/.test(s)) return s
  return `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`
}
function formatAddress(addr: string, name?: string): string {
  return name ? `${encodeWord(name)} <${addr}>` : addr
}
function boundary(prefix: string): string {
  return `=_${prefix}_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export interface GmailAttachment {
  filename: string
  contentType?: string
  content: Buffer
}
export interface GmailSendParams {
  fromEmail: string
  fromName?: string
  to: string[]
  cc?: string[]
  subject: string
  text?: string
  html?: string
  inReplyTo?: string
  threadId?: string
  attachments?: GmailAttachment[]
}

function buildMime(p: GmailSendParams): string {
  const CRLF = '\r\n'
  const headers: string[] = [
    `From: ${formatAddress(p.fromEmail, p.fromName)}`,
    `To: ${p.to.join(', ')}`,
  ]
  if (p.cc && p.cc.length) headers.push(`Cc: ${p.cc.join(', ')}`)
  headers.push(`Subject: ${encodeWord(p.subject)}`)
  headers.push(`Date: ${new Date().toUTCString()}`)
  headers.push('MIME-Version: 1.0')
  // משרשרים בשרשור רק כשנראה כמו Message-ID תקין (<...@...>)
  if (p.inReplyTo && /<[^>]+@[^>]+>/.test(p.inReplyTo)) {
    headers.push(`In-Reply-To: ${p.inReplyTo}`)
    headers.push(`References: ${p.inReplyTo}`)
  }

  const textPart = (p.text && p.text.length) || !p.html
    ? `Content-Type: text/plain; charset="UTF-8"${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${chunk76(Buffer.from(p.text ?? '', 'utf8').toString('base64'))}`
    : null
  const htmlPart = p.html
    ? `Content-Type: text/html; charset="UTF-8"${CRLF}Content-Transfer-Encoding: base64${CRLF}${CRLF}${chunk76(Buffer.from(p.html, 'utf8').toString('base64'))}`
    : null

  let bodyMime: string
  if (textPart && htmlPart) {
    const b = boundary('alt')
    bodyMime = `Content-Type: multipart/alternative; boundary="${b}"${CRLF}${CRLF}--${b}${CRLF}${textPart}${CRLF}--${b}${CRLF}${htmlPart}${CRLF}--${b}--`
  } else {
    bodyMime = (htmlPart ?? textPart) as string
  }

  if (!p.attachments || p.attachments.length === 0) {
    return headers.join(CRLF) + CRLF + bodyMime + CRLF
  }

  const mb = boundary('mix')
  const parts: string[] = [`--${mb}${CRLF}${bodyMime}`]
  for (const a of p.attachments) {
    const ct = a.contentType || 'application/octet-stream'
    const fn = encodeWord(a.filename)
    parts.push(
      `--${mb}${CRLF}` +
      `Content-Type: ${ct}; name="${fn}"${CRLF}` +
      `Content-Disposition: attachment; filename="${fn}"${CRLF}` +
      `Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
      chunk76(a.content.toString('base64'))
    )
  }
  const top = [...headers, `Content-Type: multipart/mixed; boundary="${mb}"`].join(CRLF)
  return top + CRLF + CRLF + parts.join(CRLF) + CRLF + `--${mb}--` + CRLF
}

export async function gmailSend(p: GmailSendParams): Promise<{ id: string; threadId: string }> {
  const token = await getAccessToken()
  const raw = b64url(Buffer.from(buildMime(p), 'utf8'))
  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw, threadId: p.threadId || undefined }),
  })
  const json = (await res.json()) as { id?: string; threadId?: string; error?: { message?: string } }
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? 'שליחת המייל דרך Gmail נכשלה')
  return { id: json.id, threadId: json.threadId ?? json.id }
}

// ----- קבלה (סנכרון תיבת הנכנס) -----

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: GmailPart[]
}
interface GmailMessage {
  id: string
  threadId: string
  internalDate?: string
  labelIds?: string[]
  payload?: GmailPart
}
interface InboundAtt { filename: string; mimeType?: string; attachmentId?: string; size?: number }
interface BodyAcc { text?: string; html?: string; atts: InboundAtt[] }

// פענוח encoded-words (RFC2047) בכותרות נכנסות
function decodeMime(s: string): string {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, _charset, enc: string, text: string) => {
    try {
      if (enc.toUpperCase() === 'B') return Buffer.from(text, 'base64').toString('utf8')
      const q = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16)))
      return Buffer.from(q, 'binary').toString('utf8')
    } catch {
      return text
    }
  })
}
function parseAddress(s: string): { email: string; name?: string } {
  const m = s.match(/^(.*?)<([^>]+)>\s*$/)
  if (m) {
    const name = decodeMime(m[1].trim()).replace(/^"|"$/g, '').trim()
    return { email: m[2].trim(), name: name || undefined }
  }
  return { email: s.trim() }
}
function splitAddrs(s?: string): string[] {
  if (!s) return []
  return s.split(',').map((x) => parseAddress(x).email).filter(Boolean)
}
function walk(part: GmailPart, acc: BodyAcc): void {
  const mime = part.mimeType ?? ''
  if (part.filename && part.body?.attachmentId) {
    acc.atts.push({ filename: part.filename, mimeType: part.mimeType, attachmentId: part.body.attachmentId, size: part.body.size })
  } else if (mime === 'text/plain' && part.body?.data) {
    acc.text = (acc.text ?? '') + Buffer.from(part.body.data, 'base64url').toString('utf8')
  } else if (mime === 'text/html' && part.body?.data) {
    acc.html = (acc.html ?? '') + Buffer.from(part.body.data, 'base64url').toString('utf8')
  }
  if (part.parts) for (const sub of part.parts) walk(sub, acc)
}

async function gmailGet(token: string, id: string): Promise<GmailMessage | null> {
  const r = await fetch(`${GMAIL_API}/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  return (await r.json()) as GmailMessage
}
async function getAttachment(token: string, msgId: string, attId: string): Promise<Buffer | null> {
  const r = await fetch(`${GMAIL_API}/messages/${msgId}/attachments/${attId}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return null
  const j = (await r.json()) as { data?: string }
  return j.data ? Buffer.from(j.data, 'base64url') : null
}
async function listInbox(token: string, max: number): Promise<string[]> {
  const r = await fetch(`${GMAIL_API}/messages?labelIds=INBOX&maxResults=${max}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return []
  const j = (await r.json()) as { messages?: { id: string }[] }
  return (j.messages ?? []).map((m) => m.id)
}
async function profileHistoryId(token: string): Promise<string | undefined> {
  const r = await fetch(`${GMAIL_API}/profile`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) return undefined
  const j = (await r.json()) as { historyId?: string }
  return j.historyId
}

async function importMessage(db: SupabaseClient, token: string, id: string): Promise<boolean> {
  const { data: exists } = await db.from('mail_messages').select('id').eq('provider_id', id).maybeSingle()
  if (exists) return false
  const msg = await gmailGet(token, id)
  if (!msg?.payload) return false
  // מתעלמים מהודעות יוצאות שלנו שמסומנות SENT (כדי לא לכפול את מה שכבר נשמר בשליחה)
  if ((msg.labelIds ?? []).includes('SENT') && !(msg.labelIds ?? []).includes('INBOX')) return false

  const hs = msg.payload.headers ?? []
  const get = (n: string) => hs.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value
  const from = parseAddress(get('from') ?? '')
  if (!from.email) return false
  const acc: BodyAcc = { atts: [] }
  walk(msg.payload, acc)
  const created = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString()

  const { data: inserted, error } = await db.from('mail_messages').insert({
    direction: 'inbound',
    from_email: from.email,
    from_name: from.name ?? null,
    to_emails: splitAddrs(get('to')),
    cc_emails: splitAddrs(get('cc')),
    subject: decodeMime(get('subject') ?? ''),
    body_text: acc.text ?? null,
    body_html: acc.html ?? null,
    status: 'received',
    is_read: false,
    thread_id: msg.threadId,
    in_reply_to: get('in-reply-to') ?? null,
    provider_id: id,
    has_attachments: acc.atts.length > 0,
    created_at: created,
  }).select('id').single()

  if (error || !inserted) return false

  // קבצים מצורפים — הורדה מ-Gmail והעלאה ל-Storage כדי שיהיו ניתנים להורדה
  for (const at of acc.atts) {
    if (!at.attachmentId) continue
    try {
      const data = await getAttachment(token, id, at.attachmentId)
      if (!data) continue
      const safeName = at.filename.replace(/[^\w.\-]+/g, '_')
      const path = `inbound/${id}/${safeName}`
      const up = await db.storage.from('mail-attachments').upload(path, data, { contentType: at.mimeType || undefined, upsert: true })
      if (up.error) continue
      const { data: pub } = db.storage.from('mail-attachments').getPublicUrl(path)
      await db.from('mail_attachments').insert({
        message_id: inserted.id,
        file_url: pub.publicUrl,
        file_name: at.filename,
        content_type: at.mimeType ?? null,
        size: at.size ?? null,
      })
    } catch {
      /* דילוג על קובץ בעייתי — לא חוסם את שמירת ההודעה */
    }
  }
  return true
}

// סנכרון תיבת הנכנס: מושך הודעות חדשות מ-Gmail ושומר אותן. בטוח לקריאה חוזרת (dedupe).
export async function syncInbox(opts?: { max?: number }): Promise<{ imported: number }> {
  const db = svc()
  if (!db) throw new Error('Supabase אינו מוגדר בשרת')
  const acc = await getGoogleAccount()
  if (!acc?.refresh_token) throw new Error('Gmail אינו מחובר')
  const token = await getAccessToken()

  let ids: string[] = []
  let newHistoryId: string | undefined

  if (acc.last_history_id) {
    const url = new URL(`${GMAIL_API}/history`)
    url.searchParams.set('startHistoryId', acc.last_history_id)
    url.searchParams.set('historyTypes', 'messageAdded')
    url.searchParams.set('labelId', 'INBOX')
    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } })
    if (r.ok) {
      const j = (await r.json()) as {
        history?: { messagesAdded?: { message: { id: string; labelIds?: string[] } }[] }[]
        historyId?: string
      }
      newHistoryId = j.historyId
      for (const h of j.history ?? []) {
        for (const m of h.messagesAdded ?? []) {
          if ((m.message.labelIds ?? []).includes('INBOX')) ids.push(m.message.id)
        }
      }
    } else {
      // היסטוריה פגה (לרוב 404) — חוזרים לסריקת התיבה
      ids = await listInbox(token, opts?.max ?? 25)
    }
  } else {
    ids = await listInbox(token, opts?.max ?? 25)
  }

  ids = [...new Set(ids)]
  let imported = 0
  for (const id of ids) {
    if (await importMessage(db, token, id)) imported++
  }

  const hid = newHistoryId ?? (await profileHistoryId(token))
  if (hid) {
    await db.from('mail_google_account').update({ last_history_id: hid, updated_at: new Date().toISOString() }).eq('id', true)
  }
  return { imported }
}
