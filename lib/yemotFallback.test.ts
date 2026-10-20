import { describe, it, expect } from 'vitest'
import { withFallbackFolder } from './yemotFallback'

describe('withFallbackFolder', () => {
  it('בלי הגדרה: מנתק כרגיל', () => {
    expect(withFallbackFolder('id_list_message=t-א&go_to_folder=hangup', undefined)).toBe('id_list_message=t-א&go_to_folder=hangup')
    expect(withFallbackFolder('x&go_to_folder=hangup', '  ')).toBe('x&go_to_folder=hangup')
  })
  it('עם הגדרה: מחליף ניתוק בשלוחה', () => {
    expect(withFallbackFolder('id_list_message=t-א&go_to_folder=hangup', '/')).toBe('id_list_message=t-א&go_to_folder=/')
  })
  it('לא נוגע בתגובות בלי ניתוק ובערך לא תקין', () => {
    expect(withFallbackFolder('read=t-א', '/')).toBe('read=t-א')
    expect(withFallbackFolder('x&go_to_folder=hangup', '/a&b')).toBe('x&go_to_folder=hangup')
  })
})
