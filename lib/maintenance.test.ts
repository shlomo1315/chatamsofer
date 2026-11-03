import { describe, it, expect } from 'vitest'
import { maintenanceOn, isMaintenanceBlockedApi } from './maintenance'

describe('maintenanceOn', () => {
  it('דלוק רק כשהערך true', () => {
    expect(maintenanceOn({ MAINTENANCE_MODE: 'true' })).toBe(true)
    expect(maintenanceOn({ MAINTENANCE_MODE: ' TRUE ' })).toBe(true)
  })
  it('כבוי כשלא מוגדר או ערך אחר', () => {
    expect(maintenanceOn({})).toBe(false)
    expect(maintenanceOn({ MAINTENANCE_MODE: 'false' })).toBe(false)
    expect(maintenanceOn({ MAINTENANCE_MODE: '' })).toBe(false)
  })
})

describe('isMaintenanceBlockedApi', () => {
  it('חוסם כניסה, הרשמה ואימות', () => {
    for (const p of [
      '/api/portal/auth/login', '/api/portal/auth/send-code', '/api/portal/auth/send-phone-code',
      '/api/portal/login', '/api/portal/public-register', '/api/portal/verify/send',
      '/api/portal/verify/confirm', '/api/register',
    ]) expect(isMaintenanceBlockedApi(p), p).toBe(true)
  })
  it('לא חוסם בריאות, ניהול ושאר ה-API', () => {
    for (const p of ['/api/health', '/api/admin/users', '/api/portal/data', '/api/portal/logout', '/api/webhooks/resend-inbound'])
      expect(isMaintenanceBlockedApi(p), p).toBe(false)
  })
})
