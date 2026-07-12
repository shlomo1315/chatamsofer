import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Send, Plus } from 'lucide-react'
import NewCampaignButton from './NewCampaignButton'

export const dynamic = 'force-dynamic'

interface CampaignRow {
  id: string
  name: string
  subject: string
  status: string
  total_count: number
  sent_count: number
  failed_count: number
  created_at: string
}

const STATUS_META: Record<string, { label: string; color: string }> = {
  draft:     { label: 'טיוטה',   color: 'bg-slate-100 text-slate-600' },
  scheduled: { label: 'מתוזמן',  color: 'bg-sky-100 text-sky-700' },
  sending:   { label: 'בשליחה',  color: 'bg-amber-100 text-amber-700' },
  paused:    { label: 'מושהה',   color: 'bg-orange-100 text-orange-700' },
  sent:      { label: 'נשלח',    color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'בוטל',    color: 'bg-slate-100 text-slate-400' },
  failed:    { label: 'נכשל',    color: 'bg-rose-100 text-rose-700' },
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL')
}

export default async function NewsletterPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, subject, status, total_count, sent_count, failed_count, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const campaigns = (error ? [] : (data ?? [])) as CampaignRow[]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">ניוזלטר</h1>
          <p className="text-sm text-slate-500">דיוור לקהלים נבחרים, עם מעקב פתיחות וקליקים</p>
        </div>
        <NewCampaignButton />
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          הטבלאות טרם נוצרו. יש להריץ את המיגרציה{' '}
          <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
            20260725_newsletter.sql
          </code>
        </div>
      )}

      {!campaigns.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
          <Send size={26} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold mb-1">אין עדיין קמפיינים</p>
          <p className="text-slate-400 text-sm mb-5">צור קמפיין ראשון כדי לשלוח דיוור</p>
          <NewCampaignButton />
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-right text-xs text-slate-500">
                <th className="px-4 py-3 font-semibold">שם</th>
                <th className="px-4 py-3 font-semibold">נושא</th>
                <th className="px-4 py-3 font-semibold">סטטוס</th>
                <th className="px-4 py-3 font-semibold">נמענים</th>
                <th className="px-4 py-3 font-semibold">נוצר</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {campaigns.map(c => {
                const meta = STATUS_META[c.status] ?? STATUS_META.draft
                const done = ['sent', 'sending', 'paused'].includes(c.status)
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <Link href={`/admin/newsletter/${c.id}`}
                            className="font-semibold text-slate-800 hover:text-indigo-600">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-xs">
                      <span className="line-clamp-1">{c.subject}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {done ? (
                        <span>
                          <strong className="text-slate-800">{c.sent_count.toLocaleString('he-IL')}</strong>
                          <span className="text-slate-400"> / {c.total_count.toLocaleString('he-IL')}</span>
                          {c.failed_count > 0 && (
                            <span className="text-rose-600 text-xs mr-1.5">({c.failed_count} נכשלו)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmt(c.created_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
