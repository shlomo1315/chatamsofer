import { describe, expect, it } from 'vitest'
import { distributorTurn } from './turn'
import { DM_REC } from '@/lib/gilyonotDistributorPhone'

const ctx = (hasPhone: boolean) => ({ distributors: [], hasPhone, agentPhone: '0501234567', agentOpen: true })

describe('שלוחת מפיצים: מתקשר לא מזוהה', () => {
  it.each([true, false])('מקליט הודעה למנהל, בלי תפריט, גם כשנציג זמין (טלפון=%s)', hasPhone => {
    const t = distributorTurn({}, ctx(hasPhone))
    expect(t.action).toBeNull()
    const s = JSON.stringify(t.result)
    expect(s).toContain('record')
    expect(s).toContain('אתם לא מזוהים במערכת')
    expect(s).not.toContain('simpleMenu')
    expect(s).not.toContain('dial')
  })
  it('אחרי ההקלטה: פעולת שמירה בלי מפיץ ופרידה', () => {
    const t = distributorTurn({ [`PATH_${DM_REC}`]: '/rec/1.wav' }, ctx(true))
    expect(t.action).toMatchObject({ kind: 'recording', distributorId: null, path: '/rec/1.wav' })
    expect(JSON.stringify(t.result)).toContain('hangup')
  })
  it('מקשים ישנים (הילולא/נציג) לא מפעילים דבר', () => {
    expect(distributorTurn({ dmMenu: '1' }, ctx(true)).action).toBeNull()
  })
})
