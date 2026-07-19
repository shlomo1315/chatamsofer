import { describe, it, expect, afterEach } from 'vitest'
import { isWorkspaceConfigured, getWorkspaceGmailClient } from './googleWorkspace'

const orig = process.env.GOOGLE_SA_KEY
afterEach(() => {
  if (orig === undefined) delete process.env.GOOGLE_SA_KEY
  else process.env.GOOGLE_SA_KEY = orig
})

// מפתח דמה תקין למבנה (private_key חייב להיות PEM כדי ש-JWT לא יזרוק בבנייה)
const FAKE_KEY = {
  client_email: 'sa@proj.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\\nMIIfake\\n-----END PRIVATE KEY-----\\n',
}

describe('isWorkspaceConfigured', () => {
  it('false כשאין GOOGLE_SA_KEY', () => {
    delete process.env.GOOGLE_SA_KEY
    expect(isWorkspaceConfigured()).toBe(false)
  })
  it('true כשמוגדר', () => {
    process.env.GOOGLE_SA_KEY = JSON.stringify(FAKE_KEY)
    expect(isWorkspaceConfigured()).toBe(true)
  })
})

describe('getWorkspaceGmailClient', () => {
  it('זורק כשה-SA לא מוגדר', () => {
    delete process.env.GOOGLE_SA_KEY
    expect(() => getWorkspaceGmailClient('y@chasamsofer.info')).toThrow(/not configured/)
  })

  it('בונה לקוח מ-JSON גולמי (impersonation לתיבת היעד)', () => {
    process.env.GOOGLE_SA_KEY = JSON.stringify(FAKE_KEY)
    const gmail = getWorkspaceGmailClient('y@chasamsofer.info')
    expect(gmail).toBeTruthy()
    // ה-auth הוא JWT עם subject=תיבת היעד ו-email של ה-SA
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jwt = (gmail.context._options.auth) as any
    expect(jwt.subject).toBe('y@chasamsofer.info')
    expect(jwt.email).toBe(FAKE_KEY.client_email)
  })

  it('מקבל מפתח מקודד base64', () => {
    process.env.GOOGLE_SA_KEY = Buffer.from(JSON.stringify(FAKE_KEY), 'utf-8').toString('base64')
    const gmail = getWorkspaceGmailClient('g@chasamsofer.info')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jwt = (gmail.context._options.auth) as any
    expect(jwt.subject).toBe('g@chasamsofer.info')
  })

  it('זורק על מפתח לא תקין (JSON פגום)', () => {
    process.env.GOOGLE_SA_KEY = '{not valid json'
    expect(() => getWorkspaceGmailClient('y@chasamsofer.info')).toThrow(/not configured/)
  })
})
