'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { MaternityAid } from '@/types'

// לשונית "כרטיסים" בכרטסת הלידה: מונים, פרטי הכרטיס, רכישות בחנויות (נדרים) והיסטוריית טעינות (יומן).
// ⚠️ רכישות ויתרה חיה: מנהל בלבד (ה-API מחזיר 403 לאחרים, ואז הקטע מוסתר).
// ⚠️ נדרים מחזירה לכל רכישה תאריך, חנות וסכום בלבד: אין סניף ואין יתרה אחרי כל רכישה.

type Purchase = { id: string; date: string; store: string; amount: number | null }
type Load = { at: string; ok: boolean; amount: number | null; tlushId: string | null; error: string | null }
type Data = { available: boolean; balance: number | null; purchases: Purchase[]; loads: Load[] }

const money = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const PREVIEW = 6

const STATUS: Record<string, { label: string; cls: string }> = {
  loaded: { label: 'נטען', cls: 'bg-[#E0EFE4] text-[#22663A]' },
  pending: { label: 'בטעינה', cls: 'bg-[#F6EBD2] text-[#87600F]' },
  failed: { label: 'הטעינה נכשלה', cls: 'bg-[#F6E0DE] text-[#9A2F24]' },
  unloaded: { label: 'נפרק', cls: 'bg-[#E7EBF3] text-[#34477A]' },
  idle: { label: 'טרם נטען', cls: 'bg-[#F1ECE0] text-[#6B6352]' },
}

const card = 'mb-3.5 rounded-xl border border-[#E6DFCF] bg-[#FFFDF8] px-5 pb-4 pt-1 shadow-[0_1px_2px_rgba(20,33,61,.05)]'
const h3 = 'border-b-[1.5px] border-[#14213D] pb-2.5 pt-3.5 text-[15px] font-bold text-[#14213D]'
const th = 'px-2 py-2 text-right text-xs font-normal text-[#6B6352] border-b border-[#E6DFCF]'
const td = 'px-2 py-2.5 border-b border-[#EFE9DC] tabular-nums'

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-[#E6DFCF] bg-[#FFFDF8] p-3.5">
      <small className="block text-xs text-[#6B6352]">{label}</small>
      <b className={`block text-[22px] font-black leading-tight ${tone ?? 'text-[#14213D]'}`}>{value}</b>
    </div>
  )
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[#EFE9DC] py-3">
      <small className="block text-xs font-light text-[#6B6352]">{label}</small>
      <div className="mt-[3px] text-base font-medium text-[#1B2338]">{children}</div>
    </div>
  )
}

