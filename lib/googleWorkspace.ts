import { google } from 'googleapis'

// ─────────────────────────────────────────────────────────────────────────────
// כתיבה לתיבות Gmail בארגון דרך Domain-wide delegation.
// Service Account אחד (GOOGLE_SA_KEY) עם הרשאה לכל ה-Workspace מתחזה
// (impersonation) לתיבת היעד וכותב אליה — בלי לחבר כל תיבה בנפרד ב-OAuth.
// משמש לייבוא המיילים הישנים לתוך תיבות ה-Gmail של המחלקות.
// ─────────────────────────────────────────────────────────────────────────────

const ARCHIVE_LABEL_NAME = 'ארכיון מייל ישן'
const SCOPES = ['https://www.googleapis.com/auth/gmail.insert', 'https://www.googleapis.com/auth/gmail.labels']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GmailClient = any

/** האם ה-Service Account מוגדר? בלעדיו הייבוא ל-Gmail מושבת (לא שובר סנכרון). */
export function isWorkspaceConfigured(): boolean {
  return !!process.env.GOOGLE_SA_KEY
}

// מפענח את מפתח ה-Service Account מ-env. תומך גם ב-JSON גולמי וגם ב-base64.
function parseServiceAccountKey(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_SA_KEY
  if (!raw) return null
  try {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8')
    const parsed = JSON.parse(json)
    if (parsed.client_email && parsed.private_key) {
      // מפתחות שהודבקו ל-env לעיתים עם \n מילולי — מנרמלים לשורות אמיתיות.
      return { client_email: parsed.client_email, private_key: String(parsed.private_key).replace(/\\n/g, '\n') }
    }
  } catch { /* מפתח לא תקין */ }
  return null
}

/**
 * לקוח Gmail המאומת כתיבת היעד (impersonation) דרך ה-Service Account.
 * זורק אם ה-SA לא מוגדר או לא תקין — הקורא צריך לבדוק isWorkspaceConfigured קודם.
 */
export function getWorkspaceGmailClient(mailboxEmail: string): GmailClient {
  const sa = parseServiceAccountKey()
  if (!sa) throw new Error('GOOGLE_SA_KEY not configured')
  const jwt = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SCOPES,
    subject: mailboxEmail,   // התחזות לתיבת היעד
  })
  return google.gmail({ version: 'v1', auth: jwt })
}

/** יוצר/מאתר את תווית "ארכיון מייל ישן" בתיבת היעד ומחזיר את ה-id שלה. */
export async function ensureArchiveLabel(gmail: GmailClient): Promise<string> {
  const list = await gmail.users.labels.list({ userId: 'me' })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = (list.data.labels ?? []).find((l: any) => l.name === ARCHIVE_LABEL_NAME)
  if (existing?.id) return existing.id
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name: ARCHIVE_LABEL_NAME, labelListVisibility: 'labelShow', messageListVisibility: 'show' },
  })
  return created.data.id as string
}

/**
 * מזריק מייל raw (base64url, כפי שמוחזר מ-messages.get format:'raw') לתיבת היעד
 * עם התווית, תוך שמירת התאריך המקורי (מכותרת Date). לא שולח — רק מוסיף להיסטוריה.
 */
export async function importRawMessage(gmail: GmailClient, rawBase64: string, labelId: string): Promise<void> {
  await gmail.users.messages.import({
    userId: 'me',
    internalDateSource: 'dateHeader',  // תאריך הפנימי לפי כותרת Date — לא זמן הייבוא
    neverMarkSpam: true,
    processForCalendar: false,
    requestBody: { raw: rawBase64, labelIds: [labelId] },
  })
}
