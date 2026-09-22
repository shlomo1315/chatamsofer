'use client'
import { useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CreditCard, AlertTriangle, Loader2 } from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'

// דף סליקה מדומה.
//
// 🔴 מדמה את דף הספק המתארח כדי שכל זרימת התשלום — כולל החזרה לאתר
// ודיווח השרת — תיבדק לפני שפרטי נדרים ידועים.
//
// ⚠️ מצהיר על עצמו בבירור ובאדום. דף סליקה מדומה שנראה אמיתי הוא הדרך
// המהירה ביותר להאמין שכסף נגבה כשלא נגבה דבר.

function MockPaymentInner() {
  const params = useSearchParams()
  const [busy, setBusy] = useState<'ok' | 'fail' | null>(null)

  const txn = params.get('txn') ?? ''
  const order = params.get('order') ?? ''
  const amount = Number(params.get('amount') ?? 0)
  const returnUrl = params.get('return') ?? '/yerid'

  async function pay(result: 'ok' | 'fail') {
    setBusy(result)
    try {
      // מדמה את הדיווח שהספק שולח לשרת שלנו
      await fetch('/api/yerid/payment-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txn, order, amount, result: result === 'fail' ? 'fail' : 'ok' }),
      })
    } catch { /* ממשיכים בכל מקרה — הלקוח יראה את מצב ההזמנה בדף המעקב */ }
    window.location.href = returnUrl
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-5 py-10">
      <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-lg font-bold text-amber-900">
          <AlertTriangle size={20} /> מצב בדיקה
        </p>
        <p className="mt-1 text-base text-amber-800">
          זהו דף סליקה מדומה. לא נגבה כסף ולא נדרש כרטיס אשראי.
        </p>
      </div>

      <div className="rounded-xl border-2 border-stone-200 bg-white p-6">
        <div className="mb-5 flex items-center gap-3 border-b-2 border-stone-100 pb-4">
          <CreditCard size={26} className="text-[#1E3A5F]" strokeWidth={1.5} />
          <div>
            <h1 className="text-xl font-bold text-stone-900">תשלום</h1>
            <p className="text-base text-stone-500">יריד הספרים</p>
          </div>
        </div>

        <dl className="mb-6 flex flex-col gap-2 text-base">
          <div className="flex justify-between">
            <dt className="text-stone-600">סכום לחיוב</dt>
            <dd className="text-2xl font-bold tabular-nums text-stone-900">{fmtAgorot(amount)}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-2">
          <button
            onClick={() => pay('ok')}
            disabled={!!busy}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-4 text-lg font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy === 'ok' && <Loader2 size={18} className="animate-spin" />}
            אישור התשלום
          </button>
          {/* ⚠️ כפתור הכישלון קיים בכוונה: בלעדיו מסלול הכישלון — שחרור
              השריון, סימון ההזמנה, ההודעה ללקוח — לא נבדק אף פעם. */}
          <button
            onClick={() => pay('fail')}
            disabled={!!busy}
            className="rounded-xl border-2 border-stone-300 py-3.5 text-base font-medium text-stone-600 transition hover:bg-stone-50 disabled:opacity-50"
          >
            דחיית התשלום (לבדיקת מסלול הכישלון)
          </button>
        </div>
      </div>
    </main>
  )
}

export default function MockPaymentPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-lg text-stone-500">טוען…</div>}>
      <MockPaymentInner />
    </Suspense>
  )
}
