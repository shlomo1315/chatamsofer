'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, GitBranch, Baby, CreditCard, Gift,
  BarChart3, Settings, Menu, X, Building2, Trees, HeartHandshake,
  Mail, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import type { UserPermissions, SectionKey, Profile } from '@/types'

interface MailAccount { name: string; email: string }

function LogoBadge() {
  const [error, setError] = useState(false)
  return (
    <div className="flex-shrink-0 w-10 h-10 bg-white rounded-xl flex items-center justify-center overflow-hidden p-1 shadow-sm">
      {error ? (
        <Building2 size={18} className="text-indigo-600" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/logo.jpg" alt="היכל החתם סופר" className="w-full h-full object-contain" onError={() => setError(true)} />
      )}
    </div>
  )
}

const navItems: { href: string; label: string; icon: React.ElementType; section?: SectionKey }[] = [
  { href: '/admin/dashboard',     label: 'לוח בקרה',        icon: LayoutDashboard },
  { href: '/admin/beneficiaries', label: 'נתמכים',           icon: Users,          section: 'beneficiaries' },
  { href: '/admin/lineage',       label: 'עץ הדורות',        icon: Trees,          section: 'lineage' },
  { href: '/admin/maternity',     label: 'יולדות',           icon: Baby,           section: 'maternity' },
  { href: '/admin/loans',         label: 'הלוואות',          icon: CreditCard,     section: 'loans' },
  { href: '/admin/distributions', label: 'חלוקות',           icon: Gift,           section: 'distributions' },
  { href: '/admin/widows',        label: 'אלמנות ויתומים',   icon: HeartHandshake, section: 'widows' },
  { href: '/admin/reports',       label: 'דוחות',            icon: BarChart3,      section: 'reports' },
]

const bottomItems: { href: string; label: string; icon: React.ElementType }[] = [
  { href: '/admin/settings', label: 'הגדרות', icon: Settings },
]

export default function Sidebar({ isAdmin, permissions }: { isAdmin?: boolean; permissions?: UserPermissions }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mailOpen, setMailOpen] = useState(pathname.startsWith('/admin/mail'))
  const [mailAccounts, setMailAccounts] = useState<MailAccount[]>([])
  const [myProfile, setMyProfile] = useState<Profile | null>(null)

  // Fetch mail accounts and current user profile
  useEffect(() => {
    fetch('/api/admin/mail/labels')
      .then(r => r.json())
      .then(d => {
        const internal: MailAccount[] = d.internalEmails ?? []
        // Always include the main account first
        setMailAccounts([
          { name: 'משרד ראשי', email: 'office@chasamsofer.info' },
          ...internal,
        ])
      })
      .catch(() => setMailAccounts([{ name: 'משרד ראשי', email: 'office@chasamsofer.info' }]))

    fetch('/api/admin/me')
      .then(r => r.json())
      .then(d => setMyProfile(d.profile ?? null))
      .catch(() => {})
  }, [])

  // Filter accounts by role: non-admin only sees their assigned account
  const visibleAccounts = isAdmin
    ? mailAccounts
    : mailAccounts.filter(a =>
        !myProfile || !myProfile.mail_account || a.email === myProfile.mail_account
      )

  const visibleItems = navItems.filter(item => {
    if (!item.section) return true
    if (isAdmin) return true
    const level = permissions?.[item.section] ?? 'view'
    return level !== 'none'
  })

  const mailActive = pathname.startsWith('/admin/mail')

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-800">
        <LogoBadge />
        <div className="min-w-0">
          <p className="text-sm font-bold text-white leading-tight truncate">היכל החתם סופר</p>
          <p className="text-xs text-slate-400 truncate">תוכנת ניהול</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const active = href === '/admin/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
              <Icon size={18} className="flex-shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}

        {/* ── Mail accordion ── */}
        <div className="pt-1">
          <button
            onClick={() => setMailOpen(o => !o)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
              ${mailActive ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}
          >
            <Mail size={18} className="flex-shrink-0" />
            <span className="flex-1 text-right">מייל</span>
            {mailOpen
              ? <ChevronUp size={14} className="flex-shrink-0 opacity-70" />
              : <ChevronDown size={14} className="flex-shrink-0 opacity-70" />}
          </button>

          {mailOpen && (
            <div className="mt-1 mr-4 border-r border-slate-700 pr-2 flex flex-col gap-0.5">
              {visibleAccounts.map(acc => (
                <Link
                  key={acc.email}
                  href="/admin/mail"
                  onClick={() => setMobileOpen(false)}
                  className={`flex flex-col px-3 py-2 rounded-lg text-xs transition-colors
                    ${mailActive ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <span className="font-medium text-slate-200 leading-tight">{acc.name}</span>
                  <span className="text-[10px] text-slate-500 truncate">{acc.email}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ── Bottom items (הגדרות) below mail ── */}
        {bottomItems.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link key={href} href={href} onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                ${active ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-800'}`}>
              <Icon size={18} className="flex-shrink-0" />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-slate-800">
        <p className="text-xs text-slate-500 text-center">גרסה 1.0.0</p>
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
