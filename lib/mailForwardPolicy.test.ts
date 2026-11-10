import { describe, it, expect } from 'vitest'
import { shouldForwardToGmail } from './mailForwardPolicy'

describe('shouldForwardToGmail', () => {
  it('בקשת לידה לא מועברת', () => {
    expect(shouldForwardToGmail('בקשת לידה · ת.ז 325453058')).toBe(false)
  })
  it('מייל רגיל מועבר', () => {
    expect(shouldForwardToGmail('שלום, שאלה כללית')).toBe(true)
  })
})
