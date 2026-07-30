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
// לפעולות ששמורות למנהל מעצם טיבן (ניהול מלאי, מחיקה לצמיתות).
export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useContext(StaffPermissionsContext)
  return isAdmin ? <>{children}</> : null
}

// ─────────────────────────────────────────────────────────────────────────────
// עוטף תוכן שיוצג רק למי שיש לו הרשאה לפעולה במסך מסוים.
//
// ⚠️ להעדיף על AdminOnly בכל מקום שבו השרת אוכף הרשאה ולא תפקיד. כשה-UI
// הסתיר לפי isAdmin בעוד ה-API בדק requirePermission, נוצר פער: למזכירות
// *הייתה* ההרשאה בפועל, אך הכפתור לא הוצג לה כלל ולא היה שום רמז למה.
//
// חובה שהזוג (section, action) יהיה זהה ל-requirePermission של אותו מסלול —
// אחרת הכפתור מוצג ומחזיר 403, וזה גרוע מלהסתיר אותו.
// ─────────────────────────────────────────────────────────────────────────────
export function Can({
  section, action, children,
}: { section: SectionKey; action: PermAction; children: React.ReactNode }) {
  return useCan(section, action) ? <>{children}</> : null
}
