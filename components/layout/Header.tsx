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

      <div className="flex items-center gap-3">
        <HeaderDateTime />

        {/* Notification bell with pulse dot */}
        <button className="relative p-2 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 transition-colors">
          <Bell size={18} />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full">
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-75" />
          </span>
        </button>

        {user ? (
          <div className="flex items-center gap-2.5 pr-3 border-r border-zinc-200">
            <div className="bg-zinc-100 rounded-full px-3 py-1 text-right leading-tight hidden sm:block">
              <p className="text-sm font-semibold text-zinc-800 leading-snug">{user.full_name}</p>
              <p className="text-[11px] text-indigo-500 font-medium leading-snug">{ROLE_LABELS[user.role]}</p>
            </div>

            {/* Avatar with indigo-to-violet gradient ring */}
            <div className="p-[2px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0">
              <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                <User size={15} />
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              title="יציאה"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 pr-2 border-r border-zinc-200">
            <div className="p-[2px] rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0">
              <div className="w-8 h-8 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-500">
                <User size={15} />
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
