'use client'
import { Fragment, useMemo, useState } from 'react'
import { Download, ChevronDown } from 'lucide-react'
import { downloadXlsx, todayStamp } from '@/lib/downloadXlsx'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { byCity, type CityOrderRow } from '@/lib/bookFairShippingCities'

// ⚠️ בלי גלילה לרוחב: במובייל עמודות המשנה מוסתרות, והפירוט נפתח מתחת לעיר.

const num = 'tabular-nums'
const th = 'px-3 py-2 text-xs font-semibold text-slate-500'
const td = 'px-3 py-2.5 text-sm'
const btn = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50'
const shekel = (a: number | null) => (a == null ? null : a / 100)

function Diff({ v }: { v: number }) {
  if (!v) return <span className="text-slate-400">0</span>
  return <span dir="ltr" className={v < 0 ? 'text-amber-700' : 'text-sky-700'}>{v > 0 ? '+' : '−'}{fmtAgorot(Math.abs(v))}</span>
}

export default function ShippingCitiesClient({ rows, error }: { rows: CityOrderRow[]; error: string | null }) {
  const { cities, total } = useMemo(() => byCity(rows), [rows])
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function exportXlsx(detail: boolean) {
    setBusy(true)
    try {
      if (detail) {
        await downloadXlsx({
          filename: `משלוחים לפי הזמנה ${todayStamp()}`, sheetName: 'הזמנות',
          columns: [
            { header: 'עיר', width: 16 }, { header: 'מספר הזמנה', kind: 'id', width: 14 },
            { header: 'כרכים', kind: 'number' }, { header: 'לפי התעריף ₪', kind: 'number', width: 14 },
            { header: 'נגבה ₪', kind: 'number' }, { header: 'הפרש ₪', kind: 'number' }, { header: 'הערה', width: 22 },
          ],
          rows: [...rows].sort((a, b) => a.city.localeCompare(b.city, 'he') || a.order_number.localeCompare(b.order_number))
            .map(r => [r.city, r.order_number, r.volumes, shekel(r.expected), shekel(r.charged),
              r.expected == null ? null : shekel(r.charged - r.expected), r.channel === 'office' ? 'הזמנת משרד' : '']),
        })
      } else {
        await downloadXlsx({
          filename: `משלוחים לפי עיר ${todayStamp()}`, sheetName: 'לפי עיר',
          columns: [
            { header: 'עיר', width: 18 }, { header: 'הזמנות', kind: 'number' }, { header: 'מתוכן משרד', kind: 'number' },
            { header: 'כרכים', kind: 'number' }, { header: 'לפי התעריף ₪', kind: 'number', width: 14 },
            { header: 'נגבה ₪', kind: 'number' }, { header: 'הפרש ₪', kind: 'number' },
          ],
          rows: [...cities, total].map(c => [c.city, c.orders, c.officeOrders, c.volumes, shekel(c.expected), shekel(c.charged), shekel(c.diff)]),
        })
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : 'הייצוא נכשל')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">הטעינה נכשלה: {error}</p>}

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <div><div className="text-xs text-slate-500">משלוחים</div><div className={`text-2xl font-bold ${num}`}>{total.orders}</div></div>
        <div><div className="text-xs text-slate-500">כרכים</div><div className={`text-2xl font-bold ${num}`}>{total.volumes}</div></div>
        <div><div className="text-xs text-slate-500">לשליחים לפי התעריף</div><div className={`text-2xl font-bold text-indigo-700 ${num}`}>{fmtAgorot(total.expected)}</div></div>
        <div><div className="text-xs text-slate-500">נגבה מהלקוחות</div><div className={`text-2xl font-bold ${num}`}>{fmtAgorot(total.charged)}</div></div>
        <div><div className="text-xs text-slate-500">הפרש</div><div className={`text-2xl font-bold ${num}`}><Diff v={total.diff} /></div></div>
        <div className="ms-auto flex flex-wrap gap-2">
          <button className={btn} disabled={busy || !rows.length} onClick={() => exportXlsx(false)}><Download size={15} /> אקסל לפי עיר</button>
          <button className={btn} disabled={busy || !rows.length} onClick={() => exportXlsx(true)}><Download size={15} /> אקסל לפי הזמנה</button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className={`${th} text-start`}>עיר</th>
              <th className={`${th} text-end`}>הזמנות</th>
              <th className={`${th} hidden text-end sm:table-cell`}>כרכים</th>
              <th className={`${th} text-end`}>לפי התעריף</th>
              <th className={`${th} hidden text-end sm:table-cell`}>נגבה</th>
              <th className={`${th} text-end`}>הפרש</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cities.map(c => (
              <Fragment key={c.city}>
                <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === c.city ? null : c.city)}>
                  <td className={`${td} font-medium text-slate-900`}>
                    <span className="inline-flex items-center gap-1">
                      <ChevronDown size={14} className={`text-slate-400 transition ${open === c.city ? 'rotate-180' : ''}`} />
                      {c.city}
                    </span>
                    {c.officeOrders > 0 && <div className="text-xs text-slate-500">כולל {c.officeOrders} הזמנות משרד, בלי תעריף</div>}
                  </td>
                  <td className={`${td} text-end ${num}`}>{c.orders}</td>
                  <td className={`${td} hidden text-end sm:table-cell ${num}`}>{c.volumes}</td>
                  <td className={`${td} text-end font-semibold ${num}`}>{fmtAgorot(c.expected)}</td>
                  <td className={`${td} hidden text-end sm:table-cell ${num}`}>{fmtAgorot(c.charged)}</td>
                  <td className={`${td} text-end ${num}`}><Diff v={c.diff} /></td>
                </tr>
                {open === c.city && (
                  <tr>
                    <td colSpan={6} className="bg-slate-50 px-3 py-3">
                      <ul className="grid gap-1 text-sm sm:grid-cols-2">
                        {rows.filter(r => r.city === c.city).map(r => (
                          <li key={r.id} className="flex flex-wrap items-center gap-x-3">
                            <a href={`/admin/book-fair/orders/${r.id}`} className={`font-medium text-indigo-700 hover:underline ${num}`}>{r.order_number}</a>
                            <span className={`text-slate-600 ${num}`}>{r.volumes} כרכים</span>
                            <span className={num}>{r.expected == null ? 'משרד' : fmtAgorot(r.expected)}</span>
                            <span className={`text-slate-500 ${num}`}>נגבה {fmtAgorot(r.charged)}</span>
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!cities.length && <tr><td colSpan={6} className="py-6 text-center text-sm text-slate-400">אין משלוחים ששולמו</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        נספרות הזמנות משלוח ששולמו, כולל &quot;זוכה חלקית&quot;. &quot;נגבה&quot; הוא דמי המשלוח שנשמרו בהזמנה בזמן התשלום. לחיצה על עיר פותחת את ההזמנות שלה.
      </p>
    </div>
  )
}
