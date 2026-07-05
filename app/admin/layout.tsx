export const dynamic = 'force-dynamic'
export const metadata = { title: 'היכל החתם סופר - מערכת ניהול' }

import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import WelcomeModal from '@/components/ui/WelcomeModal'
import { ToastProvider } from '@/components/ui/Toast'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Profile } from '@/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  let profile: Profile | null = null

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        profile = data
      }
    } catch {
      // Supabase not available
    }
  }

  return (
    <ToastProvider>
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <WelcomeModal />
      <Sidebar
        isAdmin={profile?.role === 'admin'}
        permissions={profile?.permissions}
        mailOnlyFlag={profile?.mail_only}
        allowedMailboxes={profile?.allowed_mailboxes}
        department={profile?.department}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={profile} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-5 lg:p-6 pb-16 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
    </ToastProvider>
  )
}
