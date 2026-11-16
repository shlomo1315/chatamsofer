'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import type { MatchmakerRow, MatchmakerSortKey } from '@/lib/matchmaker/matchmakerList'

interface Payload { rows: MatchmakerRow[]; counters: { total: number; active: number; waiting: number; paid: number }; circles: string[] }
interface Filters { q: string; circle: string; hasReq: string; verif: string; limit: string; from: string; to: string; counter: string }

const EMPTY: Filters = { q: '', circle: '', hasReq: '', verif: '', limit: '', from: '', to: '', counter: '' }
const COLS: { key: MatchmakerSortKey; label: string }[] = [
  { key: 'name', label: 'שדכן' }, { key: 'circle', label: 'חוג' }, { key: 'reqs', label: 'בקשות' }, { key: 'ok', label: 'אושרו' },
  { key: 'wait', label: 'ממתינות' }, { key: 'paid', label: 'שולם' }, { key: 'bank', label: 'בנק' }, { key: 'reg', label: 'נרשם' },
]
const STATUS_LABEL: Record<string, string> = { pending: 'ממתינה', approved: 'אושרה', rejected: 'נדחתה', paid: 'שולמה' }
const COUNTER_LABEL: Record<string, string> = { active: 'פעילים', wait: 'עם בקשה ממתינה' }
const HAS_REQ: Record<string, string> = { pending: 'יש ממתינות', any: 'יש בקשות', none: 'אין בקשות' }
const VERIF: Record<string, string> = { ok: 'אומת', wait: 'ממתין לאימות אנושי' }
const LIMIT: Record<string, string> = { yes: 'עם הגבלה פרטנית', no: 'לפי ההגדרה הכללית' }

const fmtDate = (s: string) => new Date(s).toLocaleDateString('he-IL')
const fmtMoney = (n: number) => (n ? `₪${n.toLocaleString('he-IL')}` : '—')
const inputCls = 'h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold/40'
const pill = 'inline-block px-2.5 py-px rounded-full text-xs font-medium'

