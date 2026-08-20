import { describe, it, expect } from 'vitest'
import { buildDraftBody, buildDraftBodyCompact, fieldsFor, attachmentsFor, SUBJECT_PREFIX, type ReqType } from './emailRequestForms'
import { gmailComposeLink, GMAIL_URL_SAFE_LIMIT } from './draftLink'
import { parseDraft } from './emailRequestForms'

const ctx = { recoveryHomes: ['בית הבראה ויזניץ', 'בית הבראה בעלזא'], pending: true }
const TYPES: ReqType[] = ['birth', 'silent_birth', 'loan', 'financial_aid', 'widow']
const box = { birth: 'y@chasamsofer.info', silent_birth: 'y@chasamsofer.info', loan: 'g@chasamsofer.info', financial_aid: 'r@chasamsofer.info', widow: 'a@chasamsofer.info' } as Record<ReqType, string>

describe('🔴 הטיוטה נפתחת — הקישור חייב להיכנס למגבלת Gmail', () => {
  // השורש: עברית תופחת פי ~5 בקידוד URL ("א" -> "%D7%90"). הגוף המלא
  // (1,726 תווים) הפך ל-URL של 8,411 ו-Gmail דחה אותו — דף לבן.
  for (const t of TYPES) {
    it(`${t}: הקישור המלא מתחת למגבלה`, () => {
      const body = buildDraftBodyCompact(t, ctx)
      const url = gmailComposeLink({ to: box[t], subject: `${SUBJECT_PREFIX[t]} · ת.ז `, body })
      expect(url.length, `${t}: ${url.length} תווים`).toBeLessThan(GMAIL_URL_SAFE_LIMIT)
    })
  }

  it('מתעד את השורש: הגוף הארוך אכן חורג', () => {
    expect(encodeURIComponent(buildDraftBody('birth', '', ctx)).length).toBeGreaterThan(GMAIL_URL_SAFE_LIMIT)
  })
})

describe('🔴 הטיוטה נקלטת — כל שדות החובה חוזרים מהפרסר', () => {
  // ⚠️ הבאג הקודם: גוף מקוצר שהשמיט שדות. הבקשה נשלחה ונקלטה ריקה.
  for (const t of TYPES) {
    it(`${t}: כל שדות החובה מופיעים ומזוהים`, () => {
      const body = buildDraftBodyCompact(t, ctx)
      const parsed = parseDraft(t, body, ctx)
      for (const f of fieldsFor(t, ctx)) {
        expect(Object.keys(parsed), `${t}/${f.key} חסר בטיוטה`).toContain(f.key)
      }
    })
  }
})

describe('הטיוטה מכילה את ההוראות הקריטיות', () => {
  it('כל סוג מציין ת"ז עם ספרת ביקורת בשורת הנושא', () => {
    for (const t of TYPES) {
      expect(buildDraftBodyCompact(t, ctx)).toContain('ספרת ביקורת')
    }
  })

  it('סוג עם קבצי חובה מציין את שמות הקבצים', () => {
    for (const t of TYPES) {
      const req = attachmentsFor(t, ctx).filter(a => a.required)
      if (!req.length) continue
      const body = buildDraftBodyCompact(t, ctx)
      for (const a of req) expect(body, `${t}: ${a.name}`).toContain(a.name)
    }
  })
})

describe('תקינות הקישור', () => {
  it('כולל /u/0/ — בלעדיו Gmail מחזיר Bad Request 400', () => {
    expect(gmailComposeLink({ to: 'a@b.info', subject: 'x' })).toContain('/mail/u/0/')
  })
  it('אינו mailto: — Gmail חוסם mailto מגוף הודעה', () => {
    expect(gmailComposeLink({ to: 'a@b.info', subject: 'x' }).startsWith('mailto:')).toBe(false)
  })
  it('נושא ריק אינו נשלח כפרמטר ריק', () => {
    expect(gmailComposeLink({ to: 'a@b.info', subject: '' })).not.toContain('su=')
  })
})
