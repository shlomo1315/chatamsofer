'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useIsAdmin } from '@/components/StaffPermissions'
import { LineageTreePicker } from '../../BeneficiaryForm'
import { validateIsraeliId, validatePhone } from '@/lib/validation'
import { childrenPayload, emptyChild, isLinkedToMaternity, docTypeOf, type EditableChild } from '@/lib/childrenEditor'
import { isoToDmy, dmyToIso, diffFields, normalizeId, type FieldDef, type Change } from './editLogic'
import StatusControl from '../StatusControl'
import BeneficiaryActions from '../BeneficiaryActions'
import DocumentsManager from '../DocumentsManager'
import './bx.css'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const WIFE_PRIMARY = ['גרושה', 'אלמנה']
const MARRIED = 'נשואים'
const SEG: { label: string; match: string[]; set: string }[] = [
  { label: 'נשואים', match: ['נשואים'], set: 'נשואים' },
  { label: 'אלמן', match: ['אלמן'], set: 'אלמן' },
  { label: 'אלמנה', match: ['אלמנה'], set: 'אלמנה' },
  { label: 'גרוש/ה', match: ['גרוש', 'גרושה'], set: 'גרוש' },
]

export interface SheetDefaults {
  family_name: string; id_number: string; id_doc_type: 'id' | 'passport'; full_name: string
  phone: string; phone2: string; email: string; address: string; city: string
  birth_date: string; gender: string; marital_status: string
  spouse_name: string; spouse_id_number: string; spouse_doc_type: 'id' | 'passport'
  spouse_birth_date: string; spouse_phone: string; community_affiliation: string
  notes: string; lineage_node_id: string; lineage_manual: string[]; is_special: boolean
  eligibility_status: string; children: EditableChild[]
  created_at: string; registration_source: string
}

interface Note { id: string; body: string; author_name: string | null; created_at: string }
interface KidRow { key: number; c: EditableChild }

