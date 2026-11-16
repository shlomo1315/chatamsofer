import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { roleAllows } from '@/lib/permissions'

// הרשאות מסך שדכנים: מי שמורשה למדור אחר בלבד נחסם; צפייה בלבד לא מייצאת ולא משנה; בנק/ת"ז ושינוי שדכן רק למנהל.
// אין גישה למסד בבדיקות: כל מסלול חסום חייב לחזור 403 לפני שנוגעים בו.
const guards = vi.hoisted(() => ({ requirePermission: vi.fn(), requireAdmin: vi.fn(), getServiceClient: vi.fn() }))
vi.mock('@/lib/apiAuth', () => ({
  ...guards,
  forbidden: () => new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }),
}))

import { GET as list } from '@/app/api/admin/matchmaker-grants/matchmakers/route'
import { GET as exportXlsx } from '@/app/api/admin/matchmaker-grants/matchmakers/export/route'
import { PATCH as patchMatchmaker } from '@/app/api/admin/matchmaker-grants/matchmakers/[id]/route'
import { POST as revealBank } from '@/app/api/admin/matchmaker-grants/matchmakers/[id]/reveal/route'

const params = { params: Promise.resolve({ id: 'x' }) }
const req = () => new NextRequest('http://localhost/api/x')

beforeEach(() => {
  vi.clearAllMocks()
  guards.requirePermission.mockResolvedValue(null)
  guards.requireAdmin.mockResolvedValue(null)
})

describe('מטריצת ההרשאות של מלגות שדכנים', () => {
  it('מורשה למדור אחר בלבד נחסם גם מצפייה', () => {
    expect(roleAllows('secretary', { loans: 'edit' }, 'matchmaker_grants', 'view')).toBe(false)
    expect(roleAllows('secretary', {}, 'matchmaker_grants', 'view')).toBe(false)
  })
  it('צפייה בלבד: רואה, לא עורך', () => {
    expect(roleAllows('secretary', { matchmaker_grants: 'view' }, 'matchmaker_grants', 'view')).toBe(true)
    expect(roleAllows('secretary', { matchmaker_grants: 'view' }, 'matchmaker_grants', 'edit')).toBe(false)
  })
  it('עריכה מאפשרת עריכה', () => {
    expect(roleAllows('secretary', { matchmaker_grants: 'edit' }, 'matchmaker_grants', 'edit')).toBe(true)
  })
})

describe('נתיבי שדכנים חוסמים בלי הרשאה (403)', () => {
  it('רשימה: דורשת צפייה במדור', async () => {
    expect((await list(req())).status).toBe(403)
    expect(guards.requirePermission).toHaveBeenCalledWith('matchmaker_grants', 'view')
    expect(guards.getServiceClient).not.toHaveBeenCalled()
  })
  it('ייצוא: דורש עריכה, לכן צפייה בלבד נחסמת', async () => {
    expect((await exportXlsx(req())).status).toBe(403)
    expect(guards.requirePermission).toHaveBeenCalledWith('matchmaker_grants', 'edit')
    expect(guards.getServiceClient).not.toHaveBeenCalled()
  })
  it('שינוי שדכן: מנהל בלבד', async () => {
    const res = await patchMatchmaker(new NextRequest('http://localhost/api/x', { method: 'PATCH', body: '{"claims_limit":"2"}' }), params)
    expect(res.status).toBe(403)
    expect(guards.requireAdmin).toHaveBeenCalled()
    expect(guards.getServiceClient).not.toHaveBeenCalled()
  })
  it('חשיפת חשבון בנק: מנהל בלבד', async () => {
    const res = await revealBank(new NextRequest('http://localhost/api/x', { method: 'POST' }), params)
    expect(res.status).toBe(403)
    expect(guards.requireAdmin).toHaveBeenCalled()
    expect(guards.getServiceClient).not.toHaveBeenCalled()
  })
})
