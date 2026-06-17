'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, GitBranch, Baby, CreditCard, Gift,
  BarChart3, Settings, Menu, X, Building2, Trees, HeartHandshake,
  Mail, ChevronDown, ChevronUp, UtensilsCrossed, HandCoins,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import type { UserPermissions, SectionKey, Profile } from '@/types'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

function LogoBadge() {
  const [error, setError] = useState(false)
  return (
    <div className="flex-shrink-0 w-10 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden p-1 shadow-sm">
      {error ? (
        <Building2 size={18} className="text-indigo-600" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo.png" alt="היכל החתם סופר" className="w-full h-full object-contain" onError={() => setError(true)} />
      )}
    </div>
  )
}

type NavItem = { href: string; label: string; icon: React.ElementType; section?: SectionKey }

const navTop: NavItem[] = [
  { href: '/admin/dashboard',     label: 'לוח בקרה',   icon: LayoutDashboard },
  { href: '/admin/beneficiaries', label: 'צאצאים',      icon: Users,  section: 'beneficiaries' },
  { href: '/admin/lineage',       label: 'עץ הדורות',   icon: Trees,  section: 'lineage' },
]

// "יולדות" — קטגוריית אם מתקפלת עם שני תתי-אגפים
const maternityChildren: { href: string; label: string; section: SectionKey }[] = [
  { href: '/admin/maternity/recovery', label: 'עזר יולדות',        section: 'maternity' },
  { href: '/admin/maternity/cards',    label: 'כרטיסי מזון יולדות', section: 'maternity_cards' },
]

const navBottom: NavItem[] = [
  { href: '/admin/loans',         label: 'הלוואות',        icon: CreditCard,     section: 'loans' },
  { href: '/admin/financial-aid', label: 'סיוע רפואי',     icon: HandCoins,      section: 'financial_aid' },
  { href: '/admin/distributions', label: 'חלוקות',         icon: Gift,           section: 'distributions' },
  { href: '/admin/widows',        label: 'אלמנות ויתומים', icon: HeartHandshake, section: 'widows' },
  { href: '/admin/reports',       label: 'דוחות',          icon: BarChart3,      section: 'reports' },
]

const bottomItems: { href: string; label: string; icon: React.ElementType }[] = [
  { href: '/admin/settings', label: 'הגדרות', icon: Settings },
]

