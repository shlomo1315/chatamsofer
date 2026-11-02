'use client'
import { LogOut, User } from 'lucide-react'
import NotificationBell from './NotificationBell'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Profile, ROLE_LABELS } from '@/types'
import dynamic from 'next/dynamic'

// ווידג'ט התאריך/שעה טוען את @hebcal/core (כבד) — נטען עצלה בצד לקוח בלבד,
// כדי שלא יוכנס לבאנדל המשותף של כל עמוד אדמין ולא יריץ חישובי זמנים ב-SSR.
const HeaderDateTime = dynamic(() => import('./HeaderDateTime'), { ssr: false })

interface HeaderProps {
  user?: Profile | null
  title?: string
}

export default function Header({ user, title }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    // ניתוק גם מסשני פורטל בתי ההחלמה שנפתחו בכניסה מהירה (עוגיות ph_)
    await fetch('/api/admin/portal-logout-all', { method: 'POST' }).catch(() => {})
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="relative z-30 h-[60px] bg-[#f7f3ea] border-b border-[#e6dfcf] flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        {title && <h1 className="text-base font-semibold text-zinc-800">{title}</h1>}
      </div>

      <div className="flex items-center gap-2.5">
        <HeaderDateTime />

        {/* התראות אמיתיות. קודם הייתה כאן נקודה אדומה פועמת קבועה — התראה
            מזויפת שהופיעה גם כשלא היה כלום. */}
        <NotificationBell />

        {/* User chip — אחיד, נקי ומודרני: אווטאר עם ראשי תיבות + שם/תפקיד + יציאה */}
        <div className="flex items-center gap-1 rounded-full bg-[#fffdf8] border border-[#e6dfcf] ps-1 pe-1 py-1">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-navy flex items-center justify-center text-gold text-sm font-bold flex-shrink-0">
            {user?.full_name?.trim().charAt(0) || <User size={16} />}
          </div>
          {user && (
            <div className="text-right leading-tight px-1.5 hidden sm:block">
              <p className="text-sm font-semibold text-navy leading-snug">{user.full_name}</p>
              <p className="text-[11px] text-[#8a6316] font-medium leading-snug">{user.display_title?.trim() || ROLE_LABELS[user.role]}</p>
            </div>
          )}
          {user && (
            <button
              onClick={handleSignOut}
              className="p-2 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors flex-shrink-0"
              title="יציאה"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