export default function MatchmakersTab({ canEdit, isAdmin, onShowClaims, onChanged }: {
  canEdit: boolean; isAdmin: boolean; onShowClaims: (matchmakerId: string) => void; onChanged: () => void
}) {
  const [f, setF] = useState<Filters>(EMPTY)
  const [sort, setSort] = useState<{ key: MatchmakerSortKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' })
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
    p.set('sort', sort.key); p.set('dir', sort.dir)
    return p.toString()
  }, [f, sort])

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/matchmaker-grants/matchmakers?${query}`, { cache: 'no-store' })
    if (!res.ok) { setError('שגיאה בטעינת השדכנים'); return }
    setError(''); setData(await res.json())
  }, [query])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const set = (k: keyof Filters, v: string) => setF(p => ({ ...p, [k]: v }))
  const c = data?.counters
  const counters: { label: string; value: string | number; counter?: string; gold?: boolean }[] = [
    { label: 'סך שדכנים', value: c?.total ?? 0 },
    { label: 'פעילים (עם בקשה)', value: c?.active ?? 0, counter: 'active' },
    { label: 'עם בקשה ממתינה', value: c?.waiting ?? 0, counter: 'wait' },
    { label: 'שולם', value: fmtMoney(c?.paid ?? 0), gold: true },
  ]
  const chips: { key: keyof Filters; text: string }[] = []
  if (f.q) chips.push({ key: 'q', text: f.q })
  if (f.circle) chips.push({ key: 'circle', text: f.circle })
  if (f.hasReq) chips.push({ key: 'hasReq', text: `בקשות: ${HAS_REQ[f.hasReq]}` })
  if (f.verif) chips.push({ key: 'verif', text: `אימות: ${VERIF[f.verif]}` })
  if (f.limit) chips.push({ key: 'limit', text: `הגבלה: ${LIMIT[f.limit]}` })
  if (f.from) chips.push({ key: 'from', text: `נרשם מ-${fmtDate(f.from)}` })
  if (f.to) chips.push({ key: 'to', text: `נרשם עד ${fmtDate(f.to)}` })
  if (f.counter) chips.push({ key: 'counter', text: `מונה: ${COUNTER_LABEL[f.counter]}` })

  const open = data?.rows.find(r => r.id === openId) ?? null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {counters.map(k => {
          const sel = !!k.counter && f.counter === k.counter
          return (
            <button key={k.label} type="button" onClick={() => set('counter', k.counter && !sel ? k.counter : '')}
              className={`text-right rounded-xl border bg-paper p-4 transition ${sel ? 'border-navy ring-1 ring-navy' : 'border-line hover:border-gold'}`}>
              <div className={`text-3xl font-black tabular-nums leading-tight ${k.gold ? 'text-gold' : 'text-navy'}`}>{k.value}</div>
              <div className="text-sm text-ink-soft mt-1">{k.label}</div>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-line bg-paper p-3 flex flex-wrap items-end gap-2">
        <input type="search" className={`${inputCls} flex-1 min-w-[220px]`} placeholder="חיפוש: שם, טלפון, חוג" value={f.q} onChange={e => set('q', e.target.value)} aria-label="חיפוש חופשי" />
        <select className={inputCls} value={f.circle} onChange={e => set('circle', e.target.value)} aria-label="חוג">
          <option value="">כל החוגים</option>
          {data?.circles.map(x => <option key={x} value={x}>{x}</option>)}
        </select>
        <select className={inputCls} value={f.hasReq} onChange={e => set('hasReq', e.target.value)} aria-label="בקשות">
          <option value="">בקשות: הכול</option>
          {Object.entries(HAS_REQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={inputCls} value={f.verif} onChange={e => set('verif', e.target.value)} aria-label="אימות">
          <option value="">אימות: הכול</option>
          {Object.entries(VERIF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={inputCls} value={f.limit} onChange={e => set('limit', e.target.value)} aria-label="הגבלה פרטנית">
          <option value="">הגבלה: הכול</option>
          {Object.entries(LIMIT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="text-xs text-ink-soft">נרשם מתאריך
          <input type="date" className={`${inputCls} block mt-0.5`} value={f.from} onChange={e => set('from', e.target.value)} /></label>
        <label className="text-xs text-ink-soft">עד תאריך
          <input type="date" className={`${inputCls} block mt-0.5`} value={f.to} onChange={e => set('to', e.target.value)} /></label>
        {canEdit && (
          <a href={`/api/admin/matchmaker-grants/matchmakers/export?${query}`} className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-gold text-navy-dark font-bold text-sm hover:brightness-105">
            <Download className="w-4 h-4" />ייצוא לאקסל</a>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
          {chips.map(x => (
            <button key={x.key} type="button" onClick={() => set(x.key, '')} className="rounded-full border border-line bg-gold-soft px-2.5 py-0.5 text-navy">{x.text} ✕</button>
          ))}
          <button type="button" onClick={() => setF(EMPTY)} className="text-navy underline text-sm">נקה הכול</button>
        </div>
      )}

      {error && <div role="alert" className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      {/* חריג מאושר בידי שלמה ויסברג: גלילה לרוחב בטלפון, לפי המוקאפ */}
      {/* eslint-disable local/no-horizontal-scroll */}
      <div className="rounded-xl border border-line bg-paper overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="bg-navy text-white text-right">
              {COLS.map(col => (
                <th key={col.key} scope="col" className="px-3 py-3 font-medium whitespace-nowrap cursor-pointer select-none"
                  aria-sort={sort.key === col.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => setSort(s => s.key === col.key ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: col.key, dir: 'asc' })}>
                  {col.label}<span className="opacity-50 text-[11px] ms-1">{sort.key === col.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.rows.map(m => (
              <tr key={m.id} onClick={() => setOpenId(m.id)} className="border-t border-line cursor-pointer hover:bg-gold-soft/60">
                <td className="px-3 py-3"><div className="font-bold">{m.name}</div><div className="text-xs text-ink-soft" dir="ltr" style={{ textAlign: 'right' }}>{m.phone}</div></td>
                <td className="px-3 py-3">{m.circle || '—'}</td>
                <td className="px-3 py-3 tabular-nums">{m.reqs}{m.claims_limit != null && <span className={`${pill} bg-[#E8ECF6] text-navy ms-1`}>מתוך {m.claims_limit}</span>}</td>
                <td className="px-3 py-3 tabular-nums">{m.ok}</td>
                <td className="px-3 py-3">{m.wait ? <span className={`${pill} bg-[#FDF0D8] text-[#A8650D]`}>{m.wait} ממתינה</span> : '—'}</td>
                <td className="px-3 py-3 tabular-nums">{fmtMoney(m.paid)}</td>
                <td className="px-3 py-3 text-[13px]">{m.bank_name ? `${m.bank_name} · ••••${(m.bank_account_masked ?? '').slice(-2)}` : '—'}</td>
                <td className="px-3 py-3 tabular-nums">{fmtDate(m.created_at)}</td>
                <td className="px-3 py-3"><span className="text-navy underline text-[13px]">פתח</span></td>
              </tr>
            ))}
            {data && data.rows.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-soft">אין שדכנים שמתאימים לסינון. <button type="button" onClick={() => setF(EMPTY)} className="text-navy underline">נקה סינון</button></td></tr>
            )}
            {!data && !error && <tr><td colSpan={9} className="px-4 py-10 text-center text-ink-soft">טוען…</td></tr>}
          </tbody>
        </table>
      </div>
      {/* eslint-enable local/no-horizontal-scroll */}
      <div className="flex justify-between text-[13px] text-ink-soft px-1">
        <span>{data ? `מוצגים ${data.rows.length} מתוך ${data.counters.total}` : ''}</span>
        <span>לחיצה על שורה פותחת כרטסת</span>
      </div>

      {open && <MatchmakerCard m={open} isAdmin={isAdmin} onClose={() => setOpenId(null)}
        onShowClaims={() => { setOpenId(null); onShowClaims(open.id) }} onChanged={() => { load(); onChanged() }} />}
    </div>
  )
}

