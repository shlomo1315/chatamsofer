import type { SupabaseClient } from '@supabase/supabase-js'

type Nav = { push: (href: string) => void; refresh: () => void }

// אחרי טיפול בבקשה ממתינה — קפיצה לבקשה הממתינה הבאה (לפי סדר כניסה),
// ואם אין עוד — חזרה לרשימה הכללית של האגף.
export async function goToNextPending(
  supabase: SupabaseClient,
  router: Nav,
  opts: {
    table: string
    statusColumn: string
    pendingValues: string[]
    currentId: string
    detailBase: string   // לדוגמה '/admin/loans'
    listPath: string     // לדוגמה '/admin/loans'
  },
) {
  try {
    const { data } = await supabase
      .from(opts.table)
      .select('id')
      .in(opts.statusColumn, opts.pendingValues)
      .neq('id', opts.currentId)
      .order('created_at', { ascending: true })
      .limit(1)
    const next = data?.[0] as { id?: string } | undefined
    if (next?.id) { router.push(`${opts.detailBase}/${next.id}`); return }
  } catch { /* נופלים לרשימה */ }
  router.push(opts.listPath)
}
