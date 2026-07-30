'use client'

import { createContext, useContext } from 'react'
import type { SectionKey, UserPermissions, UserRole } from '@/types'
import { roleAllows, type PermAction } from '@/lib/permissions'

// הקשר הרשאות בצד הלקוח — משקף את אותה מטריצה של השרת (lib/permissions),
// כדי להסתיר/להשבית כפתורי הוספה/עריכה/מחיקה שאין למשתמש הרשאה אליהם.
// זו שכבת UX בלבד; האכיפה האמיתית נעשית בשרת (requirePermission).
interface StaffPerms {
  isAdmin: boolean
  role: UserRole | undefined
  permissions: UserPermissions
}

const StaffPermissionsContext = createContext<StaffPerms>({ isAdmin: false, role: undefined, permissions: {} })

export function StaffPermissionsProvider({
  isAdmin,
  role,
  permissions,
  children,
}: {
  isAdmin: boolean
  role?: UserRole
  permissions: UserPermissions | undefined
  children: React.ReactNode
}) {
  return (
    <StaffPermissionsContext.Provider value={{ isAdmin, role, permissions: permissions ?? {} }}>
      {children}
    </StaffPermissionsContext.Provider>
  )
}

// hook: האם למשתמש הנוכחי יש הרשאה לפעולה במסך. מנהל תמיד true.
// מביא בחשבון גם את רצפת התפקיד (מזכירות — עריכת צאצאים תמיד), בדיוק כמו השרת.
export function useCan(section: SectionKey, action: PermAction): boolean {
  const { isAdmin, role, permissions } = useContext(StaffPermissionsContext)
  if (isAdmin) return true
  return roleAllows(role, permissions, section, action)
}

// hook: האם המשתמש הנוכחי הוא מנהל ראשי. לפעולות ששמורות למנהל בלבד
// (למשל מחיקת צאצא לצמיתות) ואינן נגזרות ממטריצת ההרשאות.
export function useIsAdmin(): boolean {
  return useContext(StaffPermissionsContext).isAdmin
}

export function useStaffPermissions(): StaffPerms {
  return useContext(StaffPermissionsContext)
}

// עוטף תוכן שיוצג רק למנהל ראשי (admin) — מזכירות לא תראה אותו.
// כפתורי "הוספה חדשה" (צאצא/לידה/הלוואה/סיוע/משפחה) שמורים למנהל בלבד.
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useContext(StaffPermissionsContext)
  return isAdmin ? <>{children}</> : null
}