function MatchmakerCard({ m, isAdmin, onClose, onShowClaims, onChanged }: {
  m: MatchmakerRow; isAdmin: boolean; onClose: () => void; onShowClaims: () => void; onChanged: () => void
}) {
  const [account, setAccount] = useState('')
  const [editing, setEditing] = useState(false)
  const [limit, setLimit] = useState(m.claims_limit != null ? String(m.claims_limit) : '')
  const [bank, setBank] = useState({ bank_name: m.bank_name ?? '', bank_branch: m.bank_branch ?? '', bank_account: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function reveal() {
    const res = await fetch(`/api/admin/matchmaker-grants/matchmakers/${m.id}/reveal`, { method: 'POST' })
    if (res.ok) setAccount((await res.json()).bank_account ?? '')
  }
  async function save() {
    setBusy(true); setErr('')
    const body: Record<string, unknown> = { claims_limit: limit }
    if (bank.bank_account) Object.assign(body, bank)
    const res = await fetch(`/api/admin/matchmaker-grants/matchmakers/${m.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setBusy(false)
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'שגיאה'); return }
    setEditing(false); onChanged(); onClose()
  }

  const row = 'flex justify-between gap-3 py-2 border-t border-line text-sm'
  const sec = 'text-xs font-bold text-gold mt-4 mb-1'
  return (
    <Modal open onClose={onClose} size="md" title={editing ? `עריכת שדכן: ${m.name}` : m.name}
      footer={editing ? (
        <div className="flex gap-2">
          <button disabled={busy} onClick={save} className="h-10 px-5 rounded-lg bg-navy text-white font-bold text-sm disabled:opacity-50">שמירה</button>
          <button onClick={() => setEditing(false)} className="h-10 px-4 rounded-lg border border-line bg-white text-sm">ביטול</button>
        </div>
      ) : (
        <div className="flex gap-2">
          {isAdmin && <button onClick={() => setEditing(true)} className="h-10 px-5 rounded-lg bg-navy text-white font-bold text-sm">עריכת הגבלה ופרטי העברה</button>}
          <button onClick={onClose} className="h-10 px-4 rounded-lg border border-line bg-white text-sm">סגירה</button>
        </div>
      )}>
      {editing ? (
        <div className="space-y-4 text-sm">
          <label className="block"><span className="font-bold">הגבלת בקשות לשדכן</span><span className="block text-xs text-ink-soft">גוברת על ההגדרה הכללית. ריק = לפי ההגדרה הכללית</span>
            <input className={`${inputCls} w-full mt-1`} inputMode="numeric" value={limit} onChange={e => setLimit(e.target.value.replace(/\D/g, ''))} /></label>
          <fieldset className="rounded-lg border border-line p-3 space-y-3">
            <legend className="px-2 text-xs font-bold text-gold">פרטי העברה (רק מנהל)</legend>
            <p className="text-xs text-ink-soft">להשאיר את החשבון ריק כדי לא לשנות. שינוי נרשם ביומן.</p>
            <input className={`${inputCls} w-full`} placeholder="בנק" value={bank.bank_name} onChange={e => setBank({ ...bank, bank_name: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} inputMode="numeric" dir="ltr" placeholder="סניף" value={bank.bank_branch} onChange={e => setBank({ ...bank, bank_branch: e.target.value.replace(/\D/g, '') })} />
              <input className={inputCls} inputMode="numeric" dir="ltr" placeholder="חשבון חדש" value={bank.bank_account} onChange={e => setBank({ ...bank, bank_account: e.target.value.replace(/\D/g, '') })} />
            </div>
          </fieldset>
          {err && <div role="alert" className="text-sm text-red-700">{err}</div>}
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {[[m.reqs, `בקשות${m.claims_limit != null ? ` (מתוך ${m.claims_limit})` : ''}`], [m.ok, 'אושרו'], [fmtMoney(m.paid), 'שולם']].map(([v, l]) => (
              <div key={String(l)} className="rounded-lg border border-line bg-white px-3 py-2.5"><b className="block text-[22px] font-black text-navy tabular-nums">{v}</b><span className="text-xs text-ink-soft">{l}</span></div>
            ))}
          </div>
          <div className={sec}>פרטים</div>
          <div className={row}><span className="text-ink-soft">טלפון</span><span dir="ltr">{m.phone}</span></div>
          <div className={row}><span className="text-ink-soft">מייל</span><span dir="ltr">{m.email}</span></div>
          <div className={row}><span className="text-ink-soft">חוג</span><span>{m.circle || '—'}</span></div>
          <div className={row}><span className="text-ink-soft">נרשם</span><span>{fmtDate(m.created_at)}</span></div>
          <div className={row}><span className="text-ink-soft">אימות</span><span className={`${pill} ${m.verified ? 'bg-[#E1F2E8] text-[#2F7D4F]' : 'bg-[#FDF0D8] text-[#A8650D]'}`}>{m.verified ? 'אומת' : 'ממתין לאימות אנושי'}</span></div>
          <div className={sec}>פרטי העברה</div>
          <div className={row}>
            <span className="text-ink-soft">{m.bank_name ? `${m.bank_name} · סניף ${m.bank_branch ?? ''}` : 'לא הוזן'}</span>
            <span dir="ltr" className="tabular-nums">{m.bank_name ? (account || m.bank_account_masked) : '—'}
              {m.bank_name && !account && isAdmin && <button onClick={reveal} className="ms-2 text-xs text-navy underline">הצג (נרשם ביומן)</button>}</span>
          </div>
          <div className={sec}>בקשות אחרונות</div>
          {m.recent.length ? <>
            {m.recent.map(r => (
              <div key={r.id} className={row}><span>{r.label} · {fmtDate(r.created_at)}</span>
                <span className={`${pill} ${r.status === 'pending' ? 'bg-[#FDF0D8] text-[#A8650D]' : r.status === 'rejected' ? 'bg-[#F0F0F0] text-ink-soft' : 'bg-[#E1F2E8] text-[#2F7D4F]'}`}>{STATUS_LABEL[r.status]}</span></div>
            ))}
            <button onClick={onShowClaims} className="mt-2 text-[13px] text-navy underline">כל הבקשות של השדכן ←</button>
          </> : <div className="py-3 text-center text-ink-soft text-sm">עדיין לא הוגשו בקשות</div>}
        </div>
      )}
    </Modal>
  )
}
