'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Send, RefreshCw, Check, X, Clock, Loader2, Mail, AlertTriangle, ExternalLink, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { FinancialAidRequest } from '@/types'
import { FINANCIAL_AID_STATUS_LABELS, FINANCIAL_AID_STATUS_COLORS } from '@/types'
import Card from '@/components/ui/Card'

const fmtDate = (d?: string) => d ? new Date(d).toLocaleString('he-IL') : '—'
const fmtDateTime = (d?: string) => d ? new Date(d).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const ELIGIBILITY_LBL: Record<string, string> = {
  pending: 'ממתין לאישור ראשוני', review: 'ממתין לאישור מסמכים', docs_pending: 'השלמת מסמכים', rejected: 'נדחה',
}

export default function FinancialAidDetail({ req }: { req: FinancialAidRequest }) {
  const router = useRouter()
  const supabase = createClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [amountInput, setAmountInput] = useState('')

  // המשפחה חייבת להיות מאושרת במערכת לפני אישור בקשת הסיוע
  const eligible = req.beneficiary?.eligibility_status === 'approved'
  const [showBlock, setShowBlock] = useState(!eligible)

  const send = async () => {
    if (!eligible) { setShowBlock(true); return }
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
  const del = async () => {
    if (!confirm('למחוק בקשת סיוע זו? הפעולה אינה הפיכה.')) return
    setBusy('delete'); setErr('')
    try {
      const { error } = await supabase.from('financial_aid_requests').delete().eq('id', req.id)
      if (error) throw error
      router.push('/admin/financial-aid')
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה'); setBusy(null) }
  }

  const setStatus = async (status: string, amount?: number | null) => {
    if (status === 'approved' && !eligible) { setShowBlock(true); return }
    setBusy(status); setErr('')
    try {
      const r = await fetch('/api/admin/financial-aid/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: req.id, status, amount: amount ?? null }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'שגיאה')
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    setBusy(null)
  }

  return (
    <>
    {/* חלונית חסימה — המשפחה טרם אושרה במערכת */}
    {showBlock && !eligible && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 text-center">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle size={28} className="text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">המשפחה טרם אושרה במערכת</h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-1">
            לא ניתן לאשר את בקשת הסיוע הכספי כל עוד המשפחה אינה מאושרת.
          </p>
          <p className="text-sm text-slate-600 leading-relaxed mb-5">
            סטטוס נוכחי: <span className="font-semibold text-amber-700">{ELIGIBILITY_LBL[req.beneficiary?.eligibility_status ?? ''] ?? req.beneficiary?.eligibility_status}</span>. יש לאשר את המשפחה תחילה.
          </p>
          <div className="flex flex-col gap-2">
            <Link href={`/admin/beneficiaries/${req.beneficiary_id}`}
              className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm">
              <ExternalLink size={16} /> מעבר לכרטיס המשפחה לאישור
            </Link>
            <button onClick={() => setShowBlock(false)} className="text-slate-500 hover:text-slate-700 py-2 text-sm">סגירה</button>
          </div>
        </div>
      </div>
    )}

    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold text-slate-500 uppercase">אישור דרך הגורם המאשר</h2>
        <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${FINANCIAL_AID_STATUS_COLORS[req.status]}`}>{FINANCIAL_AID_STATUS_LABELS[req.status]}</span>
      </div>

      {!eligible && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">המשפחה טרם אושרה במערכת ({ELIGIBILITY_LBL[req.beneficiary?.eligibility_status ?? ''] ?? req.beneficiary?.eligibility_status}).</p>
            <p className="mt-0.5">יש לאשר את המשפחה לפני אישור בקשת הסיוע. <Link href={`/admin/beneficiaries/${req.beneficiary_id}`} className="font-semibold underline hover:text-amber-900">לכרטיס המשפחה</Link></p>
          </div>
        </div>
      )}

      {req.status === 'approved' && (
        <div className="rounded-xl border border-green-200 bg-green-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-green-100/60">
            <span className="text-sm font-bold text-green-800">✅ הבקשה אושרה</span>
            <span className="text-lg font-extrabold text-green-700 ltr-num">₪{Number(req.amount ?? 0).toLocaleString('he-IL')}</span>
          </div>
          <dl className="px-4 py-2.5 text-xs text-green-800 divide-y divide-green-100">
            <div className="flex justify-between py-1"><dt className="text-green-600">סכום מאושר</dt><dd className="font-semibold ltr-num">₪{Number(req.amount ?? 0).toLocaleString('he-IL')}</dd></div>
            <div className="flex justify-between py-1"><dt className="text-green-600">התקבל מהגורם המאשר</dt><dd className="font-semibold ltr-num">{fmtDateTime(req.decision_replied_at)}</dd></div>
            <div className="flex justify-between py-1"><dt className="text-green-600">הודעה למבקש</dt><dd className="font-semibold">נשלחה ✓</dd></div>
          </dl>
        </div>
      )}
      {req.status === 'rejected' && (
        <div className="rounded-xl border border-red-200 bg-red-50 overflow-hidden">
          <div className="px-4 py-3 bg-red-100/60 text-sm font-bold text-red-800">❌ הבקשה נדחתה</div>
          <dl className="px-4 py-2.5 text-xs text-red-800 divide-y divide-red-100">
            <div className="flex justify-between py-1"><dt className="text-red-500">התקבל מהגורם המאשר</dt><dd className="font-semibold ltr-num">{fmtDateTime(req.decision_replied_at)}</dd></div>
            <div className="flex justify-between py-1"><dt className="text-red-500">הודעה למבקש</dt><dd className="font-semibold">נשלחה ✓</dd></div>
          </dl>
        </div>
      )}

      {req.status === 'pending' && (
        <>
          <p className="text-sm text-slate-600">שלח את הבקשה לגורם המאשר במייל. הוא ישיב בסכום לאישור או X לדחייה, והמערכת תעדכן אוטומטית.</p>
          <button onClick={send} disabled={busy === 'send' || !eligible}
            className="self-start inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-5 py-2.5">
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
          <button onClick={() => setStatus('approved', parseInt(amountInput, 10) || 0)} disabled={!amountInput || busy === 'approved' || !eligible}
            className="inline-flex items-center gap-1 text-xs font-medium text-green-700 border border-green-200 hover:bg-green-50 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2.5 py-1.5"><Check size={13} /> אשר בסכום</button>
          <button onClick={() => setStatus('rejected')} disabled={busy === 'rejected'}
            className="inline-flex items-center gap-1 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1.5"><X size={13} /> דחה</button>
          <button onClick={() => setStatus('pending')} disabled={busy === 'pending'}
            className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 border border-amber-200 hover:bg-amber-50 rounded-lg px-2.5 py-1.5"><Clock size={13} /> החזר לממתין</button>
        </div>
      </div>

      {/* מחיקת הבקשה */}
      <div className="mt-1 pt-3 border-t border-slate-100">
        <button onClick={del} disabled={busy === 'delete'}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50">
          {busy === 'delete' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} מחק בקשה
        </button>
      </div>
    </Card>
    </>
  )
}
