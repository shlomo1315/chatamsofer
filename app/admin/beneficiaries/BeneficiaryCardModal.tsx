'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, ChevronUp, Lock, Pencil, Plus, Send, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Beneficiary, ELIGIBILITY_LABELS, MATERNITY_STATUS_LABELS } from '@/types'
import { displayChain, registrantGeneration } from '@/lib/lineageDisplayChain'
import { docTypeLabel } from '@/lib/docTypes'
import { docViewUrl } from '@/lib/docUrl'
import { registrationSourceLabel } from '@/lib/distributionSources'
import {
  draftFrom, buildCardPayload, validateCardPayload, readiness, MARITAL_OPTIONS,
  type CardDraft, type CardSource,
} from '@/lib/beneficiaryCardEdit'
import RecordMailDialog from '@/components/admin/system/RecordMailDialog'
import LineageStairs, { type StairGen } from '@/components/lineage/LineageStairs'
import LineageChainEditButton from '@/components/lineage/LineageChainEditButton'
import { useCan } from '@/components/StaffPermissions'

// כרטסת משפחה מהירה בדף הצאצאים: חלונית באמצע המסך עם שש לשוניות ועריכה במקום.
// ⚠️ ילדים, שרשרת והערות לא נטענים עם הרשימה (שדות כבדים), לכן נשלפים כאן לפי המזהה.
// ⚠️ אישור והעברה לבדיקה מעמיקה מתבצעים בכרטסת המלאה: שם רצה האזהרה על אישור
// אבות ממתינים, שליחת המייל וסנכרון נדרים. אין לשכפל את הלוגיקה הזו כאן.
// 🔒 ת״ז (בעל, אישה, ילדים) לא נערכת כאן — ראו lib/beneficiaryCardEdit.
// 🔴 הצבעים של סדר הדורות מחושבים בשרת (/api/admin/beneficiaries/[id]/lineage).

const FIELDS = 'full_name, family_name, birth_date, phone, phone2, email, email_verified_at, spouse_name, spouse_birth_date, spouse_phone, marital_status, city, address, notes, children, lineage_chain, lineage_manual, past_benefits, deep_review_reason, registration_source'
type Extra = CardSource & Pick<Beneficiary, 'lineage_chain' | 'lineage_manual' | 'past_benefits' | 'registration_source' | 'email_verified_at'> & { deep_review_reason?: string | null }
type Log = { id: string; action: string; created_at: string }
type Doc = { id: string; doc_type: string; file_name: string | null; file_url: string | null; uploaded_at: string }
type Recipient = { id: string; approval_status: string | null; registered_at: string | null; distribution: { name: string } | { name: string }[] | null }
type Aid = { id: string; baby_name: string | null; status: string; created_at: string }
type Loaded = { extra: Extra; log: Log[]; docs: Doc[]; recipients: Recipient[]; aids: Aid[] }

const C = { navy: '#141D33', gold: '#B8913A', ok: '#15803d', wait: '#ea580c', bad: '#dc2626', chk: '#2563eb' }
const TONE: Record<string, string> = {
  pending: C.wait, review: C.chk, docs_pending: C.chk, docs_returned: C.chk,
  deep_review: C.chk, approved: C.ok, rejected: C.bad,
}
const TABS = ['פרטי המשפחה', 'ילדים', 'סדר הדורות', 'הטבות ורישום', 'הערות ומסמכים', 'היסטוריה'] as const
const RECIPIENT_STATUS: Record<string, [string, string]> = {
  approved: ['אושרו', C.ok], pending: ['נרשמו · ממתין לאישור', C.wait], rejected: ['נדחו', C.bad],
}
const PAST_BENEFITS: [keyof NonNullable<Beneficiary['past_benefits']>, string][] = [
  ['recovery_home', 'בית החלמה'], ['food_card', 'כרטיס מזון'], ['holiday_grant', 'מענק לקראת החגים'],
  ['catering', 'קייטרינג'], ['loan', 'הלוואה'], ['other', 'אחר'],
]

