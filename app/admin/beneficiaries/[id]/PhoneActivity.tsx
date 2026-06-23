'use client'

import { useEffect, useState } from 'react'
import { Phone, Loader2, CheckCircle2, XCircle, AlertCircle, PhoneOff, CreditCard } from 'lucide-react'
import Card from '@/components/ui/Card'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'

type Row = {
  id: string
  action: string
  actionLabel: string
  ok: boolean
  isError: boolean
  caller: string | null
  callId: string | null
  cardLast4: string | null
  center: string | null
  centerStockAfter: number | null
  nedarimId: string | null
  errorMsg: string | null
  note: string | null
  createdAt: string
}

function iconFor(r: Row) {
  if (r.ok) return { Icon: CheckCircle2, cls: 'bg-green-50 text-green-600' }
  if (r.isError) return { Icon: XCircle, cls: 'bg-red-50 text-red-600' }
  if (r.action === 'yemot_phone_not_found') return { Icon: PhoneOff, cls: 'bg-slate-100 text-slate-500' }
  if (r.action === 'yemot_no_active_birth') return { Icon: AlertCircle, cls: 'bg-amber-50 text-amber-600' }
  return { Icon: Phone, cls: 'bg-indigo-50 text-indigo-600' }
}

export default function PhoneActivity({ beneficiaryId }: { beneficiaryId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/beneficiaries/${beneficiaryId}/phone-activity`)
      .then((r) => r.json())
      .then((d) => { if (alive) { if (d.error) setError(d.error); else setRows(d.rows ?? []) } })
      .catch(() => { if (alive) setError('שגיאה בטעינת היסטוריית הטלפון') })
    return () => { alive = false }
  }, [beneficiaryId])

  if (error) return <Card><p className="text-center text-red-500 text-sm py-6">{error}</p></Card>
  if (rows === null) {
    return <Card><p className="flex items-center justify-center gap-2 text-slate-400 text-sm py-6"><Loader2 size={16} className="animate-spin" /> טוען…</p></Card>
  }
  if (rows.length === 0) {
    return <Card><p className="text-center text-slate-400 text-sm py-6">אין פעילות טלפון רשומה למשפחה זו</p></Card>
  }

  return (
    <Card padding="none">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Phone size={16} className="text-indigo-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase">היסטוריית פעילות בטלפון (שלוחת ימות)</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const { Icon, cls } = iconFor(r)
          return (
            <div key={r.id} className="flex items-start gap-3 px-4 py-3">
              <span className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${cls}`}><Icon size={17} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800">{r.actionLabel}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-slate-500">
                  {r.caller && <span className="ltr-num">מתקשר: {r.caller}</span>}
                  {r.cardLast4 && <span className="inline-flex items-center gap-1"><CreditCard size={11} /> כרטיס ****{r.cardLast4}</span>}
                  {r.center && <span>מוקד: {r.center}{r.centerStockAfter != null ? ` (נותר ${r.centerStockAfter})` : ''}</span>}
                  {r.nedarimId && <span className="ltr-num">נדרים: {r.nedarimId}</span>}
                </div>
                {r.errorMsg && <p className="text-xs text-red-500 mt-0.5">{r.errorMsg}</p>}
                {r.note && <p className="text-xs text-slate-400 mt-0.5">{r.note}</p>}
              </div>
              <span className="text-xs text-slate-400 ltr-num flex-shrink-0">{format(new Date(r.createdAt), 'dd/MM/yy HH:mm', { locale: he })}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
