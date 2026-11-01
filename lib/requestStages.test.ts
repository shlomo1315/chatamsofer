import { describe, it, expect } from 'vitest'
import { requestProgress } from './requestStages'

describe('requestProgress', () => {
  it('ממתינה → התקבלה', () => expect(requestProgress('loan', 'pending', 'pending').stage).toBe(0))
  it('בבדיקה', () => expect(requestProgress('financial_aid', 'awaiting_decision', 'progress').stage).toBe(1))
  it('אושרה', () => expect(requestProgress('loan', 'approved', 'approved').stage).toBe(2))
  it('הושלמה → בוצעה', () => expect(requestProgress('loan', 'completed', 'approved').stage).toBe(3))
  it('נדחתה', () => expect(requestProgress('widow', 'rejected', 'rejected').stage).toBe(-1))
})
