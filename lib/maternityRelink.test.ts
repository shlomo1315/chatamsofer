import { describe, it, expect } from 'vitest'
import { hasActiveCard } from './maternityRelink'

describe('hasActiveCard', () => {
  const full = { Cards: [{ MagneticCard: '7014 5530-0739 5399' }, { CardNumber: '111', RemovedDate: '2026-01-01' }] }
  it('מזהה כרטיס פעיל גם עם רווחים ומקפים', () => expect(hasActiveCard(full, '7014553007395399')).toBe(true))
  it('כרטיס שהוסר אינו נחשב', () => expect(hasActiveCard(full, '111')).toBe(false))
  it('בלי כרטסת או בלי מספר: לא משויך', () => {
    expect(hasActiveCard(null, '1')).toBe(false)
    expect(hasActiveCard(full, '')).toBe(false)
  })
})