const fullName = (b: Pick<Beneficiary, 'family_name' | 'full_name'>) => [b.family_name, b.full_name].filter(Boolean).join(' ') || b.full_name
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '')
const years = (d?: string | null) => {
  if (!d) return null
  const n = Math.floor((Date.now() - new Date(d).getTime()) / 31557600000)
  return Number.isFinite(n) && n >= 0 ? n : null
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

const inputCls = 'block w-full min-h-10 rounded-lg border border-[#cfc8b6] bg-white px-3 text-[16px] text-[#1B2338] focus:outline-2 focus:outline-offset-1 focus:outline-[#B8913A]'
const btn = 'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-[10px] border px-3 text-[14px] font-bold transition-colors sm:px-4 sm:text-[15px]'
const btnGhost = `${btn} border-[#E7E1D3] bg-white text-[#1B2338] hover:border-[#cfc8b6]`

const Tag = ({ children, color }: { children: React.ReactNode; color?: string }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-[#E7E1D3] bg-white px-2 text-[11px] font-bold" style={{ color: color ?? '#7A7363' }}>{children}</span>
)
const Muted = ({ children }: { children: React.ReactNode }) => <span className="font-normal text-[#7A7363]">{children}</span>

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 overflow-hidden rounded-[14px] border border-[#E7E1D3] bg-white">
      <h2 className="flex items-baseline gap-2 border-b border-[#E7E1D3] px-4 py-3 text-[15px] font-extrabold">{title}{sub && <Muted><small className="text-[13px]">· {sub}</small></Muted>}</h2>
      {children}
    </section>
  )
}
// רשת שדות: הקווים בין התאים הם הרקע שמבצבץ ב-gap
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-px bg-[#E7E1D3] sm:grid-cols-2">{children}</div>

function Field({ label, tag, wide, locked, editing, ltr, value, children }: {
  label: string; tag?: React.ReactNode; wide?: boolean; locked?: boolean; editing?: boolean; ltr?: boolean
  value: React.ReactNode; children?: React.ReactNode
}) {
  const showInput = editing && !locked && children
  const stripes = editing && locked ? { background: 'repeating-linear-gradient(135deg,#FBFAF6 0 8px,#F3EFE4 8px 9px)' } : undefined
  return (
    <div className={`min-w-0 px-4 py-3 ${wide ? 'sm:col-span-2' : ''} ${locked ? 'bg-[#FBFAF6]' : 'bg-white'}`} style={stripes}>
      <div className="mb-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[#7A7363]">
        {label}
        {locked && <Tag><Lock size={10} />לא ניתן לשינוי</Tag>}
        {tag}
      </div>
      {showInput ? children : (
        <div dir={ltr ? 'ltr' : undefined} className={`flex min-h-[30px] items-center text-[16px] font-medium [overflow-wrap:anywhere] ${ltr ? 'justify-end tabular-nums' : ''} ${locked ? 'text-[#5C5648]' : ''}`}>
          {value || <Muted>לא הוזן</Muted>}
        </div>
      )}
    </div>
  )
}

export default function BeneficiaryCardModal({ rows, index, onIndex, onClose }: {
  rows: Beneficiary[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const b = rows[index]
  const [tab, setTab] = useState(0)
  const [editing, setEditing] = useState(false)
  const total = rows.length
  const go = (s: number) => { if (!editing && total > 1) onIndex((index + s + total) % total) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (document.querySelector('[data-mail-dialog]') || t?.isContentEditable) return
      // Escape בעריכה מבטל את העריכה (בלי לשמור) ולא סוגר את החלונית
      if (e.key === 'Escape') { if (editing) setEditing(false); else onClose(); return }
      if (editing || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) || total < 2) return
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); onIndex((index + 1) % total) }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); onIndex((index - 1 + total) % total) }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [editing, index, total, onIndex, onClose])

  if (!b) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#141d3355] p-2 backdrop-blur-[6px] sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !editing) onClose() }}>
      <FamilyCard key={b.id} b={b} tab={tab} setTab={setTab} editing={editing} setEditing={setEditing}
        position={`${index + 1} מתוך ${total}`} canNav={total > 1 && !editing} onPrev={() => go(-1)} onNext={() => go(1)} onClose={onClose} />
    </div>
  )
}

