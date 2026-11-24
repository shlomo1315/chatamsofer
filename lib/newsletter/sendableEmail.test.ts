import { describe, it, expect } from 'vitest'
import { isSendableEmail } from './sender'

describe('isSendableEmail', () => {
  it('מקבל כתובות תקינות', () => {
    for (const e of ['a0548506049@gmail.com', 'office+c1234@chasamsofer.info', 'x.y-z@mail.co.il']) {
      expect(isSendableEmail(e)).toBe(true)
    }
  })

  // כתובות אמיתיות מקמפיין חנוכה תשפ"ז, שכל אחת הפילה batch שלם של 100 ב-Resend
  it('דוחה כתובות פגומות', () => {
    for (const e of [
      '‫wr158158@gmail.com‬',
      'a0548506049@gmail.com)',
      ',ylf1643@gmail.com',
      '.@gmail.comb036506864',
      'a0527618765@g.k',
      'a@w0548494514.c',
      '0533195278@30005000.,com',
      '.s053416061@gmail.com',
      'hadasg@.bbm.org.il',
      'a..b@gmail.com',
      'ab.@gmail.com',
      'a@-gmail.com',
      'no-at-sign.com',
      'a@b@c.com',
    ]) {
      expect(isSendableEmail(e)).toBe(false)
    }
  })
})
