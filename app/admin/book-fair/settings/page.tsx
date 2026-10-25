import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/PageHeader'
import type { BookFairCity } from '@/types/bookFair'
import { isMockPayment } from '@/lib/payments'
import SettingsClient from './SettingsClient'

// הגדרות יריד הספרים: פתיחה/סגירה, ערי משלוח ומדרגות תעריף.

export const dynamic = 'force-dynamic'

export default async function BookFairSettingsPage() {
  await guardPage('book_fair')

  let cities: BookFairCity[] = []
  let open = false
  let openAt: string | null = null

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const [c, g, oa] = await Promise.all([
      supabase.from('book_fair_cities').select('*').order('sort_order').order('name'),
      supabase.from('app_settings').select('value').eq('key', 'book_fair_open').maybeSingle(),
      supabase.from('app_settings').select('value').eq('key', 'book_fair_open_at').maybeSingle(),
    ])
    cities = (c.data ?? []) as BookFairCity[]
    // 🔴 ברירת מחדל סגור — זהה לשרת ולדף החנות.
    open = String(g.data?.value ?? '') === 'true'
    openAt = String(oa.data?.value ?? '') || null
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הגדרות היריד" subtitle="פתיחת הזמנות, ערי משלוח ותעריפים" />
      {/* 🔴 mockPay נקרא בשרת ולא בלקוח: פרטי הספק אינם נחשפים לדפדפן. */}
      <SettingsClient cities={cities} open={open} openAt={openAt} mockPay={await isMockPayment()} />
    </div>
  )
}
