'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowRight, Pause, Play, Loader2, MousePointerClick, Eye, Send, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { Campaign } from './CampaignWizard'

interface Metrics {
  total: number; sent: number; pending: number; failed: number
  delivered: number; opened: number; clicked: number
  bounced: number; complained: number
}

interface Recipient {
  email: string; name: string; status: string
  opened: boolean; openCount: number
  clicked: boolean; clickCount: number
  bounced: boolean; error: string | null
}

interface Stats {
  campaign: { status: string; name: string }
  metrics: Metrics
  links: { url: string; count: number }[]
  recipients: Recipient[]
}

function pct(n: number, of: number): string {
  if (!of) return '0%'
  return `${Math.round((n / of) * 100)}%`
}

export default function CampaignStats({ campaign }: { campaign: Campaign }) {
  const toast = useToast()
  const [stats, setStats] = useState<Stats | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'recipients' | 'links'>('recipients')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/stats`)
      if (res.ok) setStats(await res.json())
    } catch { /* ignore */ }
  }, [campaign.id])

  useEffect(() => { load() }, [load])

  // רענון אוטומטי בזמן שליחה — המספרים זזים
  useEffect(() => {
    if (stats?.campaign.status !== 'sending') return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [stats?.campaign.status, load])

  async function toggle(action: 'pause' | 'resume') {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(action === 'pause' ? 'הקמפיין הושהה' : 'השליחה מתחדשת')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally { setBusy(false) }
  }

  if (!stats) {
    return <div className="p-10 text-center text-slate-400"><Loader2 className="inline animate-spin" /></div>
  }

  const m = stats.metrics
  const status = stats.campaign.status
  const sending = status === 'sending'
  const paused = status === 'paused'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <Link href="/admin/newsletter"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowRight size={15} /> חזרה לקמפיינים
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{campaign.name}</h1>
          <p className="mt-1 text-sm text-slate-500">{campaign.subject}</p>
        </div>

        {(sending || paused) && (
          <button
            onClick={() => toggle(paused ? 'resume' : 'pause')}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5
                       text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" />
                  : paused ? <Play size={15} /> : <Pause size={15} />}
            {paused ? 'חידוש שליחה' : 'השהיה'}
          </button>
        )}
      </div>

      {/* התקדמות בזמן שליחה */}
      {sending && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-amber-800">שליחה בתהליך…</span>
            <span className="text-amber-700">{m.sent.toLocaleString('he-IL')} / {m.total.toLocaleString('he-IL')}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-amber-100">
            <div className="h-full rounded-full bg-amber-500 transition-all"
                 style={{ width: pct(m.sent, m.total) }} />
          </div>
        </div>
      )}

      {/* מדדים */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric icon={<Send size={14} />} label="נשלחו" value={m.sent} total={m.total} />
        <Metric icon={<Eye size={14} />} label="נפתחו" value={m.opened} total={m.sent} accent="emerald" />
        <Metric icon={<MousePointerClick size={14} />} label="הוקלקו" value={m.clicked} total={m.sent} accent="indigo" />
        <Metric icon={<AlertTriangle size={14} />} label="נכשלו" value={m.failed + m.bounced} total={m.total} accent="rose" />
      </div>

      {/* הערת אמת על אחוזי פתיחה */}
      {m.opened > 0 && (
        <p className="mb-5 rounded-xl bg-slate-50 px-4 py-2.5 text-xs leading-relaxed text-slate-500">
          <strong>שימו לב:</strong> Gmail ו-Apple חוסמים חלקית את פיקסל המעקב, ולכן
          אחוזי הפתיחה בפועל <strong>גבוהים</strong> מהמוצג. נתוני הקליקים מדויקים.
        </p>
      )}

      {/* טאבים */}
      <div className="mb-3 flex gap-2">
        {(['recipients', 'links'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
              tab === t ? 'bg-slate-800 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t === 'recipients' ? `נמענים (${stats.recipients.length})` : `קישורים (${stats.links.length})`}
          </button>
        ))}
      </div>

      {tab === 'recipients' ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr className="text-right text-xs text-slate-500">
                <th className="px-4 py-3 font-semibold">נמען</th>
                <th className="px-4 py-3 font-semibold">סטטוס</th>
                <th className="px-4 py-3 font-semibold">פתיחות</th>
                <th className="px-4 py-3 font-semibold">קליקים</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.recipients.slice(0, 200).map(r => (
                <tr key={r.email} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-800">{r.name || '—'}</div>
                    <div className="font-mono text-xs text-slate-400">{r.email}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.bounced ? <Tag color="rose">נכשל</Tag>
                      : r.status === 'sent' ? <Tag color="emerald">נשלח</Tag>
                      : r.status === 'failed' ? <Tag color="rose">שגיאה</Tag>
                      : <Tag color="slate">ממתין</Tag>}
                    {r.error && <div className="mt-1 text-xs text-rose-500">{r.error}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.opened ? <span className="font-bold text-emerald-600">{r.openCount}</span> : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.clicked ? <span className="font-bold text-indigo-600">{r.clickCount}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {!stats.links.length ? (
            <p className="p-10 text-center text-sm text-slate-400">עדיין לא נלחצו קישורים</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr className="text-right text-xs text-slate-500">
                  <th className="px-4 py-3 font-semibold">קישור</th>
                  <th className="px-4 py-3 font-semibold">קליקים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.links.map(l => (
                  <tr key={l.url} className="hover:bg-slate-50">
                    <td className="max-w-lg truncate px-4 py-2.5 font-mono text-xs text-slate-600">{l.url}</td>
                    <td className="px-4 py-2.5 font-bold text-indigo-600">{l.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ icon, label, value, total, accent = 'slate' }: {
  icon: React.ReactNode; label: string; value: number; total: number
  accent?: 'slate' | 'emerald' | 'indigo' | 'rose'
}) {
  const colors = {
    slate: 'text-slate-800',
    emerald: 'text-emerald-600',
    indigo: 'text-indigo-600',
    rose: 'text-rose-600',
  }
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-1.5 text-xs text-slate-400">{icon}{label}</div>
      <div className={`text-2xl font-bold ${colors[accent]}`}>{value.toLocaleString('he-IL')}</div>
      {total > 0 && <div className="mt-0.5 text-xs text-slate-400">{pct(value, total)}</div>}
    </div>
  )
}

function Tag({ children, color }: { children: React.ReactNode; color: 'emerald' | 'rose' | 'slate' }) {
  const map = {
    emerald: 'bg-emerald-100 text-emerald-700',
    rose: 'bg-rose-100 text-rose-700',
    slate: 'bg-slate-100 text-slate-500',
  }
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${map[color]}`}>{children}</span>
}
