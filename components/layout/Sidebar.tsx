'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, GitBranch, Baby, CreditCard, Gift,
  BarChart3, Settings, Menu, X, Building2, Trees, HeartHandshake,
  Mail, ChevronDown, ChevronUp, UtensilsCrossed, HandCoins, Heart, Send, Star, ShieldAlert,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import type { UserPermissions, SectionKey, UserRole } from '@/types'
import { sectionVisible } from '@/lib/permissions'
import { DEPARTMENTS } from '@/lib/departments'

function LogoBadge() {
  const [error, setError] = useState(false)
  return (
    <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden">
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

/**
 * האם להציג את "מייל Resend" בתפריט.
 *
 * 🔴 false = מוסתר מהתפריט בלבד. המסך (/admin/mail), ה-API והנתונים
 * נשארים שלמים ונגישים בכתובת ישירה — שום דבר לא נמחק.
 *
 * ⚠️ הוסתר אחרי שמסלול ה-Gmail הפך למסלול העבודה. אם יתברר שחסרות
 * הודעות ב-Gmail — מחזירים ל-true והתפריט חוזר כפי שהיה.
 */
const SHOW_RESEND_MAIL = false

const navTop: NavItem[] = [
  { href: '/admin/dashboard',     label: 'לוח בקרה',   icon: LayoutDashboard },
  { href: '/admin/beneficiaries', label: 'צאצאים',      icon: Users,  section: 'beneficiaries' },
  { href: '/admin/lineage',       label: 'עץ הדורות',   icon: Trees,  section: 'lineage' },
]

// "יולדות" — קטגוריית אם מתקפלת עם שני תתי-אגפים
const maternityChildren: { href: string; label: string; section: SectionKey }[] = [
  { href: '/admin/maternity/recovery',  label: 'עזר יולדות',        section: 'maternity' },
  { href: '/admin/maternity/silent',    label: 'לידה שקטה',         section: 'maternity' },
  { href: '/admin/maternity/cards',     label: 'כרטיסי מזון יולדות', section: 'maternity_cards' },
  { href: '/admin/maternity/gratitude', label: 'מכתבי ברכה',        section: 'maternity' },
  { href: '/admin/maternity/feedback',  label: 'משוב בתי החלמה',    section: 'maternity' },
]

const MATERNITY_CHILD_ICONS: Record<string, React.ElementType> = {
  '/admin/maternity/recovery':  Baby,
  '/admin/maternity/silent':    Heart,
  '/admin/maternity/cards':     UtensilsCrossed,
  '/admin/maternity/gratitude': Gift,
  '/admin/maternity/feedback':  Star,
}

const navBottom: NavItem[] = [
  { href: '/admin/loans',         label: 'הלוואות',        icon: CreditCard,     section: 'loans' },
  { href: '/admin/financial-aid', label: 'סיוע רפואי',     icon: HandCoins,      section: 'financial_aid' },
  { href: '/admin/distributions', label: 'חלוקות חגים',         icon: Gift,           section: 'distributions' },
  { href: '/admin/widows',        label: 'אלמנות ויתומים', icon: HeartHandshake, section: 'widows' },
  { href: '/admin/reports',       label: 'דוחות',          icon: BarChart3,      section: 'reports' },
  { href: '/admin/newsletter',    label: 'ניוזלטר',        icon: Send,           section: 'newsletter' },
]

const bottomItems: { href: string; label: string; icon: React.ElementType }[] = [
  { href: '/admin/settings', label: 'הגדרות', icon: Settings },
]

// שדות הפרופיל (mail_only/allowed_mailboxes/department) מגיעים כ-props מה-Layout שכבר טען
// את הפרופיל המלא — כדי לחסוך fetch('/api/admin/me') + getUser + שאילתת profiles נוספים בכל עמוד.
export default function Sidebar({ isAdmin, role, permissions, mailOnlyFlag, allowedMailboxes, department }: {
  isAdmin?: boolean; role?: UserRole; permissions?: UserPermissions
  mailOnlyFlag?: boolean; allowedMailboxes?: string[] | null; department?: string | null
}) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mailOpen, setMailOpen] = useState(pathname.startsWith('/admin/mail'))
  const [maternityOpen, setMaternityOpen] = useState(pathname.startsWith('/admin/maternity'))
  const [unreadCounts, setUnreadCounts] = useState<{ byDepartment: Record<string, number>; total: number }>({ byDepartment: {}, total: 0 })

  useEffect(() => {
    const fetchCounts = () =>
      fetch('/api/admin/mail/unread-counts')
        .then(r => r.json())
        .then(d => { if (!d.error) setUnreadCounts({ byDepartment: d.byDepartment ?? {}, total: d.total ?? 0 }) })
        .catch(() => {})
    fetchCounts()
    // ⚠️ הסקר רץ בכל לשונית פתוחה של כל מנהל, וכל קריאה מריצה 11 שאילתות
    // ספירה בשרת. ב-60 שניות זה עומס רקע קבוע שמתחרה ברינדור של הדפים
    // עצמם. שלוש דקות, ורק כשהלשונית גלויה — כשחוזרים אליה מרעננים מיד.
    const tick = () => { if (!document.hidden) fetchCounts() }
    const interval = setInterval(tick, 180_000)
    const onVisible = () => { if (!document.hidden) fetchCounts() }
    document.addEventListener('visibilitychange', onVisible)
    // סנכרון מיידי של תג ה"לא נקראו" כשמסמנים מייל כנקרא / מוחקים / נכנס מייל חדש במסך המייל
    const onRefresh = (e: Event) => {
      const detail = (e as CustomEvent).detail as { byDepartment?: Record<string, number>; total?: number } | undefined
      if (detail && typeof detail.total === 'number') setUnreadCounts({ byDepartment: detail.byDepartment ?? {}, total: detail.total })
      else fetchCounts()
    }
    window.addEventListener('mail-unread-refresh', onRefresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener('mail-unread-refresh', onRefresh)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  // מחלקות בתפריט המייל: מנהל רואה הכל; משתמש מוגבל רק את התיבות שהוקצו לו.
  // mailOnly = משתמש "מייל בלבד" — רואה אך ורק את לשונית המייל.
  const mailOnly = !isAdmin && mailOnlyFlag === true
  const allowedKeys: string[] | null = isAdmin
    ? null
    : (allowedMailboxes && allowedMailboxes.length > 0
        ? allowedMailboxes
        : (department ? [department] : (mailOnly ? [] : null)))
  const visibleDepartments = allowedKeys === null
    ? Object.values(DEPARTMENTS)
    : Object.values(DEPARTMENTS).filter(d => allowedKeys.includes(d.key))

  // משתמש "מייל בלבד" — פתח אוטומטית את תפריט המייל
  useEffect(() => { if (mailOnly) setMailOpen(true) }, [mailOnly])

  // ⚠️ ההכרעה עברה ל-lib/permissions (sectionVisible) — אותה פונקציה שהשרת
  // מריץ. קודם הייתה כאן ברירת מחדל מתירנית משלה ("ללא סימון = גלוי"), ולכן
  // הסרגל הציג מחלקות שהמשתמש מעולם לא הורשה אליהן.
  const canSee = (section?: SectionKey) => sectionVisible(!!isAdmin, role, permissions, section)
  const topVisible = navTop.filter(i => canSee(i.section))
  const bottomVisible = navBottom.filter(i => canSee(i.section))
  const maternityVisible = maternityChildren.filter(c => canSee(c.section))

  // ⚠️ משתמש "מייל בלבד" רואה את המייל גם ללא סימון מפורש: זו כל מהות
  // ההגדרה שלו, ובלעדיה נוצר חשבון בלי אף מסך — הוא נכנס ומקבל סרגל ריק.
  // בכל שאר המקרים נדרש סימון 'mail', בדיוק כמו בשרת.
  const canSeeMail = canSee('mail') || mailOnly

  // ⚠️ מסכי Gmail יושבים תחת /admin/mail, ולכן היו מדליקים גם את "מייל
  // Resend". בתקופת המעבר דווקא ההבחנה בין השניים היא כל העניין.
  const gmailActive = pathname.startsWith('/admin/mail/gmail')
    || pathname.startsWith('/admin/mail/index-sync')
  const mailActive = pathname.startsWith('/admin/mail') && !gmailActive
  // תת-עמוד יולדות פעיל — לפי הקידומת של הקישור עצמו
  const childActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const anyChildActive = maternityChildren.some(c => childActive(c.href))
  const maternityRootActive = pathname === '/admin/maternity'
    || (/^\/admin\/maternity\/[^/]+$/.test(pathname) && !anyChildActive)

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

        {!mailOnly && (<>
        {/* Section: ניווט ראשי */}
        <p className="px-3 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">ראשי</p>
        {topVisible.map(renderLink)}
        {/* אישורים חריגים — admin-only. אנשים שאושרו ידנית (אינם צאצאים). */}
        {isAdmin && renderLink({ href: '/admin/special-approvals', label: 'אישורים חריגים', icon: ShieldAlert })}

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
                  const active = childActive(child.href)
                  const Icon = MATERNITY_CHILD_ICONS[child.href] ?? Baby
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
        </>)}

        {/* ── מייל Resend — מוסתר מהתפריט ──────────────────────────────────
            🔴 הוסתר בלבד, **לא נמחק**: המסך (/admin/mail), ה-API והנתונים
            נשארים כפי שהם ונגישים בכתובת ישירה. זו החלטה של תצוגה בלבד,
            בהמשך למעבר ל-Gmail כמסלול היחיד בתפריט.

            ⚠️ להחזרה: להחליף את SHOW_RESEND_MAIL ל-true. שום דבר אחר לא
            צריך להשתנות — לכן זה דגל ולא מחיקה. */}
        {canSeeMail && (<>
        {SHOW_RESEND_MAIL && (<>
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
            {/* ⚠️ מסומן במפורש כ"Resend" לאורך תקופת המעבר: שני מסלולי דואר
                פועלים במקביל (Resend הישן, Gmail החדש), ובלי שם מבחין אי אפשר
                לדעת באיזה מהם צופים — וכל השוואה ביניהם חסרת ערך. */}
            <span className="flex-1 text-right">מייל Resend</span>
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

        </>)}

        {/* ── מייל — מסלול העבודה ──
            ⚠️ נמצא *מחוץ* לתנאי SHOW_RESEND_MAIL בכוונה: משתמש "מייל בלבד"
            רואה אך ורק את לשונית המייל, ואילו הוא היה בתוך אותו תנאי —
            הסתרת Resend הייתה מותירה אותו עם תפריט ריק לגמרי. */}
        <div className="pt-0.5">
          <Link
            href="/admin/mail/gmail"
            onClick={() => setMobileOpen(false)}
            className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
              ${gmailActive
                ? 'bg-indigo-600/90 text-white shadow-lg shadow-indigo-500/25 ring-1 ring-indigo-400/30'
                : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
          >
            {gmailActive && (
              <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-300 rounded-full" />
            )}
            <Mail size={18} className="flex-shrink-0" />
            {/* ⚠️ "מייל" ולא "מייל Gmail": זהו מסלול המייל של המערכת, ושם
                הספק אינו מעניין את המשתמש. תווית "חדש" הוסרה — הוא כבר
                לא חדש. */}
            <span className="flex-1 text-right">מייל</span>
          </Link>
        </div>
        </>)}

        {/* Section divider: מערכת */}
        {!mailOnly && (<>
        <div className="pt-3 pb-1">
          <div className="mx-1 h-px bg-slate-800 mb-2" />
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">מערכת</p>
        </div>

        {/* Bottom items (הגדרות) — מנהל ראשי בלבד */}
        {isAdmin && bottomItems.map(({ href, label, icon: Icon }) => {
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
        </>)}
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
