'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Search, ShieldCheck, ShieldAlert, Eye, RefreshCw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import type { AdminClaim, AdminMatchmaker } from '@/lib/matchmaker/adminData'
import { reasonsText } from '@/lib/matchmaker/reasons'
import MatchmakersTab from './MatchmakersTab'

interface Data {
  claims: AdminClaim[]
  counters: { pending: number; approved: number; grandchildren: number; payable: number }
  settings: { regular_amount: number | null; enlarged_amount: number | null; max_claims_per_matchmaker: number | null; claims_open_from: string | null; claim_wait_days: number }
  matchmakers: AdminMatchmaker[]
}
interface LogRow { action: string; detail: string | null; actor: string | null; created_at: string }

const STATUS_LABEL: Record<string, string> = { pending: 'ממתין', approved: 'אושר', rejected: 'נדחה', paid: 'שולם' }
const STATUS_CLS: Record<string, string> = {
  pending: 'bg-[#F8EBD6] text-[#9A5B13]', approved: 'bg-[#E3F0E8] text-[#2F6B4F]',
  paid: 'bg-navy text-white', rejected: 'bg-line text-ink-soft',
}
const ACTION_LABEL: Record<string, string> = {
  approve: 'אישור', reject: 'דחייה', paid: 'סימון שולם', amount: 'קביעת סכום', recheck: 'בדיקה חוזרת', reveal_id: 'חשיפת ת"ז', reveal_bank: 'חשיפת חשבון בנק', matchmaker_edit: 'עריכת שדכן', settings: 'הגדרות', export: 'ייצוא',
}
const SIDE_LABEL = { groom: 'החתן', bride: 'הכלה', both: 'שניהם' }
const fmtDate = (s: string) => new Date(s).toLocaleDateString('he-IL')
const fmtMoney = (n: number | null) => (n == null ? '—' : `₪${n.toLocaleString('he-IL')}`)

const inputCls = 'h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-gold/40'

type Tab = 'claims' | 'matchmakers' | 'settings'