function FamilyCard({ b, tab, setTab, editing, setEditing, position, canNav, onPrev, onNext, onClose }: {
  b: Beneficiary; tab: number; setTab: (t: number) => void; editing: boolean; setEditing: (v: boolean) => void
  position: string; canNav: boolean; onPrev: () => void; onNext: () => void; onClose: () => void
}) {
  const router = useRouter()
  const canEdit = useCan('beneficiaries', 'edit')
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [gens, setGens] = useState<StairGen[] | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [lineageKey, setLineageKey] = useState(0)
  const [draft, setDraft] = useState<CardDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [mailTo, setMailTo] = useState<string | null>(null)
  const [verify, setVerify] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => { dialogRef.current?.focus() }, [])

  useEffect(() => {
    let alive = true
    const sb = createClient()
    Promise.all([
      sb.from('beneficiaries').select(FIELDS).eq('id', b.id).single(),
      sb.from('activity_log').select('id, action, created_at').eq('entity_id', b.id).order('created_at', { ascending: false }).limit(30),
      sb.from('documents').select('id, doc_type, file_name, file_url, uploaded_at').eq('beneficiary_id', b.id).order('uploaded_at', { ascending: false }),
      sb.from('distribution_recipients').select('id, approval_status, registered_at, distribution:distributions(name)').eq('beneficiary_id', b.id).order('registered_at', { ascending: false }),
      sb.from('maternity_aids').select('id, baby_name, status, created_at').eq('beneficiary_id', b.id).order('created_at', { ascending: false }),
    ]).then(([a, l, d, r, m]) => {
      if (!alive || !a.data) return
      setLoaded({
        extra: a.data as unknown as Extra, log: (l.data as Log[] | null) ?? [], docs: (d.data as Doc[] | null) ?? [],
        recipients: (r.data as unknown as Recipient[] | null) ?? [], aids: (m.data as Aid[] | null) ?? [],
      })
    })
    return () => { alive = false }
  }, [b.id, reloadKey])

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/beneficiaries/${b.id}/lineage`)
      .then((r) => (r.ok ? r.json() : { gens: [] }))
      .then((j: { gens?: StairGen[] }) => { if (alive) setGens(j.gens ?? []) })
      .catch(() => { if (alive) setGens([]) })
    return () => { alive = false }
  }, [b.id, lineageKey])

  // הנתונים העדכניים: השורה מהרשימה, ומעליה מה שנשלף לפי המזהה
  const cur = { ...b, ...(loaded?.extra ?? {}) } as Beneficiary & Partial<Extra>
  const status = cur.eligibility_status
  const tone = TONE[status] ?? C.wait
  const kids = loaded?.extra.children ?? []
  const chain = displayChain(loaded?.extra.lineage_chain, null, loaded?.extra.lineage_manual)
  const generation = registrantGeneration(chain)
  const stairs: StairGen[] = gens?.length ? [...gens, { generation: gens[gens.length - 1].generation + 1, name: fullName(cur), badge: 'הנרשם' }] : []
  const ready = readiness(cur, chain.length)
  const pendingBirth = kids.some((c) => c.birth_status === 'pending')
  const href = `/admin/beneficiaries/${b.id}`
  const d = editing ? draft : null
  const set = (k: Exclude<keyof CardDraft, 'children'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = e.target.value
    setDraft((p) => (p ? { ...p, [k]: v } : p))
  }
  const setKid = (i: number, k: 'name' | 'birth_date' | 'gender', v: string) =>
    setDraft((p) => (p ? { ...p, children: p.children.map((c, j) => (j === i ? { ...c, [k]: v } : c)) } : p))

  const startEdit = () => {
    if (!loaded) return
    setDraft(draftFrom(cur))
    setError('')
    setEditing(true)
  }
  const save = async () => {
    if (!draft || !loaded) return
    const payload = buildCardPayload(cur, draft)
    if (Object.keys(payload).length === 0) { setEditing(false); return }
    const bad = validateCardPayload(payload, draft)
    if (bad) { setError(bad); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/beneficiaries/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: b.id, payload }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'השמירה נכשלה'); return }
      setEditing(false)
      setReloadKey((k) => k + 1)
      router.refresh()
    } catch {
      setError('השמירה נכשלה, בדקו את החיבור ונסו שוב')
    } finally {
      setSaving(false)
    }
  }

  const loading = <p className="text-sm text-[#7A7363]">טוען…</p>
  const chainEdit = canEdit && loaded ? (
    <LineageChainEditButton compact beneficiaryId={b.id}
      initialChain={chain.map((g) => ({ generation: g.generation, name: g.name, relation: g.relation ?? null }))}
      onSaved={() => { setReloadKey((k) => k + 1); setLineageKey((k) => k + 1) }} />
  ) : null
  // שליחת קישור אימות דרך אותו נתיב של הכרטסת המלאה (EmailRow), שמוגן ב-beneficiaries/edit
  const sendVerification = async () => {
    setVerify('sending')
    try {
      const res = await fetch(`/api/admin/beneficiaries/${b.id}/email`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      setVerify(res.ok && j.sent !== 0 ? 'sent' : 'failed')
    } catch {
      setVerify('failed')
    }
  }
  const verifyBtn = canEdit && cur.email && !cur.email_verified_at && !editing ? (
    verify === 'sent' ? <Tag color={C.ok}><Check size={10} />קישור אימות נשלח</Tag>
      : (
        <button type="button" onClick={sendVerification} disabled={verify === 'sending'} title="שליחת קישור לאימות המייל לכתובת הזו"
          className="inline-flex min-h-7 items-center gap-1 rounded-full border border-[#B8913A] bg-white px-2.5 text-[12px] font-bold text-[#141D33] hover:bg-[#F7F1E2] disabled:opacity-60">
          <Send size={11} />{verify === 'sending' ? 'שולח…' : verify === 'failed' ? 'השליחה נכשלה · לנסות שוב' : 'שליחת קישור לאימות'}
        </button>
      )
  ) : null
  const emailTag = cur.email ? (cur.email_verified_at ? <Tag color={C.ok}>אומת</Tag> : <><Tag color={C.wait}>לא אומת</Tag>{verifyBtn}</>) : null
  const iconBtn = 'grid size-11 place-items-center rounded-[10px] text-white/80 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`כרטסת משפחה: ${fullName(cur)}`} dir="rtl"
      className="flex max-h-[calc(100dvh-16px)] w-full max-w-[980px] flex-col overflow-hidden rounded-[14px] bg-[#FAF8F3] text-[15px] leading-normal text-[#1B2338] shadow-[0_30px_80px_#0007] outline-none sm:max-h-[calc(100dvh-48px)]">
      <header className="bg-[#141D33] px-4 pt-4 text-white sm:px-6 sm:pt-6">
        <div className="flex items-start gap-4 sm:items-center">
          <div className="grid size-[52px] flex-none place-items-center rounded-full border-[1.5px] border-[#B8913A] text-[22px] font-extrabold text-[#B8913A] max-sm:hidden">
            {(cur.family_name || cur.full_name || '?').trim().charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-extrabold leading-tight sm:text-[28px]">{fullName(cur)}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-white/75">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-bold text-white" style={{ background: `${tone}33`, borderColor: `${tone}88` }}>
                <i className="size-[7px] rounded-full" style={{ background: tone }} />
                {ELIGIBILITY_LABELS[status as keyof typeof ELIGIBILITY_LABELS] ?? status}
              </span>
              {cur.id_number && <span>ת״ז <b dir="ltr" className="font-bold text-white tabular-nums">{cur.id_number}</b></span>}
              {cur.id_number && <span className="inline-flex items-center gap-1 rounded-full border border-white/30 px-2.5 py-0.5 text-[12px] text-white/80"><Lock size={11} />נעול</span>}
              {generation && <span>דור <b className="font-bold text-white tabular-nums">{generation}</b> לחתם סופר</span>}
            </div>
          </div>
          <div className="flex flex-none items-center gap-2">
            {canEdit && (
              <button type="button" onClick={editing ? undefined : startEdit} disabled={!loaded} aria-pressed={editing}
                className={`${btn} border-[#B8913A] ${editing ? 'bg-[#B8913A] text-[#141D33]' : 'bg-transparent text-white hover:bg-white/10'} disabled:opacity-50`}>
                <Pencil size={16} />{editing ? 'עורך עכשיו' : <><span className="sm:hidden">עריכה</span><span className="max-sm:hidden">עריכת פרטים</span></>}
              </button>
            )}
            <span className="text-[12px] text-white/60 tabular-nums max-sm:hidden">{position}</span>
            <button type="button" aria-label="הקודם" onClick={onPrev} disabled={!canNav} className={`${iconBtn} max-sm:hidden`}><ChevronUp size={20} /></button>
            <button type="button" aria-label="הבא" onClick={onNext} disabled={!canNav} className={`${iconBtn} max-sm:hidden`}><ChevronDown size={20} /></button>
            <button type="button" aria-label="סגירה" onClick={onClose} className={iconBtn}><X size={20} /></button>
          </div>
        </div>
        <nav role="tablist" aria-label="לשוניות הכרטסת" className="mt-4 flex flex-wrap gap-x-1 sm:mt-6">
          {TABS.map((t, i) => {
            const n = i === 1 ? kids.length || cur.children_count || 0 : i === 2 ? stairs.length : null
            return (
              <button key={t} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)}
                className={`flex min-h-11 items-center gap-2 whitespace-nowrap border-b-[3px] px-2.5 py-2.5 sm:px-4 sm:py-3 ${tab === i ? 'border-[#B8913A] font-extrabold text-white' : 'border-transparent font-medium text-white/65 hover:text-white'}`}>
                {t}
                {n ? <span className="rounded-full bg-white/15 px-2 text-[11px] font-bold tabular-nums">{n}</span> : null}
                {i === 1 && pendingBirth && <i className="size-[7px] rounded-full" style={{ background: C.wait }} title="לידה ממתינה לאישור" />}
              </button>
            )
          })}
        </nav>
      </header>
      <div className="h-[3px] flex-none bg-[#B8913A]" />

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 0 && (
          <>
            <Card title="הבעל" sub="הנרשם">
              <Grid>
                <Field label="שם פרטי" editing={editing} value={cur.full_name}><input className={inputCls} value={d?.full_name ?? ''} onChange={set('full_name')} /></Field>
                <Field label="שם משפחה" editing={editing} value={cur.family_name}><input className={inputCls} value={d?.family_name ?? ''} onChange={set('family_name')} /></Field>
                <Field label="ת״ז" locked editing={editing} ltr value={cur.id_number} />
                <Field label="תאריך לידה" editing={editing} value={fmt(cur.birth_date)}><input type="date" className={inputCls} value={d?.birth_date ?? ''} onChange={set('birth_date')} /></Field>
                <Field label="טלפון" editing={editing} ltr value={cur.phone}><input dir="ltr" type="tel" className={inputCls} value={d?.phone ?? ''} onChange={set('phone')} /></Field>
                <Field label="טלפון נוסף" editing={editing} ltr value={cur.phone2}><input dir="ltr" type="tel" placeholder="05X-XXX-XXXX" className={inputCls} value={d?.phone2 ?? ''} onChange={set('phone2')} /></Field>
                <Field label="מייל" tag={emailTag} wide editing={editing} ltr value={cur.email ? (
                  <button type="button" onClick={() => setMailTo(cur.email!)} className="underline decoration-[#E7E1D3] underline-offset-4 hover:decoration-[#B8913A]" title="שליחת מייל">{cur.email}</button>
                ) : null}>
                  <input dir="ltr" type="email" className={inputCls} value={d?.email ?? ''} onChange={set('email')} />
                </Field>
              </Grid>
            </Card>
            <Card title="האישה">
              <Grid>
                <Field label="שם" editing={editing} value={cur.spouse_name}><input className={inputCls} value={d?.spouse_name ?? ''} onChange={set('spouse_name')} /></Field>
                <Field label="ת״ז" locked editing={editing} ltr value={cur.spouse_id_number} />
                <Field label="תאריך לידה" editing={editing} value={fmt(cur.spouse_birth_date)}><input type="date" className={inputCls} value={d?.spouse_birth_date ?? ''} onChange={set('spouse_birth_date')} /></Field>
                <Field label="טלפון" editing={editing} ltr value={cur.spouse_phone}><input dir="ltr" type="tel" className={inputCls} value={d?.spouse_phone ?? ''} onChange={set('spouse_phone')} /></Field>
              </Grid>
            </Card>
            <Card title="בית ומשפחה">
              <Grid>
                <Field label="מצב משפחתי" editing={editing} value={cur.marital_status}>
                  <select className={inputCls} value={d?.marital_status ?? ''} onChange={set('marital_status')}>
                    {!MARITAL_OPTIONS.includes(d?.marital_status ?? '') && <option value={d?.marital_status ?? ''}>{d?.marital_status || 'לא הוזן'}</option>}
                    {MARITAL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="עיר" editing={editing} value={cur.city}><input className={inputCls} value={d?.city ?? ''} onChange={set('city')} /></Field>
                <Field label="כתובת" wide editing={editing} value={cur.address}><input className={inputCls} value={d?.address ?? ''} onChange={set('address')} /></Field>
              </Grid>
            </Card>
          </>
        )}

        {tab === 1 && (!loaded ? loading : (
          <>
            {kids.length === 0 && <p className="text-[#7A7363]">אין פרטי ילדים</p>}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
              {kids.map((c, i) => {
                const pend = c.birth_status === 'pending'
                const age = years(c.birth_date)
                const k = d?.children[i]
                return (
                  <div key={i} className={`flex gap-3 rounded-[14px] border bg-white p-4 ${pend ? 'border-dashed border-[#ea580c]' : 'border-[#E7E1D3]'} ${k ? 'flex-col' : 'items-center'}`}>
                    {k ? (
                      <>
                        <label className="text-[12px] text-[#7A7363]">שם<input className={`${inputCls} mt-0.5`} value={k.name} onChange={(e) => setKid(i, 'name', e.target.value)} /></label>
                        <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2">
                          <label className="text-[12px] text-[#7A7363]">תאריך לידה<input type="date" className={`${inputCls} mt-0.5`} value={k.birth_date} onChange={(e) => setKid(i, 'birth_date', e.target.value)} /></label>
                          <label className="text-[12px] text-[#7A7363]">מין
                            <select className={`${inputCls} mt-0.5`} value={k.gender} onChange={(e) => setKid(i, 'gender', e.target.value)}>
                              <option value="">לא הוזן</option><option value="male">בן</option><option value="female">בת</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[#5C5648]" style={{ background: 'repeating-linear-gradient(135deg,#FBFAF6 0 8px,#F3EFE4 8px 9px)' }}>
                          ת״ז <b dir="ltr" className="tabular-nums">{c.id_number || 'לא הוזנה'}</b><Tag><Lock size={10} />לא ניתן לשינוי</Tag>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="grid size-10 flex-none place-items-center rounded-full bg-[#F1ECDD] font-extrabold text-[#141D33]">{(c.name || '?').charAt(0)}</div>
                        <div className="min-w-0">
                          <b className="block">{c.name || 'שם חסר'}</b>
                          {pend
                            ? <span className="text-[13px] font-bold" style={{ color: C.wait }}>הלידה ממתינה לאישור{c.birth_date ? ` · ${fmt(c.birth_date)}` : ''}</span>
                            : <span className="text-[13px] text-[#7A7363]">
                                {c.birth_date ? `${c.gender === 'female' ? 'נולדה' : 'נולד'} ${fmt(c.birth_date)}` : 'תאריך לידה לא הוזן'}
                                {age !== null && c.birth_date ? ` · ${c.gender === 'female' ? 'בת' : 'בן'} ${age}` : ''}
                              </span>}
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            {canEdit && !editing && (
              <Link href={`${href}/edit`} className={`${btnGhost} mt-4`} title="הוספת ילד עם ת״ז נעשית בטופס העריכה המלא"><Plus size={16} />הוספת ילד</Link>
            )}
          </>
        ))}

        {tab === 2 && (!gens || !loaded ? loading : stairs.length ? (
          <LineageStairs framed gens={stairs} action={chainEdit} />
        ) : (
          <Card title="סדר הדורות">
            <div className="flex flex-wrap items-center gap-3 p-4"><Muted>לא מולא סדר הדורות</Muted>{chainEdit}</div>
          </Card>
        ))}

        {tab === 3 && (!loaded ? loading : (
          <>
            <Card title="רישום">
              <Grid>
                <Field label="סטטוס" value={<span style={{ color: tone }} className="font-bold">{ELIGIBILITY_LABELS[status as keyof typeof ELIGIBILITY_LABELS] ?? status}</span>} />
                <Field label="תאריך הרשמה" value={<span className="tabular-nums">{fmt(cur.created_at)}</span>} />
                <Field label="ערוץ הרשמה" value={registrationSourceLabel(cur.registration_source)} />
                <Field label="אימות מייל" value={cur.email_verified_at
                  ? <span className="font-bold" style={{ color: C.ok }}>בוצע · {fmt(cur.email_verified_at)}</span>
                  : <span className="font-bold" style={{ color: C.bad }}>לא בוצע</span>} />
              </Grid>
            </Card>
            <Card title="הטבות">
              {loaded.recipients.length === 0 && loaded.aids.length === 0 ? (
                <p className="px-4 py-3 text-[#7A7363]">לא נרשמו להטבות</p>
              ) : (
                <Grid>
                  {loaded.recipients.map((r) => {
                    const [label, color] = RECIPIENT_STATUS[r.approval_status ?? ''] ?? ['נרשמו', C.wait]
                    return <Field key={r.id} label={one(r.distribution)?.name ?? 'חלוקה'} value={<span className="font-bold" style={{ color }}>{label}{r.registered_at ? <Muted> · {fmt(r.registered_at)}</Muted> : null}</span>} />
                  })}
                  {loaded.aids.map((m) => (
                    <Field key={m.id} label={`מענק לידה${m.baby_name ? ` · ${m.baby_name}` : ''}`}
                      value={<span className="font-bold" style={{ color: m.status === 'completed' ? C.ok : m.status === 'cancelled' ? C.bad : C.wait }}>{MATERNITY_STATUS_LABELS[m.status as keyof typeof MATERNITY_STATUS_LABELS] ?? m.status}<Muted> · {fmt(m.created_at)}</Muted></span>} />
                  ))}
                  {(loaded.recipients.length + loaded.aids.length) % 2 === 1 && <div className="bg-white max-sm:hidden" />}
                </Grid>
              )}
            </Card>
            {(() => {
              const past = PAST_BENEFITS.filter(([k]) => cur.past_benefits?.[k]).map(([, l]) => l)
              return past.length ? (
                <Card title="הטבות קודמות" sub="לפי הצהרה ברישום">
                  <div className="flex flex-wrap gap-2 p-4">{past.map((p) => <Tag key={p}>{p}</Tag>)}</div>
                </Card>
              ) : null
            })()}
          </>
        ))}

        {tab === 4 && (!loaded ? loading : (
          <>
            <Card title="הערות מזכירות">
              <div className="grid gap-px bg-[#E7E1D3]">
                <Field label="הערה פנימית" editing={editing} value={cur.notes?.trim() ? <span className="whitespace-pre-wrap">{cur.notes}</span> : <Muted>אין הערה</Muted>}>
                  <textarea rows={3} className={`${inputCls} py-2`} value={d?.notes ?? ''} onChange={set('notes')} />
                </Field>
                {cur.deep_review_reason && <Field label="הערת בדיקה מעמיקה" value={cur.deep_review_reason} />}
              </div>
            </Card>
            <Card title="מסמכים" sub={`${loaded.docs.length} קבצים`}>
              {loaded.docs.length === 0 ? <p className="px-4 py-3 text-[#7A7363]">לא הועלו מסמכים</p> : (
                <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                  {loaded.docs.map((doc) => {
                    const ext = (doc.file_name || doc.file_url || '').split('.').pop()?.toUpperCase()
                    return (
                      <a key={doc.id} href={docViewUrl(doc.file_url)} target="_blank" rel="noopener noreferrer"
                        className="rounded-lg border border-[#E7E1D3] bg-white p-3 text-[14px] hover:border-[#B8913A]">
                        {docTypeLabel(doc.doc_type)}
                        <small className="block text-[#7A7363]">{ext && ext.length <= 4 ? `${ext} · ` : ''}{fmt(doc.uploaded_at)}</small>
                      </a>
                    )
                  })}
                </div>
              )}
            </Card>
          </>
        ))}

        {tab === 5 && (!loaded ? loading : (
          <Card title="יומן פעולות">
            {loaded.log.length === 0 ? <p className="px-4 py-3 text-[#7A7363]">אין פעולות מתועדות</p> : (
              <ul>
                {loaded.log.map((l) => (
                  <li key={l.id} className="flex gap-4 border-b border-[#E7E1D3] px-4 py-3 last:border-0">
                    <time className="w-[92px] flex-none text-[13px] text-[#7A7363] tabular-nums">{fmt(l.created_at)}</time>
                    <span>{l.action}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <footer className="flex flex-wrap items-center gap-3 border-t border-[#E7E1D3] bg-white px-4 py-3 sm:px-6">
        {editing ? (
          <>
            <span className="me-auto text-[14px] font-bold max-sm:basis-full" style={{ color: error ? C.bad : C.gold }} role={error ? 'alert' : undefined}>
              {error || 'עורך עכשיו · לא נשמר עדיין'}
            </span>
            <button type="button" onClick={save} disabled={saving} className={`${btn} border-[#B8913A] bg-[#B8913A] text-[#141D33] hover:brightness-95 disabled:opacity-60 max-sm:flex-1`}>
              <Check size={18} />{saving ? 'שומר…' : 'שמירת השינויים'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setError('') }} disabled={saving} className={`${btnGhost} max-sm:flex-1`}>ביטול</button>
          </>
        ) : (
          <>
            <div className="me-auto flex items-center gap-3 text-[13px] text-[#7A7363] max-sm:basis-full">
              <span><b className="text-[#1B2338] tabular-nums">{ready.done}/{ready.checks.length}</b> {ready.missing.length ? `מוכן לאישור · ${ready.missing.join(' · ')}` : 'מוכן לאישור'}</span>
              <span className="flex gap-1" aria-hidden>
                {ready.checks.map((c) => <i key={c.label} className="h-1 w-[22px] rounded-sm" style={{ background: c.ok ? C.ok : '#E7E1D3' }} title={c.label} />)}
              </span>
            </div>
            <Link href={href} title="הבדיקה המעמיקה מתבצעת בכרטסת המלאה" className={`${btnGhost} max-sm:flex-1`}>העבר לבדיקה מעמיקה</Link>
            <Link href={href} title="האישור מתבצע בכרטסת המלאה" className={`${btn} border-[#141D33] bg-[#141D33] text-white hover:bg-[#1D2845] max-sm:flex-1`}>אישור<Check size={18} /></Link>
            <Link href={href} className={`${btnGhost} max-sm:basis-full`}>פתיחת כרטסת מלאה</Link>
          </>
        )}
      </footer>
      {mailTo && <div data-mail-dialog className="contents"><RecordMailDialog to={mailTo} subject="הודעה מהיכל החתם סופר" onClose={() => setMailTo(null)} /></div>}
    </section>
  )
}