export default function MaternityCardsTab({ aid }: { aid: MaternityAid }) {
  const [data, setData] = useState<Data | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'hidden' | 'error'>('loading')
  const [all, setAll] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/maternity/${aid.id}/card-activity`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) { if (alive) setState('hidden'); return }
        if (!r.ok) throw new Error()
        const d = await r.json() as Data
        if (alive) { setData(d); setState('ok') }
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [aid.id])

  const loads = useMemo(() => data?.loads ?? [], [data])
  const okLoads = loads.filter(l => l.ok)
  const loadedTotal = okLoads.reduce((s, l) => s + (l.amount ?? 0), 0)
  const purchases = useMemo(() => data?.purchases ?? [], [data])
  const spent = purchases.reduce((s, p) => s + (p.amount ?? 0), 0)
  const byStore = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of purchases) m.set(p.store, (m.get(p.store) ?? 0) + (p.amount ?? 0))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [purchases])
  const shown = all ? purchases : purchases.slice(0, PREVIEW)
  const st = STATUS[aid.card_load_status ?? 'idle'] ?? STATUS.idle
  const assigned = !!(aid.card_number || aid.card_picked_up_at)

  return (
    <div>
      {state === 'loading' && <p className="mb-3 flex items-center gap-1.5 text-sm text-[#6B6352]"><Loader2 size={14} className="animate-spin" />טוען נתוני כרטיס…</p>}
      {state === 'error' && <p className="mb-3 text-sm text-[#9A4314]">לא ניתן לטעון את נתוני הכרטיס כרגע</p>}

      {state === 'ok' && (
        <div className="mb-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Kpi label="סה״כ הוטען" value={okLoads.length ? money(loadedTotal) : money(Number(aid.card_load_amount) || 0)} tone="text-[#8A6316]" />
          <Kpi label="נוצל בחנויות" value={money(spent)} />
          <Kpi label="יתרה בכרטיס" value={data?.balance != null ? money(data.balance) : '—'} tone="text-[#2E7A47]" />
          <Kpi label="רכישות" value={`${purchases.length} · ${byStore.length} חנויות`} />
        </div>
      )}

      {state === 'ok' && (
        <section className={card}>
          <h3 className={h3}>היסטוריית רכישות בחנויות</h3>
          {purchases.length === 0 ? (
            <p className="py-4 text-sm text-[#6B6352]">{data?.available ? 'אין רכישות בכרטיס' : 'אין חיבור לכרטיס בנדרים, ולכן אין רכישות להצגה'}</p>
          ) : (<>
            <div className="min-w-0">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>תאריך</th><th className={th}>חנות</th><th className={th}>סכום</th></tr></thead>
                <tbody>
                  {shown.map(p => (
                    <tr key={p.id}>
                      <td className={td}>{p.date || '—'}</td>
                      <td className={`${td} font-bold`}>{p.store}</td>
                      <td className={td}>{p.amount != null ? money(p.amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {purchases.length > PREVIEW && (
              <button type="button" onClick={() => setAll(v => !v)} className="mt-2 w-full py-2 text-sm font-semibold text-[#14213D]">
                {all ? 'הצג פחות ▴' : `הצג את כל ${purchases.length} הרכישות ▾`}
              </button>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-[#6B6352]">
              לפי חנות:
              {byStore.map(([s, n]) => <span key={s} className="rounded-full bg-[#E7EBF3] px-2.5 py-0.5 text-xs text-[#14213D]">{s} {money(n)}</span>)}
            </div>
          </>)}
        </section>
      )}

      <section className={card}>
        <h3 className={h3}>הכרטיס</h3>
        <div className="grid grid-cols-1 gap-x-7 md:grid-cols-2">
          <Item label="מספר כרטיס"><span dir="ltr" className="inline-block [unicode-bidi:isolate]">{aid.card_number || '—'}</span></Item>
          <Item label="סטטוס"><span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span></Item>
          <Item label="שויך">{assigned ? (aid.card_picked_up_at ? fmtTime(aid.card_picked_up_at) : 'כן') : 'טרם שויך'}</Item>
          <Item label="נטען בתאריך">{fmtTime(aid.card_loaded_at)}</Item>
          <Item label="סכום טעינה">{aid.card_load_amount ? money(Number(aid.card_load_amount)) : '—'}</Item>
          <Item label="תוקף">{aid.card_expires_at ? new Date(aid.card_expires_at).toLocaleDateString('he-IL') : '—'}</Item>
          {aid.card_unloaded_at && <Item label="נפרק בתאריך">{fmtTime(aid.card_unloaded_at)}</Item>}
          <Item label="חסמים">{aid.card_load_error ? <span className="text-[#9A2F24]">{aid.card_load_error}</span> : <span className="text-[#2E7A47]">אין</span>}</Item>
        </div>
      </section>

      {state === 'ok' && (
        <section className={card}>
          <h3 className={h3}>היסטוריית טעינות</h3>
          {loads.length === 0 ? <p className="py-4 text-sm text-[#6B6352]">אין טעינות ביומן</p> : (
            <div className="min-w-0">
              <table className="w-full text-sm">
                <thead><tr><th className={th}>תאריך</th><th className={th}>סכום</th><th className={th}>סטטוס</th><th className={th}>אסמכתא</th></tr></thead>
                <tbody>
                  {loads.map((l, i) => (
                    <tr key={i}>
                      <td className={td}>{fmtTime(l.at)}</td>
                      <td className={td}>{l.amount != null ? money(l.amount) : '—'}</td>
                      <td className={td}><span className={`rounded-full px-2.5 py-0.5 text-xs ${l.ok ? STATUS.loaded.cls : STATUS.failed.cls}`}>{l.ok ? 'הוטען' : 'נכשל'}</span>{l.error && <small className="mr-2 text-[#9A2F24]">{l.error}</small>}</td>
                      <td className={td}>{l.tlushId ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
