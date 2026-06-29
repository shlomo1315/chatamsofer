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
    <header className="h-[60px] bg-white/95 backdrop-blur-sm border-b border-zinc-200/80 flex items-center justify-between px-5 flex-shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        {title && <h1 className="text-base font-semibold text-zinc-800">{title}</h1>}
      </div>

      <div className="flex items-center gap-2.5">
        <HeaderDateTime />

        {/* Notification bell */}
        <button className="relative p-2 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white">
            <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-75" />
          </span>
        </button>

        {/* User chip — אחיד, נקי ומודרני: אווטאר עם ראשי תיבות + שם/תפקיד + יציאה */}
        <div className="flex items-center gap-1 rounded-full bg-gradient-to-b from-white to-slate-50 border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_4px_10px_-6px_rgba(15,23,42,0.12)] ps-1 pe-1 py-1">
          {/* Avatar */}
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-[0_3px_8px_-2px_rgba(79,70,229,0.5)]">
            {user?.full_name?.trim().charAt(0) || <User size={16} />}
          </div>
          {user && (
            <div className="text-right leading-tight px-1.5 hidden sm:block">
              <p className="text-sm font-semibold text-slate-800 leading-snug">{user.full_name}</p>
              <p className="text-[11px] text-indigo-500 font-medium leading-snug">{ROLE_LABELS[user.role]}</p>
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
