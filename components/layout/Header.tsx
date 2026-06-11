'use client'
import { Bell, LogOut, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Profile, ROLE_LABELS } from '@/types'
import HeaderDateTime from './HeaderDateTime'

interface HeaderProps {
  user?: Profile | null
  title?: string
}

export default function Header({ user, title }: HeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-16 bg-white shadow-sm flex items-center justify-between px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        {title && <h1 className="text-base font-semibold text-slate-800">{title}</h1>}
      </div>

      <div className="flex items-center gap-3">
        <HeaderDateTime />

        {/* Notification bell with pulse dot */}
        <button className="relative p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full">
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
          </span>
        </button>

        {user ? (
          <div className="flex items-center gap-2.5 pr-3 border-r border-slate-200">
            <div className="text-right leading-tight">
              <p className="text-sm font-semibold text-slate-800">{user.full_name}</p>
              <p className="text-xs text-slate-400 ltr-num">{user.email}</p>
              <p className="text-xs text-indigo-500 font-medium">{ROLE_LABELS[user.role]}</p>
            </div>

            {/* Avatar with indigo-to-violet gradient ring */}
            <div className="p-[2px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                <User size={15} />
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              title="יציאה"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
            <div className="p-[2px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0">
              <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-500">
                <User size={15} />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
