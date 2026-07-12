'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Trash2, Loader2, MoreVertical, Send } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

export interface CampaignRow {
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

export default function CampaignsTable({ campaigns }: { campaigns: CampaignRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  async function duplicate(id: string, name: string) {
    setBusy(id)
    setMenu(null)
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/duplicate`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שכפול נכשל')
      toast.success(`נוצר עותק של "${name}"`)
      router.push(`/admin/newsletter/${d.id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
      setBusy(null)
    }
  }

  async function remove(id: string, name: string) {
    setMenu(null)
    if (!confirm(`למחוק את הקמפיין "${name}"?\nהפעולה אינה הפיכה.`)) return

    setBusy(id)
    try {
      const res = await fetch(`/api/admin/campaigns/${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'מחיקה נכשלה')
      toast.success('הקמפיין נמחק')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusy(null)
    }
  }

  if (!campaigns.length) return null

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr className="text-right text-xs text-slate-500">
            <th className="px-4 py-3 font-semibold">שם</th>
            <th className="px-4 py-3 font-semibold">נושא</th>
            <th className="px-4 py-3 font-semibold">סטטוס</th>
            <th className="px-4 py-3 font-semibold">נמענים</th>
            <th className="px-4 py-3 font-semibold">נוצר</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {campaigns.map(c => {
            const meta = STATUS_META[c.status] ?? STATUS_META.draft
            const live = ['sent', 'sending', 'paused'].includes(c.status)
            const isBusy = busy === c.id

            return (
              <tr
                key={c.id}
                onClick={() => !isBusy && router.push(`/admin/newsletter/${c.id}`)}
                className={`cursor-pointer transition hover:bg-slate-50 ${isBusy ? 'opacity-50' : ''}`}
              >
                <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                <td className="max-w-xs px-4 py-3 text-slate-500">
                  <span className="line-clamp-1">{c.subject}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${meta.color}`}>
                    {meta.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {live ? (
                    <span>
                      <strong className="text-slate-800">{c.sent_count.toLocaleString('he-IL')}</strong>
                      <span className="text-slate-400"> / {c.total_count.toLocaleString('he-IL')}</span>
                      {c.failed_count > 0 && (
                        <span className="mr-1.5 text-xs text-rose-600">({c.failed_count} נכשלו)</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{fmt(c.created_at)}</td>

                {/* תפריט פעולות — עוצר את ה-propagation כדי שלא ייפתח הקמפיין */}
                <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                  <div className="relative">
                    {isBusy ? (
                      <Loader2 size={16} className="animate-spin text-slate-400" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setMenu(menu === c.id ? null : c.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        title="פעולות"
                      >
                        <MoreVertical size={16} />
                      </button>
                    )}

                    {menu === c.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} />
                        <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl
                                        border border-slate-200 bg-white shadow-lg">
                          <button
                            type="button"
                            onClick={() => duplicate(c.id, c.name)}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-sm
                                       text-slate-700 transition hover:bg-slate-50"
                          >
                            <Copy size={14} className="text-slate-400" />
                            שכפול לשליחה חוזרת
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(c.id, c.name)}
                            disabled={c.status === 'sending'}
                            title={c.status === 'sending' ? 'יש לעצור את הקמפיין לפני מחיקה' : undefined}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5
                                       text-right text-sm text-rose-600 transition hover:bg-rose-50
                                       disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                            מחיקה
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
