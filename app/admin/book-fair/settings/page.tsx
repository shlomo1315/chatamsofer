import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import PageHeader from '@/components/ui/PageHeader'
import type { BookFairCity, BookFairShippingTier } from '@/types/bookFair'
import { isMockPayment } from '@/lib/payments'
import SettingsClient from './SettingsClient'

// הגדרות יריד הספרים: פתיחה/סגירה, ערי משלוח ומדרגות תעריף.

export const dynamic = 'force-dynamic'

export default async function BookFairSettingsPage() {
  await guardPage('book_fair')

  let cities: BookFairCity[] = []
  let tiers: BookFairShippingTier[] = []
  let open = false

  if (isSupabaseConfigured()) {
    const supabase = await createClient()
    const [c, t, g] = await Promise.all([
      supabase.from('book_fair_cities').select('*').order('sort_order').order('name'),
      supabase.from('book_fair_shipping_tiers').select('*').order('min_books'),
      supabase.from('app_settings').select('value').eq('key', 'book_fair_open').maybeSingle(),
    ])
    cities = (c.data ?? []) as BookFairCity[]
    tiers = (t.data ?? []) as BookFairShippingTier[]
    // 🔴 ברירת מחדל סגור — זהה לשרת ולדף החנות.
    open = String(g.data?.value ?? '') === 'true'
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="הגדרות היריד" subtitle="פתיחת הזמנות, ערי משלוח ותעריפים" />
      {/* 🔴 mockPay נקרא בשרת ולא בלקוח: פרטי הספק אינם נחשפים לדפדפן. */}
      <SettingsClient cities={cities} tiers={tiers} open={open} mockPay={await isMockPayment()} />
    </div>
  )
}
