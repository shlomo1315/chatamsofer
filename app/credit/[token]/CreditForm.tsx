'use client'
import { useEffect, useState } from 'react'

interface Info { name: string | null; books: string; amountAgorot: number; done: boolean }

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base text-slate-900 focus:border-[#1B3256] focus:outline-none'

export default function CreditForm({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [loadError, setLoadError] = useState('')
  const [f, setF] = useState({ holder: '', holderId: '', bank: '', branch: '', account: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    fetch(`/api/credit/${token}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setLoadError(j.error ?? 'הקישור אינו תקין')
      else { setInfo(j); setDone(!!j.done) }
    }).catch(() => setLoadError('הטעינה נכשלה, נסו שוב'))
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/credit/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok) setDone(true); else setError(j.error ?? 'השמירה נכשלה')
    } catch { setError('השמירה נכשלה, נסו שוב') }
    setBusy(false)
  }

  if (loadError) return <p className="text-red-700">{loadError}</p>
  if (!info) return <p className="text-slate-600">טוען…</p>
  if (done) return <p className="text-lg text-slate-800">הפרטים התקבלו. הזיכוי יועבר לחשבון שמסרתם. תודה רבה.</p>

  const amount = info.amountAgorot / 100
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-slate-700">
        {info.name ? `שלום ${info.name}, ` : ''}לא סיפקנו לכם את הספרים: <b>{info.books}</b>.
        סכום הזיכוי: <b>{Number.isInteger(amount) ? amount : amount.toFixed(2)} ש&quot;ח</b>.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">שם בעל החשבון
        <input className={input} value={f.holder} maxLength={80} required autoComplete="off"
          onChange={e => setF({ ...f, holder: e.target.value })} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">מספר זהות של בעל החשבון
        <input className={input} inputMode="numeric" maxLength={9} required autoComplete="off" value={f.holderId}
          onChange={e => setF({ ...f, holderId: e.target.value.replace(/\D/g, '') })} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">מספר בנק
          <input className={input} inputMode="numeric" maxLength={2} required autoComplete="off" value={f.bank}
            onChange={e => setF({ ...f, bank: e.target.value.replace(/\D/g, '') })} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">מספר סניף
          <input className={input} inputMode="numeric" maxLength={4} required autoComplete="off" value={f.branch}
            onChange={e => setF({ ...f, branch: e.target.value.replace(/\D/g, '') })} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">מספר חשבון
        <input className={input} inputMode="numeric" maxLength={9} required autoComplete="off" value={f.account}
          onChange={e => setF({ ...f, account: e.target.value.replace(/\D/g, '') })} />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <button disabled={busy} className="rounded-lg bg-[#1B3256] px-4 py-3 text-base font-medium text-white disabled:opacity-60">
        {busy ? 'שומר…' : 'שליחת הפרטים'}
      </button>
    </form>
  )
}