export default function Sidebar({ isAdmin, permissions }: { isAdmin?: boolean; permissions?: UserPermissions }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mailOpen, setMailOpen] = useState(pathname.startsWith('/admin/mail'))
  const [maternityOpen, setMaternityOpen] = useState(pathname.startsWith('/admin/maternity'))
  const [myProfile, setMyProfile] = useState<Profile | null>(null)
  const [unreadCounts, setUnreadCounts] = useState<{ byDepartment: Record<string, number>; total: number }>({ byDepartment: {}, total: 0 })

  useEffect(() => {
    fetch('/api/admin/me')
      .then(r => r.json())
      .then(d => setMyProfile(d.profile ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => {
    const fetchCounts = () =>
      fetch('/api/admin/mail/unread-counts')
        .then(r => r.json())
        .then(d => { if (!d.error) setUnreadCounts({ byDepartment: d.byDepartment ?? {}, total: d.total ?? 0 }) })
        .catch(() => {})
    fetchCounts()
    const interval = setInterval(fetchCounts, 60_000)
    return () => clearInterval(interval)
  }, [])

  // מחלקות בתפריט המייל: מנהל רואה את כל המחלקות; משתמש רגיל רק את המחלקה שלו.
  const allDepartments = Object.values(DEPARTMENTS)
  const visibleDepartments = isAdmin
    ? allDepartments
    : (myProfile?.department && DEPARTMENTS[myProfile.department as DepartmentKey]
        ? [DEPARTMENTS[myProfile.department as DepartmentKey]]
        : allDepartments)

  const canSee = (section?: SectionKey) => {
    if (!section) return true
    if (isAdmin) return true
    return (permissions?.[section] ?? 'view') !== 'none'
  }
  const topVisible = navTop.filter(i => canSee(i.section))
  const bottomVisible = navBottom.filter(i => canSee(i.section))
  const maternityVisible = maternityChildren.filter(c => canSee(c.section))

  const mailActive = pathname.startsWith('/admin/mail')
  const cardsActive = pathname.startsWith('/admin/maternity/cards')
  const recoveryActive = pathname.startsWith('/admin/maternity/recovery')
  const maternityRootActive = pathname === '/admin/maternity' || /^\/admin\/maternity\/[^/]+$/.test(pathname) && !cardsActive && !recoveryActive

  const renderLink = ({ href, label, icon: Icon }: NavItem) => {
    const active = href === '/admin/dashboard' ? pathname === href : pathname.startsWith(href)
    return (
      <Link key={href} href={href} onClick={() => setMobileOpen(false)}
        className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
          ${active
            ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400/30'
            : 'text-slate-300 hover:text-white hover:bg-white/10'
          }`}>
        {active && (
          <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-300 rounded-full" />
        )}
        <Icon size={18} className="flex-shrink-0" />
        <span>{label}</span>
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo area with gradient background */}
      <div className="flex items-center gap-3 px-4 py-5 bg-gradient-to-b from-slate-800 to-slate-900">
        <LogoBadge />
        <div className="min-w-0">
          <p className="text-sm font-bold text-white leading-tight truncate">היכל החתם סופר</p>
          <p className="text-xs text-slate-400 truncate">תוכנת ניהול</p>
        </div>
      </div>
      {/* Gradient fade separator */}
      <div className="mx-4 h-px bg-gradient-to-l from-transparent via-indigo-800/60 to-transparent mb-1" />

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">

        {/* Section: ניווט ראשי */}
        <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">ראשי</p>
        {topVisible.map(renderLink)}

        {/* Maternity accordion */}
        {maternityVisible.length > 0 && (
          <div className="pt-0.5">
            <div className={`relative flex items-center rounded-lg transition-all
                ${maternityRootActive
                  ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}>
              {maternityRootActive && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-300 rounded-full" />
              )}
              <Link href="/admin/maternity" onClick={() => { setMobileOpen(false); setMaternityOpen(true) }}
                className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium flex-1 min-w-0">
                <Baby size={18} className="flex-shrink-0" />
                <span>יולדות</span>
              </Link>
              <button onClick={() => setMaternityOpen(o => !o)} className="px-3 py-2.5 opacity-70 hover:opacity-100" aria-label="פתח/סגור">
                {maternityOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            {maternityOpen && (
              <div className="mt-1 mr-4 border-r border-slate-700/60 pr-2 flex flex-col gap-0.5">
                {maternityVisible.map(child => {
                  const active = child.href === '/admin/maternity/cards' ? cardsActive : recoveryActive
                  const Icon = child.href === '/admin/maternity/cards' ? UtensilsCrossed : Baby
                  return (
                    <Link key={child.href} href={child.href} onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all
                        ${active
                          ? 'bg-indigo-500/80 text-white shadow-sm shadow-indigo-500/20'
                          : 'text-slate-400 hover:text-white hover:bg-white/10'
                        }`}>
                      <Icon size={15} className="flex-shrink-0" />
                      <span>{child.label}</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Section divider: שירותים */}
        <div className="pt-3 pb-1">
          <div className="mx-1 h-px bg-slate-800 mb-2" />
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">שירותים</p>
        </div>
        {bottomVisible.map(renderLink)}

        {/* Mail accordion */}
        <div className="pt-0.5">
          <button
            onClick={() => setMailOpen(o => !o)}
            className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
              ${mailActive
                ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
          >
            {mailActive && (
              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-300 rounded-full" />
            )}
            <Mail size={18} className="flex-shrink-0" />
            <span className="flex-1 text-right">מייל</span>
            {unreadCounts.total > 0 && (
              <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0">
                {unreadCounts.total}
              </span>
            )}
            {mailOpen
              ? <ChevronUp size={14} className="flex-shrink-0 opacity-70" />
              : <ChevronDown size={14} className="flex-shrink-0 opacity-70" />}
          </button>

          {mailOpen && (
            <div className="mt-1 mr-4 border-r border-slate-700/60 pr-2 flex flex-col gap-0.5">
              {visibleDepartments.map(dep => {
                const cnt = unreadCounts.byDepartment[dep.key] ?? 0
                return (
                <Link
                  key={dep.key}
                  href={`/admin/mail?department=${dep.key}`}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all
                    ${mailActive ? 'text-slate-200 hover:bg-white/10' : 'text-slate-400 hover:text-white hover:bg-white/10'}`}
                >
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium text-slate-200 leading-tight">{dep.label}</span>
                    <span className="text-[10px] text-slate-500 truncate">{dep.email}</span>
                  </div>
                  {cnt > 0 && (
                    <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center flex-shrink-0 text-white"
                      style={{ backgroundColor: dep.color }}>
                      {cnt}
                    </span>
                  )}
                </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Section divider: מערכת */}
        <div className="pt-3 pb-1">
          <div className="mx-1 h-px bg-slate-800 mb-2" />
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">מערכת</p>
        </div>

        {/* Bottom items (הגדרות) */}
        {bottomItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${active
                  ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400/30'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}>
              {active && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-300 rounded-full" />
              )}
              <Icon size={18} className="flex-shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="mx-4 h-px bg-gradient-to-l from-transparent via-slate-700 to-transparent" />
      <div className="px-4 py-4">
        <p className="text-xs text-slate-600 text-center">גרסה 1.0.0</p>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:flex flex-col w-56 bg-slate-900 flex-shrink-0">
        <SidebarContent />
      </aside>

      <button onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed bottom-4 left-4 z-40 bg-indigo-600 text-white p-3 rounded-full shadow-lg">
        <Menu size={20} />
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-56 bg-slate-900 flex flex-col">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 left-4 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}
    </>
  )
}
