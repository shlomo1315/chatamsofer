import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as templates from './emailTemplates'
import { buildCampaignHtml } from './newsletter/blocks'
import { issueEmail } from './gilyonotSender'
import { distributorMailHtml } from './gilyonotDistributorServer'
import { auditOutgoingMail, cleanOutgoingHtml, cleanSubject, emailPlainText } from './emailSanitize'

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 שומר הספאם: כל מייל שהמערכת בונה חייב לעבור את auditOutgoingMail אחרי
// הניקוי שכל מסלולי השליחה מפעילים. תבנית חדשה שמחזירה טקסט מוסתר, h2 שעוטף
// את הכול, נושא עם "!!!" או HTML ענק תיכשל כאן.
// ─────────────────────────────────────────────────────────────────────────────

const ZW = String.fromCharCode(0x200b)
const dirty = (s: string) => s.split(' ').join(` ${ZW}${ZW}`)

/** הנושא וה-HTML בדיוק כמו שהם יוצאים מהמסלולים (אחרי הניקוי המשותף). */
const outgoing = (html: string, subject: string) => ({ html: cleanOutgoingHtml(html), subject: cleanSubject(subject) })

describe('כל תבניות המערכת (emailTemplates) עומדות בכללי הספאם', () => {
  const built: { name: string; html: string; subject: string }[] = []
  for (const [name, fn] of Object.entries(templates)) {
    if (typeof fn !== 'function' || !name.endsWith('Email')) continue
    // ארגומנטים לדוגמה: שם, או אובייקט אפשרויות. תבנית שלא נבנית מהם נבדקת בבדיקות שלה.
    for (const args of [['ישראל ישראלי'], [{ name: 'ישראל ישראלי' }], []] as unknown[][]) {
      try {
        const r = (fn as (...a: unknown[]) => { html?: unknown; subject?: unknown })(...args)
        if (r && typeof r.html === 'string' && typeof r.subject === 'string') {
          built.push({ name, html: r.html, subject: r.subject })
          break
        }
      } catch { /* מנסים את צורת הארגומנטים הבאה */ }
    }
  }

  it('רוב התבניות נבנות בבדיקה (כדי שהשומר לא יהיה ריק)', () => {
    expect(built.length).toBeGreaterThanOrEqual(30)
  })

  it.each(built.map(b => [b.name, b] as const))('%s', (_n, b) => {
    const m = outgoing(b.html, b.subject)
    expect(auditOutgoingMail(m.html, m.subject)).toEqual([])
    expect(emailPlainText(m.html).length).toBeGreaterThan(20)
  })
})

describe('ניוזלטר', () => {
  const longBody = Array.from({ length: 30 }, () => 'ברכת חנוכה שמח לכל הצאצאים ובני המשפחה').join(' ')

  it('בלוק כותרת שהודבק אליו כל הגוף, עם תווים בלתי נראים, יוצא נקי', () => {
    const html = buildCampaignHtml({
      mode: 'blocks', preheader: 'חנוכה שמח', unsubscribeUrl: 'https://chasamsofer.co.il/u/x',
      blocks: [{ id: '1', type: 'heading', content: dirty(longBody) }],
    })
    const m = outgoing(html, 'חג שמח!!!')
    expect(auditOutgoingMail(m.html, m.subject)).toEqual([])
    expect(m.subject).toBe('חג שמח!')
  })

  it('מצב HTML חופשי עם h2 עוטף נתפס על ידי השומר', () => {
    // השומר עצמו: מוודא שהוא באמת מזהה את הדפוס של קמפיין חנוכה תשפ"ז
    const html = buildCampaignHtml({ mode: 'html', rawHtml: `<h2>${longBody}</h2>`, unsubscribeUrl: 'https://x/u' })
    expect(auditOutgoingMail(html)).toContain('תגית כותרת עוטפת את רוב התוכן')
  })

  it('השומר מזהה טקסט מוסתר, תווים בלתי נראים וגודל חריג', () => {
    expect(auditOutgoingMail(`<p>${longBody}</p><span style="font-size:1px;color:#fff">x</span>`)).toContain('טקסט בגופן 0-1px')
    expect(auditOutgoingMail(`<p>${dirty(longBody)}</p>`)).toContain('תווים בלתי נראים בגוף')
    expect(auditOutgoingMail(`<p>${'א'.repeat(120 * 1024)}</p>`)).toContain('HTML גדול מ-100KB')
  })
})

describe('גיליונות', () => {
  it('מייל גיליון שבועי', () => {
    const mail = issueEmail(
      { title: 'גיליון', parasha: 'וישב', intro: dirty('שבוע טוב לכל המנויים'), body_html: `<p>${dirty('דברי תורה על פרשת השבוע מתורת רבינו החתם סופר')}</p>`, design: null },
      { deliveryToken: 't', subscriberToken: 's' },
    )
    const m = outgoing(mail.html, 'גיליון פרשת וישב')
    expect(auditOutgoingMail(m.html, m.subject)).toEqual([])
  })

  it('הודעה למפיצים', () => {
    const m = outgoing(distributorMailHtml('עדכון למפיצים', dirty('לכבוד המפיץ,\n\nהגיליון החדש מוכן לאיסוף מהמשרד')), 'עדכון למפיצים')
    expect(auditOutgoingMail(m.html, m.subject)).toEqual([])
  })
})

describe('כל קובץ ששולח מייל ישירות עובר דרך הניקוי המשותף', () => {
  // שליחה ישירה (Resend או Gmail API) חייבת לייבא את lib/emailSanitize, או לבנות את
  // ההודעה דרך buildRawEmail / sendGmailMessage שמנקים בעצמם.
  const SEND = /emails\.send\(|batch\.send\(|messages\.send\(/
  const SAFE = /emailSanitize|buildRawEmail|sendGmailMessage/
  const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
    const p = join(dir, f)
    if (f === 'node_modules' || f.startsWith('.')) return []
    if (statSync(p).isDirectory()) return walk(p)
    return /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
  const senders = [...walk('lib'), ...walk('app')].filter(p => SEND.test(readFileSync(p, 'utf8')))

  it('נמצאו קבצי שליחה', () => expect(senders.length).toBeGreaterThan(3))
  it.each(senders)('%s', p => expect(readFileSync(p, 'utf8')).toMatch(SAFE))
})
