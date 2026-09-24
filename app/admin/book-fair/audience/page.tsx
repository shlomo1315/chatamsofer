import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/fetchAllRows'
import PageHeader from '@/components/ui/PageHeader'
import { buildAudience, type AudienceMember, type ReminderRow, type OrderRow } from '@/lib/bookFairAudience'
import AudienceClient from './AudienceClient'

// רשימת התפוצה של היריד — נרשמי תזכורת ורוכשים, לשליחת ניוזלטר.
//
// ⚠️ fetchAllRows ולא select רגיל: PostgREST קוטע ב-1,000 שורות בשקט.
// רשימת תפוצה חלקית נראית מלאה לחלוטין, וזו בדיוק התקלה שמתגלה רק
// אחרי שהדיוור כבר יצא.

export const dynamic = 'force-dynamic'

type ReminderWithOptOut = ReminderRow & { unsubscribed_at: string | null }

async function getAudience(): Promise<{ members: AudienceMember[]; optedOut: number }> {
  if (!isSupabaseConfigured()) return { members: [], optedOut: 0 }
  const supabase = await createClient()

  const { rows: reminders, error: remErr } = await fetchAllRows<ReminderWithOptOut>((from, to) =>
    supabase.from('book_fair_reminders')
      .select('email, created_at, notified_at, unsubscribed_at')
      .range(from, to) as unknown as PromiseLike<{ data: ReminderWithOptOut[] | null; error: { message: string } | null }>
  )

  const { rows: orders, error: ordErr } = await fetchAllRows<OrderRow>((from, to) =>
    supabase.from('book_fair_orders')
      .select('customer_email, customer_name, status, total_agorot, refunded_agorot, created_at')
      .range(from, to) as unknown as PromiseLike<{ data: OrderRow[] | null; error: { message: string } | null }>
  )

  // ⚠️ שגיאה נרשמת ואינה זורקת: מסך ריק עם הודעה עדיף על מסך שגיאה
  // אדום שנראה כתקלה כוללת במערכת.
  if (remErr) console.error('[book-fair/audience] reminders failed:', remErr)
  if (ordErr) console.error('[book-fair/audience] orders failed:', ordErr)

  // 🔴 מי שביקש לצאת מוסר לפני כל חישוב, כולל אם הוא גם רוכש.
  const optedOutSet = new Set(
    reminders.filter(r => r.unsubscribed_at).map(r => String(r.email).trim().toLowerCase())
  )

  const members = buildAudience(reminders.filter(r => !r.unsubscribed_at), orders)
    .filter(m => !optedOutSet.has(m.email))

  return { members, optedOut: optedOutSet.size }
}

export default async function AudiencePage() {
  await guardPage('book_fair')
  const { members, optedOut } = await getAudience()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="רשימת תפוצה"
        subtitle="נרשמי התזכורת והרוכשים — לשליחת ניוזלטר"
      />
      <AudienceClient members={members} optedOut={optedOut} />
    </div>
  )
}
