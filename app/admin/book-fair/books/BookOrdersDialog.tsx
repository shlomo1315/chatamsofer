'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Loader2, Globe, Phone, Store, ExternalLink } from 'lucide-react'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { ilDateTime } from '@/lib/israelTime'
import {
  BOOK_FAIR_STATUS_LABELS, BOOK_FAIR_STATUS_COLORS,
  BOOK_FAIR_DELIVERY_LABELS,
  type BookFairOrderStatus, type BookFairDeliveryMethod,
} from '@/types/bookFair'

// ─────────────────────────────────────────────────────────────────────────────
// מי הזמין את הספר — נפתח מלחיצה על המספר בעמודת "נמכר".
//
// ⚠️ הכתובת היא העמודה החשובה כאן: הצוות פותח את הרשימה כדי ללקט,
// ולכן "טרם הוזנה" מסומן בענבר ולא מוסתר.
// ─────────────────────────────────────────────────────────────────────────────

type Row = {
  id: string
  order_number: string
  status: BookFairOrderStatus
  channel: string
  quantity: number
  line_total_agorot: number
  customer_name: string | null
  customer_phone: string | null
  customer_email: string | null
  delivery_method: BookFairDeliveryMethod
  city_name: string | null
  address_text: string | null
  address_confirmed: boolean
  at: string
}

const CHANNEL_ICON: Record<string, typeof Globe> = {
  web: Globe, phone: Phone, fair: Store,
}

export default function BookOrdersDialog({ book, onClose }: {
  book: { id: string; title: string; sku: string }
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/admin/book-fair/books/${book.id}/orders`, { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) { setError(json.error ?? 'טעינת הרשימה נכשלה'); return }
        setRows(json.orders ?? [])
      } catch {
        if (alive) setError('טעינת הרשימה נכשלה — בדקו את החיבור')
      }
    })()
    return () => { alive = false }
  }, [book.id])

  // ⚠️ Escape סוגר: הפופאפ מכסה את המסך, ולחיצה על הרקע אינה מובנת
  // מאליה לכל משתמש.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const total = rows?.reduce((s, r) => s + r.quantity, 0) ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">מי הזמין · {book.title}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              מק״ט {book.sku}
              {rows && ` · ${rows.length} הזמנות · ${total} עותקים`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            title="סגירה"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
          )}

          {!rows && !error && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
              <Loader2 size={16} className="animate-spin" /> טוען…
            </div>
          )}

          {rows && rows.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-500">
              טרם הוזמנו עותקים מספר זה.
            </p>
          )}

          {rows && rows.length > 0 && (
            // ⚠️ גלילה אנכית בלבד — גלילה לרוחב אסורה ונאכפת בלינט.
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-slate-100 text-xs text-slate-500">
                    <th className="py-2 text-right font-semibold">הזמנה</th>
                    <th className="py-2 text-right font-semibold">לקוח</th>
                    <th className="py-2 text-right font-semibold">כמות</th>
                    <th className="py-2 text-right font-semibold">מסירה וכתובת</th>
                    <th className="py-2 text-right font-semibold">מתי</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const Icon = CHANNEL_ICON[r.channel] ?? Globe
                    return (
                      <tr key={r.id} className="border-b border-slate-50 align-top">
                        <td className="py-3 pl-3">
                          <Link
                            href={`/admin/book-fair/orders/${r.id}`}
                            className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline"
                          >
                            {r.order_number}
                            <ExternalLink size={12} />
                          </Link>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] ${BOOK_FAIR_STATUS_COLORS[r.status]}`}>
                              {BOOK_FAIR_STATUS_LABELS[r.status]}
                            </span>
                            <Icon size={12} className="text-slate-400" />
                          </div>
                        </td>

                        <td className="py-3 pl-3">
                          <div className="text-slate-800">{r.customer_name || '—'}</div>
                          {r.customer_phone && (
                            <a href={`tel:${r.customer_phone}`} className="text-xs text-indigo-600 hover:underline">
                              {r.customer_phone}
                            </a>
                          )}
                          {r.customer_email && (
                            <div className="truncate text-xs text-slate-400">{r.customer_email}</div>
                          )}
                        </td>

                        <td className="py-3 pl-3">
                          <div className="font-medium text-slate-800">{r.quantity}</div>
                          <div className="text-xs text-slate-400">{fmtAgorot(r.line_total_agorot)}</div>
                        </td>

                        <td className="py-3 pl-3">
                          <div className="text-slate-700">
                            {BOOK_FAIR_DELIVERY_LABELS[r.delivery_method]}
                            {r.city_name && <span className="text-slate-400"> · {r.city_name}</span>}
                          </div>
                          {/* 🔴 זו הסיבה שהרשימה קיימת — כתובת חסרה מסומנת
                              ולא מושמטת, אחרת ליקוט ייעצר בלי התראה. */}
                          {r.delivery_method === 'shipping' && (
                            r.address_text
                              ? <div className="text-xs text-slate-500">{r.address_text}</div>
                              : <div className="text-xs font-medium text-amber-600">טרם הוזנה כתובת</div>
                          )}
                        </td>

                        <td className="whitespace-nowrap py-3 text-xs text-slate-500">
                          {ilDateTime(r.at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
