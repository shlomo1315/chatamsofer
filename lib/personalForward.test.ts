import { describe, it, expect } from 'vitest'
import { personalForwardHit } from './personalForward'

const toT = ['copy@in.chasamsofer.info', 't@chasamsofer.info']

describe('personalForwardHit', () => {
  it('מייל מ-y@ ל-t@ מועבר למייל האישי', () => {
    expect(personalForwardHit(toT, 'y@chasamsofer.info')).toBe('t@chasamsofer.info')
  })

  it('מייל משולח חיצוני ל-T@ מועבר', () => {
    expect(personalForwardHit(['T@chasamsofer.info'], 'r0527173262@gmail.com')).toBe('t@chasamsofer.info')
  })

  it('מייל שלא נשלח ל-t@ לא מועבר', () => {
    expect(personalForwardHit(['y@chasamsofer.info'], 'x@gmail.com')).toBeNull()
  })

  it('מייל מ-t@ עצמו לא מועבר, כדי שלא תיווצר לולאה', () => {
    expect(personalForwardHit(toT, 't@chasamsofer.info')).toBeNull()
  })

  it('דיווח כשל מכתובת מערכת לא מועבר', () => {
    expect(personalForwardHit(toT, 'mailer-daemon@googlemail.com')).toBeNull()
    expect(personalForwardHit(toT, '')).toBeNull()
  })
})
