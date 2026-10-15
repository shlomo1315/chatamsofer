import Link from 'next/link'
import { Download } from 'lucide-react'
import { guardPage } from '@/lib/pageGuard'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/apiAuth'
import { loadAuthorPayouts } from '@/lib/bookFairAuthorRatesLoad'
import { fmtAgorot } from '@/lib/bookFairPricing'
import PageHeader from '@/components/ui/PageHeader'

// כמה כל מחבר/מכון/מו"ל אמור לקבל (בקשת שלמה 15.10). החישוב: lib/bookFairAuthorRates.ts
// ⚠️ לקוח השירות רק אחרי guardPage.

export const dynamic = 'force-dynamic'
export const metadata = { title: 'סכומים למחברים - יריד הספרים' }

const REASONS = { not_found: 'לא נמצא בקטלוג', ambiguous: 'כמה ספרים בקטלוג עם אותו שם', duplicate: 'הספר כבר הותאם לשורה אחרת' }
const num = 'tabular-nums'

export default async function AuthorPayoutsPage() {
  await guardPage('book_fair')
  if (!isSupabaseConfigured()) return <PageHeader title="סכומים למחברים" subtitle="המערכת לא מחוברת" />
  const db = getServiceClient() ?? await createClient()
  const { payouts: p, error } = await loadAuthorPayouts(db)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="סכומים למחברים, למכונים ולמו״לים" subtitle="עותקים שנמכרו (אחרי זיכויים והחזרות) כפול המחיר לעותק מהקובץ שנמסר." />
      {error && <p className="rounded-[10px] bg-red-50 p-3 text-sm text-red-800">טעינת הנתונים נכשלה, והסכומים אינם מלאים.</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-slate-200 bg-white p-4">
        <div>
          <div className="text-sm text-slate-600">סך הכל לתשלום ל-{p.parties.length} גורמים · {p.totalQty} עותקים</div>
          <div className={`text-2xl font-bold text-slate-900 ${num}`}>{fmtAgorot(p.totalAgorot)}</div>
        </div>
        <a href="/api/admin/book-fair/author-payouts/export"
          className="inline-flex min-h-10 items-center gap-2 rounded-[10px] bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
          <Download className="h-4 w-4" /> הורדה לאקסל
        </a>
      </div>

      <section className="flex flex-col gap-2">
        {p.parties.map(party => (
          <details key={party.party} className="rounded-[12px] border border-slate-200 bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 p-4">
              <span className="font-semibold text-slate-900">{party.party}</span>
              <span className={`text-sm text-slate-700 ${num}`}>{party.qty} עותקים · <b>{fmtAgorot(party.amountAgorot)}</b></span>
            </summary>
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {party.books.map(b => (
                <li key={b.bookId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="text-slate-900">{b.title}</span>
                  <span className={`text-slate-600 ${num}`}>{b.qty} × {fmtAgorot(b.priceAgorot)} = <b className="text-slate-900">{fmtAgorot(b.amountAgorot)}</b></span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>

      {p.unmatched.length > 0 && (
        <Notice title={`לא הותאמו בוודאות (${p.unmatched.length}), ממתינים לאישור`}>
          {p.unmatched.map((u, i) => <li key={i}>{u.title} · {u.party} · {REASONS[u.reason]}</li>)}
        </Notice>
      )}
      {p.unpriced.length > 0 && (
        <Notice title={`נמכרו ואין להם מחיר בקובץ (${p.unpriced.length})`}>
          {p.unpriced.map(u => <li key={u.bookId}>{u.title} · {u.qty} עותקים</li>)}
        </Notice>
      )}
      {p.unpaid.length > 0 && (
        <Notice title={`ללא מחבר / מו״ל, לא משולמים (${p.unpaid.length})`}>
          {p.unpaid.map(u => <li key={u.bookId}>{u.title} · {u.qty} עותקים</li>)}
        </Notice>
      )}
      {p.skipped.length > 0 && (
        <Notice title={`שורות בלי מחיר, דולגו (${p.skipped.length})`}>
          {p.skipped.map((s, i) => <li key={i}>{s.title} · {s.party}</li>)}
        </Notice>
      )}
      <p className="text-xs text-slate-500">ההתחשבנות הכספית המלאה (עמלה ותשלומים): <Link className="underline" href="/admin/book-fair/settlement">מסך ההתחשבנות</Link>.</p>
    </div>
  )
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="rounded-[12px] border border-amber-200 bg-amber-50">
      <summary className="cursor-pointer p-4 text-sm font-semibold text-amber-900">{title}</summary>
      <ul className="list-disc space-y-1 border-t border-amber-200 px-8 py-3 text-sm text-slate-800">{children}</ul>
    </details>
  )
}
