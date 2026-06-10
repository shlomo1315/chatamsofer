'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, RefreshCw, Check, X, Clock, Loader2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { FinancialAidRequest } from '@/types'
import { FINANCIAL_AID_STATUS_LABELS, FINANCIAL_AID_STATUS_COLORS } from '@/types'
import Card from '@/components/ui/Card'

const fmtDate = (d?: string) => d ? new Date(d).toLocaleString('he-IL') : '—'

export default function FinancialAidDetail({ req }: { req: FinancialAidRequest }) {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [amountInput, setAmountInput] = useState('')

  const send = async () => {
    setBusy('send'); setErr('')
    try {
      const r = await fetch('/api/admin/financial-aid/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: req.id }) })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה'); setBusy(null); return }
      router.refresh()
    } catch { setErr('שגיאת רשת') }
    setBusy(null)
  }
  const check = async () => {
    setBusy('check'); setErr('')
    try { await fetch('/api/admin/financial-aid/check-replies', { method: 'POST' }); router.refresh() }
    catch { setErr('שגיאת רשת') }
    setBusy(null)
  }
  // עדכון ידני (override)
  const setStatus = async (status: string, amount?: number | null) => {
    setBusy(status); setErr('')
    try {
      const { error } = await supabase.from('financial_aid_requests').update({
        status, amount: amount ?? null, updated_at: new Date().toISOString(),
      }).eq('id', req.id)
      if (error) throw error
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    setBusy(null)
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500 uppercase">אישור דרך הגורם המאשר</h2>
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${FINANCIAL_AID_STATUS_COLORS[req.status]}`}>{FINANCIAL_AID_STATUS_LABELS[req.status]}</span>
      </div>

      {req.status === 'approved' && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ אושר סכום של <strong>₪{Number(req.amount ?? 0).toLocaleString('he-IL')}</strong>
          {req.decision_reply && <span className="block text-xs text-green-700 mt-1">תשובת הגורם: "{req.decision_reply}"</span>}
        </div>
      )}
      {req.status === 'rejected' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          ❌ הבקשה נדחתה{req.decision_reply ? ` — "${req.decision_reply}"` : ''}
        </div>
      )}

      {req.status === 'pending' && (
        <>
          <p className="text-sm text-slate-600">שלח את הבקשה לגורם המאשר במייל. הוא ישיב בסכום לאישור או X לדחייה, והמערכת תעדכן אוטומטית.</p>
          <button onClick={send} disabled={busy === 'send'}
            className="self-start inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5">
            {busy === 'send' ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} שלח לגורם המאשר
          </button>
        </>
      )}

      {req.status === 'awaiting_decision' && (
        <>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Mail size={14} className="text-blue-500" />
            נשלח אל <span className="font-medium ltr-num">{req.decision_email}</span> · {fmtDate(req.sent_to_decision_at)}
          </div>
          <button onClick={check} disabled={busy === 'check'}
            className="self-start inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl px-5 py-2.5">
            {busy === 'check' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} בדוק תשובות עכשיו
          </button>
        </>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}

      {/* עדכון ידני */}
      <div className="mt-2 pt-3 border-t border-slate-100">
        <p className="text-xs text-slate-400 mb-2">עדכון ידני (במידת הצורך):</p>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="number" min="0" value={amountInput} onChange={e => setAmountInput(e.target.value)} placeholder="סכום" className="w-28 rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
          <button onClick={() => setStatus('approved', parseInt(amountInput, 10) || 0)} disabled={!amountInput || busy === 'approved'}
            className="inline-flex items-center gap-1 text-xs font-medium text-green-700 border border-green-200 hover:bg-green-50 disabled:opacity-40 rounded-lg px-2.5 py-1.5"><Check size={13} /> אשר בסכום</button>
          <button onClick={() => setStatus('rejected')} disabled={busy === 'rejected'}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5"><X size={13} /> דחה</button>
          <button onClick={() => setStatus('pending')} disabled={busy === 'pending'}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-lg px-2.5 py-1.5"><Clock size={13} /> החזר לממתין</button>
        </div>
      </div>
    </Card>
  )
}
