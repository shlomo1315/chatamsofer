'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2, Loader2 } from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'

// כפתור "זכה" לשורת ספר בהזמנה: סימון ברמת מערכת ההזמנות בלבד (בלי כסף ובלי מלאי),
// כדי שהספר לא ייספר כנמכר. בשורה עם כמה עותקים שואלים כמה זוכו.

export default function ItemCreditToggle({ orderId, itemId, quantity, credited }: {
  orderId: string; itemId: string; quantity: number; credited: number
}) {
  const router = useRouter()
  const canEdit = useCan('book_fair', 'edit')
  const [busy, setBusy] = useState(false)
  if (!canEdit && !credited) return null

  async function call(method: 'POST' | 'DELETE', qty?: number) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/book-fair/orders/${orderId}/item-credit`, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity: qty }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error ?? 'הפעולה נכשלה'); return }
      router.refresh()
    } catch {
      alert('הפעולה נכשלה, בדקו את החיבור')
    } finally {
      setBusy(false)
    }
  }

  function mark() {
    let qty = quantity
    if (quantity > 1) {
      const ans = window.prompt(`כמה עותקים זוכו? (1 עד ${quantity})`, String(credited || quantity))
      if (ans === null) return
      qty = Number(ans)
      if (!Number.isInteger(qty) || qty < 1 || qty > quantity) { alert(`יש להזין מספר בין 1 ל-${quantity}`); return }
    }
    void call('POST', qty)
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      {credited > 0 && (
        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
          זכה{quantity > 1 ? ` ${credited}/${quantity}` : ''}
        </span>
      )}
      {canEdit && (
        <button type="button" disabled={busy} onClick={credited ? () => { if (window.confirm('לבטל את סימון "זכה"?')) void call('DELETE') } : mark}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />}
          {credited ? 'ביטול' : 'זכה'}
        </button>
      )}
    </span>
  )
}