const fmtNote = (iso: string) => {
  const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`
}

function initialVals(d: SheetDefaults): Record<string, string> {
  return {
    family_name: d.family_name, full_name: d.full_name, id_number: d.id_number, birth_date: isoToDmy(d.birth_date),
    spouse_name: d.spouse_name, spouse_id_number: d.spouse_id_number, spouse_birth_date: isoToDmy(d.spouse_birth_date),
    spouse_phone: d.spouse_phone, marital_status: d.marital_status, community_affiliation: d.community_affiliation,
    phone: d.phone, phone2: d.phone2, email: d.email, address: d.address, city: d.city, notes: d.notes,
  }
}

export default function BeneficiaryEditSheet({ beneficiaryId, defaults }: { beneficiaryId: string; defaults: SheetDefaults }) {
  const router = useRouter()
  const isAdmin = useIsAdmin()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [orig, setOrig] = useState(() => initialVals(defaults))
  const [vals, setVals] = useState(orig)
  const [origKids, setOrigKids] = useState<EditableChild[]>(defaults.children)
  const nextKey = useRef(1000)
  const mkRows = (cs: EditableChild[]): KidRow[] => cs.map((c, i) => ({ key: i, c }))
  const [kids, setKids] = useState<KidRow[]>(() => mkRows(defaults.children))
  const [origLin, setOrigLin] = useState({ node: defaults.lineage_node_id, manual: defaults.lineage_manual, special: defaults.is_special })
  const [lin, setLin] = useState(origLin)
  const [pathState, setPath] = useState<string[]>([])
  const [pendingNode, setPendingNode] = useState<{ id: string; path: string[] } | null>(null)
  const [maternityDel, setMaternityDel] = useState<string[]>([])
  const [modal, setModal] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState<Note[]>([])
  const [noteText, setNoteText] = useState('')
  const [errMsg, setErrMsg] = useState('')
  const [docSnap] = useState(0)

  const showToast = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 1800) }, [])
  const set = (k: string, v: string) => setVals(p => ({ ...p, [k]: v }))
  const editing = mode === 'edit' && isAdmin

  const marital = vals.marital_status
  const primaryIsWife = WIFE_PRIMARY.includes(marital)
  const married = marital === MARRIED
  const fullTitle = [vals.family_name, vals.full_name].filter(Boolean).join(' ')
  const title = married && vals.spouse_name ? `${fullTitle} ו${vals.spouse_name}` : fullTitle

  // שרשרת הדורות מהעץ
  useEffect(() => {
    if (!lin.node) return
    let alive = true
    fetch('/api/lineage?all=1').then(r => r.json()).then((d: { nodes?: { id: string; name: string; parent_id: string | null }[] }) => {
      if (!alive) return
      const m = new Map((d.nodes ?? []).map(n => [n.id, n]))
      const out: string[] = []
      const seen = new Set<string>()
      let cur = m.get(lin.node)
      while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.unshift(cur.name); cur = cur.parent_id ? m.get(cur.parent_id) : undefined }
      setPath(out)
    }).catch(() => {})
    return () => { alive = false }
  }, [lin.node])

  const loadNotes = useCallback(async () => {
    try {
      const d = await (await fetch(`/api/admin/beneficiary-notes?beneficiaryId=${beneficiaryId}`)).json()
      setNotes(Array.isArray(d.notes) ? d.notes : [])
    } catch { /* ריק */ }
  }, [beneficiaryId])
  useEffect(() => {
    const t = setTimeout(() => void loadNotes(), 0)
    return () => clearTimeout(t)
  }, [loadNotes])

  const sendNote = async () => {
    const t = noteText.trim()
    if (!t) return
    const r = await fetch('/api/admin/beneficiary-notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ beneficiaryId, body: t }) })
    const d = await r.json().catch(() => ({}))
    if (r.ok && d.note) { setNotes(p => [...p, d.note]); setNoteText('') } else showToast(d.error || 'שמירת ההערה נכשלה')
  }

  // ── שינויים ──
  const defs: FieldDef[] = useMemo(() => {
    const who = primaryIsWife ? 'האישה' : 'בעל'
    const out: FieldDef[] = [
      { key: 'family_name', label: `שם משפחה (${who})`, section: 's1' },
      { key: 'full_name', label: `שם פרטי (${who})`, section: 's1' },
      { key: 'id_number', label: `ת.ז. ${primaryIsWife ? 'האישה' : 'הבעל'}`, section: 's1' },
      { key: 'birth_date', label: `תאריך לידה (${who})`, section: 's1' },
    ]
    if (married) out.push(
      { key: 'spouse_name', label: 'שם האישה', section: 's1' },
      { key: 'spouse_id_number', label: 'ת.ז. האישה', section: 's1' },
      { key: 'spouse_birth_date', label: 'תאריך לידה (אישה)', section: 's1' },
      { key: 'spouse_phone', label: 'טלפון האישה', section: 's1' },
    )
    out.push(
      { key: 'marital_status', label: 'מצב משפחתי', section: 's1' },
      { key: 'community_affiliation', label: 'קהילה', section: 's1' },
      { key: 'phone', label: 'טלפון ראשי', section: 's3' },
      { key: 'phone2', label: 'טלפון משני', section: 's3' },
      { key: 'email', label: 'אימייל', section: 's3' },
      { key: 'address', label: 'רחוב ומספר', section: 's3' },
      { key: 'city', label: 'עיר', section: 's3' },
      { key: 'notes', label: 'הערות לתיק', section: 's6' },
    )
    return out
  }, [primaryIsWife, married])

  const changes: Change[] = useMemo(() => {
    // שדות שהוסתרו (אישה כשלא נשואים) לא נספרים כשינוי רק אם גם הערך המקורי זהה
    const out = diffFields(defs, orig, vals)
    const byKey = new Map(origKids.map((c, i) => [i, c]))
    const live = new Set(kids.map(r => r.key))
    kids.forEach((r, idx) => {
      if (r.key >= 1000) { out.push({ label: `ילד חדש · ${r.c.name || idx + 1}`, section: 's2' }); return }
      const o = byKey.get(r.key)
      if (!o) return
      if (r.c.name.trim() !== o.name.trim()) out.push({ label: `שם ילד ${idx + 1}`, section: 's2' })
      if (r.c.birth_date !== o.birth_date) out.push({ label: `תאריך לידה · ${r.c.name || idx + 1}`, section: 's2' })
    })
    origKids.forEach((o, i) => { if (!live.has(i)) out.push({ label: `הסרת ילד · ${o.name || i + 1}`, section: 's2' }) })
    if (lin.node !== origLin.node) out.push({ label: 'שושלת', section: 's4' })
    if (lin.special !== origLin.special) out.push({ label: 'מקרה מיוחד', section: 's4' })
    return out
  }, [defs, orig, vals, kids, origKids, lin, origLin])

  const n = changes.length
  const changedSec = (s: string) => changes.some(c => c.section === s)
  const isCh = (k: string) => editing && (vals[k] ?? '').trim() !== (orig[k] ?? '').trim()

  const discard = useCallback(() => {
    setVals(orig); setKids(mkRows(origKids)); setLin(origLin); setMaternityDel([]); setErrMsg('')
  }, [orig, origKids, origLin])

  const requestView = () => { if (mode === 'edit' && n) setModal('m-leave'); else setMode('view') }
  const cancel = () => { discard(); setMode('view') }

  // ── שמירה ──
  const validate = (): string | null => {
    if (!vals.family_name.trim()) return 'שם משפחה הוא שדה חובה'
    if (!vals.full_name.trim()) return 'שם פרטי הוא שדה חובה'
    if (!vals.id_number.trim()) return 'ת.ז. היא שדה חובה'
    if (defaults.id_doc_type === 'id' && !validateIsraeliId(vals.id_number)) return 'תעודת זהות ישראלית לא תקינה (כולל ספרת ביקורת)'
    if (dmyToIso(vals.birth_date) === null || !vals.birth_date.trim()) return 'תאריך לידה לא תקין (יי.חח.שששש)'
    if (married) {
      if (!vals.spouse_name.trim()) return 'שם האישה הוא שדה חובה'
      if (dmyToIso(vals.spouse_birth_date) === null || !vals.spouse_birth_date.trim()) return 'תאריך הלידה של האישה לא תקין'
      if (vals.spouse_id_number && defaults.spouse_doc_type === 'id' && !validateIsraeliId(vals.spouse_id_number)) return 'ת.ז. האישה לא תקינה'
      if (vals.spouse_phone && !validatePhone(vals.spouse_phone)) return 'טלפון האישה לא תקין'
      if (vals.spouse_id_number && normalizeId(vals.spouse_id_number, defaults.spouse_doc_type) === normalizeId(vals.id_number, defaults.id_doc_type)) return 'ת.ז. הבעל והאישה לא יכולות להיות זהות'
      if (vals.spouse_phone && vals.phone && vals.spouse_phone.replace(/\D/g, '') === vals.phone.replace(/\D/g, '')) return 'טלפון הבעל והאישה לא יכולים להיות זהים'
    }
    if (vals.phone && !validatePhone(vals.phone)) return 'טלפון ראשי לא תקין'
    if (vals.phone2 && !validatePhone(vals.phone2)) return 'טלפון משני לא תקין'
    if (vals.email && !EMAIL_REGEX.test(vals.email)) return 'כתובת אימייל לא תקינה'
    for (const [i, r] of kids.entries()) {
      if (!r.c.name.trim()) return `חסר שם לילד ${i + 1}`
      if (!r.c.birth_date || dmyToIso(isoToDmy(r.c.birth_date) || r.c.birth_date) === null) return `תאריך לידה לא תקין לילד ${i + 1}`
      if (!r.c.gender) return `חסר מין לילד ${i + 1}`
    }
    return null
  }

  const save = async (): Promise<boolean> => {
    const e = validate()
    if (e) { setErrMsg(e); setModal(null); showToast(e); return false }
    setErrMsg('')
    setSaving(true)
    try {
      const docType = defaults.id_doc_type
      const { children, children_count } = childrenPayload(kids.map(r => r.c))
      const nul = (s: string) => s.trim() || null
      const payload = {
        family_name: vals.family_name.trim(), full_name: vals.full_name.trim(),
        id_number: normalizeId(vals.id_number, docType), id_doc_type: docType,
        phone: vals.phone.trim(), phone2: nul(vals.phone2), email: nul(vals.email),
        address: nul(vals.address), city: nul(vals.city),
        birth_date: dmyToIso(vals.birth_date) || null,
        gender: primaryIsWife ? 'female' : 'male', marital_status: vals.marital_status,
        spouse_name: married ? nul(vals.spouse_name) : null,
        spouse_id_number: married ? nul(normalizeId(vals.spouse_id_number, defaults.spouse_doc_type)) : null,
        spouse_doc_type: married ? defaults.spouse_doc_type : null,
        spouse_birth_date: married ? dmyToIso(vals.spouse_birth_date) || null : null,
        spouse_phone: married ? nul(vals.spouse_phone) : null,
        community_affiliation: nul(vals.community_affiliation),
        children, children_count, notes: nul(vals.notes),
        lineage_node_id: lin.special ? null : lin.node || null,
        lineage_manual: lin.special ? [] : lin.manual.map(s => s.trim()).filter(Boolean),
        ...(lin.special || origLin.special ? { is_special: lin.special } : {}),
      }
      const r = await fetch('/api/admin/beneficiaries/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: beneficiaryId, payload, maternityToDelete: maternityDel }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErrMsg(d.error || 'השמירה נכשלה'); setModal(null); showToast(d.error || 'השמירה נכשלה'); return false }
      // מקור חדש = מה שנשמר
      const nv = { ...vals }
      setOrig(nv)
      const saved = kids.map(r => r.c)
      setOrigKids(saved); setKids(mkRows(saved))
      setOrigLin(lin); setMaternityDel([])
      setModal(null); setMode('view'); showToast('השינויים נשמרו')
      router.refresh()
      return true
    } catch { setErrMsg('שגיאת רשת'); showToast('שגיאת רשת'); return false }
    finally { setSaving(false) }
  }

  const approveBirth = async (idx: number) => {
    const c = kids[idx]?.c
    if (!c?.maternity_aid_id) return
    const r = await fetch('/api/admin/beneficiaries/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve-birth', id: beneficiaryId, aidId: c.maternity_aid_id }),
    })
    if (!r.ok) { showToast('אישור הלידה נכשל'); return }
    // סימון הילד כמאושר בכרטסת עצמה, בלי לגעת בשאר השינויים שלא נשמרו
    const upd = (cs: EditableChild[]) => cs.map(x => (x.maternity_aid_id === c.maternity_aid_id ? { ...x, birth_status: 'approved' as const } : x))
    const next = upd(origKids)
    const { children } = childrenPayload(next)
    await fetch('/api/admin/beneficiaries/update', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', id: beneficiaryId, payload: { children } }),
    })
    setOrigKids(next); setKids(p => p.map(row => ({ ...row, c: upd([row.c])[0] })))
    setModal(null); showToast('הלידה אושרה'); router.refresh()
  }

  // ── חלונות ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setModal(null) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [])

  const setKid = (key: number, patch: Partial<EditableChild>) => setKids(p => p.map(r => (r.key === key ? { ...r, c: { ...r.c, ...patch } } : r)))
  const removeKid = (key: number) => {
    const r = kids.find(x => x.key === key)
    if (!r) return
    if (isLinkedToMaternity(r.c) && r.c.maternity_aid_id) {
      if (!window.confirm(`${r.c.name || 'הילד'} מקושר לתיק יולדת. למחוק גם את תיק היולדת בשמירה?`)) return
      setMaternityDel(p => [...p, r.c.maternity_aid_id as string])
    }
    setKids(p => p.filter(x => x.key !== key))
  }
  const addKid = () => setKids(p => [...p, { key: nextKey.current++, c: emptyChild() }])

  const pendingApprove = kids.findIndex(r => r.c.birth_status === 'pending' && r.c.maternity_aid_id)
  const pendingKid = pendingApprove >= 0 ? kids[pendingApprove].c : null
  const manualNames = lin.manual
  const path = lin.node ? pathState : []
  const chain = [...path, ...manualNames]
  const selfName = fullTitle || 'הצאצא'
  const genLabel = chain.length ? `דור ${chain.length + 1}` : ''

  const V = (k: string, ltr?: boolean, num?: boolean) => {
    const x = (vals[k] ?? '').trim()
    return <span className={`v${ltr ? ' ltr' : ''}${num ? ' num' : ''}${x ? '' : ' empty'}`}>{x || 'לא הוזן'}</span>
  }
  const F = (k: string, label: string | null, opts: { cls?: string; ltr?: boolean; num?: boolean; mode?: 'numeric' | 'tel'; ph?: string } = {}) => (
    <div className={`f${opts.cls ? ' ' + opts.cls : ''}${isCh(k) ? ' changed' : ''}`}>
      {label && <label>{label}</label>}
      {V(k, opts.ltr, opts.num)}
      <input className="in" dir={opts.ltr ? 'ltr' : undefined} inputMode={opts.mode} placeholder={opts.ph} value={vals[k] ?? ''} onChange={e => set(k, e.target.value)} />
    </div>
  )

  const segActive = (s: typeof SEG[number]) => s.match.includes(marital)
  const pickSeg = (s: typeof SEG[number]) => {
    if (segActive(s)) return
    const wasDivorced = ['גרוש', 'גרושה'].includes(origMaritalRef.current)
    set('marital_status', s.label === 'גרוש/ה' ? (wasDivorced ? origMaritalRef.current : defaults.gender === 'female' ? 'גרושה' : 'גרוש') : s.set)
  }
  const origMaritalRef = useRef(orig.marital_status)
  useEffect(() => { origMaritalRef.current = orig.marital_status }, [orig.marital_status])

  const nav: { id: string; label: string; em?: string }[] = [
    { id: 's1', label: 'משפחה' }, { id: 's2', label: 'ילדים', em: String(kids.length) },
    { id: 's3', label: 'קשר וכתובת' }, { id: 's4', label: 'שושלת', em: genLabel || undefined },
    { id: 's5', label: 'מסמכים' }, { id: 's6', label: 'הערות' },
  ]
  const kidsNote = `${kids.length} ילדים${pendingKid ? ' · לידה אחת ממתינה לאישור' : ''}`
  const changeList = n ? changes.map((c, i) => <li key={i}>{c.label}</li>) : <li className="none">עוד לא שינית כלום.</li>
  const initial = (defaults.family_name || defaults.full_name || '?').trim().charAt(0)
  const created = defaults.created_at ? isoToDmy(defaults.created_at) : ''

  return (
    <div className={`bx ${editing ? 'm-edit' : 'm-view'} ${isAdmin ? 'role-admin' : 'role-staff'}`}>
      <main className="page">
        <div className="crumb"><Link href="/admin/beneficiaries">צאצאים</Link> ‹ <b>{fullTitle}</b></div>

        <section className="head">
          <div className="head-main">
            <div className="mono">{initial}</div>
            <div className="who">
              <h1>{title}</h1>
              <div className="meta">
                <span>ת.ז. <b className="ltr num">{vals.id_number}</b></span>
                {vals.city && <><i></i><span>{vals.city}</span></>}
                <i></i><span><b className="num">{kids.length}</b> ילדים</span>
                {created && <><i></i><span>{defaults.registration_source || 'נרשם'} · <b className="num">{created}</b></span></>}
              </div>
            </div>
            <div className="acts">
              <div className="mode" role="group" aria-label="מצב התיק">
                <button className={mode === 'view' ? 'on' : ''} onClick={requestView} data-m="view"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>צפייה</button>
                <button className={editing ? 'on' : ''} onClick={() => isAdmin && setMode('edit')} data-m="edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>עריכה <span className="tag">מנהל</span></button>
              </div>
              <span className="lock"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>צפייה בלבד · עריכה למנהל</span>
              {isAdmin && <StatusControl id={beneficiaryId} status={defaults.eligibility_status as never} advance />}
              {isAdmin && <button className="btn icon only-view" onClick={() => setModal('m-more')} aria-label="פעולות נוספות"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg></button>}
            </div>
          </div>
          <div className="edit-strip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 20h4L19 9l-4-4L4 16z" /></svg>מצב עריכה · שום דבר לא נשמר עד הלחיצה על שמירה</div>
        </section>

        <nav className="secnav" aria-label="חלקי התיק">
          {nav.map(a => (
            <a key={a.id} href={`#${a.id}`} className={editing && changedSec(a.id) ? 'chg' : ''}>{a.label}{a.em && <> <em>{a.em}</em></>}<span className="d"></span></a>
          ))}
        </nav>

        {errMsg && <div role="alert" style={{ background: '#FBEAEA', color: '#9B2C2C', border: '1px solid #EBC9C9', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 14 }}>{errMsg}</div>}

        <div className="grid">
          <div className="sheet">
            <section className="sec" id="s1" data-wide>
              <div className="sec-h"><span className="no">01</span><h2>משפחה</h2></div>
              <div className="sec-b">
                <p className="sub">{primaryIsWife ? 'האישה' : 'הבעל'}</p>
                <div className="fields">
                  {F('family_name', 'שם משפחה')}
                  {F('full_name', 'שם פרטי')}
                  {F('id_number', 'ת.ז.', { ltr: true, num: true, mode: 'numeric' })}
                  {F('birth_date', 'תאריך לידה', { ltr: true, num: true, mode: 'numeric', ph: 'יי.חח.שששש' })}
                </div>
                {married && <>
                  <p className="sub">האישה</p>
                  <div className="fields">
                    {F('spouse_name', 'שם')}
                    {F('spouse_id_number', 'ת.ז.', { ltr: true, num: true, mode: 'numeric' })}
                    {F('spouse_birth_date', 'תאריך לידה', { ltr: true, num: true, mode: 'numeric', ph: 'יי.חח.שששש' })}
                    {F('spouse_phone', 'טלפון האישה', { ltr: true, num: true, mode: 'tel' })}
                  </div>
                </>}
                <div className="fields">
                  <div className={`f w2${isCh('marital_status') ? ' changed' : ''}`}><label>מצב משפחתי</label><span className="v">{marital || 'לא הוזן'}</span>
                    <div className="seg">{SEG.map(s => <button key={s.label} type="button" className={segActive(s) ? 'on' : ''} onClick={() => pickSeg(s)}>{s.label}</button>)}</div></div>
                  {F('community_affiliation', 'קהילה', { cls: 'w2', ph: '[להשלים]' })}
                </div>
              </div>
            </section>

            <section className="sec" id="s2" data-wide>
              <div className="sec-h"><span className="no">02</span><h2>ילדים</h2><span className="note">{kidsNote}</span></div>
              <div className="sec-b">
                <table className="kids">
                  <thead><tr><th>#</th><th>שם</th><th>מין</th><th>תאריך לידה</th><th>מסמך זיהוי</th><th>סטטוס</th><th></th></tr></thead>
                  <tbody>
                    {kids.map((r, i) => {
                      const c = r.c
                      const isNew = r.key >= 1000
                      const male = c.gender === 'male' || c.gender === 'זכר' || c.gender === 'בן'
                      const female = c.gender === 'female' || c.gender === 'נקבה' || c.gender === 'בת'
                      const dmy = isoToDmy(c.birth_date) || c.birth_date
                      const o = origKids[r.key]
                      const nameCh = editing && !!o && c.name.trim() !== o.name.trim()
                      const dateCh = editing && !!o && c.birth_date !== o.birth_date
                      const dt = docTypeOf(c)
                      return (
                        <tr key={r.key}>
                          <td className="num">{i + 1}</td>
                          <td><div className={`f${nameCh || (editing && isNew) ? ' changed' : ''}`}><span className="v">{c.name || 'לא הוזן'}</span><input className="in" value={c.name} onChange={e => setKid(r.key, { name: e.target.value })} /></div></td>
                          <td>{isNew && editing
                            ? <select className="in" style={{ display: 'block' }} value={c.gender} onChange={e => setKid(r.key, { gender: e.target.value })}><option value="">—</option><option value="male">בן</option><option value="female">בת</option></select>
                            : male ? 'בן' : female ? 'בת' : '—'}</td>
                          <td><div className={`f${dateCh || (editing && isNew) ? ' changed' : ''}`}><span className="v num">{dmy || 'לא הוזן'}</span>
                            <input className="in" dir="ltr" inputMode="numeric" placeholder="יי.חח.שששש" value={dmy}
                              onChange={e => { const t = e.target.value; setKid(r.key, { birth_date: dmyToIso(t) || (t.trim() ? t : '') }) }} /></div></td>
                          <td className="k-id">{isNew && editing
                            ? <input className="in" dir="ltr" inputMode="numeric" value={c.id_number} onChange={e => setKid(r.key, { id_number: e.target.value })} />
                            : <>{dt === 'passport' && 'דרכון '}<span className="ltr num">{c.id_number || '—'}</span></>}</td>
                          <td className="k-st">
                            {c.birth_status === 'pending' ? <><span className="pill w">{female ? 'ממתינה' : 'ממתין'} לאישור לידה</span>
                              {isAdmin && c.maternity_aid_id && <button type="button" className="btn sm gold" style={{ marginInlineStart: 6 }} onClick={() => setModal('m-birth')}>אישור לידה</button>}</>
                              : c.birth_status === 'approved' ? <span className="pill ok2">לידה מאושרת</span>
                              : <span className="pill n">{female ? 'רשומה' : 'רשום'}</span>}
                          </td>
                          <td className="k-del"><button type="button" className="del" aria-label={female ? 'הסרת ילדה' : 'הסרת ילד'} onClick={() => removeKid(r.key)}>✕</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <button type="button" className="btn sm add only-edit" onClick={addKid}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>הוספת ילד</button>
              </div>
            </section>

            <section className="sec" id="s3">
              <div className="sec-h"><span className="no">03</span><h2>קשר וכתובת</h2></div>
              <div className="sec-b">
                <div className="fields">
                  {F('phone', 'טלפון ראשי', { ltr: true, num: true, mode: 'tel' })}
                  {F('phone2', 'טלפון משני', { ltr: true, num: true, mode: 'tel', ph: 'לא חובה' })}
                  {F('email', 'אימייל', { cls: 'w2', ltr: true })}
                  {F('address', 'רחוב ומספר', { cls: 'w2' })}
                  {F('city', 'עיר', { cls: 'w2' })}
                </div>
              </div>
            </section>

            <section className="sec" id="s4">
              <div className="sec-h"><span className="no">04</span><h2>שושלת</h2>{genLabel && <span className="note">{genLabel} לחתם סופר</span>}</div>
              <div className="sec-b">
                {lin.special ? <p className="sub" style={{ margin: 0 }}>מקרה מיוחד — ללא שושלת</p> : (
                  <div className="chain">
                    {chain.map((nm, i) => <span key={i} style={{ display: 'contents' }}><span className={i >= path.length ? 'manual' : ''}>{nm}</span><b>‹</b></span>)}
                    <span className="me">{selfName}</span>
                  </div>
                )}
                <div className="chain-foot">
                  <span>קו מקווקו = הוזן ידנית, טרם אומת</span><span style={{ flex: 1 }}></span>
                  {editing && <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginInlineEnd: 12, fontSize: 13 }}><input type="checkbox" checked={lin.special} onChange={e => setLin(p => ({ ...p, special: e.target.checked }))} />מקרה מיוחד</label>}
                  {!lin.special && <button type="button" className="btn sm" onClick={() => { setPendingNode(null); setModal('m-tree') }}><span className="only-view">הצגת העץ</span><span className="only-edit">עריכת השושלת</span></button>}
                </div>
              </div>
            </section>

            <section className="sec" id="s5">
              <div className="sec-h"><span className="no">05</span><h2>מסמכים</h2></div>
              <div className="sec-b" key={docSnap}>
                <DocumentsManager beneficiaryId={beneficiaryId} beneficiaryName={fullTitle} />
              </div>
            </section>

            <section className="sec" id="s6" data-wide>
              <div className="sec-h"><span className="no">06</span><h2>הערות לתיק</h2></div>
              <div className="sec-b">
                <div className="fields c3"><div className={`f${isCh('notes') ? ' changed' : ''}`} style={{ gridColumn: '1/-1', border: 0 }}>
                  <span className={`v${vals.notes.trim() ? '' : ' empty'}`}>{vals.notes.trim() || 'לא הוזן'}</span>
                  <textarea className="in" value={vals.notes} onChange={e => set('notes', e.target.value)} /></div></div>
              </div>
            </section>
          </div>

          <aside className="aside">
            <section className="box changes" aria-live="polite">
              <div className="box-h">שינויים שלא נשמרו <span className="c">{n}</span></div>
              <ul className="chg-list">{changeList}</ul>
              <div className="chg-acts"><button className="btn" onClick={cancel}>ביטול</button><button className="btn pri" disabled={!n || saving} onClick={() => void save()}>שמירת השינויים</button></div>
            </section>

            <section className="box view-box">
              <div className="box-h">מצב התיק</div>
              <ul className="state">
                <li><span className="ic y">✓</span><a href="#s1">משפחה</a></li>
                <li><span className={`ic ${pendingKid ? 'w' : 'y'}`}>{pendingKid ? '!' : '✓'}</span><a href="#s2">ילדים{pendingKid && <small>לידה של {pendingKid.name} ממתינה לאישור</small>}</a></li>
                <li><span className="ic y">✓</span><a href="#s3">קשר וכתובת</a></li>
                <li><span className={`ic ${lin.node || lin.special ? 'y' : 'w'}`}>{lin.node || lin.special ? '✓' : '!'}</span><a href="#s4">שושלת{manualNames.length > 0 && <small>{manualNames.length === 1 ? 'דור אחד הוזן ידנית' : `${manualNames.length} דורות הוזנו ידנית`}</small>}</a></li>
                <li><span className="ic y">✓</span><a href="#s5">מסמכים</a></li>
              </ul>
            </section>

            <section className="box">
              <div className="box-h">יומן המשפחה <span className="c">{notes.length}</span></div>
              <ul className="log">
                {notes.map(nt => (
                  <li key={nt.id} className={nt.author_name ? '' : 'sys'}>
                    <div className="by"><b>{nt.author_name || 'מערכת'}</b> · <span className="num">{fmtNote(nt.created_at)}</span></div><p>{nt.body}</p>
                  </li>
                ))}
              </ul>
              <div className="compose"><input placeholder="הערה ליומן…" value={noteText} onChange={e => setNoteText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void sendNote() }} /><button className="btn pri sm" onClick={() => void sendNote()}>שליחה</button></div>
            </section>

            <details className="box">
              <summary>תיעוד <span className="c">0</span><svg className="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6" /></svg></summary>
              <div className="inner">אין תיעוד בתיק הזה עדיין.</div>
            </details>
          </aside>
        </div>
      </main>

      <div className="mbar"><div className="t"><span>{n}</span> שינויים<small>לא נשמרו עדיין</small></div><button className="btn" onClick={cancel}>ביטול</button><button className="btn pri" disabled={!n || saving} onClick={() => void save()}>שמירה</button></div>

      <div className={`ov${modal === 'm-leave' ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && setModal(null)} role="dialog" aria-modal="true" aria-labelledby="lt">
        <div className="modal">
          <div className="m-h"><h3 id="lt">יש שינויים שלא נשמרו</h3><button className="x" onClick={() => setModal(null)} aria-label="סגירה">✕</button></div>
          <div className="m-b"><p>לפני שחוזרים לצפייה, מה לעשות עם <b>{n}</b> השינויים?</p><ul>{changeList}</ul></div>
          <div className="m-f"><button className="btn" onClick={() => { discard(); setModal(null); setMode('view') }}>ביטול השינויים</button><button className="btn pri" disabled={saving} onClick={() => void save()}>שמירה וחזרה לצפייה</button></div>
        </div>
      </div>

      <div className={`ov${modal === 'm-birth' ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && setModal(null)} role="dialog" aria-modal="true">
        <div className="modal">
          <div className="m-h"><h3>אישור הלידה של {pendingKid?.name}</h3><button className="x" onClick={() => setModal(null)} aria-label="סגירה">✕</button></div>
          <div className="m-b"><p>נולד/ה ב-<span className="num">{pendingKid ? isoToDmy(pendingKid.birth_date) : ''}</span>.</p><p style={{ color: 'var(--mut)', fontSize: 'var(--t-sm)', margin: 0 }}>אחרי האישור המשפחה תוכל להגיש בקשה להטבות היולדת.</p></div>
          <div className="m-f"><button className="btn" onClick={() => setModal(null)}>ביטול</button><button className="btn pri" onClick={() => void approveBirth(pendingApprove)}>אישור הלידה</button></div>
        </div>
      </div>

      <div className={`ov${modal === 'm-more' ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && setModal(null)} role="dialog" aria-modal="true">
        <div className="modal">
          <div className="m-h"><h3>פעולות נוספות</h3><button className="x" onClick={() => setModal(null)} aria-label="סגירה">✕</button></div>
          <div className="m-b" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BeneficiaryActions id={beneficiaryId} name={fullTitle} />
          </div>
        </div>
      </div>

      <div className={`ov${modal === 'm-tree' ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && setModal(null)} role="dialog" aria-modal="true">
        <div className="modal lg">
          <div className="m-h"><h3>השושלת של {fullTitle}</h3><button className="x" onClick={() => setModal(null)} aria-label="סגירה">✕</button></div>
          <div className="m-b">
            {modal === 'm-tree' && <LineageTreePicker initialNodeId={lin.node} selfName={selfName} onSelect={(id, p) => setPendingNode({ id, path: p })} />}
          </div>
          <div className="m-f"><button className="btn" onClick={() => setModal(null)}>סגירה</button>
            <button className="btn pri only-edit" onClick={() => { if (pendingNode && pendingNode.id !== lin.node) { setLin(p => ({ ...p, node: pendingNode.id })); setPath(pendingNode.path) } setModal(null); showToast('השושלת עודכנה') }}>שמירת השושלת</button></div>
        </div>
      </div>

      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </div>
  )
}
