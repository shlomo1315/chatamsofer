'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Wallet, CalendarClock, Plus, Trash2, Check, X, Loader2, Baby, Phone, MapPin, ExternalLink } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Card from '@/components/ui/Card'
import HebrewDatePicker from '@/components/ui/HebrewDatePicker'
import { useCan } from '@/components/StaffPermissions'
import {
  Beneficiary, WidowRequest, WidowSupportPayment, WidowSupportType,
  WIDOW_SUPPORT_TYPE_LABELS, WIDOW_REQUEST_TYPE_LABELS, WIDOW_REQUEST_STATUS_LABELS, WIDOW_REQUEST_STATUS_COLORS,
} from '@/types'

const fmtCur = (n: number) => `₪${Math.round(n).toLocaleString('he-IL')}`
const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'

export default function FamilyFile({ widow, requests, payments }: { widow: Beneficiary; requests: WidowRequest[]; payments: WidowSupportPayment[] }) {
  const router = useRouter()
  const supabase = createClient()
  const canEdit = useCan('widows', 'edit')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  // קצבה חודשית
  const [monthly, setMonthly] = useState(String(widow.monthly_support ?? ''))
  const saveMonthly = async () => {
    setBusy('monthly'); setErr('')
    try {
      const { error } = await supabase.from('beneficiaries').update({ monthly_support: parseFloat(monthly) || 0, updated_at: new Date().toISOString() }).eq('id', widow.id)
      if (error) throw error
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    setBusy(null)
  }

  // הוספת תמיכה ללוג
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ amount: '', paid_at: new Date().toISOString().slice(0, 10), type: 'one_time' as WidowSupportType, note: '' })
  const addPayment = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { setErr('יש להזין סכום'); return }
    setBusy('add'); setErr('')
    try {
      const { error } = await supabase.from('widow_support_payments').insert({
        beneficiary_id: widow.id, amount: parseFloat(form.amount), paid_at: form.paid_at, type: form.type, note: form.note.trim() || null,
      })
      if (error) throw error
      setShowAdd(false); setForm({ amount: '', paid_at: new Date().toISOString().slice(0, 10), type: 'one_time', note: '' })
      router.refresh()
    } catch (e) { setErr(e instanceof Error ? e.message : 'שגיאה') }
    setBusy(null)
  }
  const delPayment = async (pid: string) => {
    setBusy(pid)
    try { await supabase.from('widow_support_payments').delete().eq('id', pid); router.refresh() }
    catch { /* ignore */ }
    setBusy(null)
  }

  // אישור/דחיית בקשה
  const setReqStatus = async (id: string, status: string) => {
    setBusy(id)
    try {
      await fetch('/api/admin/widow-request-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
      router.refresh()
    } catch { /* ignore */ }
    setBusy(null)
  }

  const total = payments.reduce((s, p) => s + Number(p.amount || 0), 0)

  return (
    <>
      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{err}</div>}

      {/* פרטי המשפחה */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase">פרטי המשפחה</h2>
          <Link href={`/admin/beneficiaries/${widow.id}`} className="text-xs text-indigo-600 hover:text-indigo-700 inline-flex items-center gap-1">
            לכרטיס המלא <ExternalLink size={12} />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <p><span className="text-slate-500">שם: </span>{[widow.family_name, widow.full_name].filter(Boolean).join(' ')}</p>
          <p><span className="text-slate-500">ת.ז: </span><span className="ltr-num">{widow.id_number}</span></p>
          <p><span className="text-slate-500">מצב: </span>{widow.marital_status ?? '—'}</p>
          {widow.phone && <p className="flex items-center gap-1"><Phone size={12} className="text-slate-400" /><span className="ltr-num">{widow.phone}</span></p>}
          {(widow.address || widow.city) && <p className="col-span-2 flex items-center gap-1"><MapPin size={12} className="text-slate-400" />{[widow.address, widow.city].filter(Boolean).join(', ')}</p>}
        </div>
        {!!(widow.children && widow.children.length) && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-2 flex items-center gap-1"><Baby size={13} /> ילדים ({widow.children.length})</p>
            <div className="flex flex-wrap gap-1.5">
              {widow.children.map((c, i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-700 rounded-lg px-2.5 py-1">
                  {c.name || '—'}{c.birth_date ? ` · ${fmtDate(c.birth_date)}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* קצבה חודשית */}
      <Card>
        <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1.5"><CalendarClock size={14} /> תמיכה חודשית קבועה</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <span className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 text-sm">₪</span>
            <input type="number" min="0" value={monthly} onChange={e => setMonthly(e.target.value)} placeholder="0"
              className="w-40 rounded-lg border border-slate-300 pr-7 pl-3 py-2 text-sm ltr-num" />
          </div>
          <button onClick={saveMonthly} disabled={busy === 'monthly' || String(widow.monthly_support ?? '') === monthly}
            className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2">
            {busy === 'monthly' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור
          </button>
          <span className="text-xs text-slate-400">נקבע ע"י המזכירות · נספר ב"סך תמיכות חודשי"</span>
        </div>
      </Card>

      {/* לוג תמיכות */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1.5"><Wallet size={14} /> תמיכות שניתנו · סך הכל <span className="text-emerald-700 font-bold ltr-num">{fmtCur(total)}</span></h2>
          <button onClick={() => { setShowAdd(s => !s); setErr('') }} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-3 py-1.5">
            <Plus size={13} /> הוסף תמיכה
          </button>
        </div>

        {showAdd && (
          <div className="bg-slate-50 rounded-xl p-3 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
            <label className="flex flex-col gap-1 text-xs text-slate-500">סכום
              <input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm ltr-num" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">תאריך
              <HebrewDatePicker value={form.paid_at} onChange={iso => setForm(f => ({ ...f, paid_at: iso }))} maxToday />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500">סוג
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as WidowSupportType }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm bg-white">
                {Object.entries(WIDOW_SUPPORT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-500 col-span-2 sm:col-span-1">הערה
              <input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
            <div className="col-span-2 sm:col-span-4 flex justify-end">
              <button onClick={addPayment} disabled={busy === 'add'} className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg px-4 py-2">
                {busy === 'add' ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} שמור תמיכה
              </button>
            </div>
          </div>
        )}

        {payments.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">טרם נרשמו תמיכות</p>
        ) : (
          <table className="w-full text-sm text-right">
            <thead><tr className="text-xs text-slate-400">
              <th className="py-1.5 font-medium">תאריך</th><th className="py-1.5 font-medium">סוג</th><th className="py-1.5 font-medium">הערה</th><th className="py-1.5 font-medium">סכום</th><th />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="py-2 text-slate-600 ltr-num">{fmtDate(p.paid_at)}</td>
                  <td className="py-2"><span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{WIDOW_SUPPORT_TYPE_LABELS[p.type]}</span></td>
                  <td className="py-2 text-slate-500 max-w-[140px] truncate">{p.note || '—'}</td>
                  <td className="py-2 font-bold text-slate-800 ltr-num">{fmtCur(Number(p.amount))}</td>
                  <td className="py-2 text-left"><button onClick={() => delPayment(p.id)} disabled={busy === p.id} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* בקשות */}
      <Card>
        <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">בקשות המשפחה</h2>
        {requests.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">אין בקשות</p>
        ) : (
          <div className="flex flex-col divide-y divide-slate-100">
            {requests.map(r => (
              <div key={r.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs bg-purple-50 text-purple-700 rounded-full px-2 py-0.5">{WIDOW_REQUEST_TYPE_LABELS[r.request_type]}</span>
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${WIDOW_REQUEST_STATUS_COLORS[r.status]}`}>{WIDOW_REQUEST_STATUS_LABELS[r.status]}</span>
                    {r.amount ? <span className="text-xs font-bold text-slate-700 ltr-num">{fmtCur(Number(r.amount))}</span> : null}
                    <span className="text-xs text-slate-400 ltr-num">{fmtDate(r.created_at)}</span>
                  </div>
                  {r.description && <p className="text-sm text-slate-600 mt-1">{r.description}</p>}
                </div>
                {canEdit && r.status === 'pending' && (
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => setReqStatus(r.id, 'approved')} disabled={busy === r.id} className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100" title="אשר"><Check size={14} /></button>
                    <button onClick={() => setReqStatus(r.id, 'rejected')} disabled={busy === r.id} className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100" title="דחה"><X size={14} /></button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  )
}
