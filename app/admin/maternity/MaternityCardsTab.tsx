'use client'
import { useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { MaternityAid } from '@/types'

// כרטיס מזון בכרטסת הלידה: קובייה (כרטיס, יתרה, פרטים, ציר זמן) והיסטוריה (רכישות בחנויות וטעינות מהיומן).
// ⚠️ רכישות ויתרה חיה: מנהל בלבד (ה-API מחזיר 403 לאחרים, ואז הנתונים החיים מוסתרים).
// ⚠️ נדרים מחזירה לכל רכישה תאריך, חנות וסכום בלבד: אין סניף ואין יתרה אחרי כל רכישה.

export type Purchase = { id: string; date: string; store: string; amount: number | null }
export type Load = { at: string; ok: boolean; amount: number | null; tlushId: string | null; error: string | null }
export type CardData = { available: boolean; balance: number | null; purchases: Purchase[]; loads: Load[] }
export type CardState = 'loading' | 'ok' | 'hidden' | 'error'

export const money = (n: number) => `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const PREVIEW = 6
const TBD = '[להשלים]'

export function useCardActivity(id: string, reloadKey = 0) {
  const [res, setRes] = useState<{ id: string; key: number; data: CardData | null; state: CardState } | null>(null)
  useEffect(() => {
    let alive = true
    const done = (data: CardData | null, state: CardState) => { if (alive) setRes({ id, key: reloadKey, data, state }) }
    fetch(`/api/admin/maternity/${id}/card-activity`)
      .then(async r => {
        if (r.status === 401 || r.status === 403) return done(null, 'hidden')
        if (!r.ok) throw new Error()
        done(await r.json() as CardData, 'ok')
      })
      .catch(() => done(null, 'error'))
    return () => { alive = false }
  }, [id, reloadKey])
  const fresh = res && res.id === id && res.key === reloadKey ? res : null
  return { data: fresh?.data ?? null, state: (fresh?.state ?? 'loading') as CardState }
}

const STATUS: Record<string, { label: string; cls: string }> = {
  loaded: { label: 'נטען', cls: 'bg-[#E0EFE4] text-[#22663A]' },
  pending: { label: 'בטעינה', cls: 'bg-[#F6EBD2] text-[#87600F]' },
  failed: { label: 'הטעינה נכשלה', cls: 'bg-[#F6E0DE] text-[#9A2F24]' },
  unloaded: { label: 'נפרק', cls: 'bg-[#E7EBF3] text-[#34477A]' },
  idle: { label: 'טרם נטען', cls: 'bg-[#F1ECE0] text-[#6B6352]' },
  awaiting: { label: 'ממתין למלאי', cls: 'bg-[#F6EBD2] text-[#87600F]' },
}

const card = 'rounded-xl border border-[#E6DFCF] bg-[#FFFDF8] px-5 pb-4 pt-1 shadow-[0_1px_2px_rgba(20,33,61,.05),0_8px_24px_rgba(20,33,61,.06)]'
const h3 = 'border-b-[1.5px] border-[#14213D] pb-2.5 pt-3.5 text-[15px] font-bold text-[#14213D]'
const th = 'px-2 py-2 text-right text-xs font-normal text-[#6B6352] border-b border-[#E6DFCF]'
const td = 'px-2 py-2.5 border-b border-[#EFE9DC] tabular-nums'

function Kv({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-[#EFE9DC] py-2.5">
      <small className="block text-xs font-light text-[#6B6352]">{label}</small>
      <div className="mt-[3px] break-words text-[15px] font-medium text-[#1B2338]">{children}</div>
    </div>
  )
}
const Muted = ({ children }: { children: React.ReactNode }) => <span className="font-light text-[#958C78]">{children}</span>

export function cardStatusKey(aid: MaternityAid) {
  if (aid.card_load_status === 'failed') return 'failed'
  if (aid.card_load_status === 'loaded' || aid.card_load_status === 'unloaded') return aid.card_load_status
  if (aid.card_status === 'awaiting_stock') return 'awaiting'
  return aid.card_load_status ?? 'idle'
}

type TlItem = { at: string; tone: 'ok' | 'err' | 'now'; title: string; note?: string }

function buildTimeline(aid: MaternityAid, loads: Load[]): TlItem[] {
  const items: TlItem[] = []
  if (aid.approved_at) items.push({ at: aid.approved_at, tone: 'ok', title: 'התיק אושר' })
  for (const l of loads) {
    items.push(l.ok
      ? { at: l.at, tone: 'ok', title: `נטענו ${l.amount != null ? money(l.amount) : 'כספים'} לכרטיס` }
      : { at: l.at, tone: 'err', title: 'ניסיון טעינה נכשל', note: l.error ?? undefined })
  }
  if (!loads.length && aid.card_loaded_at) items.push({ at: aid.card_loaded_at, tone: 'ok', title: 'הכרטיס נטען', note: aid.card_load_amount ? money(Number(aid.card_load_amount)) : undefined })
  if (aid.card_picked_up_at) items.push({ at: aid.card_picked_up_at, tone: 'ok', title: 'הכרטיס שויך ליולדת' })
  if (aid.card_unloaded_at) items.push({ at: aid.card_unloaded_at, tone: 'ok', title: 'הכרטיס נפרק' })
  return items.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime())
}

// קובייה ראשית: כרטיס פיזי, יתרה, התראה, פרטי הכרטיס וציר זמן
export function CardPanel({ aid, data, state, centerName, voucher, holder, onRetry, retrying, onRelink, relinking }: {
  aid: MaternityAid
  data: CardData | null
  state: CardState
  centerName: string | null
  voucher: string | null
  holder: string
  onRetry?: () => void
  retrying?: boolean
  onRelink?: () => void
  relinking?: boolean
}) {
  const key = cardStatusKey(aid)
  const st = STATUS[key] ?? STATUS.idle
  const loads = useMemo(() => data?.loads ?? [], [data])
  const loadedAmt = loads.filter(l => l.ok).reduce((s, l) => s + (l.amount ?? 0), 0) || Number(aid.card_load_amount) || 0
  const balance = data?.balance ?? null
  const used = balance != null && loadedAmt ? Math.max(0, loadedAmt - balance) : null
  const pct = balance != null && loadedAmt ? Math.min(100, Math.round((balance / loadedAmt) * 100)) : 0
  const tl = useMemo(() => buildTimeline(aid, loads), [aid, loads])
  const last4 = aid.card_number ? aid.card_number.slice(-4) : null

  return (
    <section className={`${card} md:col-span-8`}>
      <h3 className={h3}>כרטיס מזון</h3>

      {key === 'failed' && (
        <div className="mt-3 rounded-[10px] border border-[#E7B9B3] border-r-4 border-r-[#B04A3E] bg-[#FBEDEB] px-4 py-3 text-sm text-[#7A241B]">
          <b className="block">הטעינה נכשלה</b>
          {aid.card_load_error || 'לא נרשמה סיבה'}
        </div>
      )}
      {key !== 'failed' && aid.card_number && aid.card_load_error?.includes('שיוך כרטיס') && (
        <div className="mt-3 rounded-[10px] border border-[#E7B9B3] border-r-4 border-r-[#B04A3E] bg-[#FBEDEB] px-4 py-3 text-sm text-[#7A241B]">
          <b className="block">הכסף נטען, אבל שיוך הכרטיס נכשל</b>
          {aid.card_load_error}
          {onRelink && (
            <button type="button" onClick={onRelink} disabled={relinking}
              className="mt-2 block rounded-md border border-[#14213D] bg-white px-3 py-1.5 text-sm font-bold text-[#14213D] hover:bg-[#F4F1E8] disabled:opacity-50">
              {relinking ? 'מתקן שיוך...' : 'תיקון שיוך כרטיס'}
            </button>
          )}
        </div>
      )}
      {key === 'awaiting' && (
        <div className="mt-3 rounded-[10px] border border-[#EFDCAE] border-r-4 border-r-[#C0912F] bg-[#FFF8E6] px-4 py-3 text-sm text-[#5C4512]">
          <b className="block">ממתין למלאי</b>
          אין כרטיס פנוי כרגע. הכרטיס יוקצה וייטען אחרי הוספת מלאי.
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 items-center gap-4 md:grid-cols-[auto_1fr]">
        <div className={`relative flex aspect-[1.586] w-full max-w-[290px] flex-col justify-between rounded-2xl p-4 text-white shadow-[0_10px_24px_rgba(20,33,61,.25)] ${aid.card_number ? 'bg-gradient-to-br from-[#14213D] to-[#22345E]' : 'border-2 border-dashed border-[#D9CFB9] bg-[#F1ECE0] text-[#6B6352] shadow-none'}`}>
          <div className="flex justify-between text-xs"><span>היכל החתם סופר</span><span>כרטיס מזון</span></div>
          <span aria-hidden className="h-6 w-8 rounded bg-[#C0912F]/80" />
          <div dir="ltr" className="text-right text-lg font-bold tracking-[.12em] tabular-nums">{aid.card_number || 'עוד לא שויך כרטיס'}</div>
          <div className="flex justify-between text-xs"><span>{holder}</span></div>
        </div>
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
          <small className="mt-3 block text-xs text-[#6B6352]">יתרה בכרטיס</small>
          {state === 'loading' ? <Loader2 size={20} className="animate-spin text-[#6B6352]" /> : (
            <div className="text-[40px] font-black leading-none tabular-nums text-[#14213D]">{balance != null ? money(balance) : '—'}</div>
          )}
          <div className="mt-1.5 text-sm tabular-nums text-[#6B6352]">
            {loadedAmt ? `נטענו ${money(loadedAmt)}${used != null ? ` · נוצלו ${money(used)}` : ''}` : 'לא נטען כסף'}
          </div>
          <span className="mt-2 block h-[6px] overflow-hidden rounded-[3px] bg-[#EBDFC2]"><i className="block h-full bg-[#C0912F]" style={{ width: `${pct}%` }} /></span>
          {state === 'hidden' && <p className="mt-2 text-xs text-[#958C78]">יתרה חיה ורכישות מוצגות למנהל בלבד</p>}
          {state === 'error' && <p className="mt-2 text-xs text-[#9A4314]">לא ניתן לטעון את נתוני הכרטיס כרגע</p>}
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={retrying} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-[9px] bg-[#14213D] px-4 text-sm font-bold text-white hover:bg-[#22345E] disabled:opacity-60">
              {retrying && <Loader2 size={14} className="animate-spin" />}נסה להטעין שוב
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-7 sm:grid-cols-2 lg:grid-cols-4">
        <Kv label="מספר כרטיס"><span dir="ltr" className="inline-block [unicode-bidi:isolate]">{aid.card_number || <Muted>—</Muted>}</span></Kv>
        <Kv label="שויך בתאריך">{aid.card_picked_up_at ? fmtTime(aid.card_picked_up_at) : aid.card_number ? 'שויך' : <Muted>טרם שויך</Muted>}</Kv>
        <Kv label="נטען בתאריך">{aid.card_loaded_at ? fmtTime(aid.card_loaded_at) : <Muted>—</Muted>}</Kv>
        <Kv label="סכום שנטען">{aid.card_load_amount ? money(Number(aid.card_load_amount)) : <Muted>—</Muted>}</Kv>
        <Kv label="מוקד איסוף">{aid.card_center_id ? (centerName ?? TBD) : <Muted>לא נבחר</Muted>}</Kv>
        <Kv label="תוקף">{aid.card_expires_at ? new Date(aid.card_expires_at).toLocaleDateString('he-IL') : <Muted>—</Muted>}</Kv>
        <Kv label="שובר כרטיס">{voucher ? <span dir="ltr" className="inline-block [unicode-bidi:isolate]">{voucher}</span> : <Muted>{TBD}</Muted>}</Kv>
        <Kv label="מזהה תלוש בנדרים"><span dir="ltr" className="inline-block [unicode-bidi:isolate]">{aid.card_tlush_id || <Muted>—</Muted>}</span></Kv>
      </div>
      {last4 && <span className="sr-only">ארבע ספרות אחרונות {last4}</span>}

      <div className="mt-4">
        <h4 className="text-sm font-bold text-[#14213D]">מה קרה עם הכרטיס</h4>
        {tl.length === 0 ? <p className="py-3 text-sm text-[#6B6352]">אין אירועים ביומן</p> : (
          <ol className="mt-2">
            {tl.map((t, i) => (
              <li key={i} className="flex items-start gap-3 border-b border-[#EFE9DC] py-2 text-sm">
                <i aria-hidden className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${t.tone === 'err' ? 'bg-[#B04A3E]' : 'bg-[#2E7A47]'}`} />
                <span className="min-w-0 flex-1">{t.title}{t.note && <small className={`block ${t.tone === 'err' ? 'text-[#9A2F24]' : 'text-[#6B6352]'}`}>{t.note}</small>}</span>
                <time className="flex-none text-xs tabular-nums text-[#6B6352]">{fmtTime(t.at)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

// היסטוריה: רכישות בחנויות וטעינות
export function CardHistory({ data, state }: { data: CardData | null; state: CardState }) {
  const [all, setAll] = useState(false)
  const loads = useMemo(() => data?.loads ?? [], [data])
  const purchases = useMemo(() => data?.purchases ?? [], [data])
  const byStore = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of purchases) m.set(p.store, (m.get(p.store) ?? 0) + (p.amount ?? 0))
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [purchases])
  const spent = purchases.reduce((s, p) => s + (p.amount ?? 0), 0)
  const shown = all ? purchases : purchases.slice(0, PREVIEW)
  if (state !== 'ok') return null

  return (
    <div className="grid gap-3 md:grid-cols-2 md:gap-4">
      <section className={card}>
        <h3 className={h3}>היסטוריית רכישות בחנויות</h3>
        {purchases.length === 0 ? (
          <p className="py-4 text-sm text-[#6B6352]">{data?.available ? 'אין רכישות בכרטיס' : 'אין חיבור לכרטיס בנדרים, ולכן אין רכישות להצגה'}</p>
        ) : (<>
          <p className="mt-2 text-sm text-[#6B6352]">{purchases.length} רכישות · {byStore.length} חנויות · סה״כ נוצל {money(spent)}</p>
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
    </div>
  )
}
