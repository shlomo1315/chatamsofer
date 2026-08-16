import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// דפי הניהול הם Server Components ששולפים ישירות מהמסד. עד לתיקון הזה
// ההגנה היחידה עליהם הייתה שהפריט לא הוצג בסרגל — כלומר מי שהקליד את
// הכתובת ידנית קיבל את הנתונים במלואם. הטסטים כאן מקבעים את ההכרעה.
// ─────────────────────────────────────────────────────────────────────────────

const redirect = vi.fn((url: string) => { throw new Error(`REDIRECT:${url}`) })
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }))

const requireStaff = vi.fn()
vi.mock('@/lib/apiAuth', () => ({ requireStaff: () => requireStaff() }))

const { guardPage, guardAdminPage } = await import('./pageGuard')

const staff = (role: string, permissions: Record<string, string> = {}) =>
  ({ userId: 'u1', email: 'a@b.c', role, permissions, department: null, mailOnly: false, allowedMailboxes: [] })

beforeEach(() => { redirect.mockClear(); requireStaff.mockReset() })

describe('guardPage', () => {
  it('מפנה להתחברות כשאין סשן', async () => {
    requireStaff.mockResolvedValue(null)
    await expect(guardPage('widows')).rejects.toThrow('REDIRECT:/login')
  })

  it('חוסם מחלקה שלא סומנה — גם אם המשתמש איש צוות תקין', async () => {
    requireStaff.mockResolvedValue(staff('secretary', { loans: 'edit' }))
    await expect(guardPage('widows')).rejects.toThrow('REDIRECT:/admin/dashboard')
  })

  it('מתיר את המחלקה שסומנה', async () => {
    requireStaff.mockResolvedValue(staff('secretary', { loans: 'edit' }))
    await expect(guardPage('loans')).resolves.toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })

  it('מנהל עובר לכל מחלקה גם ללא מטריצה', async () => {
    requireStaff.mockResolvedValue(staff('admin'))
    await expect(guardPage('widows')).resolves.toBeTruthy()
  })

  it("'view' אינו מספיק כשנדרשת עריכה", async () => {
    requireStaff.mockResolvedValue(staff('reviewer', { loans: 'view' }))
    await expect(guardPage('loans', 'edit')).rejects.toThrow('REDIRECT:/admin/dashboard')
  })
})

describe('guardAdminPage', () => {
  it('חוסם מי שאינו מנהל — גם עם מטריצה מלאה', async () => {
    requireStaff.mockResolvedValue(staff('secretary', { beneficiaries: 'edit', loans: 'edit' }))
    await expect(guardAdminPage()).rejects.toThrow('REDIRECT:/admin/dashboard')
  })

  it('מתיר מנהל', async () => {
    requireStaff.mockResolvedValue(staff('admin'))
    await expect(guardAdminPage()).resolves.toBeTruthy()
  })
})