export default function MatchmakerGrantsClient({ demo, canEdit = false, isAdmin = false }: { demo?: Data; canEdit?: boolean; isAdmin?: boolean }) {
  const [tab, setTab] = useState<Tab>('claims')
  const [data, setData] = useState<Data | null>(demo ?? null)
  const [error, setError] = useState('')
  const [f, setF] = useState({ status: '', grandchild: '', from: '', to: '', matchmaker: '', q: '' })
  const [open, setOpen] = useState<AdminClaim | null>(null)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(f).forEach(([k, v]) => { if (v) p.set(k, v) })
    return p.toString()
  }, [f])

  const load = useCallback(async () => {
    if (demo) return
    const res = await fetch(`/api/admin/matchmaker-grants?${query}`, { cache: 'no-store' })
    if (!res.ok) { setError('שגיאה בטעינת הבקשות'); return }
    setError(''); setData(await res.json())
  }, [query, demo])

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  const c = data?.counters
  const counters = [
    { label: 'ממתינות', value: c?.pending ?? 0 },
    { label: 'אושרו', value: c?.approved ?? 0 },
    { label: 'נכדי החתם סופר', value: c?.grandchildren ?? 0 },
    { label: 'סה״כ לתשלום', value: fmtMoney(c?.payable ?? 0), gold: true },
  ]

  const tabs: { key: Tab; label: string }[] = [
    { key: 'claims', label: 'בקשות' }, { key: 'matchmakers', label: 'שדכנים' },
    ...(isAdmin ? [{ key: 'settings' as Tab, label: 'הגדרות' }] : []),
  ]

  return (
    <div className="space-y-5">
      <div role="tablist" className="flex gap-1 border-b border-line">
        {tabs.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-bold -mb-px border-b-2 ${tab === t.key ? 'border-gold text-navy' : 'border-transparent text-ink-soft hover:text-navy'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'matchmakers' && <MatchmakersTab canEdit={canEdit} isAdmin={isAdmin}
        onShowClaims={id => { setF({ status: '', grandchild: '', from: '', to: '', matchmaker: id, q: '' }); setTab('claims') }} onChanged={load} />}
      {tab === 'settings' && isAdmin && data && <SettingsPanel settings={data.settings} onSaved={load} />}

      {tab === 'claims' && <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {counters.map(k => (
          <div key={k.label} className="rounded-xl border border-line bg-paper p-4">
            <div className={`text-3xl font-black tabular-nums ${k.gold ? 'text-gold' : 'text-navy'}`}>{k.value}</div>
            <div className="text-sm text-ink-soft mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-paper p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute top-3 right-3 w-4 h-4 text-ink-soft" aria-hidden />
          <input className={`${inputCls} w-full pr-9`} placeholder="חיפוש: שדכן, חתן, כלה, טלפון" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} aria-label="חיפוש חופשי" />
        </div>
        <select className={inputCls} value={f.status} onChange={e => setF({ ...f, status: e.target.value })} aria-label="סטטוס">
          <option value="">כל הסטטוסים</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className={inputCls} value={f.grandchild} onChange={e => setF({ ...f, grandchild: e.target.value })} aria-label="נכד החתם סופר">
          <option value="">נכד חת״ס: הכול</option>
          <option value="yes">סומן כנכד</option>
          <option value="no">לא סומן</option>
          <option value="verified">אומת</option>
          <option value="not_found">לא נמצא</option>
        </select>
        <select className={inputCls} value={f.matchmaker} onChange={e => setF({ ...f, matchmaker: e.target.value })} aria-label="שדכן">
          <option value="">כל השדכנים</option>
          {data?.matchmakers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <input type="date" className={inputCls} value={f.from} onChange={e => setF({ ...f, from: e.target.value })} aria-label="מתאריך" />
        <input type="date" className={inputCls} value={f.to} onChange={e => setF({ ...f, to: e.target.value })} aria-label="עד תאריך" />
        <button onClick={load} className="h-10 w-10 grid place-items-center rounded-lg border border-line bg-white text-navy hover:bg-gold-soft" aria-label="רענון"><RefreshCw className="w-4 h-4" /></button>
        <a href={`/api/admin/matchmaker-grants/export?${query}`} className="h-10 px-4 inline-flex items-center gap-2 rounded-lg bg-gold text-navy-dark font-bold text-sm hover:brightness-105"><Download className="w-4 h-4" />ייצוא לאקסל</a>
      </div>

      {error && <div role="alert" className="rounded-lg bg-red-50 text-red-700 px-4 py-2 text-sm">{error}</div>}

      <div className="rounded-xl border border-line bg-paper">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white text-right">
              {['הוגש', 'שדכן', 'חתן', 'כלה', 'נכד חת״ס', 'סכום', 'סטטוס'].map(h => <th key={h} className={`px-3 py-3 font-medium ${h === 'כלה' || h === 'הוגש' ? 'hidden md:table-cell' : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data?.claims.map(r => (
              <tr key={r.id} onClick={() => setOpen(r)} className="border-t border-line cursor-pointer hover:bg-gold-soft/50">
                <td className="px-3 py-3 whitespace-nowrap tabular-nums hidden md:table-cell">{fmtDate(r.created_at)}</td>
                <td className="px-4 py-3 font-bold">{r.matchmaker.name}</td>
                <td className="px-4 py-3">{r.groom_name}</td>
                <td className="px-3 py-3 hidden md:table-cell">{r.bride_name}</td>
                <td className="px-4 py-3"><GrandchildBadge c={r} /></td>
                <td className="px-4 py-3 tabular-nums">{fmtMoney(r.amount)}</td>
                <td className="px-4 py-3"><span className={`inline-block px-3 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
              </tr>
            ))}
            {data && data.claims.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-soft">אין בקשות להצגה</td></tr>}
            {!data && !error && <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-soft">טוען…</td></tr>}
          </tbody>
        </table>
      </div>

      </>}

      {open && <ClaimModal claim={open} demo={!!demo} canEdit={canEdit} onClose={() => setOpen(null)} onChanged={async () => { await load(); setOpen(null) }} />}
    </div>
  )
}

function GrandchildBadge({ c }: { c: AdminClaim }) {
  if (!c.is_grandchild) return <span className="text-ink-soft">—</span>
  const ok = c.verification?.result === 'verified'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${ok ? 'text-[#2F6B4F]' : 'text-[#9A5B13]'}`}>
      {ok ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}{ok ? 'אומת' : 'לא נמצא'}
    </span>
  )
}

function ClaimModal({ claim, demo, canEdit, onClose, onChanged }: { claim: AdminClaim; demo: boolean; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [amount, setAmount] = useState(claim.amount != null ? String(claim.amount) : '')
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [log, setLog] = useState<LogRow[]>([])
  const [revealed, setRevealed] = useState<{ groom?: string; bride?: string }>({})

  useEffect(() => {
    if (demo) return
    fetch(`/api/admin/matchmaker-grants/${claim.id}`, { cache: 'no-store' }).then(r => r.json()).then(d => setLog(d.log ?? [])).catch(() => {})
  }, [claim.id, demo])

  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (demo) return
    setBusy(true); setErr('')
    const res = await fetch(`/api/admin/matchmaker-grants/${claim.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, amount, ...extra }),
    })
    setBusy(false)
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'שגיאה'); return }
    onChanged()
  }
  async function reveal(who: 'groom' | 'bride') {
    if (demo) return
    const res = await fetch(`/api/admin/matchmaker-grants/${claim.id}/reveal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ who }) })
    if (res.ok) setRevealed(r => ({ ...r, [who]: undefined, [who === 'groom' ? 'groom' : 'bride']: '' }))
    if (res.ok) { const d = await res.json(); setRevealed(r => ({ ...r, [who]: d.id_number ?? '' })) }
  }

  const decided = claim.status !== 'pending'
  const v = claim.verification
  return (
    <Modal open onClose={onClose} size="lg" title={`${claim.groom_name} ו${claim.bride_name}`}
      footer={claim.status === 'paid' || !canEdit ? undefined : (
        <div className="flex flex-wrap gap-2 w-full">
          {claim.status !== 'approved' && !rejecting && <button disabled={busy} onClick={() => act('approve')} className="h-10 px-5 rounded-lg bg-navy text-white font-bold text-sm disabled:opacity-50">אישור</button>}
          {claim.status === 'approved' && <button disabled={busy} onClick={() => act('paid')} className="h-10 px-5 rounded-lg bg-gold text-navy-dark font-bold text-sm disabled:opacity-50">סימון כשולם</button>}
          {claim.status !== 'rejected' && !rejecting && <button disabled={busy} onClick={() => setRejecting(true)} className="h-10 px-5 rounded-lg border border-line bg-white text-ink text-sm">דחייה</button>}
          {rejecting && <>
            <button disabled={busy || !reason.trim()} onClick={() => act('reject', { reason })} className="h-10 px-5 rounded-lg bg-[#9A5B13] text-white font-bold text-sm disabled:opacity-50">אישור דחייה</button>
            <button onClick={() => setRejecting(false)} className="h-10 px-4 rounded-lg border border-line bg-white text-sm">ביטול</button>
          </>}
        </div>
      )}>
      <div className="space-y-5 text-sm">
        <div className="flex items-center gap-2"><span className={`inline-block px-3 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[claim.status]}`}>{STATUS_LABEL[claim.status]}</span>
          <span className="text-ink-soft">הוגש {fmtDate(claim.created_at)} · שידוך מתאריך {fmtDate(claim.match_date)}</span></div>

        <div className="grid sm:grid-cols-2 gap-3">
          {(['groom', 'bride'] as const).map(w => (
            <div key={w} className="rounded-lg border border-line p-3 space-y-1">
              <div className="text-xs font-bold text-gold">{w === 'groom' ? 'החתן' : 'הכלה'}</div>
              <div className="font-bold">{claim[`${w}_name`]}</div>
              {claim[`${w}_id_masked`] && <div className="flex items-center gap-2 text-ink-soft"><span dir="ltr" className="tabular-nums">{revealed[w] || claim[`${w}_id_masked`]}</span>
                {!revealed[w] && <button onClick={() => reveal(w)} className="inline-flex items-center gap-1 text-xs text-navy underline"><Eye className="w-3 h-3" />הצג (נרשם ביומן)</button>}</div>}
              <div className="text-ink-soft">אב: {claim[`${w}_father_name`] || '—'} · <span dir="ltr">{claim[`${w}_phone`] || '—'}</span></div>
              <div className="text-ink-soft">אם: {claim[`${w}_mother_name`] || '—'} · <span dir="ltr">{claim[`${w}_mother_phone`] || '—'}</span></div>
              <div className="text-ink-soft">{claim[`${w}_address`] || '—'}{claim[`${w}_circle`] ? ` · חוג ${claim[`${w}_circle`]}` : ''}</div>
            </div>
          ))}
        </div>

        {reasonsText(claim.reasons) && <div className="rounded-lg border border-line p-3">
          <div className="text-xs font-bold text-gold mb-1">סיבות למלגה</div>
          <div>{reasonsText(claim.reasons)}</div>
        </div>}
        {claim.second_matchmaker && <div className="rounded-lg border border-line p-3">
          <div className="text-xs font-bold text-gold mb-1">שדכן נוסף</div>
          <div className="font-bold">{claim.second_matchmaker.first_name} {claim.second_matchmaker.last_name}{claim.second_matchmaker.circle ? ` · חוג ${claim.second_matchmaker.circle}` : ''}</div>
          <div className="text-ink-soft"><span dir="ltr">{claim.second_matchmaker.phone}</span> · {claim.second_matchmaker.email} · {claim.second_matchmaker.address}, {claim.second_matchmaker.city}</div>
        </div>}

        <div className="rounded-lg border border-line p-3">
          <div className="text-xs font-bold text-gold mb-1">שדכן</div>
          <div className="font-bold">{claim.matchmaker.name} · {claim.matchmaker.city}</div>
          <div className="text-ink-soft" dir="ltr" style={{ textAlign: 'right' }}>{claim.matchmaker.phone} · {claim.matchmaker.email}</div>
        </div>

        {claim.is_grandchild && (
          <div className="rounded-lg bg-gold-soft border-r-4 border-gold p-3 space-y-1">
            <div className="font-bold">סומן כנכד החתם סופר: {claim.grandchild_side ? SIDE_LABEL[claim.grandchild_side] : ''}</div>
            {v?.result === 'verified'
              ? v.matches.map((m, i) => <div key={i}>אומת: {m.name}{m.family_name ? `, משפחת ${m.family_name}` : ''} ({m.side === 'groom' ? 'חתן' : 'כלה'}, לפי {m.matched_on === 'id_number' ? 'ת״ז צאצא' : 'ת״ז בן/בת זוג'})</div>)
              : <div>לא נמצא במאגר הצאצאים. המלצה בלבד, ההחלטה שלך.</div>}
            {v && <div className="text-xs text-ink-soft">נבדק {fmtDate(v.checked_at)}</div>}
            {!demo && canEdit && <button onClick={() => act('recheck')} disabled={busy} className="text-xs text-navy underline">בדיקה חוזרת</button>}
          </div>
        )}

        <label className="block">
          <span className="text-xs font-bold text-ink-soft">סכום מלגה (₪)</span>
          <div className="flex gap-2 mt-1">
            <input className={`${inputCls} w-40`} inputMode="numeric" value={amount} disabled={claim.status === 'paid' || !canEdit} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} />
            {claim.status !== 'paid' && canEdit && <button onClick={() => act('amount')} disabled={busy} className="h-10 px-4 rounded-lg border border-line bg-white text-sm">שמירת סכום</button>}
          </div>
        </label>

        {rejecting && <label className="block"><span className="text-xs font-bold text-ink-soft">סיבת הדחייה (תישלח לשדכן)</span>
          <textarea className="mt-1 w-full rounded-lg border border-line bg-white p-3 text-sm" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}
        {decided && claim.reject_reason && <div className="text-ink-soft">סיבת דחייה: {claim.reject_reason}</div>}
        {err && <div role="alert" className="rounded-lg bg-red-50 text-red-700 px-3 py-2">{err}</div>}

        {log.length > 0 && <div>
          <div className="text-xs font-bold text-ink-soft mb-1">יומן</div>
          <ul className="space-y-1 text-xs text-ink-soft">{log.map((l, i) => <li key={i}>{new Date(l.created_at).toLocaleString('he-IL')} · {l.actor ?? ''} · {ACTION_LABEL[l.action] ?? l.action}{l.detail ? `: ${l.detail}` : ''}</li>)}</ul>
        </div>}
      </div>
    </Modal>
  )
}

function SettingsPanel({ settings, onSaved }: { settings: Data['settings']; onSaved: () => void }) {
  const [s, setS] = useState({
    regular: settings.regular_amount?.toString() ?? '', enlarged: settings.enlarged_amount?.toString() ?? '', max: settings.max_claims_per_matchmaker?.toString() ?? '',
    wait: String(settings.claim_wait_days ?? 7), open: settings.claims_open_from ?? '',
  })
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState(false)
  async function save() {
    setSaved(false)
    const res = await fetch('/api/admin/matchmaker-grants/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regular_amount: s.regular, enlarged_amount: s.enlarged, max_claims_per_matchmaker: s.max, claim_wait_days: s.wait, claims_open_from: s.open }) })
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error ?? 'שגיאה'); return }
    setSaved(true); onSaved()
  }
  const field = (label: string, key: 'regular' | 'enlarged' | 'max' | 'wait', hint: string) => (
    <label className="block"><span className="text-sm font-bold">{label}</span><span className="block text-xs text-ink-soft">{hint}</span>
      <input className={`${inputCls} w-full mt-1`} inputMode="numeric" value={s[key]} onChange={e => setS({ ...s, [key]: e.target.value.replace(/\D/g, '') })} /></label>
  )
  return (
    <div className="rounded-xl border border-line bg-paper p-5 max-w-xl">
      <div className="space-y-4">
        {field('מלגה רגילה (₪)', 'regular', 'מוצע אוטומטית בבקשה רגילה')}
        {field('מלגה מוגדלת (₪)', 'enlarged', 'מוצע אוטומטית כשסומן נכד החתם סופר')}
        {field('מקסימום בקשות לשדכן', 'max', 'ריק = ללא הגבלה. אפשר להגדיר הגבלה פרטנית לכל שדכן בלשונית "שדכנים"')}
        <label className="block"><span className="text-sm font-bold">פתיחת הגשת בקשות</span><span className="block text-xs text-ink-soft">לא לפני תאריך זה (ברירת מחדל: ה׳ בטבת, 15.12.2026)</span>
          <input type="date" className={`${inputCls} w-full mt-1`} value={s.open} onChange={e => setS({ ...s, open: e.target.value })} /></label>
        {field('ימי המתנה אחרי ההרשמה', 'wait', 'שדכן יכול להגיש בקשה רק כך וכך ימים אחרי שנרשם')}
        {err && <div role="alert" className="text-sm text-red-700">{err}</div>}
        {saved && <div role="status" className="text-sm text-[#2F6B4F]">ההגדרות נשמרו</div>}
        <button onClick={save} className="h-10 px-5 rounded-lg bg-navy text-white font-bold text-sm">שמירה</button>
      </div>
    </div>
  )
}
