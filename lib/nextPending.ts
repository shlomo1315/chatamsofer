import type { SupabaseClient } from '@supabase/supabase-js'

type Nav = { push: (href: string) => void; refresh: () => void }

// אחרי טיפול בבקשה ממתינה — קפיצה לבקשה הממתינה הבאה (לפי סדר כניסה),
// ואם אין עוד — חזרה לרשימה הכללית של האגף.
// החיפוש מתבצע ב-endpoint עם service-role כדי שלא ייחסם ע"י RLS בצד-הדפדפן.
export async function goToNextPending(
  _supabase: SupabaseClient,
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
    const params = new URLSearchParams({
      table: opts.table,
      currentId: opts.currentId,
      pending: opts.pendingValues.join(','),
    })
    const res = await fetch(`/api/admin/next-pending?${params.toString()}`, { cache: 'no-store' })
    const data = await res.json()
    if (data?.id) { router.push(`${opts.detailBase}/${data.id}`); return }
  } catch { /* נופלים לרשימה */ }
  router.push(opts.listPath)
}
