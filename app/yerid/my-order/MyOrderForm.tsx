'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Mail, Loader2, CheckCircle2 } from 'lucide-react'

export default function MyOrderForm() {
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')
  const [error, setError] = useState('')

  const valid = /^0\d{8,9}$/.test(phone.replace(/\D/g, ''))

  async function submit() {
    setError(''); setBusy(true)
    try {
      const res = await fetch('/api/yerid/my-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'הבקשה נכשלה'); return }
      setSent(json.message ?? 'הקישורים נשלחו')
    } catch {
      setError('הבקשה נכשלה — בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF7F0] px-5 py-10">
      <div className="mx-auto max-w-md">
        <Link href="/yerid" className="mb-6 inline-flex items-center gap-1.5 text-base text-[#141210]/55 transition hover:text-[#6B2737]">
          <ArrowRight size={17} /> חזרה לחנות
        </Link>

        <div className="rounded-2xl border border-[#141210]/8 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-[#12314F]">האזור האישי</h1>
          <p className="mt-2 text-base leading-relaxed text-[#141210]/60">
            הזינו את מספר הטלפון שאיתו ביצעתם את ההזמנה, ונשלח את קישורי
            המעקב לכתובת המייל שנרשמה בה.
          </p>

          {sent ? (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-[#2D5016]/25 bg-[#2D5016]/5 px-4 py-4">
              <CheckCircle2 size={20} className="mt-0.5 flex-shrink-0 text-[#2D5016]" />
              <p className="text-base leading-relaxed text-[#2D5016]">{sent}</p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-lg font-semibold text-[#141210]">מספר טלפון</span>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d-]/g, ''))}
                  onKeyDown={e => { if (e.key === 'Enter' && valid && !busy) submit() }}
                  inputMode="tel"
                  dir="ltr"
                  placeholder="050-0000000"
                  className="w-full rounded-md border-2 border-[#141210]/15 bg-white px-4 py-3.5 text-lg outline-none transition focus:border-[#B8860B]"
                />
              </label>

              {error && (
                <p className="rounded-md border-2 border-[#6B2737]/30 bg-[#6B2737]/5 px-4 py-3 text-base text-[#6B2737]">
                  {error}
                </p>
              )}

              <button
                onClick={submit}
                disabled={!valid || busy}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#6B2737] py-4 text-lg font-semibold text-white transition hover:bg-[#141210] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                {busy ? 'שולח…' : 'שליחת קישורי המעקב'}
              </button>
            </div>
          )}
        </div>

        <p className="mt-5 text-center text-sm leading-relaxed text-[#141210]/45">
          אם קיבלתם קישור מעקב במייל בעת ההזמנה — אפשר להשתמש בו ישירות.
        </p>
      </div>
    </div>
  )
}
