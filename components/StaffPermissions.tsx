'use client'

import { createContext, useContext } from 'react'
import type { SectionKey, UserPermissions } from '@/types'
import { levelAllows, type PermAction } from '@/lib/permissions'

// הקשר הרשאות בצד הלקוח — משקף את אותה מטריצה של השרת (lib/permissions),
// כדי להסתיר/להשבית כפתורי הוספה/עריכה/מחיקה שאין למשתמש הרשאה אליהם.
// זו שכבת UX בלבד; האכיפה האמיתית נעשית בשרת (requirePermission).
interface StaffPerms {
  isAdmin: boolean
  permissions: UserPermissions
}

const StaffPermissionsContext = createContext<StaffPerms>({ isAdmin: false, permissions: {} })

export function StaffPermissionsProvider({
  isAdmin,
  permissions,
  children,
}: {
  isAdmin: boolean
  permissions: UserPermissions | undefined
  children: React.ReactNode
}) {
  return (
    <StaffPermissionsContext.Provider value={{ isAdmin, permissions: permissions ?? {} }}>
      {children}
    </StaffPermissionsContext.Provider>
  )
}

// hook: האם למשתמש הנוכחי יש הרשאה לפעולה במסך. מנהל תמיד true.
export function useCan(section: SectionKey, action: PermAction): boolean {
  const { isAdmin, permissions } = useContext(StaffPermissionsContext)
  if (isAdmin) return true
  return levelAllows(permissions[section], action)
}

export function useStaffPermissions(): StaffPerms {
  return useContext(StaffPermissionsContext)
}
