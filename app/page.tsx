'use client'
import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import EmailInput from '@/components/ui/EmailInput'
import VerifyControl from '@/components/VerifyControl'

// רכיבים כבדים המופיעים רק עמוק בזרימת הרישום (לא במסך הפתיחה id-lookup) — נטענים עצלה
// כדי לא להיכנס לבאנדל הראשוני של הדף הציבורי. HebrewDatePicker טוען את @hebcal/core הכבד.
const CityStreetPicker = dynamic(() => import('@/components/ui/CityStreetPicker'), { ssr: false })
const HebrewDatePicker = dynamic(() => import('@/components/ui/HebrewDatePicker'), { ssr: false })
const ConfettiSuccess = dynamic(() => import('@/components/ui/ConfettiSuccess'), { ssr: false })
import { ViewDocButton, downloadDocDirect } from '@/components/ui/DocViewer'
import SignaturePad from '@/components/ui/SignaturePad'
import { useDocTypes } from '@/lib/useDocTypes'
import { UPLOAD_ACCEPT, UPLOAD_HINT } from '@/lib/uploads'
import { LOAN_DECLARATIONS, MATERNITY_SUBMIT_DAYS } from '@/lib/emailRequestForms'
import {
  Search, AlertCircle, Loader2, CheckCircle2, User,
  Baby, CreditCard, Gift, ChevronLeft, Phone, MapPin, Mail,
  Users, GitBranch, Heart, ArrowRight, Clock, Shield, Plus, Trash2, Check, X, Upload, FileText, HandCoins,
  AlertTriangle,
} from 'lucide-react'

// ─── Types ───

type Step =
  | 'id-lookup'
  | 'portal-auth'
  | 'not-found'
  | 'found-as-child'
  | 'register'
  | 'register-success'
  | 'dashboard'
  | 'docs-needed'
  | 'widow-dashboard'
  | 'new-birth'
  | 'new-silent-birth'
  | 'new-loan'
  | 'request-sent'

interface ParentLineage {
  parentName: string
  lineage_node_id: string | null
  lineage_chain: { generation: number; name: string; relation: 'son' | 'son_in_law' | null }[] | null
}
interface ChildMatchData {
  parentName: string
  childData: { name: string; id_number: string; birth_date: string; gender: string; marital_status: string }
  parentLineage?: ParentLineage
}

interface FoundBeneficiary {
  id: string
  full_name: string
  family_name?: string
  eligibility_status: string
  phone?: string
  phone2?: string
  spouse_phone?: string
  verified_phones?: string[]
  email?: string
  city?: string
  address?: string
  id_number?: string
  spouse_name?: string
  spouse_id_number?: string
  marital_status?: string
  children_count?: number
  required_docs?: string
  children?: Array<{ name?: string; birth_date?: string; gender?: string; id_number?: string; marital_status?: string }>
  lineage_node_id?: string
  lineage_manual?: string[]
  lineage_chain?: { generation: number; name: string; relation: 'son' | 'son_in_law' | null }[]
  created_at: string
}

// ─── Constants ───

const GENDER_BTN_SEL: Record<string, string> = {
  male: 'bg-blue-100 text-blue-800 border-blue-400',
  female: 'bg-pink-100 text-pink-800 border-pink-400',
}
const GENDER_BTN_UNSEL = 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'

const MARITAL_OPTIONS = [
  { value: 'נשואים', label: 'נשואים' },
  { value: 'גרוש', label: 'גרוש' },
  { value: 'גרושה', label: 'גרושה' },
  { value: 'אלמן', label: 'אלמן' },
  { value: 'אלמנה', label: 'אלמנה' },
]
// תחת "אחר" — כל מצבי המשפחה שאינם "נשואים"
const OTHER_MARITAL_OPTIONS = MARITAL_OPTIONS.filter(o => o.value !== 'נשואים')
const MARRIED_STATUSES = ['נשואים']

// פלטת צבעים לדורות — כל דור בגוון שונה (לציר הייחוס)
const GEN_COLORS = [
  { bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  { bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', dot: 'bg-sky-500' },
  { bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', dot: 'bg-teal-500' },
  { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
  { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200', dot: 'bg-orange-500' },
  { bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', dot: 'bg-rose-500' },
  { bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500' },
  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-800', border: 'border-fuchsia-200', dot: 'bg-fuchsia-500' },
]

const LOAN_PURPOSES = [
  { value: 'נישואי הבן/הבת' },
  { value: 'שמחה משפחתית' },
  { value: 'הוצאה רפואית' },
  { value: 'חובות מנישואי הילדים' },
  { value: 'רכישת דירה', desc: 'רק לדירה ראשונה, בעת הרכישה בפועל' },
  { value: 'אחר' },
]


const RECOVERY_HOMES_DEFAULT = ['אם וילד', 'טלזסטון', 'ביכורים']

// תוויות סוגי מסמכים (לפי המפתחות שהמזכירות מסמנת בצ'קליסט) — מקור אמת אחד
const DOC_LABELS: Record<string, string> = {
  id_husband:    'תעודת זהות — הבעל (כולל ספח)',
  id_wife:       'תעודת זהות — האשה (כולל ספח)',
  id_child:      'תעודת זהות — ילד (כולל ספח)',
  marriage_cert: 'תעודת נישואין',
  birth_cert:    'אישור לידה',
  address_proof: 'אישור כתובת מגורים',
  other:         'מסמך נוסף',
}

// ─── Shared helpers ───

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: React.ReactNode; hint?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500 mr-1">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

function TextInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 bg-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-indigo-500/80 focus:border-indigo-400 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.12)] placeholder:text-slate-400 transition-all duration-150 ${className}`}
      {...props}
    />
  )
}

// שדות תינוק בטופס הלידה (מין · שם אופציונלי · ת.ז/דרכון + אימות וכפילות).
// משמש גם ללידה רגילה (תינוק אחד) וגם ללידת תאומים (שני מופעים).
function BabyFields({
  title, accent = 'indigo', gender, name, idType, idNumber, noName, idError,
  onChange, setNoName, setIdError,
}: {
  title?: string
  accent?: 'indigo' | 'violet'
  gender: string
  name: string
  idType: string
  idNumber: string
  noName: boolean
  idError: string
  onChange: (field: 'baby_gender' | 'baby_name' | 'baby_id_type' | 'baby_id_number', value: string) => void
  setNoName: (v: boolean) => void
  setIdError: (msg: string) => void
}) {
  // בתאומים (title קיים) עוטפים כל תינוק במסגרת תוחמת עם כותרת בולטת בצבע משלו,
  // כדי שיהיה ברור לחלוטין איזה שדה שייך לאיזה ילד.
  const framed = !!title
  const theme = accent === 'violet'
    ? { border: 'border-violet-200', ring: 'bg-violet-50/40', head: 'bg-violet-100 text-violet-800' }
    : { border: 'border-indigo-200', ring: 'bg-indigo-50/40', head: 'bg-indigo-100 text-indigo-800' }
  return (
    <div className={`col-span-2 flex flex-col gap-4 ${framed ? `rounded-2xl border-2 ${theme.border} ${theme.ring} p-4` : ''}`}>
      {title && (
        <div className={`flex items-center gap-2 text-sm font-bold rounded-lg px-3 py-2 -mx-1 -mt-1 ${theme.head}`}>
          <Baby size={16} /> {title}
        </div>
      )}
      <Field label="מין הנולד/ת" required>
        <div className="flex gap-2">
          {[{ v: 'male', l: 'בן' }, { v: 'female', l: 'בת' }].map(({ v, l }) => (
            <button key={v} type="button"
              onClick={() => onChange('baby_gender', v)}
              className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all duration-150 ${
                gender === v ? GENDER_BTN_SEL[v] : GENDER_BTN_UNSEL
              }`}
            >{l}</button>
          ))}
        </div>
      </Field>
      {/* שם — אופציונלי. אם עדיין אין שם ניתן לסמן ולהשלים בכניסה הבאה */}
      {gender && (
        <Field label={gender === 'female' ? 'שם הנולדת' : 'שם הנולד'} hint="לא חובה — אם עדיין אין שם, ניתן לסמן ולהשלים בכניסה הבאה">
          <TextInput value={name}
            disabled={noName}
            className={noName ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}
            onChange={e => { onChange('baby_name', e.target.value); if (noName) setNoName(false) }}
            placeholder={noName ? 'יושלם בהמשך' : (gender === 'female' ? 'שם הנולדת' : 'שם הנולד')} />
          <div className="mt-2">
            <button type="button"
              onClick={() => { const next = !noName; setNoName(next); if (next) onChange('baby_name', '') }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${
                noName
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                  : 'bg-white border-indigo-200 text-indigo-600 hover:bg-indigo-50 hover:border-indigo-300'
              }`}>
              {noName ? <CheckCircle2 size={14} /> : <Clock size={14} />}
              {noName ? 'יושלם בהמשך' : 'עדיין אין שם'}
            </button>
            {noName && (
              <p className="mt-1.5 text-xs text-indigo-600">סומן — נזכיר לך להשלים את השם בכניסה הבאה לאזור האישי.</p>
            )}
          </div>
        </Field>
      )}
      {gender && (
        <Field label={gender === 'female' ? 'תעודת זהות של הנולדת' : 'תעודת זהות של הנולד'} required hint="עבור תושב חוץ יש לבחור דרכון">
          <div className="flex gap-2 mb-2">
            {[{ v: 'id', l: 'ת.ז ישראלית' }, { v: 'passport', l: 'דרכון' }].map(({ v, l }) => (
              <button key={v} type="button" onClick={() => onChange('baby_id_type', v)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-all duration-150 ${idType === v ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium' : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                {l}
              </button>
            ))}
          </div>
          <TextInput value={idNumber}
            className={idError ? 'border-red-400 focus:ring-red-400' : ''}
            onChange={e => { const v = idType === 'id' ? e.target.value.replace(/\D/g, '').slice(0, 9) : e.target.value; onChange('baby_id_number', v); setIdError('') }}
            dir="ltr" inputMode={idType === 'id' ? 'numeric' : 'text'}
            maxLength={idType === 'id' ? 9 : undefined}
            placeholder={idType === 'id' ? 'מספר תעודת זהות (9 ספרות)' : 'מספר דרכון'} required
            onBlur={async () => {
              const val = idNumber.trim()
              if (!val) return
              // ת.ז ישראלית — בדיקת תקינות תחילה
              if (idType === 'id') {
                const digits = val.replace(/\D/g, '')
                if (digits.length < 9) return
                if (!validateIsraeliId(digits)) { setIdError(''); return }
              }
              // בדיקה מיידית — האם כבר רשום במערכת (כצאצא או כילד אצל מישהו)
              try {
                const param = idType === 'id' ? `id=${encodeURIComponent(val)}` : `passport=${encodeURIComponent(val)}`
                const r = await fetch(`/api/portal/lookup?${param}`)
                const d = await r.json()
                if (d.found || d.foundAsChild) setIdError('תעודת זהות זו כבר רשומה במערכת — לא ניתן לרשום אותה שוב')
                else setIdError('')
              } catch { /* תיתפס בעת השליחה */ }
            }} />
          {idError && <p className="flex items-center gap-1 text-xs text-red-600 mt-1.5"><AlertCircle size={13} /> {idError}</p>}
          {!idError && idType === 'id' && idNumber.replace(/\D/g, '').length >= 9 && !validateIsraeliId(idNumber) && (
            <p className="flex items-center gap-1 text-xs text-red-600 mt-1.5"><AlertCircle size={13} /> תעודת הזהות אינה תקינה</p>
          )}
          {!idError && idType === 'id' && idNumber.replace(/\D/g, '').length >= 9 && validateIsraeliId(idNumber) && (
            <p className="flex items-center gap-1 text-xs text-green-600 mt-1.5"><CheckCircle2 size={13} /> תעודת זהות תקינה</p>
          )}
        </Field>
      )}
    </div>
  )
}

function SelectInput({ className = '', children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 bg-white shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus:outline-none focus:ring-2 focus:ring-indigo-500/80 focus:border-indigo-400 focus:shadow-[0_0_0_4px_rgba(99,102,241,0.12)] transition-all duration-150 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 text-sm text-red-700">
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200/80 p-6 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_12px_28px_-12px_rgba(15,23,42,0.12)] ${className}`}>
      {children}
    </div>
  )
}

// ─── Types ───

interface LineageNode { id: string; name: string; generation: number; parent_id: string | null; status?: string; relation?: 'son' | 'son_in_law' | null }

interface ChildEntry {
  name: string; id_number: string; gender: string; birth_date: string; marital_status: string
}
function emptyChild(): ChildEntry { return { name: '', id_number: '', gender: '', birth_date: '', marital_status: '' } }
function maritalFor(g: string) {
  if (g === 'male')   return [{ v: 'נשוי', l: 'נשוי' }, { v: 'לא נשוי', l: 'לא נשוי' }]
  if (g === 'female') return [{ v: 'נשואה', l: 'נשואה' }, { v: 'לא נשואה', l: 'לא נשואה' }]
  return []
}
function genderFromMarital(status: string): 'male' | 'female' | '' {
  if (['גרוש', 'אלמן'].includes(status)) return 'male'
  if (['גרושה', 'אלמנה'].includes(status)) return 'female'
  return ''
}

// ─── Lineage tree picker (full graphical) ───

const TP_NW = 160, TP_NH = 54, TP_HGAP = 44, TP_VGAP = 88, TP_PAD = 64
const TP_PAL = [
  { bg: 'linear-gradient(135deg,#7C3AED,#5B21B6)', ring: '#7C3AED', shadow: 'rgba(124,58,237,.35)', light: '#F5F0FF' },
  { bg: 'linear-gradient(135deg,#2563EB,#1E40AF)', ring: '#2563EB', shadow: 'rgba(37,99,235,.30)',   light: '#EFF6FF' },
  { bg: 'linear-gradient(135deg,#0891B2,#0E7490)', ring: '#0891B2', shadow: 'rgba(8,145,178,.30)',   light: '#F0F9FF' },
  { bg: 'linear-gradient(135deg,#059669,#047857)', ring: '#059669', shadow: 'rgba(5,150,105,.30)',   light: '#F0FDF4' },
  { bg: 'linear-gradient(135deg,#D97706,#B45309)', ring: '#D97706', shadow: 'rgba(217,119,6,.30)',   light: '#FFFBEB' },
  { bg: 'linear-gradient(135deg,#DB2777,#BE185D)', ring: '#DB2777', shadow: 'rgba(219,39,119,.30)', light: '#FDF2F8' },
]
const tpPal = (g: number) => TP_PAL[g % TP_PAL.length]

interface TPNode extends LineageNode { children: TPNode[] }
interface TPPos { node: TPNode; x: number; y: number; cx: number; cy: number }

function tpBuild(flat: LineageNode[]): TPNode[] {
  const map = new Map<string, TPNode>()
  flat.forEach(n => map.set(n.id, { ...n, children: [] }))
  const roots: TPNode[] = []
  flat.forEach(n => {
    const nd = map.get(n.id)!
    if (n.parent_id && map.has(n.parent_id)) map.get(n.parent_id)!.children.push(nd)
    else roots.push(nd)
  })
  return roots
}
function tpW(n: TPNode): number { return n.children.length ? n.children.reduce((s, c) => s + tpW(c), 0) : TP_NW + TP_HGAP }
function tpLayout(roots: TPNode[]): TPPos[] {
  const res: TPPos[] = []
  function place(n: TPNode, x: number, y: number) {
    const sw = tpW(n), cx = x + sw / 2
    res.push({ node: n, x: cx - TP_NW / 2, y, cx, cy: y + TP_NH / 2 })
    let cx2 = x; n.children.forEach(c => { place(c, cx2, y + TP_NH + TP_VGAP); cx2 += tpW(c) })
  }
  let sx = TP_PAD; roots.forEach(r => { place(r, sx, TP_PAD); sx += tpW(r) })
  return res
}
function tpSize(pos: TPPos[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + TP_NW)) + TP_PAD, h: Math.max(...pos.map(p => p.y + TP_NH)) + TP_PAD }
}
function tpEdges(pos: TPPos[]) {
  const byId = new Map(pos.map(p => [p.node.id, p]))
  return pos.flatMap(p => p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null }).filter(Boolean) as { from: TPPos; to: TPPos }[])
}
function buildPath(nodeId: string, all: LineageNode[]): string[] {
  const map = new Map(all.map(n => [n.id, n])); const path: string[] = []
  let cur = map.get(nodeId)
  while (cur) { path.unshift(cur.name); cur = cur.parent_id ? map.get(cur.parent_id) : undefined }
  return path
}

// קשרי בן/חתן המוגדרים בעץ הניהול, מיושרים לנתיב (אינדקס 0 = השורש, ללא קשר)
function buildPathRelations(nodeId: string, all: LineageNode[]): ('son' | 'son_in_law' | null)[] {
  const map = new Map(all.map(n => [n.id, n])); const rels: ('son' | 'son_in_law' | null)[] = []
  let cur = map.get(nodeId)
  while (cur) { rels.unshift(cur.relation ?? null); cur = cur.parent_id ? map.get(cur.parent_id) : undefined }
  return rels
}

function LineageTreePicker({ initialNodeId, onSelect }: { initialNodeId?: string; onSelect: (id: string, path: string[], relations: ('son' | 'son_in_law' | null)[]) => void }) {
  const [allNodes, setAllNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string>(initialNodeId ?? '')
  const [zoom, setZoom] = useState(0.65)
  const [q, setQ] = useState('')
  const canvasRef = useRef<HTMLDivElement>(null)
  const didCenter = useRef(false)
  const dragRef = useRef<{ sx: number; sy: number; slx: number; sly: number } | null>(null)
  const zoomAnchor = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    fetch('/api/lineage?all=1').then(r => r.json()).then(d => {
      const raw = (d.nodes ?? []).filter((n: LineageNode) => (n.status ?? 'verified') === 'verified')
      const minGen = raw.length ? Math.min(...raw.map((n: LineageNode) => n.generation)) : 0
      const nodes = raw.map((n: LineageNode) => ({ ...n, generation: n.generation - minGen }))
      setAllNodes(nodes)
      if (initialNodeId && nodes.length > 0) { const p = buildPath(initialNodeId, nodes); if (p.length) onSelect(initialNodeId, p, buildPathRelations(initialNodeId, nodes)) }
    }).catch(() => {}).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault(); e.stopPropagation()
      setZoom(prev => {
        const next = Math.min(2.5, Math.max(0.5, +(prev - e.deltaY * 0.0015).toFixed(3)))
        if (next === prev) return prev
        const r = el.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top
        zoomAnchor.current = { px: (el.scrollLeft + ox) / prev, py: (el.scrollTop + oy) / prev, ox, oy }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [loading])

  useLayoutEffect(() => {
    const el = canvasRef.current, a = zoomAnchor.current; if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.ox; el.scrollTop = a.py * zoom - a.oy; zoomAnchor.current = null
  }, [zoom])

  useEffect(() => {
    const el = canvasRef.current; if (!el) return
    const onDown = (e: MouseEvent) => { if (e.button !== 0) return; dragRef.current = { sx: e.clientX, sy: e.clientY, slx: el.scrollLeft, sly: el.scrollTop }; el.style.cursor = 'grabbing' }
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.sx, dy = e.clientY - dragRef.current.sy
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) { e.preventDefault(); el.scrollLeft = dragRef.current.slx - dx; el.scrollTop = dragRef.current.sly - dy }
    }
    const onUp = () => { dragRef.current = null; el.style.cursor = 'grab' }
    el.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp)
    return () => { el.removeEventListener('mousedown', onDown); window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [loading])

  const positions = useMemo(() => tpLayout(tpBuild(allNodes)), [allNodes])
  const edges = useMemo(() => tpEdges(positions), [positions])
  const { w, h } = useMemo(() => tpSize(positions), [positions])
  const nodeById = useMemo(() => new Map(allNodes.map(n => [n.id, n])), [allNodes])
  const branch = useMemo(() => {
    const s = new Set<string>(); if (!selected) return s
    const map = new Map(allNodes.map(n => [n.id, n])); let cur = map.get(selected); let g = 0
    while (cur && g < 60) { s.add(cur.id); cur = cur.parent_id ? map.get(cur.parent_id) : undefined; g++ }
    return s
  }, [selected, allNodes])
  const results = useMemo(() => { const lq = q.trim().toLowerCase(); if (!lq) return []; return allNodes.filter(n => n.name.toLowerCase().includes(lq)).slice(0, 8) }, [q, allNodes])

  useEffect(() => {
    if (!positions.length || didCenter.current) return
    const el = canvasRef.current; if (!el) return
    didCenter.current = true
    requestAnimationFrame(() => { if (!canvasRef.current) return; const sc = (w * zoom - canvasRef.current.clientWidth) / 2; if (sc > 0) canvasRef.current.scrollLeft = sc })
  }, [positions.length, w, zoom])

  function scrollTo(nodeId: string) {
    const pos = positions.find(p => p.node.id === nodeId); if (!pos || !canvasRef.current) return
    const el = canvasRef.current
    el.scrollTo({ left: Math.max(0, pos.cx * zoom - el.clientWidth / 2), top: Math.max(0, pos.y * zoom - el.clientHeight / 3), behavior: 'smooth' })
  }
  function pick(nodeId: string) { setSelected(nodeId); onSelect(nodeId, buildPath(nodeId, allNodes), buildPathRelations(nodeId, allNodes)); setQ(''); setTimeout(() => scrollTo(nodeId), 50) }

  if (loading) return <div className="flex items-center gap-2 py-4 text-indigo-600"><Loader2 size={16} className="animate-spin" /><span className="text-sm">טוען עץ דורות...</span></div>
  if (!allNodes.length) return <div className="py-4 text-center text-slate-400 text-sm">לא נמצאו נתוני שושלת</div>

  return (
    <div style={{ direction: 'rtl' }}>
      {/* search + zoom */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 240 }}>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש שם בשושלת..."
            style={{ width: '100%', height: 30, borderRadius: 8, border: '1px solid #E2E8F0', padding: '0 10px', fontSize: 12, color: '#334155', outline: 'none', direction: 'rtl', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' }} />
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: 34, right: 0, left: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
              {results.map(n => { const par = n.parent_id ? nodeById.get(n.parent_id) : null; return (
                <button key={n.id} type="button" onClick={() => pick(n.id)} style={{ display: 'block', width: '100%', textAlign: 'right', padding: '7px 11px', border: 'none', borderBottom: '1px solid #F1F5F9', background: '#fff', cursor: 'pointer', direction: 'rtl', fontFamily: 'inherit' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{n.name}</div>
                  <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>דור {n.generation + 1}{par ? ` · ${par.name}` : ''}</div>
                </button>
              )})}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button type="button" onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>+</button>
          <button type="button" onClick={() => { setZoom(0.65); didCenter.current = false }} style={{ height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 10, cursor: 'pointer', padding: '0 7px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} style={{ width: 26, height: 26, borderRadius: 7, border: '1px solid #E2E8F0', background: '#fff', fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366F1', fontWeight: 700 }}>−</button>
        </div>
      </div>

      {/* canvas */}
      <div ref={canvasRef} dir="ltr" style={{ overflow: 'auto', overflowAnchor: 'none', borderRadius: 14, background: 'linear-gradient(180deg,#FCFCFF 0%,#F7F5FF 100%)', border: '1px solid #E8E0F5', height: 380, cursor: 'grab' }}>
        <div style={{ position: 'relative', width: w * zoom, height: (h + 60) * zoom, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
            {edges.map((e, i) => {
              const x1 = e.from.cx * zoom, y1 = (e.from.y + TP_NH) * zoom, x2 = e.to.cx * zoom, y2 = e.to.y * zoom, mid = (y1 + y2) / 2
              const col = tpPal(e.from.node.generation).ring
              const isPath = selected && branch.has(e.from.node.id) && branch.has(e.to.node.id)
              return (<g key={i}>
                <path d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke="#fff" strokeWidth={isPath ? 7 : 4} strokeLinecap="round" opacity={selected && !isPath ? 0.1 : 0.9} />
                <path d={`M${x1},${y1} C${x1},${mid} ${x2},${mid} ${x2},${y2}`} fill="none" stroke={col} strokeWidth={isPath ? 3.5 : 2} strokeLinecap="round" opacity={selected && !isPath ? 0.08 : 0.85} />
              </g>)
            })}
          </svg>
          {positions.map(pos => {
            const isSel = selected === pos.node.id
            const isDim = selected ? !branch.has(pos.node.id) : false
            const p = tpPal(pos.node.generation)
            // אותו עיקרון כמו בניהול: בן = צבע הדור המלא · חתן = אותו גוון, כהה יותר
            const relOverlay = pos.node.relation === 'son_in_law'
              ? 'linear-gradient(rgba(0,0,0,0.30),rgba(0,0,0,0.30)), '
              : ''
            return (
              <div key={pos.node.id} onClick={() => pick(pos.node.id)}
                style={{ position: 'absolute', left: pos.x * zoom, top: pos.y * zoom, width: TP_NW * zoom, height: TP_NH * zoom, borderRadius: 14 * zoom, background: relOverlay + p.bg, boxShadow: isSel ? `0 0 0 3px #fff, 0 0 0 5px ${p.ring}, 0 10px 28px ${p.shadow}` : `0 4px 16px ${p.shadow}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transform: isSel ? 'scale(1.07)' : 'scale(1)', transition: 'all .2s', opacity: isDim ? 0.22 : 1, zIndex: isSel ? 20 : 2, userSelect: 'none' }}>
                <div style={{ position: 'absolute', top: -9 * zoom, right: 5 * zoom, background: '#fff', color: p.ring, fontSize: Math.max(8, 9 * zoom), fontWeight: 800, width: 19 * zoom, height: 19 * zoom, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1.5px solid ${p.ring}` }}>{pos.node.generation + 1}</div>
                {isSel && <div style={{ position: 'absolute', top: -9 * zoom, left: 5 * zoom, width: 19 * zoom, height: 19 * zoom, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 25 }}><Check size={10 * zoom} color="#fff" strokeWidth={3} /></div>}
                {/* תווית בן/חתן */}
                {pos.node.relation && (
                  <div style={{ position: 'absolute', bottom: -8 * zoom, right: 5 * zoom, background: pos.node.relation === 'son' ? '#DBEAFE' : '#FEF3C7', color: pos.node.relation === 'son' ? '#1E40AF' : '#92400E', fontSize: Math.max(7, 8 * zoom), fontWeight: 800, padding: `${0.5 * zoom}px ${6 * zoom}px`, borderRadius: 20, border: `1px solid ${pos.node.relation === 'son' ? '#93C5FD' : '#FCD34D'}` }}>{pos.node.relation === 'son' ? 'בן' : 'חתן'}</div>
                )}
                <span style={{ color: '#fff', fontWeight: 700, fontSize: Math.max(9, (pos.node.name.length > 12 ? 10 : 12) * zoom), textAlign: 'center', direction: 'rtl', padding: `0 ${10 * zoom}px`, lineHeight: 1.3, maxWidth: (TP_NW - 14) * zoom, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{pos.node.name}</span>
              </div>
            )
          })}
        </div>
      </div>
      {selected && <p className="text-xs text-indigo-600 font-medium mt-2">נבחר: {allNodes.find(n => n.id === selected)?.name}</p>}
    </div>
  )
}

export interface LineageResult {
  valid: boolean
  nodeId: string | null
  ancestors: { id: string | null; name: string; relation: 'son' | 'son_in_law' | null; isNew: boolean }[]
  selfRelation: 'son' | 'son_in_law' | null
}
function LineageBuilder({ selfName, onChange }: { selfName: string; onChange: (r: LineageResult) => void }) {
  const [root, setRoot] = useState<{ id: string; name: string } | null>(null)
  const [chain, setChain] = useState<{ id: string | null; name: string; relation: 'son' | 'son_in_law' | null; isNew: boolean }[]>([])
  const [options, setOptions] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRel, setNewRel] = useState<'son' | 'son_in_law' | null>(null)
  const [newErr, setNewErr] = useState('')
  const [selfAdded, setSelfAdded] = useState(false)
  const [selfRel, setSelfRel] = useState<'son' | 'son_in_law' | null>(null)

  const fetchChildren = async (parentId: string) => { try { const r = await fetch(`/api/lineage?parent_id=${parentId}`); const d = await r.json(); return (d.nodes ?? []) as LineageNode[] } catch { return [] } }

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/lineage'); const d = await r.json(); const rn = (d.nodes ?? [])[0]
        if (rn) { setRoot({ id: rn.id, name: rn.name }); setOptions(await fetchChildren(rn.id)) }
      } catch { /* ignore */ }
      setLoading(false)
    })()
  }, [])

  useEffect(() => {
    const deepestVerified = [...chain].reverse().find(c => !c.isNew && c.id)
    // קשר (בן/חתן) נדרש רק לדורות שהנרשם הוסיף ידנית; דורות מאומתים מהעץ
    // משתמשים בקשר שמוגדר בניהול (שעשוי להיות ריק) — אחרת אי אפשר להתקדם.
    const valid = chain.length >= 1 && selfAdded && !!selfRel && chain.every(c => !c.isNew || !!c.relation)
    onChange({ valid, nodeId: deepestVerified?.id ?? null, ancestors: chain, selfRelation: selfRel })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, selfAdded, selfRel])

  const pickVerified = async (node: LineageNode) => {
    setSelfAdded(false)
    setChain(c => [...c, { id: node.id, name: node.name, relation: node.relation ?? null, isNew: false }])
    setOptions(await fetchChildren(node.id))
  }
  const confirmNew = () => {
    const nm = newName.trim()
    if (nm.split(/\s+/).filter(Boolean).length < 2) { setNewErr('יש להזין שם פרטי מלא ושם משפחה מלא (לדוגמה: "משה כהן")'); return }
    if (!newRel) { setNewErr('יש לסמן בן או חתן'); return }
    setSelfAdded(false)
    setChain(c => [...c, { id: null, name: nm, relation: newRel, isNew: true }])
    setOptions([]); setAddOpen(false); setNewName(''); setNewRel(null); setNewErr('')
  }
  // מחיקת שם מהשרשרת לפי מיקומו — מסירה אותו ואת כל מה שאחריו (הדורות תלויים זה בזה),
  // ומחזירה את רשימת הבחירה לדור שנותר האחרון.
  const removeAt = async (chainIndex: number) => {
    const next = chain.slice(0, chainIndex)
    setChain(next)
    setSelfAdded(false); setAddOpen(false)
    const prev = next[next.length - 1]
    if (prev && !prev.isNew && prev.id) setOptions(await fetchChildren(prev.id))
    else if (!prev && root) setOptions(await fetchChildren(root.id))
    else setOptions([])
  }

  const relBadge = (r: 'son' | 'son_in_law' | null) => (r === 'son' || r === 'son_in_law') ? (
    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${r === 'son' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{r === 'son' ? 'בן' : 'חתן'}</span>
  ) : null

  if (loading) return <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={14} className="animate-spin" /> טוען דורות…</div>

  const canAddSelf = chain.length >= 1 && !selfAdded
  const lastIsNew = chain.length > 0 && chain[chain.length - 1].isNew

  return (
    <div className="flex flex-col">
      {/* סיכום הדורות שנבחרו — דור 1 קבוע ואז השרשרת */}
      {[{ name: root?.name ?? 'רבינו החתם סופר זיע״א', relation: null as 'son' | 'son_in_law' | null, fixed: true, isNew: false }, ...chain.map(c => ({ ...c, fixed: false }))].map((row, i, arr) => {
        const col = GEN_COLORS[i % GEN_COLORS.length]
        return (
          <div key={i} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center w-5 flex-shrink-0">
              <span className={`w-3 h-3 rounded-full mt-2.5 ${col.dot}`} />
              <span className="w-0.5 flex-1 bg-slate-200 my-0.5" />
            </div>
            <div className={`flex-1 mb-2 rounded-xl border px-3 py-2 flex items-center gap-2 ${col.bg} ${col.border}`}>
              <span className={`text-[10px] font-bold flex-shrink-0 ${col.text} opacity-70`}>דור {i + 1}</span>
              <span className={`text-sm font-semibold flex-1 truncate ${col.text}`}>{row.name}</span>
              {row.fixed && <span className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5 flex-shrink-0">קבוע</span>}
              {!row.fixed && (row as { isNew: boolean }).isNew && <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5 flex-shrink-0">ממתין לאימות</span>}
              {relBadge(row.relation)}
              {!row.fixed && !selfAdded && (
                <button type="button" onClick={() => removeAt(i - 1)}
                  className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-red-100 text-red-600 border border-red-300 hover:bg-red-600 hover:text-white hover:border-red-600 shadow-sm transition-colors"
                  title="מחיקת שם זה (וכל מה שאחריו)"><X size={17} strokeWidth={2.5} /></button>
              )}
            </div>
          </div>
        )
      })}

      {/* שורת הנרשם — אחרי שלחץ "הוסף אותי" */}
      {selfAdded && (
        <div className="flex items-stretch gap-3">
          <div className="flex flex-col items-center w-5 flex-shrink-0"><span className="w-3 h-3 rounded-full mt-2.5 bg-green-600 ring-2 ring-green-200" /></div>
          <div className="flex-1 mb-2 rounded-xl border-2 border-green-300 bg-green-600 px-3 py-2 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold text-green-100 flex-shrink-0">דור {chain.length + 2}</span>
            <span className="text-sm font-semibold text-white flex-1 truncate">{selfName || '(שמך)'}</span>
            <span className={`text-xs font-bold text-white ${selfRel === null ? 'animate-pulse' : ''}`}>{selfRel === null ? '← בחר/י בן/חתן (חובה):' : 'בן/חתן:'}</span>
            {(['son', 'son_in_law'] as const).map(r => (
              <button key={r} type="button" onClick={() => setSelfRel(r)}
                className={`text-sm font-bold rounded-lg px-4 py-1.5 border-2 transition-all duration-150 ${selfRel === r ? 'bg-white text-green-800 border-white shadow-md ring-2 ring-white/60' : selfRel === null ? 'bg-white/90 text-green-800 border-white animate-pulse ring-2 ring-yellow-300 shadow-lg' : 'bg-green-800/60 text-white border-white/80 hover:bg-green-800'}`}>{r === 'son' ? 'בן' : 'חתן'}</button>
            ))}
            <button type="button" onClick={() => { setSelfAdded(false); setSelfRel(null) }} className="text-green-100 hover:text-white flex-shrink-0" title="בטל"><X size={15} /></button>
          </div>
        </div>
      )}

      {/* בורר הדור הבא — כפתורים + "אחר" */}
      {!selfAdded && (
        <div className="mr-8 mt-1">
          {!addOpen ? (
            <>
              {!lastIsNew && options.length > 0 && (
                <>
                  <p className="text-xs font-medium text-slate-500 mb-1.5">בחר/י את דור {chain.length + 2}:</p>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {options.slice().sort((a, b) => a.name.localeCompare(b.name, 'he')).map(node => (
                      <button key={node.id} type="button" onClick={() => pickVerified(node)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-150">
                        {node.name}{node.relation ? <span className="text-[10px] text-slate-400 mr-1">({node.relation === 'son' ? 'בן' : 'חתן'})</span> : null}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setAddOpen(true); setNewErr('') }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 border border-amber-300 bg-amber-50 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition-all duration-150">
                  <Plus size={13} /> {lastIsNew || options.length === 0 ? 'הוסף את הדור הבא' : 'הדור הבא לא ברשימה — הוסף "אחר"'}
                </button>
              </div>
              {canAddSelf && (
                <div className="mt-4">
                  <button type="button" onClick={() => setSelfAdded(true)}
                    className="w-full inline-flex items-center justify-center gap-1.5 text-sm font-bold text-white bg-gradient-to-b from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-sm hover:shadow-md active:scale-[0.98] rounded-lg px-3 py-2.5 transition-all duration-150 shadow-sm">
                    <Check size={15} /> הוסף אותי כעת (סיימתי את האבות)
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-amber-800">הוספת דור {chain.length + 2} (ייכנס לאישור הצוות)</p>
              <TextInput value={newName} onChange={e => { setNewName(e.target.value); setNewErr('') }} placeholder="שם פרטי מלא ושם משפחה מלא" />
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-700">בן/חתן של הדור הקודם:</span>
                {(['son', 'son_in_law'] as const).map(r => (
                  <button key={r} type="button" onClick={() => setNewRel(r)}
                    className={`text-sm font-bold rounded-lg px-4 py-1.5 border-2 transition-all duration-150 ${newRel === r ? (r === 'son' ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-200' : 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-200') : 'bg-white text-slate-700 border-slate-400 hover:border-slate-500 hover:bg-slate-50'}`}>{r === 'son' ? 'בן' : 'חתן'}</button>
                ))}
              </div>
              {newErr && <p className="text-xs text-red-600">{newErr}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={confirmNew} className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-[0_6px_16px_-6px_rgba(217,119,6,0.5)] hover:shadow-[0_10px_22px_-8px_rgba(217,119,6,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] rounded-lg px-4 py-2"><Check size={12} /> הוסף</button>
                <button type="button" onClick={() => { setAddOpen(false); setNewName(''); setNewRel(null); setNewErr('') }} className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-2">ביטול</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Israeli ID validation ───

function validateIsraeliId(raw: string): boolean {
  const id = raw.replace(/\D/g, '').padStart(9, '0')
  if (id.length !== 9) return false
  let sum = 0
  for (let i = 0; i < 9; i++) {
    let v = parseInt(id[i]) * (i % 2 === 0 ? 1 : 2)
    if (v > 9) v -= 9
    sum += v
  }
  return sum % 10 === 0
}

function validatePhone(p: string): boolean {
  const d = p.replace(/\D/g, '')
  return d.length === 10 && d.startsWith('05')
}

function validateEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

// ─── Widow Portal Component ───

const WIDOW_REQUEST_TYPES = [
  { value: 'financial', label: 'קרן סיוע כספי', icon: '', desc: 'מענק או הלוואה לסיוע כלכלי' },
  { value: 'food',      label: 'סיוע במזון / שוברים', icon: '', desc: 'חבילות מזון ושוברי קנייה' },
  { value: 'general',   label: 'בקשת עזרה כללית', icon: '', desc: 'פנייה חופשית לצוות' },
] as const

function WidowPortal({ beneficiary, onBack }: { beneficiary: FoundBeneficiary; onBack: () => void }) {
  const [tab, setTab] = useState<'children' | 'requests'>('requests')
  const [showForm, setShowForm] = useState(false)
  const [reqType, setReqType] = useState<string>('')
  const [reqDesc, setReqDesc] = useState('')
  const [reqAmount, setReqAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  const children = (beneficiary as FoundBeneficiary & { children?: unknown[] }).children ?? []
  const name = [beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!reqType) { setError('בחר סוג בקשה'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/portal/widow-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, request_type: reqType, description: reqDesc, amount: reqAmount ? Number(reqAmount) : undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחה'); return }
      setSubmitted(true); setShowForm(false); setReqType(''); setReqDesc(''); setReqAmount('')
    } catch { setError('שגיאת רשת') }
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button type="button" onClick={onBack} className="text-slate-400 hover:text-slate-600">
          <ArrowRight size={20} />
        </button>
        <div>
          <h2 className="font-bold text-slate-900 text-lg">שלום, {name}</h2>
          <p className="text-xs text-slate-500">אגף אלמנות ויתומים — אזור אישי</p>
        </div>
      </div>

      {submitted && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 text-sm">
          <Check size={16} className="text-green-600 flex-shrink-0" />
          הבקשה נשלחה בהצלחה. הצוות יחזור אליך בהקדם.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {[{ key: 'requests', label: 'בקשות' }, { key: 'children', label: 'ילדים' }].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              tab === t.key ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Requests tab */}
      {tab === 'requests' && (
        <div className="flex flex-col gap-3">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full py-3 rounded-xl bg-indigo-600 text-white font-medium text-sm hover:bg-indigo-700 transition-all duration-150 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> הגש בקשה חדשה
            </button>
          )}

          {showForm && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="font-semibold text-slate-800">בקשה חדשה</h3>

              <div className="grid grid-cols-1 gap-2">
                {WIDOW_REQUEST_TYPES.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setReqType(t.value)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-right transition-all duration-150 ${
                      reqType === t.value
                        ? 'border-indigo-400 bg-indigo-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{t.label}</p>
                      <p className="text-xs text-slate-500">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {reqType === 'financial' && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-slate-600">סכום מבוקש (₪)</label>
                  <input
                    type="number"
                    value={reqAmount}
                    onChange={e => setReqAmount(e.target.value)}
                    placeholder="לדוגמה: 1500"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-slate-600">פרטים נוספים</label>
                <textarea
                  value={reqDesc}
                  onChange={e => setReqDesc(e.target.value)}
                  placeholder="תאר את הבקשה בקצרה..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all duration-150"
                >
                  {submitting ? 'שולח...' : 'שלח בקשה'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError('') }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-all duration-150"
                >
                  ביטול
                </button>
              </div>
            </form>
          )}

          <div className="bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-500">
            כל הבקשות נבדקות על ידי צוות העמותה. נחזור אליך בהקדם.
          </div>
        </div>
      )}

      {/* Children tab */}
      {tab === 'children' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {children.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">אין ילדים רשומים</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(children as Array<{ name?: string; birth_date?: string; gender?: string }>).map((c, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                    {c.gender === 'female' ? 'בת' : 'בן'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{c.name || 'ללא שם'}</p>
                    {c.birth_date && <p className="text-xs text-slate-500">{c.birth_date}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ───

export default function PublicPortalPage() {
  const [step, setStep] = useState<Step>('id-lookup')
  const [idInput, setIdInput] = useState('')
  const [docType, setDocType] = useState<'id' | 'passport'>('id')
  const [regDocType, setRegDocType] = useState<'id' | 'passport'>('id')
  const [spouseDocType, setSpouseDocType] = useState<'id' | 'passport'>('id')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [beneficiary, setBeneficiary] = useState<FoundBeneficiary | null>(null)
  const [childMatch, setChildMatch] = useState<ChildMatchData | null>(null)
  // רישום כילד רשום — השיוך נקבע אוטומטית מההורה
  const [childParentLineage, setChildParentLineage] = useState<ParentLineage | null>(null)
  // נתוני הילד ברישום מהיר — ימולאו לבעל/אשה לפי המין רק אחרי בחירת מצב משפחתי
  const [childSelf, setChildSelf] = useState<ChildMatchData['childData'] | null>(null)
  const [requestType, setRequestType] = useState<'birth' | 'loan' | 'financial_aid' | null>(null)
  const [pendingConfirmed, setPendingConfirmed] = useState(false)

  // ── אימות כניסה לפורטל: סיסמה + "שכחתי סיסמה"/הגדרת סיסמה ראשונה ──
  const [pendingAuth, setPendingAuth] = useState<{ idType: 'id' | 'passport'; id: string } | null>(null)
  const [authMode, setAuthMode] = useState<'login' | 'reset'>('login')
  // מסך פתיחה לאחר זיהוי ת"ז: 'intro' = "כבר נרשמתם" + אפשרויות מייל; 'login' = הזנת סיסמה/קוד להגשת בקשה
  const [authView, setAuthView] = useState<'intro' | 'login'>('intro')
  const [authPassword, setAuthPassword] = useState('')
  const [authPassword2, setAuthPassword2] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [authEmailHint, setAuthEmailHint] = useState('')
  const [authCodeSent, setAuthCodeSent] = useState(false)
  const [authIsSetup, setAuthIsSetup] = useState(false)
  // כניסה עם קוד בשיחה טלפונית (צינתוק ימות)
  const [phoneStep, setPhoneStep] = useState<'' | 'choose' | 'code'>('')
  const [authPhones, setAuthPhones] = useState<{ index: number; hint: string }[]>([])
  const [authPhoneHint, setAuthPhoneHint] = useState('')
  // כניסה עם קוד זמני למייל: '' = מסך בחירה (מייל/טלפון); 'code' = הזנת הקוד שנשלח למייל
  const [emailStep, setEmailStep] = useState<'' | 'code'>('')

  // סטטוס הבקשות נשלח למייל הרשום (במקום הצגתן בפורטל — שמירה על פרטיות)
  const [statusSending, setStatusSending] = useState(false)
  const [statusSentTo, setStatusSentTo] = useState<string | null>(null)
  const [statusErr, setStatusErr] = useState('')
  // גוף זיהוי לבקשות מייל: לפי סשן (אחרי כניסה) או לפי ת"ז (לפני כניסה — נשלח רק לרשום)
  const authIdentity = useCallback(() => {
    if (beneficiary?.id) return { beneficiary_id: beneficiary.id }
    if (pendingAuth) return { idType: pendingAuth.idType, id: pendingAuth.id }
    return null
  }, [beneficiary?.id, pendingAuth])

  const sendStatusEmail = useCallback(async () => {
    const ident = authIdentity()
    if (!ident) return
    setStatusSending(true); setStatusErr('')
    try {
      const res = await fetch('/api/portal/request-status-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ident),
      })
      const d = await res.json()
      if (res.ok) setStatusSentTo(d.email || 'המייל הרשום במערכת')
      else setStatusErr(d.error || 'שליחת המייל נכשלה')
    } catch { setStatusErr('שגיאת רשת. נסה שוב.') }
    setStatusSending(false)
  }, [authIdentity])

  // שליחת מייל "רשימת הטבות וקישורי בקשות" מהאיגוד
  const [benefitsSending, setBenefitsSending] = useState(false)
  const [benefitsSentTo, setBenefitsSentTo] = useState<string | null>(null)
  const [benefitsErr, setBenefitsErr] = useState('')
  const sendBenefitsLink = useCallback(async () => {
    const ident = authIdentity()
    if (!ident) return
    setBenefitsSending(true); setBenefitsErr('')
    try {
      const res = await fetch('/api/portal/send-benefits-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ident),
      })
      const d = await res.json()
      if (res.ok) setBenefitsSentTo(d.email || 'המייל הרשום במערכת')
      else setBenefitsErr(d.error || 'שליחת המייל נכשלה')
    } catch { setBenefitsErr('שגיאת רשת. נסה שוב.') }
    setBenefitsSending(false)
  }, [authIdentity])

  // תזכורת השלמת שם הילד — לידות שסומנו עם מין אך ללא שם
  const [pendingNames, setPendingNames] = useState<{ id: string; baby_gender: string | null; birth_date: string | null }[]>([])
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  useEffect(() => {
    if (step !== 'dashboard' || !beneficiary?.id) return
    fetch(`/api/portal/baby-name?beneficiary_id=${beneficiary.id}`)
      .then(r => r.json()).then(d => setPendingNames(d.pending ?? [])).catch(() => {})
  }, [step, beneficiary?.id])
  const saveBabyName = async () => {
    const m = pendingNames[0]
    if (!m || !nameInput.trim() || !beneficiary?.id) return
    setSavingName(true)
    try {
      const res = await fetch('/api/portal/baby-name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, maternity_id: m.id, baby_name: nameInput.trim() }),
      })
      if (res.ok) { setPendingNames(prev => prev.slice(1)); setNameInput('') }
    } finally { setSavingName(false) }
  }

  const [showRegSuccess, setShowRegSuccess] = useState(false)
  const [regSuccessDetails, setRegSuccessDetails] = useState<{ name: string; idNumber: string; phone: string; email: string } | null>(null)

  // Registration form
  const [regForm, setRegForm] = useState({
    id_number: '', full_name: '', family_name: '', phone: '', phone2: '',
    email: '', address: '', city: '', birth_date: '', gender: '',
    marital_status: '', spouse_name: '', spouse_id_number: '', spouse_phone: '', spouse_birth_date: '',
    community_affiliation: '',
    children_count: '0', notes: '',
  })
  // רישום מהיר של ילד — מילוי הפרטים לבעל/אשה לפי המין, אחרי בחירת מצב משפחתי
  useEffect(() => {
    if (!childSelf || !regForm.marital_status) return
    const married = regForm.marital_status === 'נשואים'
    if (married && childSelf.gender === 'female') {
      setRegForm(f => ({ ...f, spouse_name: childSelf.name, spouse_id_number: childSelf.id_number, spouse_birth_date: childSelf.birth_date, gender: 'female', full_name: '', id_number: '', birth_date: '' }))
    } else {
      setRegForm(f => ({ ...f, full_name: childSelf.name, id_number: childSelf.id_number, birth_date: childSelf.birth_date, gender: childSelf.gender, spouse_name: '', spouse_id_number: '', spouse_birth_date: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childSelf, regForm.marital_status])
  const [lineageResult, setLineageResult] = useState<LineageResult>({ valid: false, nodeId: null, ancestors: [], selfRelation: null })
  const [lineageNodeId, setLineageNodeId] = useState('')
  const [lineagePath, setLineagePath] = useState<string[]>([])
  const [manualLineage, setManualLineage] = useState<string[]>([])
  // הצהרת ייחוס (חובה בטופס הציבורי לפני בחירת סדר הדורות) + סימון בן/חתן לכל דור
  const [lineageDeclared, setLineageDeclared] = useState(false)
  const [declModalOpen, setDeclModalOpen] = useState(false)
  // קשרי בן/חתן שהנרשם מסמן — רק לדורות שהוא מציע (ידני / הוא עצמו)
  const [lineageRelations, setLineageRelations] = useState<Record<string, 'son' | 'son_in_law'>>({})
  // קשרי בן/חתן של הנתיב המאומת — מגיעים אוטומטית מהגדרת העץ בניהול
  const [pathRelations, setPathRelations] = useState<('son' | 'son_in_law' | null)[]>([])
  // Suggest new lineage node
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestName, setSuggestName] = useState('')
  const [suggestParentId, setSuggestParentId] = useState('')
  const [suggestRelation, setSuggestRelation] = useState<'son' | 'son_in_law' | ''>('')
  const [suggestSubmitting, setSuggestSubmitting] = useState(false)
  const [suggestError, setSuggestError] = useState('')
  const [allLineageNodes, setAllLineageNodes] = useState<{ id: string; name: string; generation: number }[]>([])
  const [children, setChildren] = useState<ChildEntry[]>([])
  const [editingChildIdx, setEditingChildIdx] = useState<number | null>(null)
  const [idFieldError, setIdFieldError] = useState('')
  const [spouseIdError, setSpouseIdError] = useState('')
  const [spousePhoneError, setSpousePhoneError] = useState('')
  const [childIdErrors, setChildIdErrors] = useState<Record<number, string>>({})
  const [phoneError, setPhoneError] = useState('')
  const [emailError, setEmailError] = useState('')
  // אסימוני אימות מייל/טלפון (רישום)
  const [regEmailToken, setRegEmailToken] = useState<string | null>(null)
  const [regPhoneToken, setRegPhoneToken] = useState<string | null>(null)
  // אסימוני אימות לטלפון האשה והטלפון הנוסף (רב-אימות ברישום)
  const [regSpousePhoneToken, setRegSpousePhoneToken] = useState<string | null>(null)
  const [regPhone2Token, setRegPhone2Token] = useState<string | null>(null)
  // אסימוני אימות מייל/טלפון (עריכת פרטים בדשבורד)
  const [editEmailToken, setEditEmailToken] = useState<string | null>(null)
  const [editPhoneToken, setEditPhoneToken] = useState<string | null>(null)
  const [editSpousePhoneToken, setEditSpousePhoneToken] = useState<string | null>(null)
  const [editPhone2Token, setEditPhone2Token] = useState<string | null>(null)
  const [declaredReg, setDeclaredReg] = useState(false)
  // חתימה דיגיטלית — נלכדת בחלונית כשמסמנים את ההצהרה, ונשמרת בכרטסת הצאצא
  const [regSignature, setRegSignature] = useState<string>('')
  const [sigModalOpen, setSigModalOpen] = useState(false)
  // הטבות שהתקבלו בעבר מאיגוד הצאצאים
  const [pastBenefits, setPastBenefits] = useState({
    // none = "לא קיבלתי הטבות בעבר". בלעדי — סימונו מנקה את כל השאר.
    none: false,
    recovery_home: false, food_card: false, holiday_grant: false, catering: false,
    tishrei_5786: false, pesach_5786: false, shavuot_5786: false,
    loan: false, loan_amount: '', other: false, other_details: '', notes: '',
    update_topics: [] as string[],
  })
  const [regSuccess, setRegSuccess] = useState(false)

  // Docs upload (for pending users)
  const [existingDocs, setExistingDocs] = useState<Record<string, { url: string; name: string }>>({})
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({})

  // אזהרת החלפת קובץ: מסמך שכבר קיים במערכת יידרס. מוצגת פעם אחת, בבחירה,
  // כדי שהמשתמש לא ימחק בטעות מסמך תקין.
  const [replaceWarn, setReplaceWarn] = useState<{ key: string; file: File } | null>(null)

  const setDocFile = (key: string, f: File | null) => {
    // קובץ קיים + קובץ חדש נבחר => מבקשים אישור לפני שדורסים
    if (f && existingDocs[key]) {
      setReplaceWarn({ key, file: f })
      return
    }
    setDocFiles(prev => ({ ...prev, [key]: f }))
  }

  /** אישור ההחלפה — מכניס את הקובץ שנבחר בפועל. */
  const confirmReplace = () => {
    if (!replaceWarn) return
    setDocFiles(prev => ({ ...prev, [replaceWarn.key]: replaceWarn.file }))
    setReplaceWarn(null)
  }
  const { docTypes: dynDocTypes } = useDocTypes()
  // תווית מסמך: עדיפות לתוויות המתארות, ואז לסוגים מותאמים מההגדרות
  const docLabel = (d: string) => DOC_LABELS[d] ?? dynDocTypes.find(t => t.value === d)?.label ?? 'מסמך'
  const [docsUploading, setDocsUploading] = useState(false)
  const [docsPendingReason, setDocsPendingReason] = useState<'birth' | 'loan' | null>(null)
  // מסמכים שכבר הועלו בעבר (מוצגים בעת כניסה חוזרת לקישור השלמת המסמכים)
  const [replaceDoc, setReplaceDoc] = useState<Record<string, boolean>>({})
  // בורר מצב משפחתי — "אחר" פותח את שאר האפשרויות
  const [showOtherMarital, setShowOtherMarital] = useState(false)

  // Deep-link action from email buttons (?action=birth|loan|docs) — applied after ID lookup
  const intendedAction = useRef<'birth' | 'loan' | 'docs' | 'aid' | null>(null)

  // Loan modal
  const [loanModalOpen, setLoanModalOpen] = useState(false)

  // Financial aid modal
  const [aidModalOpen, setAidModalOpen] = useState(false)
  const [aidReason, setAidReason] = useState('')
  const [aidFile, setAidFile] = useState<File | null>(null)

  // Birth request form
  const [birthForm, setBirthForm] = useState({
    birth_date: '', baby_name: '', baby_gender: '', recovery_home: '', notes: '',
    baby_id_number: '', baby_id_type: 'id',
  })
  const [birthCertFile, setBirthCertFile] = useState<File | null>(null)
  const [noBabyName, setNoBabyName] = useState(false)   // סימון "עדיין אין שם" — להשלמה בכניסה הבאה
  const [babyIdError, setBabyIdError] = useState('')
  // לידת תאומים — תינוק שני (baby2) + מצבי שגיאה/שם משלו
  const [isTwins, setIsTwins] = useState(false)
  const [baby2, setBaby2] = useState({ baby_gender: '', baby_name: '', baby_id_number: '', baby_id_type: 'id' })
  const [noBaby2Name, setNoBaby2Name] = useState(false)
  const [baby2IdError, setBaby2IdError] = useState('')
  const [recoveryHomes, setRecoveryHomes] = useState<string[]>(RECOVERY_HOMES_DEFAULT)
  const [recoveryHomesSilent, setRecoveryHomesSilent] = useState<string[]>([])
  // לידה שקטה
  const [silentForm, setSilentForm] = useState({ birth_date: '', recovery_home: '', notes: '' })
  const [showSilentInfo, setShowSilentInfo] = useState(false)
  useEffect(() => {
    fetch('/api/portal/recovery-homes').then(r => r.json()).then(d => {
      if (Array.isArray(d.regular) && d.regular.length) setRecoveryHomes(d.regular)
      if (Array.isArray(d.silent)) setRecoveryHomesSilent(d.silent)
    }).catch(() => {})
  }, [])

  // שער ההרשמה הציבורית — סגור/פתוח (+ קוד עוקף סודי ?signup=CODE לטסטים)
  const [registrationOpen, setRegistrationOpen] = useState(true)
  const [signupCode, setSignupCode] = useState('')
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('signup') ?? ''
    setSignupCode(code)
    fetch(`/api/portal/registration-status${code ? `?signup=${encodeURIComponent(code)}` : ''}`)
      .then(r => r.json()).then(d => setRegistrationOpen(d.open !== false)).catch(() => {})
  }, [])

  // Loan request form
  const [loanForm, setLoanForm] = useState({
    amount: '', installments: '', purpose: '', purpose_details: '', declaration: '', notes: '',
  })
  const [loanWeddingFile, setLoanWeddingFile] = useState<File | null>(null)
  const [loanOtherFile, setLoanOtherFile] = useState<File | null>(null)
  const WEDDING_PURPOSE = 'נישואי הבן/הבת'

  // עדכון פרטים (משפחה מאושרת)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({ phone: '', phone2: '', spouse_phone: '', address: '', city: '', email: '', marital_status: '' })
  const [editChildren, setEditChildren] = useState<ChildEntry[]>([])
  const [editChildIdErrors, setEditChildIdErrors] = useState<Record<number, string>>({})
  const [editSaving, setEditSaving] = useState(false)
  // האם מספר טלפון כבר מאומת עבור הנרשם (מתוך verified_phones)
  const isVerifiedPhone = (v: string) => {
    const n = (v ?? '').replace(/\D/g, '')
    return n.length >= 9 && (beneficiary?.verified_phones ?? []).some(x => (x ?? '').replace(/\D/g, '') === n)
  }
  const openEditDetails = () => {
    if (!beneficiary) return
    setEditForm({
      phone: beneficiary.phone ?? '', phone2: beneficiary.phone2 ?? '', spouse_phone: beneficiary.spouse_phone ?? '',
      address: beneficiary.address ?? '',
      city: beneficiary.city ?? '', email: beneficiary.email ?? '', marital_status: beneficiary.marital_status ?? '',
    })
    setEditChildren((beneficiary.children ?? []).map(c => ({
      name: c.name ?? '', id_number: c.id_number ?? '', gender: c.gender ?? '',
      birth_date: c.birth_date ?? '', marital_status: c.marital_status ?? '',
    })))
    setEditChildIdErrors({})
    setEditEmailToken(null); setEditPhoneToken(null); setEditSpousePhoneToken(null); setEditPhone2Token(null)
    setError(''); setEditOpen(true)
  }
  const handleUpdateDetails = async () => {
    if (!beneficiary) return
    // שינוי מייל/טלפון מחייב אימות הערך החדש
    const emailChanged = (editForm.email ?? '').trim().toLowerCase() !== (beneficiary.email ?? '').trim().toLowerCase()
    const phoneChanged = (editForm.phone ?? '').replace(/\D/g, '') !== (beneficiary.phone ?? '').replace(/\D/g, '')
    if (emailChanged && editForm.email && !editEmailToken) { setError('יש לאמת את כתובת המייל החדשה בקוד שנשלח אליה.'); return }
    if (phoneChanged && editForm.phone && !editPhoneToken) { setError('יש לאמת את מספר הטלפון החדש בקוד שיוקרא בשיחה.'); return }
    // טלפון נוסף לא יכול להיות זהה לטלפון הבעל או האשה
    if (editForm.phone2 && editForm.phone2.trim()) {
      const ep2 = editForm.phone2.replace(/\D/g, '')
      if (editForm.phone && ep2 === editForm.phone.replace(/\D/g, '')) {
        setError('טלפון נוסף זהה לטלפון הבעל — יש להזין מספר אחר'); return
      }
      if (editForm.spouse_phone && ep2 === editForm.spouse_phone.replace(/\D/g, '')) {
        setError('טלפון נוסף זהה לטלפון האשה — יש להזין מספר אחר'); return
      }
    }
    // אימות פרטי הילדים — כל ילד שמולא חייב שם + תעודת זהות תקינה
    for (let i = 0; i < editChildren.length; i++) {
      const c = editChildren[i]
      const cid = (c.id_number || '').replace(/\D/g, '')
      if (!c.name && !cid) continue   // שורה ריקה — תסונן מהמשלוח
      if (!c.name || !cid) { setError(`יש להשלים שם ותעודת זהות עבור ילד ${i + 1}`); return }
      if (!validateIsraeliId(cid)) {
        setEditChildIdErrors(er => ({ ...er, [i]: 'תעודת הזהות שהזנתם אינה תקינה' }))
        setError(`תעודת הזהות של ילד ${i + 1} אינה תקינה`); return
      }
    }
    setEditSaving(true); setError('')
    try {
      // כל טלפון שאומת כעת (זוגות ערך+אסימון) → יתווסף לרשימת המספרים המאומתים
      const phoneTokens = [
        { value: editForm.phone, token: editPhoneToken },
        { value: editForm.spouse_phone, token: editSpousePhoneToken },
        { value: editForm.phone2, token: editPhone2Token },
      ].filter(p => p.value && p.value.trim() && p.token)
      const childrenPayload = editChildren.filter(c => c.name && c.id_number).map(c => ({
        name: c.name, id_number: c.id_number, gender: c.gender, birth_date: c.birth_date, marital_status: c.marital_status,
      }))
      const res = await fetch('/api/portal/update-details', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, ...editForm, email_verify_token: editEmailToken, phone_verify_token: editPhoneToken, phone_tokens: phoneTokens,
          children: childrenPayload, children_count: childrenPayload.length }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בעדכון'); setEditSaving(false); return }
      setBeneficiary(b => b ? { ...b, ...editForm, children: childrenPayload, children_count: childrenPayload.length } : b)
      setEditOpen(false)
    } catch { setError('שגיאת רשת') }
    setEditSaving(false)
  }

  const setReg = (k: keyof typeof regForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setRegForm(f => ({ ...f, [k]: e.target.value }))

  const setBirth = (k: keyof typeof birthForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setBirthForm(f => ({ ...f, [k]: e.target.value }))

  const setLoan = (k: keyof typeof loanForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setLoanForm(f => ({ ...f, [k]: e.target.value }))

  // שדות מספריים עם תקרה — חוסם הקלדה מעבר למקסימום (סכום עד 30,000, תשלומים עד 60)
  const setLoanClamped = (k: keyof typeof loanForm, max: number) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      let v = e.target.value
      if (v !== '') {
        const n = Number(v)
        if (!Number.isNaN(n) && n > max) v = String(max)
      }
      setLoanForm(f => ({ ...f, [k]: v }))
    }

  const showSpouseFields = MARRIED_STATUSES.includes(regForm.marital_status)
  const regGender = genderFromMarital(regForm.marital_status)

  // Set page title
  useEffect(() => { document.title = 'היכל החתם סופר' }, [])

  // Load recovery homes
  useEffect(() => {
    if (step === 'new-birth') {
      fetch('/api/portal/hebrewdate').catch(() => {})
    }
  }, [step])

  // ── Lookup ──
  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault()
    const raw = idInput.trim()
    if (docType === 'id') {
      const digits = raw.replace(/\D/g, '')
      if (!digits || digits.length < 5) { setError('אנא הזן מספר תעודת זהות'); return }
      if (!validateIsraeliId(digits)) { setError('תעודת הזהות שהזנתם אינה תקינה'); return }
      setError('')
      setLoading(true)
      try {
        const res = await fetch(`/api/portal/lookup?id=${encodeURIComponent(digits)}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'שגיאת שרת'); return }
        if (data.found) {
          // נדרש קוד זמני (מייל/טלפון) לפני חשיפת פרטי המוטב — אין יותר סיסמה קבועה
          setPendingAuth({ idType: 'id', id: digits })
          setAuthEmailHint(data.emailHint || '')
          setAuthMode('login')
          setPhoneStep(''); setEmailStep(''); setAuthCode('')
          setAuthView(intendedAction.current ? 'login' : 'intro')
          setBenefitsSentTo(null); setBenefitsErr(''); setStatusSentTo(null); setStatusErr('')
          setStep('portal-auth')
        }
        else if (data.foundAsChild) {
          setChildMatch({ parentName: data.parentName, childData: data.childData, parentLineage: data.parentLineage })
          setStep('found-as-child')
        }
        else { setRegForm(f => ({ ...f, id_number: digits })); setStep('not-found') }
      } catch { setError('שגיאת רשת. אנא נסה שוב.') }
      setLoading(false)
    } else {
      if (!raw || raw.length < 5) { setError('אנא הזן מספר דרכון'); return }
      setError('')
      setLoading(true)
      try {
        const res = await fetch(`/api/portal/lookup?passport=${encodeURIComponent(raw)}`)
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'שגיאת שרת'); return }
        if (data.found) {
          setPendingAuth({ idType: 'passport', id: raw })
          setAuthEmailHint(data.emailHint || '')
          setAuthMode('login')
          setPhoneStep(''); setEmailStep(''); setAuthCode('')
          setAuthView(intendedAction.current ? 'login' : 'intro')
          setBenefitsSentTo(null); setBenefitsErr(''); setStatusSentTo(null); setStatusErr('')
          setStep('portal-auth')
        }
        else { setRegDocType('passport'); setRegForm(f => ({ ...f, id_number: raw })); setStep('not-found') }
      } catch { setError('שגיאת רשת. אנא נסה שוב.') }
      setLoading(false)
    }
  }

  // ── אימות פורטל: כניסה עם סיסמה / הגדרת סיסמה דרך קוד למייל ──
  const enterDashboard = (b: FoundBeneficiary, docs: Record<string, { url: string; name: string }>) => {
    setBeneficiary(b)
    setExistingDocs(docs ?? {})
    setReplaceDoc({})
    setAuthPassword(''); setAuthPassword2(''); setAuthCode('')
    setPhoneStep(''); setAuthPhones([]); setAuthPhoneHint('')
    setStep('dashboard')
  }

  // שליחת קוד זמני למייל → מסך הזנת קוד → כניסה (ללא סיסמה קבועה)
  const handleSendCode = async () => {
    if (!pendingAuth) return
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/send-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType: pendingAuth.idType, id: pendingAuth.id }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאת שרת'); setLoading(false); return }
      if (data.emailHint) setAuthEmailHint(data.emailHint)
      setAuthCode(''); setEmailStep('code')
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setLoading(false)
  }

  // אימות קוד המייל הזמני → כניסה (סשן), ללא סיסמה קבועה
  const handleVerifyEmailCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingAuth) return
    if (!authCode) { setError('אנא הזן את הקוד שנשלח למייל'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/verify-email-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType: pendingAuth.idType, id: pendingAuth.id, code: authCode }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאת שרת'); setLoading(false); return }
      enterDashboard(data.beneficiary, data.documents)
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setLoading(false)
  }

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingAuth) return
    if (authPassword !== authPassword2) { setError('הסיסמאות אינן תואמות'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/set-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType: pendingAuth.idType, id: pendingAuth.id, code: authCode, password: authPassword }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאת שרת'); setLoading(false); return }
      enterDashboard(data.beneficiary, data.documents)
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setLoading(false)
  }

  // ── כניסה עם קוד בשיחה טלפונית (צינתוק ימות) ──
  const handleListPhones = async () => {
    if (!pendingAuth) return
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/send-phone-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType: pendingAuth.idType, id: pendingAuth.id }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאת שרת'); setLoading(false); return }
      if (!data.phones || data.phones.length === 0) {
        setError('לא נמצא מספר טלפון במערכת עבור משתמש זה. אנא היכנס עם סיסמה או פנה למשרד.'); setLoading(false); return
      }
      setAuthPhones(data.phones); setPhoneStep('choose')
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setLoading(false)
  }

  const handleSendPhoneCode = async (index: number) => {
    if (!pendingAuth) return
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/send-phone-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType: pendingAuth.idType, id: pendingAuth.id, phoneIndex: index }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאת שרת'); setLoading(false); return }
      setAuthPhoneHint(data.phoneHint || ''); setAuthCode(''); setPhoneStep('code')
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setLoading(false)
  }

  const handleVerifyPhoneCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pendingAuth) return
    if (!authCode) { setError('אנא הזן את הקוד שהוקרא בשיחה'); return }
    setError(''); setLoading(true)
    try {
      const res = await fetch('/api/portal/auth/verify-phone-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType: pendingAuth.idType, id: pendingAuth.id, code: authCode }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאת שרת'); setLoading(false); return }
      enterDashboard(data.beneficiary, data.documents)
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setLoading(false)
  }

  // ── סדר הדורות המלא: דור 1 (החתם סופר, נעול) → נתיב מהעץ → דורות ידניים → הנרשם עצמו ──
  // לכל דור אחרי הראשון יש סימון בן/חתן (relKey). השם של הנרשם נכנס אוטומטית כדור האחרון.
  // שם הנרשם לעץ הדורות — שם פרטי תחילה, ובזוג נשוי כולל את שם האשה: "שלמה ושרה ניימאן"
  // האם כבר אומת לפחות טלפון אחד — קובע אם להציג הבהרה שאימות שאר הטלפונים אינו חובה
  const anyPhoneVerified = Boolean(regPhoneToken || regSpousePhoneToken || regPhone2Token)
  const phoneOptionalHint = 'אימות מספר זה אינו חובה — אימתם כבר מספר טלפון אחד, ודי בכך להשלמת הרישום. אמתו מספר זה רק אם תרצו שגם באמצעותו ניתן יהיה לקבל בעתיד קוד כניסה למערכת.'

  const selfDisplayName = (() => {
    const given = (showSpouseFields && regForm.spouse_name)
      ? `${regForm.full_name} ו${regForm.spouse_name}`.trim()
      : (regForm.full_name || '')
    return [given, regForm.family_name].filter(Boolean).join(' ').trim()
  })()
  const buildLineageChain = () => {
    const chain: { generation: number; name: string; relKey: string | null; relation: 'son' | 'son_in_law' | null }[] = []
    lineagePath.forEach((name, i) => {
      // דור 1 (שורש) ללא קשר; שאר הנתיב המאומת — קשר אוטומטי מהגדרת העץ בניהול (לא נסמן ע"י הנרשם)
      chain.push({ generation: i + 1, name, relKey: null, relation: i === 0 ? null : (pathRelations[i] ?? null) })
    })
    // מספור עקבי לפי סדר הדורות שמולאו (כולל דילוג על שורות ריקות) — מונע כפילות דור
    let gen = lineagePath.length
    manualLineage.forEach((name, i) => {
      if (!name.trim()) return
      gen += 1
      const relKey = `m${i}`
      chain.push({ generation: gen, name: name.trim(), relKey, relation: lineageRelations[relKey] ?? null })
    })
    chain.push({
      generation: gen + 1,
      name: selfDisplayName, relKey: 'self', relation: lineageRelations['self'] ?? null,
    })
    return chain
  }

  // צבעי בן/חתן — אחידים בכל המערכת: בן = כחול בהיר · חתן = ענבר בהיר
  const REL_CLS = {
    son: 'bg-blue-50 text-blue-700 border-blue-200',
    son_in_law: 'bg-amber-50 text-amber-700 border-amber-200',
  } as const
  const REL_SEL = {
    son: 'bg-blue-100 text-blue-800 border-blue-400',
    son_in_law: 'bg-amber-100 text-amber-800 border-amber-400',
  } as const

  // בורר בן/חתן שהנרשם מסמן (לדור שהוא מציע)
  const renderRelToggle = (relKey: string) => (
    <div className="flex gap-1.5 flex-shrink-0">
      {(['son', 'son_in_law'] as const).map(r => (
        <button type="button" key={r}
          onClick={() => setLineageRelations(prev => ({ ...prev, [relKey]: r }))}
          className={`text-xs px-3 py-1 rounded-full border transition-all duration-150 font-semibold ${
            lineageRelations[relKey] === r ? REL_SEL[r] : 'bg-white text-slate-400 border-slate-300 hover:border-slate-400'
          }`}>
          {r === 'son' ? 'בן' : 'חתן'}
        </button>
      ))}
    </div>
  )

  // תווית קשר אוטומטית (מהגדרת העץ בניהול) — קריאה בלבד
  const renderRelAuto = (r: 'son' | 'son_in_law' | null) => (
    <span className={`text-xs px-3 py-1 rounded-full border font-semibold flex-shrink-0 ${r ? REL_CLS[r] : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
      {r === 'son' ? 'בן' : r === 'son_in_law' ? 'חתן' : '—'}
    </span>
  )

  // ── Registration ──
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!regForm.full_name || !regForm.family_name || !regForm.phone) {
      setError('אנא מלא את כל שדות החובה: שם פרטי, שם משפחה וטלפון')
      return
    }
    // כתובת מלאה חובה — עיר, רחוב ומספר בית (הכתובת נשמרת כמחרוזת "רחוב מספר")
    if (!regForm.city.trim()) { setError('אנא בחר עיר מגורים'); return }
    {
      const addr = (regForm.address || '').trim()
      const m = addr.match(/^(.*?)\s*(\d[\d/א-ת\s]*)$/) // רחוב + מספר בית בסוף
      const streetPart = (m ? m[1] : addr).trim()
      const housePart = (m ? m[2] : '').trim()
      if (!streetPart) { setError('אנא הזן שם רחוב'); return }
      if (!housePart) { setError('אנא הזן מספר בית'); return }
    }
    // ברישום כילד רשום — השיוך אוטומטי מההורה. אחרת — דרך בורר הדורות.
    if (!childParentLineage) {
      if (!lineageDeclared) {
        setError('יש לאשר את הצהרת הייחוס לפני בחירת סדר הדורות')
        return
      }
      if (!lineageResult.valid) {
        setError('יש להשלים את סדר הדורות עד הדור שלך, לסמן בן/חתן בכל דור וללחוץ "הוסף אותי"')
        return
      }
    }
    if (regDocType === 'id' && regForm.id_number && !validateIsraeliId(regForm.id_number)) {
      setIdFieldError('תעודת הזהות שהזנתם אינה תקינה'); setError('אנא תקן את שגיאות הטופס'); return
    }
    if (showSpouseFields && regForm.spouse_id_number) {
      if (spouseDocType === 'id' && !validateIsraeliId(regForm.spouse_id_number)) {
        setSpouseIdError('תעודת הזהות שהזנתם אינה תקינה'); setError('אנא תקן את שגיאות הטופס'); return
      }
      const sIdClean = spouseDocType === 'passport' ? regForm.spouse_id_number.trim() : regForm.spouse_id_number.replace(/\D/g, '')
      const hIdClean = regDocType === 'passport' ? regForm.id_number.trim() : regForm.id_number.replace(/\D/g, '')
      if (sIdClean === hIdClean) {
        setSpouseIdError('המספר שהזנת זהה לזה של הבעל'); setError('אנא תקן את שגיאות הטופס'); return
      }
      // Check if spouse ID already exists in DB
      try {
        const chkParam = spouseDocType === 'passport' ? `passport=${encodeURIComponent(sIdClean)}` : `id=${sIdClean}`
        const chkRes = await fetch(`/api/portal/lookup?${chkParam}`)
        const chkData = await chkRes.json()
        if (chkData.found) {
          setSpouseIdError('מספר זה כבר רשום במערכת — לא ניתן לרשום אותו שוב'); setError('אנא תקן את שגיאות הטופס'); return
        }
      } catch { /* network error — continue */ }
    }
    // טלפון האשה אינו חובה — מאמתים רק אם הוזן (פורמט + מניעת כפילות עם הבעל)
    if (showSpouseFields && regForm.spouse_phone && regForm.spouse_phone.trim()) {
      if (!validatePhone(regForm.spouse_phone)) {
        setSpousePhoneError('אנא הזן מספר נייד תקין המתחיל ב-05'); setError('אנא תקן את שגיאות הטופס'); return
      }
      if (regForm.phone && regForm.spouse_phone.replace(/\D/g, '') === regForm.phone.replace(/\D/g, '')) {
        setSpousePhoneError('מספר הטלפון של האישה זהה למספר הטלפון של הבעל'); setError('אנא תקן את שגיאות הטופס'); return
      }
    }
    if (regForm.phone && !validatePhone(regForm.phone)) {
      setPhoneError('אנא הזן מספר נייד תקין המתחיל ב-05'); setError('אנא תקן את שגיאות הטופס'); return
    }
    if (regForm.phone2 && regForm.phone2.trim() && !validatePhone(regForm.phone2)) {
      setError('טלפון נוסף אינו תקין — יש להזין מספר נייד ישראלי המתחיל ב-05'); return
    }
    // טלפון נוסף לא יכול להיות זהה לטלפון הבעל או האשה
    if (regForm.phone2 && regForm.phone2.trim()) {
      const p2 = regForm.phone2.replace(/\D/g, '')
      if (regForm.phone && p2 === regForm.phone.replace(/\D/g, '')) {
        setError('טלפון נוסף זהה לטלפון הבעל — יש להזין מספר אחר'); return
      }
      if (regForm.spouse_phone && p2 === regForm.spouse_phone.replace(/\D/g, '')) {
        setError('טלפון נוסף זהה לטלפון האשה — יש להזין מספר אחר'); return
      }
    }
    if (regForm.email && !validateEmail(regForm.email)) {
      setEmailError('אנא הזן כתובת מייל תקינה'); setError('אנא תקן את שגיאות הטופס'); return
    }
    if (!regEmailToken) { setError('יש לאמת את כתובת המייל בקוד שנשלח אליה (כפתור "שליחת קוד אימות למייל").'); return }
    // טלפונים — חייב לפחות אחד ממולא, ולפחות אחד מאומת (המשתמש בוחר אילו לאמת)
    const regPhoneEntries = [
      { value: regForm.phone, token: regPhoneToken },
      { value: regForm.spouse_phone, token: regSpousePhoneToken },
      { value: regForm.phone2, token: regPhone2Token },
    ].filter(p => p.value && p.value.trim())
    if (regPhoneEntries.length === 0) { setError('אנא הזן לפחות מספר טלפון אחד'); return }
    if (!regPhoneEntries.some(p => p.token)) {
      setError('יש לאמת לפחות מספר טלפון אחד — לחצו על "קבלת קוד אימות בשיחה" ליד אחד הטלפונים.'); return
    }
    if (!regForm.birth_date) { setError('אנא הזן תאריך לידה'); return }
    if (showSpouseFields && !regForm.spouse_birth_date) { setError('אנא הזן תאריך לידה של האשה'); return }

    // הטבות בעבר — חובה לסמן לפחות אפשרות אחת (או "לא קיבלתי הטבות בעבר").
    // בלי זה אי אפשר להבחין בין "לא קיבל" לבין "שכח למלא".
    {
      const pb = pastBenefits
      const picked = pb.none || pb.recovery_home || pb.food_card || pb.holiday_grant
        || pb.catering || pb.tishrei_5786 || pb.pesach_5786 || pb.shavuot_5786
        || pb.loan || pb.other
      if (!picked) {
        setError('בשאלה על הטבות שהתקבלו בעבר — יש לסמן לפחות אפשרות אחת, או לסמן "לא קיבלתי הטבות בעבר".')
        return
      }
      if (pb.holiday_grant && !pb.tishrei_5786 && !pb.pesach_5786 && !pb.shavuot_5786) {
        setError('סימנתם "מענק לקראת החגים" — יש לבחור באילו חגים קיבלתם אותו.')
        return
      }
    }
    if (!declaredReg) { setError('אנא אשר את ההצהרה'); return }
    setError('')
    setLoading(true)
    try {
      // ייחוס לשליחה: ברישום כילד רשום — נגזר אוטומטית מההורה (שרשרת ההורה + הנרשם כדור אחרון)
      const pc = childParentLineage?.lineage_chain
      const lineageData = childParentLineage && pc
        ? {
            lineage_node_id: childParentLineage.lineage_node_id,
            lineage_manual: [],
            lineage_chain: [...pc, { generation: (pc[pc.length - 1]?.generation ?? 0) + 1, name: selfDisplayName, relation: 'son' as const }],
            lineage_new_nodes: [{ name: selfDisplayName, relation: 'son' as const }],
          }
        : (() => {
            // מבורר הדורות: דור 1 (החתם סופר) + האבות שנבחרו + הנרשם
            const anc = lineageResult.ancestors
            const chainPayload = [
              { generation: 1, name: 'רבינו החתם סופר', relation: null as 'son' | 'son_in_law' | null },
              ...anc.map((a, i) => ({ generation: i + 2, name: a.name, relation: a.relation })),
              { generation: anc.length + 2, name: selfDisplayName, relation: lineageResult.selfRelation },
            ]
            return {
              lineage_node_id: lineageResult.nodeId,
              lineage_manual: anc.filter(a => a.isNew).map(a => a.name),
              lineage_chain: chainPayload,
              lineage_new_nodes: [
                ...anc.filter(a => a.isNew).map(a => ({ name: a.name, relation: a.relation })),
                { name: selfDisplayName, relation: lineageResult.selfRelation },
              ],
            }
          })()
      const res = await fetch('/api/portal/public-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...regForm,
          bypass: signupCode,
          email_verify_token: regEmailToken,
          phone_verify_token: regPhoneToken,
          // כל הטלפונים שאומתו (זוגות ערך+אסימון) — נשמרים כמספרים המאומתים
          phone_tokens: [
            { value: regForm.phone, token: regPhoneToken },
            { value: regForm.spouse_phone, token: regSpousePhoneToken },
            { value: regForm.phone2, token: regPhone2Token },
          ].filter(p => p.value && p.value.trim() && p.token),
          id_doc_type: regDocType,
          children_count: children.length,
          children: children.map(c => ({ name: c.name, id_number: c.id_number, gender: c.gender, birth_date: c.birth_date, marital_status: c.marital_status })),
          ...lineageData,
          past_benefits: pastBenefits,
          spouse_name: showSpouseFields ? regForm.spouse_name : null,
          spouse_id_number: showSpouseFields ? regForm.spouse_id_number : null,
          spouse_id_doc_type: showSpouseFields ? spouseDocType : null,
          spouse_phone: showSpouseFields ? regForm.spouse_phone : null,
          spouse_birth_date: showSpouseFields ? (regForm.spouse_birth_date || null) : null,
          signature: regSignature || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשמירת הנתונים'); return }
      setRegSuccess(true)

      // Show confetti popup with registrant details
      const fullName = [regForm.family_name, regForm.full_name].filter(Boolean).join(' ')
      setRegSuccessDetails({ name: fullName, idNumber: regForm.id_number, phone: regForm.phone, email: regForm.email })
      setShowRegSuccess(true)
      setStep('register-success')

      // Auto-reset after 5s
      setTimeout(() => {
        setShowRegSuccess(false)
        setRegSuccessDetails(null)
        backToHome()
      }, 5000)
    } catch {
      setError('שגיאת רשת. אנא נסה שוב.')
    } finally {
      setLoading(false)
    }
  }

  // ── Suggest lineage node ──
  const handleSuggestLineage = async () => {
    if (!suggestName.trim()) { setSuggestError('נא להזין שם'); return }
    if (!suggestParentId) { setSuggestError('נא לבחור הורה בעץ'); return }
    if (!suggestRelation) { setSuggestError('נא לסמן האם הוא בן או חתן'); return }
    setSuggestSubmitting(true); setSuggestError('')
    try {
      const res = await fetch('/api/portal/suggest-lineage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: suggestName.trim(), parent_id: suggestParentId || null, relation: suggestRelation }),
      })
      const data = await res.json()
      if (!res.ok) { setSuggestError(data.error || 'שגיאה'); return }
      // Select the new pending node automatically
      const node = data.node
      setLineageNodeId(node.id)
      setLineagePath([...allLineageNodes.find(n => n.id === suggestParentId)
        ? [`דור ${node.generation - 1} — ${allLineageNodes.find(n => n.id === suggestParentId)?.name ?? ''}`]
        : [], `${node.name} (ממתין לאימות)`])
      setSuggestOpen(false); setSuggestName(''); setSuggestParentId('')
    } catch { setSuggestError('שגיאת רשת') }
    finally { setSuggestSubmitting(false) }
  }

  // ── Birth request ──
  // העלאת צילומי ת.ז הנדרשים יחד עם הבקשה (בצאצא שטרם אושר). מחזיר false בשגיאה.
  const uploadRequiredIdDocs = async (): Promise<boolean> => {
    if (!beneficiary) return false
    const fd = new FormData()
    fd.append('beneficiary_id', beneficiary.id)
    let any = false
    for (const d of requiredDocs) {
      if (!existingDocs[d] && docFiles[d]) { fd.append(d, docFiles[d] as File); any = true }
    }
    if (!any) return true
    const res = await fetch('/api/portal/upload-docs', { method: 'POST', body: fd })
    return res.ok
  }
  // המסמכים שעדיין חסרים להגשת הבקשה (לא קיימים וגם לא נבחר קובץ)
  const missingRequestIdDocs = () => requiredDocs.filter(d => !existingDocs[d] && !docFiles[d])

  const handleBirthRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!birthForm.birth_date) { setError('אנא הזן תאריך לידה'); return }
    // חלון ההגשה: 30 יום מהלידה. (הכרטיס תקף 6 שבועות — ההגשה נסגרת מוקדם
    // יותר בכוונה, כדי שיישאר מרווח בין האישור לבין תום התוקף.)
    {
      const bd = new Date(birthForm.birth_date); bd.setHours(0, 0, 0, 0)
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const deadline = new Date(bd.getTime() + MATERNITY_SUBMIT_DAYS * 86400000)
      if (today > deadline) {
        setError('ניתן להגיש בקשה עד 30 יום מתאריך הלידה. אם קיימות נסיבות מיוחדות, נשמח לסייע — אנא פנו למשרד.')
        return
      }
    }
    if (!birthForm.baby_gender) { setError(isTwins ? 'אנא בחר בן או בת עבור התינוק הראשון' : 'אנא בחר בן או בת'); return }
    // שם הנולד/ת אינו חובה — ניתן להשלים בכניסה הבאה
    if (!birthForm.baby_id_number.trim()) { setError('אנא הזן תעודת זהות או דרכון של הנולד/ת'); return }
    if (birthForm.baby_id_type === 'id' && !validateIsraeliId(birthForm.baby_id_number)) { setError('תעודת הזהות של הנולד/ת אינה תקינה'); return }
    if (babyIdError) { setError(babyIdError); return }
    // תאומים — אימות התינוק השני
    if (isTwins) {
      if (!baby2.baby_gender) { setError('אנא בחר בן או בת עבור התינוק השני'); return }
      if (!baby2.baby_id_number.trim()) { setError('אנא הזן תעודת זהות או דרכון של התינוק השני'); return }
      if (baby2.baby_id_type === 'id' && !validateIsraeliId(baby2.baby_id_number)) { setError('תעודת הזהות של התינוק השני אינה תקינה'); return }
      if (baby2IdError) { setError(baby2IdError); return }
      const id1 = birthForm.baby_id_number.replace(/\D/g, '') || birthForm.baby_id_number.trim()
      const id2 = baby2.baby_id_number.replace(/\D/g, '') || baby2.baby_id_number.trim()
      if (id1 && id1 === id2) { setError('שני התאומים חייבים להיות עם תעודות זהות שונות'); return }
    }
    if (!birthForm.recovery_home) { setError('אנא בחר בית החלמה'); return }
    if (!birthCertFile) { setError('אנא צרף אישור לידה'); return }
    if (!beneficiary) return
    if (needsIdWithRequest) {
      const miss = missingRequestIdDocs()
      if (miss.length) { setError(`לאישור ראשוני אנא צרף גם: ${miss.map(docLabel).join(', ')}`); return }
    }
    setError('')
    setLoading(true)
    try {
      // צירוף צילומי ת.ז (בקשה ראשונה לפני אישור)
      if (needsIdWithRequest && !(await uploadRequiredIdDocs())) {
        setError('שגיאה בהעלאת תעודת הזהות. אנא נסה שוב.'); setLoading(false); return
      }
      // Upload birth certificate first
      let certUrl = ''
      const fd = new FormData()
      fd.append('file', birthCertFile)
      fd.append('beneficiary_id', beneficiary.id)
      fd.append('doc_type', 'birth_cert')
      const upRes = await fetch('/api/portal/upload-docs', { method: 'POST', body: fd })
      const upData = await upRes.json()
      if (upRes.ok) certUrl = upData.url ?? ''

      // רשימת התינוקות — תינוק אחד בלידה רגילה, שניים בתאומים
      const babies = [
        { name: birthForm.baby_name, gender: birthForm.baby_gender, id_type: birthForm.baby_id_type, id_number: birthForm.baby_id_number },
        ...(isTwins ? [{ name: baby2.baby_name, gender: baby2.baby_gender, id_type: baby2.baby_id_type, id_number: baby2.baby_id_number }] : []),
      ]
      const res = await fetch('/api/portal/birth-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, ...birthForm, is_twins: isTwins, babies, birth_certificate_url: certUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחת הבקשה'); return }
      setRequestType('birth')
      setStep('request-sent')
    } catch {
      setError('שגיאת רשת. אנא נסה שוב.')
    }
    setLoading(false)
  }

  // ── Loan request ──
  const handleLoanRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loanForm.amount || !loanForm.installments || !loanForm.purpose) {
      setError('אנא מלא את כל שדות החובה')
      return
    }
    if (Number(loanForm.amount) > 30000) { setError('הסכום המרבי הוא 30,000 ₪'); return }
    if (Number(loanForm.installments) > 60) { setError('מספר התשלומים המרבי הוא 60'); return }
    if (loanForm.purpose && loanForm.purpose !== WEDDING_PURPOSE && !loanForm.purpose_details.trim()) { setError('אנא פרט את מטרת ההלוואה'); return }
    if (loanForm.purpose === WEDDING_PURPOSE && !loanWeddingFile) { setError('יש לצרף הזמנה של החתונה'); return }
    if (!beneficiary) return
    if (needsIdWithRequest) {
      const miss = missingRequestIdDocs()
      if (miss.length) { setError(`לאישור ראשוני אנא צרף גם: ${miss.map(docLabel).join(', ')}`); return }
    }
    setError('')
    setLoading(true)
    try {
      if (needsIdWithRequest && !(await uploadRequiredIdDocs())) {
        setError('שגיאה בהעלאת תעודת הזהות. אנא נסה שוב.'); setLoading(false); return
      }
      // העלאת מסמך מצורף (הזמנת חתונה — חובה לנישואין; מסמך תומך — לא חובה לשאר) ושיוכו לבקשה
      const documentUrls: { url: string; name: string }[] = []
      const isWedding = loanForm.purpose === WEDDING_PURPOSE
      const fileToUpload = isWedding ? loanWeddingFile : loanOtherFile
      if (fileToUpload) {
        const wf = new FormData()
        wf.append('file', fileToUpload)
        wf.append('beneficiary_id', beneficiary.id)
        wf.append('doc_type', isWedding ? 'wedding_invite' : 'loan_doc')
        const wRes = await fetch('/api/portal/upload-docs', { method: 'POST', body: wf })
        const wData = await wRes.json()
        if (!wRes.ok || !wData.url) { setError('שגיאה בהעלאת המסמך. אנא נסה שוב.'); setLoading(false); return }
        documentUrls.push({ url: wData.url, name: fileToUpload.name })
      }
      const res = await fetch('/api/portal/loan-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, ...loanForm, document_urls: documentUrls }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחת הבקשה'); return }
      setLoanModalOpen(false)
      setLoanWeddingFile(null)
      setRequestType('loan')
      setStep('request-sent')
    } catch {
      setError('שגיאת רשת. אנא נסה שוב.')
    }
    setLoading(false)
  }

  const handleFinancialAidRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!aidReason.trim()) { setError('אנא פרט את סיבת הבקשה'); return }
    if (!aidFile) { setError('אנא צרף מסמך'); return }
    if (!beneficiary) return
    // משפחה שטרם אושרה — חובה שיהיו צילומי ת.ז (מצורפים כעת או שכבר התקבלו במערכת); נשלחים לגורם המאשר
    if (!isApproved) {
      const miss = requiredDocs.filter(d => !docFiles[d] && !existingDocs[d])
      if (miss.length) { setError(`המשפחה טרם אושרה — חובה לצרף ${miss.map(docLabel).join(', ')}`); return }
    }
    setError(''); setLoading(true)
    try {
      if (!isApproved) {
        const fdId = new FormData()
        fdId.append('beneficiary_id', beneficiary.id)
        let any = false
        for (const d of requiredDocs) { if (docFiles[d]) { fdId.append(d, docFiles[d] as File); any = true } }
        if (any) {
          const r = await fetch('/api/portal/upload-docs', { method: 'POST', body: fdId })
          if (!r.ok) { setError('שגיאה בהעלאת תעודת הזהות. אנא נסה שוב.'); setLoading(false); return }
        }
      }
      const fd = new FormData()
      fd.append('beneficiary_id', beneficiary.id)
      fd.append('reason', aidReason.trim())
      fd.append('file', aidFile)
      const res = await fetch('/api/portal/financial-aid-request', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחת הבקשה'); return }
      setAidModalOpen(false); setAidReason(''); setAidFile(null)
      setRequestType('financial_aid')
      setStep('request-sent')
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setLoading(false)
  }

  // ─── Status badge ───
  const isPending = beneficiary?.eligibility_status === 'pending' || beneficiary?.eligibility_status === 'review'
  const isDocsPending = beneficiary?.eligibility_status === 'docs_pending'
  const isApproved = beneficiary?.eligibility_status === 'approved'
  const isRejected = beneficiary?.eligibility_status === 'rejected'

  // Which documents are required — secretary's checklist takes priority, else by marital status
  const requiredDocs: string[] = (() => {
    const rd = (beneficiary?.required_docs ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (rd.length) return rd
    const ms = beneficiary?.marital_status ?? ''
    if (ms === 'נשואים') return ['id_husband', 'id_wife']
    if (['גרוש', 'אלמן'].includes(ms)) return ['id_husband']
    if (['גרושה', 'אלמנה'].includes(ms)) return ['id_wife']
    return ['id_husband']
  })()
  const displayName = beneficiary
    ? [beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ')
    : ''

  // קישור mailto ל-igud עם הת"ז (שאיתה התחבר) בשורת הנושא — כדי שהמענה האוטומטי יזהה אוטומטית
  const igudMailto = `mailto:igud@chasamsofer.info?subject=${encodeURIComponent('תעודת זהות ' + (beneficiary?.id_number || pendingAuth?.id || ''))}`

  // צאצא שטרם אושר — בהגשת הבקשה הראשונה נצרף גם צילומי תעודת זהות (אם עוד לא הועלו)
  const needsIdWithRequest = !!beneficiary && !isApproved && requiredDocs.some(d => !existingDocs[d])
  // האם עדיין חסרים מסמכים נדרשים (לכרטיס "העלאת מסמכים נדרשים" בדשבורד)
  const docsMissing = !!beneficiary && requiredDocs.some(d => !existingDocs[d])

  // בקשת הבראה ליולדת — זמינה רק לרשומים במצב נשואים
  const canRequestBirth = !!beneficiary?.marital_status && MARRIED_STATUSES.includes(beneficiary.marital_status)

  const goToBirthForm = () => {
    if (!canRequestBirth) { setError('בקשת הבראה ליולדת זמינה לרשומים במצב נשואים בלבד.'); return }
    if (isDocsPending) { setError('נדרשת השלמת מסמכים. בדוק את המייל שנשלח אליך.'); return }
    setError(''); setBabyIdError(''); setNoBabyName(false)
    setIsTwins(false); setBaby2({ baby_gender: '', baby_name: '', baby_id_number: '', baby_id_type: 'id' }); setNoBaby2Name(false); setBaby2IdError('')
    setBirthForm({ birth_date: '', baby_name: '', baby_gender: '', recovery_home: '', notes: '', baby_id_number: '', baby_id_type: 'id' })
    setBirthCertFile(null)
    setDocFiles({})
    setStep('new-birth')
  }
  const goToSilentBirthForm = () => {
    if (!canRequestBirth) { setError('בקשה זו זמינה לרשומים במצב נשואים בלבד.'); return }
    if (isDocsPending) { setError('נדרשת השלמת מסמכים. בדוק את המייל שנשלח אליך.'); return }
    setError(''); setShowSilentInfo(false)
    setSilentForm({ birth_date: '', recovery_home: '', notes: '' })
    setBirthCertFile(null)
    setStep('new-silent-birth')
  }
  const handleSilentBirthRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!beneficiary) return
    if (!silentForm.birth_date) { setError('אנא הזן תאריך לידה'); return }
    if (!silentForm.recovery_home) { setError('אנא בחר בית החלמה'); return }
    if (!birthCertFile) { setError('אנא צרף מסמך אישור'); return }
    setError(''); setLoading(true)
    try {
      let certUrl = ''
      const fd = new FormData()
      fd.append('file', birthCertFile)
      fd.append('beneficiary_id', beneficiary.id)
      fd.append('doc_type', 'birth_cert')
      const upRes = await fetch('/api/portal/upload-docs', { method: 'POST', body: fd })
      const upData = await upRes.json()
      if (upRes.ok) certUrl = upData.url ?? ''

      const res = await fetch('/api/portal/birth-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiary_id: beneficiary.id, birth_type: 'silent', birth_date: silentForm.birth_date, recovery_home: silentForm.recovery_home, notes: silentForm.notes, birth_certificate_url: certUrl }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בשליחת הבקשה'); return }
      setRequestType('birth')
      setStep('request-sent')
    } catch {
      setError('שגיאת רשת. אנא נסה שוב.')
    }
    setLoading(false)
  }
  const goToLoanForm = () => {
    if (isDocsPending) { setError('נדרשת השלמת מסמכים. בדוק את המייל שנשלח אליך.'); return }
    setError('')
    setLoanForm({ amount: '', installments: '', purpose: '', purpose_details: '', declaration: '', notes: '' })
    setDocFiles({})
    setLoanModalOpen(true)
  }

  // Read the intended action from the URL once on mount (from the email buttons)
  useEffect(() => {
    const a = new URLSearchParams(window.location.search).get('action')
    if (a === 'birth' || a === 'loan' || a === 'docs' || a === 'aid') intendedAction.current = a
  }, [])

  // Once the beneficiary reaches their dashboard, jump straight to the intended form
  useEffect(() => {
    if (!intendedAction.current || !beneficiary || step !== 'dashboard') return
    const a = intendedAction.current
    intendedAction.current = null
    if (a === 'birth') goToBirthForm()
    else if (a === 'loan') goToLoanForm()
    else if (a === 'aid') { setError(''); setAidModalOpen(true) }
    else if (a === 'docs') { setError(''); setDocsPendingReason(null); setStep('docs-needed') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, beneficiary])

  const handleDocsUpload = async () => {
    if (!beneficiary) return
    // מסמך נחשב קיים אם הועלה קובץ חדש או שכבר התקבל בעבר במערכת
    for (const d of requiredDocs) {
      if (!docFiles[d] && !existingDocs[d]) { setError(`אנא העלה: ${docLabel(d)}`); return }
    }
    setError(''); setDocsUploading(true)
    try {
      const newDocs = requiredDocs.filter(d => docFiles[d])
      // אין קבצים חדשים — כל הנדרש כבר קיים במערכת. אין צורך בהעלאה חוזרת.
      if (newDocs.length === 0) {
        setStep('dashboard')
        setDocsUploading(false)
        return
      }
      const fd = new FormData()
      fd.append('beneficiary_id', beneficiary.id)
      for (const d of newDocs) fd.append(d, docFiles[d] as File)
      const res = await fetch('/api/portal/upload-docs', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה בהעלאת המסמכים'); return }
      // עדכון מקומי של המסמכים שהוחלפו, כדי שיוצגו ככבר-קיימים
      setExistingDocs(prev => {
        const next = { ...prev }
        for (const d of newDocs) next[d] = { url: data.url ?? '', name: (docFiles[d] as File).name }
        return next
      })
      setDocFiles({}); setReplaceDoc({})
      // השלמת בקשת מסמכים ידנית → חזרה ל"ממתין לאישור" וניקוי הרשימה
      if (beneficiary.eligibility_status === 'docs_pending') {
        setBeneficiary(b => b ? { ...b, eligibility_status: 'pending', required_docs: '' } : b)
      }
      setStep('dashboard')
    } catch { setError('שגיאת רשת. אנא נסה שוב.') }
    setDocsUploading(false)
  }

  // הצגת שדה מסמך זהות: קובץ חדש שנבחר / קובץ שכבר התקבל (עם אפשרות החלפה) / שדה העלאה
  const renderIdDocSlot = (docType: string, label: string) => {
    const file = docFiles[docType] ?? null
    const setFile = (f: File | null) => setDocFile(docType, f)
    const existing = existingDocs[docType]
    const replacing = !!replaceDoc[docType]
    return (
      <div className="border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
        <p className="text-xs font-bold text-red-600 mb-3">חובה לצרף גם את הספח (הדף הנלווה לתעודת הזהות)</p>
        {file ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <span className="text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={14} /> {file.name}
            </span>
            <button type="button" onClick={() => setFile(null)} className="text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        ) : existing && !replacing ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
            <span className="text-sm text-green-700 flex items-center gap-2 min-w-0">
              <CheckCircle2 size={14} className="flex-shrink-0" />
              <span className="truncate">הקובץ כבר התקבל במערכת</span>
            </span>
            <div className="flex items-center gap-3 flex-shrink-0">
              {existing.url && (
                <ViewDocButton url={existing.url} name={existing.name}
                  className="text-xs text-indigo-600 hover:text-indigo-800 underline">צפייה</ViewDocButton>
              )}
              {existing.url && (
                <button type="button" onClick={() => { downloadDocDirect(existing.url!, existing.name).catch(() => {}) }}
                  className="text-xs text-emerald-600 hover:text-emerald-800 underline">הורדה</button>
              )}
              <button type="button" onClick={() => setReplaceDoc(p => ({ ...p, [docType]: true }))}
                className="text-xs text-slate-500 hover:text-slate-700 underline">החלף קובץ</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-indigo-50 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl px-4 py-3 transition-all duration-150">
              <Upload size={16} className="text-slate-400" />
              <span className="text-sm text-slate-500">לחץ להעלאת קובץ</span>
              <input type="file" accept={UPLOAD_ACCEPT} className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
            </label>
            <p className="text-xs text-slate-400">{UPLOAD_HINT}</p>
            {existing && replacing && (
              <button type="button" onClick={() => setReplaceDoc(p => ({ ...p, [docType]: false }))}
                className="text-xs text-slate-400 hover:text-slate-600 self-start">ביטול — השאר את הקובץ הקיים</button>
            )}
          </div>
        )}
      </div>
    )
  }

  // קטע העלאת צילומי ת"ז — מוצג בראש כל טופס בקשה כשהמשפחה טרם אושרה (לפני הבקשה עצמה).
  const idDocLabel = (d: string) =>
    d === 'id_husband' ? (beneficiary?.marital_status === 'נשואים' ? 'תעודת זהות — הבעל' : 'תעודת זהות שלך')
      : d === 'id_wife' ? 'תעודת זהות — האשה'
      : docLabel(d)
  const renderIdDocsSection = () => {
    // מוצג כל עוד המשפחה לא אושרה (ממתינה לאישור ראשוני). מאושרת → לא מוצג (הגשה מיידית).
    if (!beneficiary || isApproved) return null
    return (
      <Card>
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText size={20} className="text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 mb-1">צילומי תעודות זהות</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              לצורך הגשת בקשה למערכת יש להעלות תחילה צילומי תעודות זהות. לאחר מכן ניתן למלא את הבקשה למטה — הבקשה והמסמכים יישלחו יחד.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          {requiredDocs.map(d => (
            <div key={d}>{renderIdDocSlot(d, idDocLabel(d))}</div>
          ))}
        </div>
      </Card>
    )
  }

  const backToDashboard = () => {
    setStep('dashboard')
    setError('')
    setPendingConfirmed(false)
  }
  const backToHome = () => {
    setStep('id-lookup')
    setIdInput('')
    setError('')
    setRegDocType('id')
    setSpouseDocType('id')
    setBeneficiary(null)
    setPendingConfirmed(false)
    setExistingDocs({})
    setReplaceDoc({})
    setDocFiles({})
    setShowOtherMarital(false)
    setChildMatch(null)
    setChildParentLineage(null)
    setChildSelf(null)
    setLineageResult({ valid: false, nodeId: null, ancestors: [], selfRelation: null })
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100" dir="rtl">

      {/* חלון הצהרת ייחוס — לפני בחירת סדר הדורות (טופס ציבורי) */}
      {declModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl">
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            style={{ animation: 'pop-in 0.25s ease-out' }}>
            <h2 className="text-2xl font-extrabold text-center text-indigo-900 mb-4">שלום וברכה!</h2>
            <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 mb-5">
              <p className="text-base font-bold text-amber-900 mb-3 text-center leading-relaxed">
                הרישום מיועד אך ורק לנכדי רבינו החתם סופר!
              </p>
              <p className="text-sm text-amber-900 leading-relaxed mb-3">
                אך ורק למי שיש בידו יחוס ברור ומוסמך דור אחר דור עד החתם סופר, אין להתבסס בשום אופן על השערות או שמועות,
                ולא על חצאי עדויות.
              </p>
              <p className="text-[15px] font-semibold text-red-800 leading-8 bg-white/80 border-r-4 border-red-400 rounded-lg px-4 py-3" style={{ fontFamily: 'David, "Frank Ruhl Libre", Georgia, serif' }}>
                גם אלו שבעבר קיבלו מאיתנו אישור או הטבה מסוימת, אין לראות בכך אישור על סדר הייחוס. ואין להם בשום אופן להרשם כעת עד שיהיה בידם סדר יחוס מוסמך ודאי ומוחלט דור אחר דור עד החתם סופר.
              </p>
            </div>
            <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-slate-200 p-4 mb-5 hover:bg-slate-50 transition-all duration-150">
              <input type="checkbox" checked={lineageDeclared}
                onChange={e => setLineageDeclared(e.target.checked)}
                className="mt-0.5 w-5 h-5 accent-indigo-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-slate-800">הרינו מצהיר כי אני עומד בקריטריון הנ&quot;ל</span>
            </label>
            <button type="button" disabled={!lineageDeclared} onClick={() => setDeclModalOpen(false)}
              className="w-full bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3 transition-all duration-150">
              להמשך — בחירת סדר הדורות
            </button>
          </div>
        </div>
      )}

      {/* חלון הסבר — בקשה לאחר לידה שקטה */}
      {showSilentInfo && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4" dir="rtl">
          <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
            style={{ animation: 'pop-in 0.25s ease-out' }}>
            <button type="button" onClick={() => setShowSilentInfo(false)}
              className="absolute top-4 left-4 text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
            <div className="w-14 h-14 mx-auto bg-rose-100 rounded-2xl flex items-center justify-center mb-4">
              <Heart size={26} className="text-rose-600" />
            </div>
            <h2 className="text-xl font-extrabold text-center text-rose-900 mb-4">בקשה לאחר לידה שקטה</h2>
            <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-5 mb-5 text-sm text-rose-900 leading-relaxed space-y-3">
              <p>
                אנו משתתפים בצערכם. הסיוע מיועד לאמהות שעברו <strong>לידה שקטה משבוע 22 ואילך</strong>,
                ומאפשר שהייה והבראה בבית החלמה לצורך החלמה גופנית ונפשית.
              </p>
              <p>
                בבקשה זו <strong>אין צורך</strong> להזין שם, תעודת זהות או פרטי תינוק — אנא צרפו מסמך אישור בלבד.
                פרטי האם נלקחים מהרישום הקיים שלכם במערכת.
              </p>
              <p className="font-semibold">
                הסיוע ניתן בדיסקרטיה מלאה ובהבנה מירבית לרגישות התקופה.
              </p>
            </div>
            <button type="button" onClick={goToSilentBirthForm}
              className="w-full bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-600 hover:to-rose-800 disabled:from-rose-300 disabled:to-rose-300 shadow-[0_6px_16px_-6px_rgba(225,29,72,0.5)] hover:shadow-[0_10px_22px_-8px_rgba(225,29,72,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 text-white font-semibold rounded-xl py-3 transition-all duration-150">
              להמשך הבקשה
            </button>
          </div>
        </div>
      )}

      {/* Registration success popup */}
      {showRegSuccess && regSuccessDetails && (
        <ConfettiSuccess
          title="הרישום התקבל בהצלחה!"
          subtitle="הפרטים הועברו לטיפול המזכירות — תקבל עדכון בהקדם."
          details={[
            `שם: ${regSuccessDetails.name}`,
            `ת.ז.: ${regSuccessDetails.idNumber}`,
            ...(regSuccessDetails.phone ? [`טלפון: ${regSuccessDetails.phone}`] : []),
            ...(regSuccessDetails.email ? [`מייל: ${regSuccessDetails.email}`] : []),
          ]}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0">
            <img src="/logo.png" alt="לוגו" className="w-full h-full object-contain" />
          </div>
          <div className="flex-1">
            <h1 className="font-bold text-slate-900 text-base leading-tight">היכל החתם סופר</h1>
          </div>
          {(step === 'dashboard' || step === 'new-birth' || step === 'new-silent-birth' || step === 'new-loan' || step === 'request-sent') && (
            <button onClick={backToHome} className="text-xs text-slate-400 hover:text-indigo-600 underline">
              יציאה
            </button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">

        {/* ─── Step: ID Lookup ─── */}
        {step === 'id-lookup' && (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto mb-4">
                <img src="/logo.png" alt="לוגו" className="w-full h-full object-contain" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">ברוכים הבאים</h2>
            </div>

            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl px-4 py-3 text-center">
              <p className="text-sm font-bold text-amber-900 leading-relaxed">לעת עתה הרישום לאיגוד הצאצאים הוא לתושבי ארץ הקודש בלבד</p>
            </div>

            <Card>
              <form onSubmit={handleLookup} className="flex flex-col gap-4">
                {/* doc-type toggle */}
                <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                  {([['id', 'תעודת זהות'], ['passport', 'דרכון']] as const).map(([v, l]) => (
                    <button key={v} type="button"
                      onClick={() => { setDocType(v); setIdInput(''); setError('') }}
                      className={`flex-1 py-2 text-sm font-medium transition-all duration-150 ${docType === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                    >{l}</button>
                  ))}
                </div>

                {docType === 'id' ? (
                  <Field label='מספר תעודת זהות' required hint="הזן 9 ספרות כולל ספרת ביקורת">
                    <TextInput
                      value={idInput}
                      onChange={e => setIdInput(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000000"
                      inputMode="numeric"
                      maxLength={9}
                      dir="ltr"
                      autoComplete="off"
                      className="text-center text-lg font-semibold tracking-widest"
                    />
                  </Field>
                ) : (
                  <Field label='מספר דרכון' required>
                    <TextInput
                      value={idInput}
                      onChange={e => setIdInput(e.target.value.toUpperCase())}
                      placeholder="12345678"
                      dir="ltr"
                      autoComplete="off"
                      className="text-center text-lg font-semibold tracking-widest"
                    />
                  </Field>
                )}

                {error && <ErrorBox message={error} />}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base"
                >
                  {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                  {loading ? 'מחפש...' : 'כניסה למערכת'}
                </button>
              </form>
            </Card>

          </div>
        )}

        {/* ─── Step: Portal Auth (סיסמה) ─── */}
        {step === 'portal-auth' && pendingAuth && (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl overflow-hidden mx-auto mb-3">
                <img src="/logo.png" alt="לוגו" className="w-full h-full object-contain" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-1">
                {authMode === 'login' ? 'כניסה לאזור האישי' : authIsSetup ? 'הגדרת סיסמה' : 'איפוס סיסמה'}
              </h2>
              <p className="text-sm text-slate-500 ltr-num">{pendingAuth.id}</p>
            </div>

            <Card>
              {phoneStep === 'choose' ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-slate-600 text-center leading-relaxed">בחר/י מספר טלפון אליו נצלצל ונקריא את קוד הכניסה:</p>
                    {authPhones.map((p) => (
                      <button key={p.index} type="button" disabled={loading}
                        onClick={() => handleSendPhoneCode(p.index)}
                        className="flex items-center justify-center gap-2 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-800 font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base ltr-num">
                        <Phone size={18} /> {p.hint}
                      </button>
                    ))}
                    {error && <ErrorBox message={error} />}
                    <button type="button" onClick={() => { setError(''); setPhoneStep('') }}
                      className="text-sm text-slate-500 hover:text-slate-700 underline mx-auto">חזרה</button>
                  </div>
                ) : phoneStep === 'code' ? (
                  <form onSubmit={handleVerifyPhoneCode} className="flex flex-col gap-4">
                    <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-3 text-center text-sm text-green-700 leading-relaxed">
                      <p className="font-semibold mb-1">בקרוב תתקבל אצלך שיחה מהמערכת שלנו</p>
                      <p>
                        המספר המתקשר: <span className="font-semibold ltr-num" dir="ltr">02-3131325</span>
                        {authPhoneHint && <> · אל <span className="font-semibold ltr-num">{authPhoneHint}</span></>}
                      </p>
                      <p className="mt-1 text-green-600">
                        לאחר המענה יש להמתין מספר שניות עד שהמערכת תקריא את הקוד, ואז להזין אותו בשדה שלמטה.
                      </p>
                      <p className="mt-1 text-xs text-green-600">הקוד תקף ל-5 דקות</p>
                    </div>
                    <Field label="קוד מהשיחה" required hint="6 ספרות שהוקראו בשיחה">
                      <TextInput value={authCode}
                        onChange={e => setAuthCode(e.target.value.replace(/\D/g, ''))}
                        placeholder="000000" inputMode="numeric" maxLength={6} dir="ltr"
                        className="text-center text-lg font-semibold tracking-widest" />
                    </Field>
                    {error && <ErrorBox message={error} />}
                    <button type="submit" disabled={loading}
                      className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base">
                      {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                      {loading ? 'מאמת...' : 'כניסה'}
                    </button>
                    <div className="flex items-center justify-center gap-4">
                      <button type="button" onClick={() => { setError(''); setPhoneStep('choose') }} disabled={loading}
                        className="text-sm text-slate-500 hover:text-slate-700 underline">התקשרו אליי שוב</button>
                      <button type="button" onClick={() => { setError(''); setPhoneStep('') }}
                        className="text-sm text-slate-500 hover:text-slate-700 underline">חזרה</button>
                    </div>
                  </form>
                ) : authMode === 'login' ? (
                authView === 'intro' ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 size={20} className="text-indigo-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 mb-1">שים לב — אתם כבר רשומים אצלנו</p>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        לפי המידע במערכת אתם נמנים עם רשומי <span className="font-semibold">איגוד הצאצאים</span>.
                        כדי להגיש בקשות לסיוע בעת שמחה, לגמ״ח ולשאר ההטבות — שלחו מייל לכתובת{' '}
                        <a href={igudMailto} className="font-semibold text-indigo-600 break-all">igud@chasamsofer.info</a>,
                        או קבלו כעת קישור ישירות למייל שלכם:
                      </p>
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2 leading-relaxed">
                        בשליחת מייל לאיגוד — <span className="font-semibold">חובה לכתוב בשורת הנושא את מספר תעודת הזהות במלואו (כולל ספרת ביקורת)</span> כדי שנוכל לשלוח אליכם את הפרטים. (בלחיצה על הקישור למעלה הנושא ימולא אוטומטית.)
                      </p>
                      {authEmailHint && (
                        <p className="text-xs text-slate-500 mt-2">
                          המייל יישלח לכתובת הרשומה על שמכם: <span className="font-semibold text-slate-700" dir="ltr">{authEmailHint}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {benefitsSentTo ? (
                    <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                      <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                      <span>מייל עם רשימת ההטבות וקישורי הבקשות נשלח לכתובת הרשומה על שמכם (<span dir="ltr">{benefitsSentTo}</span>). בדקו את תיבת הדואר (כולל ספאם).</span>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={sendBenefitsLink} disabled={benefitsSending}
                        className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition-all duration-150 text-sm">
                        {benefitsSending ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                        קבלת קישור להגשת בקשות למייל
                      </button>
                      {benefitsErr && <p className="text-xs text-red-600">{benefitsErr}</p>}
                    </>
                  )}

                  {statusSentTo ? (
                    <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                      <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                      <span>הודעה עם פירוט סטטוס בקשתכם נשלחה כעת לכתובת המייל הרשומה על שמכם (<span dir="ltr">{statusSentTo}</span>).</span>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={sendStatusEmail} disabled={statusSending}
                        className="w-full flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 font-semibold rounded-xl px-4 py-3 transition-all duration-150 text-sm">
                        {statusSending ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />}
                        צפייה בסטטוס הבקשה שלי (יישלח למייל)
                      </button>
                      {statusErr && <p className="text-xs text-red-600">{statusErr}</p>}
                    </>
                  )}

                </div>
                ) : emailStep === 'code' ? (
                <form onSubmit={handleVerifyEmailCode} className="flex flex-col gap-4">
                  <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-center text-sm text-green-700">
                    שלחנו קוד זמני למייל שלך{authEmailHint ? <> <span className="font-semibold ltr-num" dir="ltr">{authEmailHint}</span></> : ''} · הקוד תקף ל-10 דקות בלבד
                  </div>
                  <Field label="קוד מהמייל" required hint="6 ספרות שנשלחו למייל">
                    <TextInput value={authCode}
                      onChange={e => setAuthCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000" inputMode="numeric" maxLength={6} dir="ltr"
                      className="text-center text-lg font-semibold tracking-widest" />
                  </Field>
                  {error && <ErrorBox message={error} />}
                  <button type="submit" disabled={loading}
                    className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base">
                    {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                    {loading ? 'מאמת...' : 'כניסה'}
                  </button>
                  <div className="flex items-center justify-center gap-4">
                    <button type="button" onClick={handleSendCode} disabled={loading}
                      className="text-sm text-slate-500 hover:text-slate-700 underline">שלחו לי קוד חדש</button>
                    <button type="button" onClick={() => { setError(''); setEmailStep('') }}
                      className="text-sm text-slate-500 hover:text-slate-700 underline">חזרה</button>
                  </div>
                </form>
                ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-slate-600 leading-relaxed text-center">
                    לכניסה לאזור האישי נשלח אליך <span className="font-semibold">קוד זמני</span>. בחר/י כיצד לקבל אותו:
                  </p>
                  {error && <ErrorBox message={error} />}
                  <button type="button" onClick={handleSendCode} disabled={loading}
                    className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base">
                    {loading ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20} />}
                    קבלת קוד זמני למייל
                  </button>
                  <button type="button" onClick={handleListPhones} disabled={loading}
                    className="flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base">
                    <Phone size={18} /> קבלת קוד זמני בשיחה לטלפון
                  </button>
                  <p className="text-xs text-slate-400 text-center leading-relaxed">
                    הקוד תקף ל-10 דקות בלבד. הקוד למייל יישלח לכתובת הרשומה במערכת; הקוד בשיחה יוקרא למספר טלפון מאומת שלך.
                  </p>
                </div>
                )
              ) : (
                <div className="flex flex-col gap-4">
                  {!authCodeSent ? (
                    <>
                      <p className="text-sm text-slate-600 leading-relaxed text-center">
                        {authIsSetup
                          ? 'כדי להגדיר סיסמה לראשונה, נשלח קוד אימות לכתובת המייל הרשומה שלך.'
                          : 'נשלח קוד אימות לכתובת המייל הרשומה שלך לאיפוס הסיסמה.'}
                        {authEmailHint && <><br /><span dir="ltr" className="inline-block font-semibold">{authEmailHint}</span></>}
                      </p>
                      {error && <ErrorBox message={error} />}
                      <button type="button" onClick={handleSendCode} disabled={loading}
                        className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base">
                        {loading && <Loader2 size={20} className="animate-spin" />}
                        {loading ? 'שולח...' : 'שליחת קוד למייל'}
                      </button>
                      <button type="button" onClick={handleListPhones} disabled={loading}
                        className="flex items-center justify-center gap-2 border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 font-semibold py-2.5 px-4 rounded-xl transition-all duration-150 text-sm">
                        <Phone size={16} /> קבלת קוד זמני בשיחה לטלפון
                      </button>
                    </>
                  ) : (
                    <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
                      <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-center text-sm text-green-700">
                        קוד נשלח אל <span dir="ltr" className="inline-block">{authEmailHint || 'המייל שלך'}</span> · תקף ל-10 דקות
                      </div>
                      <Field label="קוד אימות" required hint="6 ספרות שהתקבלו במייל">
                        <TextInput value={authCode}
                          onChange={e => setAuthCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="000000" inputMode="numeric" maxLength={6} dir="ltr"
                          className="text-center text-lg font-semibold tracking-widest" />
                      </Field>
                      <Field label="סיסמה חדשה" required hint="לפחות 10 תווים, אות באנגלית וספרה">
                        <TextInput type="password" value={authPassword}
                          onChange={e => setAuthPassword(e.target.value)}
                          dir="ltr" autoComplete="new-password" className="text-center text-lg" />
                      </Field>
                      <Field label="אימות סיסמה" required>
                        <TextInput type="password" value={authPassword2}
                          onChange={e => setAuthPassword2(e.target.value)}
                          dir="ltr" autoComplete="new-password" className="text-center text-lg" />
                      </Field>
                      {error && <ErrorBox message={error} />}
                      <button type="submit" disabled={loading}
                        className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base">
                        {loading && <Loader2 size={20} className="animate-spin" />}
                        {loading ? 'שומר...' : 'שמירת סיסמה וכניסה'}
                      </button>
                      <button type="button" onClick={handleSendCode} disabled={loading}
                        className="text-sm text-slate-500 hover:text-slate-700 underline mx-auto">
                        שליחת קוד חדש
                      </button>
                    </form>
                  )}
                </div>
              )}

              <button type="button"
                onClick={() => { setError(''); setStep('id-lookup'); setPendingAuth(null); setAuthPassword(''); setAuthPassword2(''); setAuthCode(''); setAuthCodeSent(false); setPhoneStep(''); setAuthPhones([]); setAuthPhoneHint('') }}
                className="text-sm text-slate-400 hover:text-slate-600 mx-auto mt-3 block">
                חזרה
              </button>
            </Card>
          </div>
        )}

        {/* ─── Step: Not Found ─── */}
        {step === 'not-found' && (
          <div className="flex flex-col gap-4">
            <Card>
              <div className="text-center mb-5">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle size={30} className="text-amber-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">לא מופיע במערכת</h2>
                <p className="text-slate-600 text-sm leading-relaxed">
                  {docType === 'passport' ? 'מספר הדרכון' : 'מספר תעודת הזהות'}{' '}
                  <span className="font-semibold text-slate-800" dir="ltr">{idInput}</span>
                  {' '}אינו רשום במערכת שלנו.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {registrationOpen ? (
                  <button
                    onClick={() => { setError(''); setStep('register') }}
                    className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150"
                  >
                    <User size={18} />
                    רישום למערכת
                  </button>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 text-center leading-relaxed">
                    ההרשמה למערכת סגורה כעת. לפרטים ניתן לפנות למזכירות.
                  </div>
                )}
                <button
                  onClick={backToHome}
                  className="flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 py-2 text-sm"
                >
                  <ArrowRight size={16} />
                  חזרה לכניסה
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ─── Step: Found as Child ─── */}
        {step === 'found-as-child' && childMatch && (
          <div className="flex flex-col gap-4">
            <Card>
              <div className="text-center mb-5">
                <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users size={28} className="text-indigo-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-3">שים לב</h2>
                <p className="text-slate-600 text-sm leading-relaxed mb-1">
                  אתה רשום אצלינו במערכת בתור ילד של
                </p>
                <p className="text-lg font-bold text-indigo-700 mb-4">{childMatch.parentName}</p>
                {/* פרטי הילד הרשום */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-right grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-4">
                  <p className="col-span-2"><span className="text-slate-400 text-xs block">שם</span><span className="font-medium text-slate-800">{childMatch.childData.name || '—'}</span></p>
                  <p><span className="text-slate-400 text-xs block">תעודת זהות</span><span className="ltr-num text-slate-700">{childMatch.childData.id_number}</span></p>
                  {childMatch.childData.birth_date && <p><span className="text-slate-400 text-xs block">תאריך לידה</span><span className="text-slate-700 ltr-num">{(() => { try { return new Date(childMatch.childData.birth_date).toLocaleDateString('he-IL') } catch { return childMatch.childData.birth_date } })()}</span></p>}
                </div>
                <p className="text-slate-500 text-sm">
                  כדי שתירשם אתה בעצמך, עבור לרישום מהיר.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                {registrationOpen ? (
                  <button
                    onClick={() => {
                      // שמירת נתוני הילד — ימולאו לבעל/אשה לפי המין רק אחרי בחירת מצב משפחתי
                      setChildSelf(childMatch.childData)
                      setRegForm(f => ({
                        ...f,
                        id_number: '', full_name: '', birth_date: '', gender: '', marital_status: '',
                        spouse_name: '', spouse_id_number: '', spouse_birth_date: '',
                      }))
                      setChildParentLineage(childMatch.parentLineage?.lineage_chain?.length ? childMatch.parentLineage : null)
                      setError('')
                      setStep('register')
                    }}
                    className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150"
                  >
                    <User size={18} />
                    רישום מהיר
                  </button>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 text-center leading-relaxed">
                    ההרשמה למערכת סגורה כעת. לפרטים ניתן לפנות למזכירות.
                  </div>
                )}
                <button onClick={backToHome}
                  className="flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 py-2 text-sm">
                  <ArrowRight size={16} />
                  חזרה לכניסה
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* ─── Step: Register ─── */}
        {step === 'register' && (
          <form onSubmit={handleRegister} className="flex flex-col gap-4">

            <div className="flex items-center gap-3 mb-1">
              <button type="button" onClick={() => setStep('not-found')} className="text-slate-400 hover:text-slate-600">
                <ArrowRight size={20} />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">טופס רישום</h2>
            </div>

            {/* הבהרה — רישום פעם אחת בלבד */}
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl px-4 py-3.5 text-sm text-red-800 leading-relaxed">
              <p className="font-bold mb-1">יש להירשם פעם אחת בלבד</p>
              <p>מי שברשותו גם תעודת זהות וגם דרכון — יירשם עם <strong>אמצעי זיהוי אחד בלבד</strong>, והוא ישמש אותו לאורך כל התהליך. <strong>הירשמות פעם שנייה תגרום לחסימת החשבון לצמיתות.</strong></p>
            </div>

            {/* Marital — FIRST */}
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Heart size={18} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-900">מצב משפחתי</h3>
              </div>
              {/* הבהרה — ראשי משפחה בלבד */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 leading-relaxed mb-4">
                <p className="font-bold mb-0.5">שימו לב — הרישום מיועד לראשי משפחה בלבד</p>
                <p>אין רישום כלל לבחורים או לילדים. <strong>רישום של בחור או ילד יגרום לחסימת הרישום שלו בעתיד.</strong></p>
              </div>
              {(() => {
                const otherActive = showOtherMarital || OTHER_MARITAL_OPTIONS.some(o => o.value === regForm.marital_status)
                const btnCls = (active: boolean) =>
                  `px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                  }`
                return (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => { setShowOtherMarital(false); setRegForm(f => ({ ...f, marital_status: 'נשואים', gender: genderFromMarital('נשואים') })) }}
                        className={btnCls(regForm.marital_status === 'נשואים')}
                      >נשואים</button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowOtherMarital(true)
                          if (!OTHER_MARITAL_OPTIONS.some(o => o.value === regForm.marital_status)) {
                            setRegForm(f => ({ ...f, marital_status: '', gender: '' }))
                          }
                        }}
                        className={btnCls(otherActive)}
                      >אחר</button>
                    </div>
                    {otherActive && (
                      <div className="flex flex-wrap gap-2 mt-2 pr-1 border-r-2 border-indigo-100">
                        {OTHER_MARITAL_OPTIONS.map(opt => (
                          <button
                            key={opt.value} type="button"
                            onClick={() => setRegForm(f => ({ ...f, marital_status: opt.value, gender: genderFromMarital(opt.value) }))}
                            className={btnCls(regForm.marital_status === opt.value)}
                          >{opt.label}</button>
                        ))}
                      </div>
                    )}
                  </>
                )
              })()}
            </Card>

            {/* Personal — only after marital chosen */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <User size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">
                    {showSpouseFields ? 'פרטי הבעל' : (regGender === 'female' ? 'פרטי האשה' : 'פרטים אישיים')}
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="שם פרטי" required>
                      <TextInput value={regForm.full_name} onChange={setReg('full_name')} placeholder="ישראל" required />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="שם משפחה" required>
                      <TextInput value={regForm.family_name} onChange={setReg('family_name')} placeholder="ישראלי" required />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label={regDocType === 'passport' ? 'מספר דרכון' : 'תעודת זהות'} required>
                      <TextInput
                        value={regForm.id_number}
                        onChange={e => { setReg('id_number')(e); setIdFieldError('') }}
                        onBlur={() => {
                          if (regDocType === 'id' && regForm.id_number && !validateIsraeliId(regForm.id_number))
                            setIdFieldError('תעודת הזהות שהזנתם אינה תקינה')
                          else setIdFieldError('')
                        }}
                        placeholder={regDocType === 'passport' ? 'AA000000' : '000000000'}
                        inputMode={regDocType === 'passport' ? 'text' : 'numeric'}
                        maxLength={regDocType === 'passport' ? 20 : 9}
                        dir="ltr" required
                        className={idFieldError ? 'border-red-400 focus:ring-red-400' : ''}
                      />
                      {idFieldError && <p className="text-xs text-red-600 mt-1">{idFieldError}</p>}
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="תאריך לידה" required>
                      <HebrewDatePicker value={regForm.birth_date} onChange={iso => setRegForm(f => ({ ...f, birth_date: iso }))} maxToday yearFirst birthYearRange={{ minAge: 18, maxAge: 50 }} />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="השתייכות קהילתית" hint="לא חובה, אולם מומלץ לצורך היערכות ורישום להטבות בהמשך בעז״ה">
                      <TextInput value={regForm.community_affiliation} onChange={setReg('community_affiliation')} placeholder="לדוגמה: קהילה / חסידות / בית כנסת" />
                    </Field>
                  </div>
                </div>

              </Card>
            )}

            {/* Spouse (wife) — own card, right after husband, only if married */}
            {regForm.marital_status && showSpouseFields && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <User size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">פרטי האשה</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {/* סוג מסמך זיהוי — שורה נפרדת מלאה כדי שכל השדות יישארו מיושרים */}
                  <div className="col-span-2">
                    <Field label="סוג מסמך זיהוי של האשה" required>
                      <div className="flex rounded-xl border border-slate-200 overflow-hidden w-full sm:max-w-xs">
                        {([['id', 'תעודת זהות'], ['passport', 'דרכון']] as const).map(([v, l]) => (
                          <button key={v} type="button"
                            onClick={() => { setSpouseDocType(v); setReg('spouse_id_number')({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>); setSpouseIdError('') }}
                            className={`flex-1 py-1.5 text-xs font-medium transition-all duration-150 ${spouseDocType === v ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-indigo-50'}`}
                          >{l}</button>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="שם פרטי" required>
                      <TextInput value={regForm.spouse_name} onChange={setReg('spouse_name')} placeholder="שם מלא" required />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label={spouseDocType === 'passport' ? 'מספר דרכון' : 'תעודת זהות'} required>
                      <TextInput
                        value={regForm.spouse_id_number}
                        onChange={e => { setReg('spouse_id_number')(e); setSpouseIdError('') }}
                        onBlur={async () => {
                          const sid = regForm.spouse_id_number.trim()
                          if (!sid) { setSpouseIdError(''); return }
                          if (spouseDocType === 'id' && !validateIsraeliId(sid)) {
                            setSpouseIdError('תעודת הזהות שהזנתם אינה תקינה'); return
                          }
                          const cleanSid = spouseDocType === 'passport' ? sid : sid.replace(/\D/g, '')
                          if (cleanSid === (regDocType === 'passport' ? regForm.id_number.trim() : regForm.id_number.replace(/\D/g, ''))) {
                            setSpouseIdError('המספר שהזנת זהה לזה של הבעל'); return
                          }
                          // בדיקה מול המערכת
                          try {
                            const param = spouseDocType === 'passport' ? `passport=${encodeURIComponent(cleanSid)}` : `id=${cleanSid}`
                            const res = await fetch(`/api/portal/lookup?${param}`)
                            const d = await res.json()
                            if (d.found) { setSpouseIdError('מספר זה כבר קיים במערכת — לא ניתן לרשום אותו שוב'); return }
                          } catch { /* network error — ignore on blur */ }
                          setSpouseIdError('')
                        }}
                        placeholder={spouseDocType === 'passport' ? 'AA000000' : '000000000'}
                        inputMode={spouseDocType === 'passport' ? 'text' : 'numeric'}
                        maxLength={spouseDocType === 'passport' ? 20 : 9}
                        dir="ltr" required
                        className={spouseIdError ? 'border-red-400 focus:ring-red-400' : ''}
                      />
                      {spouseIdError && <p className="text-xs text-red-600 mt-1">{spouseIdError}</p>}
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="תאריך לידה של האשה" required>
                      <HebrewDatePicker value={regForm.spouse_birth_date} onChange={iso => setRegForm(f => ({ ...f, spouse_birth_date: iso }))} maxToday yearFirst birthYearRange={{ minAge: 18, maxAge: 50 }} />
                    </Field>
                  </div>
                </div>
              </Card>
            )}

            {/* Contact — email + all phone numbers (husband required, wife/extra optional) */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <Phone size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">פרטי קשר</h3>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 leading-relaxed mb-4">
                  <p className="font-bold">שימו לב — יש לדייק בפרטי הקשר</p>
                  <p>הקפידו להזין מספר טלפון וכתובת מייל <strong>תקינים</strong>, שכן כל ההודעות והעדכונים יישלחו למספר ולכתובת שתמלאו כאן.</p>
                  <p className="mt-2"><strong>אימות טלפון:</strong> יש למלא ולאמת <strong>לפחות טלפון אחד</strong>. אימות מספר מאפשר לקבל אליו בעתיד קוד כניסה למערכת — מספר שלא אומת לא יוכל לקבל קוד. ניתן לאמת יותר ממספר אחד.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 sm:col-span-1">
                    <Field label={showSpouseFields ? 'טלפון בעל' : 'טלפון ראשי'} hint="מספר נייד ישראלי המתחיל ב-05">
                      <TextInput type="tel" value={regForm.phone}
                        onChange={e => { setReg('phone')(e); setPhoneError('') }}
                        onBlur={() => {
                          if (regForm.phone && !validatePhone(regForm.phone)) { setPhoneError('אנא הזן מספר נייד תקין המתחיל ב-05'); return }
                          setPhoneError('')
                          // התרעה מיידית על טלפון זהה בין הבעל לאשה
                          if (regForm.phone && regForm.spouse_phone && regForm.phone.replace(/\D/g, '') === regForm.spouse_phone.replace(/\D/g, '')) {
                            setSpousePhoneError('מספר הטלפון של האישה זהה למספר הטלפון של הבעל')
                          } else if (spousePhoneError === 'מספר הטלפון של האישה זהה למספר הטלפון של הבעל') {
                            setSpousePhoneError('')
                          }
                        }}
                        placeholder="0500000000" dir="ltr" maxLength={11}
                        className={phoneError ? 'border-red-400 focus:ring-red-400' : ''}
                      />
                      {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
                      <VerifyControl channel="phone" value={regForm.phone} valid={validatePhone(regForm.phone)} onToken={setRegPhoneToken} />
                    </Field>
                  </div>
                  {showSpouseFields && (
                    <div className="col-span-2 sm:col-span-1">
                      <Field label="טלפון אשה" hint="לא חובה">
                        <TextInput type="tel"
                          value={regForm.spouse_phone}
                          onChange={e => { setReg('spouse_phone')(e); setSpousePhoneError('') }}
                          onBlur={() => {
                            const sp = regForm.spouse_phone.trim()
                            if (sp && !validatePhone(sp)) { setSpousePhoneError('אנא הזן מספר נייד תקין המתחיל ב-05') }
                            else if (sp && regForm.phone && sp.replace(/\D/g, '') === regForm.phone.replace(/\D/g, '')) { setSpousePhoneError('מספר הטלפון של האישה זהה למספר הטלפון של הבעל') }
                            else { setSpousePhoneError('') }
                          }}
                          placeholder="0500000000" dir="ltr" maxLength={11}
                          className={spousePhoneError ? 'border-red-400 focus:ring-red-400' : ''}
                        />
                        {spousePhoneError && <p className="text-xs text-red-600 mt-1">{spousePhoneError}</p>}
                        <VerifyControl channel="phone" value={regForm.spouse_phone} valid={validatePhone(regForm.spouse_phone)} onToken={setRegSpousePhoneToken} optionalHint={anyPhoneVerified ? phoneOptionalHint : undefined} />
                      </Field>
                    </div>
                  )}
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="טלפון נוסף" hint="לא חובה">
                      <TextInput type="tel" value={regForm.phone2} onChange={setReg('phone2')} placeholder="0500000000" dir="ltr" maxLength={11} />
                      <VerifyControl channel="phone" value={regForm.phone2} valid={validatePhone(regForm.phone2)} onToken={setRegPhone2Token} optionalHint={anyPhoneVerified ? phoneOptionalHint : undefined} />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="דואר אלקטרוני" required>
                      <EmailInput value={regForm.email} onChange={v => setRegForm(f => ({ ...f, email: v }))} placeholder="your@email.com" required />
                      <VerifyControl channel="email" value={regForm.email} valid={validateEmail(regForm.email)} onToken={setRegEmailToken} />
                    </Field>
                  </div>
                </div>
              </Card>
            )}

            {/* Address */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">כתובת</h3>
                </div>
                <CityStreetPicker
                  city={regForm.city}
                  address={regForm.address}
                  onCityChange={v => setRegForm(f => ({ ...f, city: v }))}
                  onAddressChange={v => setRegForm(f => ({ ...f, address: v }))}
                  cityRequired
                  addressRequired
                  houseRequired
                />
              </Card>
            )}

            {/* Lineage */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-1">
                  <GitBranch size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">סדר הדורות — שיוך לחתם סופר <span className="text-red-500">*</span></h3>
                </div>
                <p className="text-xs text-slate-500 mb-4">בנה את סדר הייחוס דור אחר דור עד רבינו החתם סופר זיע&quot;א, וסמן בכל דור בן/חתן.</p>

                {childParentLineage && childParentLineage.lineage_chain ? (
                  /* שיוך אוטומטי — הנרשם הוא ילד רשום, הייחוס נגזר מההורה */
                  <div className="rounded-2xl border-2 border-green-200 bg-green-50/60 p-4">
                    <p className="text-sm font-bold text-green-800 mb-1">השיוך שלך נקבע אוטומטית</p>
                    <p className="text-xs text-green-700 mb-4 leading-relaxed">
                      אתה רשום במערכת כבן של <strong>{childParentLineage.parentName}</strong>. סדר הייחוס שלך נגזר אוטומטית — אין צורך למלא ידנית.
                    </p>
                    {/* ציר הדורות — כל דור בשורה וצבע נפרדים, מחוברים בקו */}
                    {(() => {
                      const rows = [
                        ...childParentLineage.lineage_chain!.map(c => ({ name: c.name, relation: c.relation, isSelf: false })),
                        { name: selfDisplayName || childMatch?.childData.name || 'אתה', relation: null as 'son' | 'son_in_law' | null, isSelf: true },
                      ]
                      return (
                        <div className="flex flex-col">
                          {rows.map((row, i) => {
                            const col = GEN_COLORS[i % GEN_COLORS.length]
                            const last = i === rows.length - 1
                            return (
                              <div key={i} className="flex items-stretch gap-3">
                                {/* עמודת הקו + הנקודה */}
                                <div className="flex flex-col items-center w-5 flex-shrink-0">
                                  <span className={`w-3 h-3 rounded-full mt-2.5 ${row.isSelf ? 'bg-green-600 ring-2 ring-green-200' : col.dot}`} />
                                  {!last && <span className="w-0.5 flex-1 bg-slate-200 my-0.5" />}
                                </div>
                                {/* כרטיס הדור */}
                                <div className={`flex-1 mb-2 rounded-xl border px-3 py-2 flex items-center gap-2 ${row.isSelf ? 'bg-green-600 border-green-600' : `${col.bg} ${col.border}`}`}>
                                  <span className={`text-[10px] font-bold flex-shrink-0 ${row.isSelf ? 'text-green-100' : col.text} opacity-70`}>דור {i + 1}</span>
                                  <span className={`text-sm font-semibold flex-1 truncate ${row.isSelf ? 'text-white' : col.text}`}>{row.name}</span>
                                  {(row.relation === 'son' || row.relation === 'son_in_law') && (
                                    <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 flex-shrink-0 ${row.relation === 'son' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{row.relation === 'son' ? 'בן' : 'חתן'}</span>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                ) : !lineageDeclared ? (
                  /* שער הצהרה — חוסם את בחירת הדורות עד אישור */
                  <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5 text-center">
                    <p className="text-sm font-bold text-amber-900 mb-2">לפני בחירת סדר הדורות נדרשת הצהרה</p>
                    <p className="text-xs text-amber-700 mb-4 leading-relaxed">הרישום מיועד אך ורק לנכדי רבינו החתם סופר בעלי יחוס ברור ומוסמך דור אחר דור.</p>
                    <button type="button" onClick={() => setDeclModalOpen(true)}
                      className="inline-flex items-center gap-2 bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 shadow-[0_6px_16px_-6px_rgba(217,119,6,0.5)] hover:shadow-[0_10px_22px_-8px_rgba(217,119,6,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] text-white text-sm font-semibold rounded-xl px-5 py-2.5 transition-all duration-150">
                      הקש כאן למעבר לקריאת ההצהרה ובחירת סדר הדורות
                    </button>
                  </div>
                ) : (
                <LineageBuilder selfName={selfDisplayName} onChange={setLineageResult} />
                )}
              </Card>
            )}

            {/* Children */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Users size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">ילדים</h3>
                </div>

                {/* Count field */}
                <div className="mb-4">
                  <Field label="מספר ילדים">
                    <TextInput
                      type="number" min="0" max="20"
                      value={children.length === 0 && regForm.children_count === '0' ? '' : String(children.length)}
                      placeholder="0"
                      inputMode="numeric"
                      className="w-28"
                      onChange={e => {
                        const n = Math.max(0, Math.min(20, parseInt(e.target.value || '0', 10) || 0))
                        setRegForm(f => ({ ...f, children_count: String(n) }))
                        setChildren(cs => {
                          if (n > cs.length) {
                            const added = [...cs, ...Array.from({ length: n - cs.length }, emptyChild)]
                            setEditingChildIdx(cs.length)
                            return added
                          }
                          if (n < cs.length) { setEditingChildIdx(null); return cs.slice(0, n) }
                          return cs
                        })
                      }}
                    />
                  </Field>
                </div>

                <div className="flex flex-col gap-2">
                  {children.map((child, idx) => (
                    editingChildIdx === idx ? (
                      /* Expanded edit form */
                      <div key={idx} className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-slate-700">ילד {idx + 1}</span>
                          <button type="button" onClick={() => { setChildren(cs => cs.filter((_, i) => i !== idx)); setEditingChildIdx(null) }}
                            className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-all duration-150">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="שם הילד/ה" required>
                              <TextInput value={child.name} placeholder="שם מלא" required
                                onChange={e => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))} />
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="תעודת זהות" required>
                              <TextInput value={child.id_number} placeholder="000000000" inputMode="numeric" maxLength={9} dir="ltr" required
                                className={childIdErrors[idx] ? 'border-red-400 focus:ring-red-400' : ''}
                                onChange={e => { setChildren(cs => cs.map((c, i) => i === idx ? { ...c, id_number: e.target.value.replace(/\D/g,'') } : c)); setChildIdErrors(e => ({ ...e, [idx]: '' })) }}
                                onBlur={async () => {
                                  const digits = (child.id_number || '').replace(/\D/g, '')
                                  if (digits && !validateIsraeliId(digits)) {
                                    setChildIdErrors(e => ({ ...e, [idx]: 'תעודת הזהות שהזנתם אינה תקינה' })); return
                                  }
                                  setChildIdErrors(e => ({ ...e, [idx]: '' }))
                                  // בדיקה מיידית — האם הילד כבר רשום במערכת (כצאצא או כילד אצל מישהו)
                                  if (digits.length === 9) {
                                    try {
                                      const r = await fetch(`/api/portal/lookup?id=${digits}`)
                                      const d = await r.json()
                                      if (d.found || d.foundAsChild) {
                                        setChildIdErrors(e => ({ ...e, [idx]: 'ילד/ה זה כבר רשום/ה במערכת — לא ניתן לרשום פעם נוספת' }))
                                      }
                                    } catch { /* בדיקת שרת תיתפס בעת השליחה */ }
                                  }
                                }} />
                              {childIdErrors[idx] && <p className="text-xs text-red-600 mt-1">{childIdErrors[idx]}</p>}
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="תאריך לידה" required>
                              <HebrewDatePicker value={child.birth_date}
                                onChange={iso => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, birth_date: iso } : c))} maxToday yearFirst />
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="מין" required>
                              <div className="flex gap-2">
                                {[{ v: 'male', l: 'בן' }, { v: 'female', l: 'בת' }].map(({ v, l }) => (
                                  <button key={v} type="button"
                                    onClick={() => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, gender: v, marital_status: '' } : c))}
                                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                                      child.gender === v ? GENDER_BTN_SEL[v] : GENDER_BTN_UNSEL
                                    }`}
                                  >{l}</button>
                                ))}
                              </div>
                            </Field>
                          </div>
                          {child.gender && (
                          <div className="col-span-2">
                            <Field label="מצב משפחתי" required>
                              <div className="flex gap-2 flex-wrap">
                                {maritalFor(child.gender).map(({ v, l }) => (
                                  <button key={v} type="button"
                                    onClick={() => setChildren(cs => cs.map((c, i) => i === idx ? { ...c, marital_status: v } : c))}
                                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                                      child.marital_status === v
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                                    }`}
                                  >{l}</button>
                                ))}
                              </div>
                            </Field>
                          </div>
                          )}
                        </div>
                        <button type="button" onClick={() => {
                          if (!child.name || !child.id_number || !child.birth_date || !child.gender || !child.marital_status) {
                            alert('אנא מלא את כל שדות הילד'); return
                          }
                          if (!validateIsraeliId(child.id_number)) {
                            setChildIdErrors(e => ({ ...e, [idx]: 'תעודת הזהות שהזנתם אינה תקינה' })); return
                          }
                          setEditingChildIdx(null)
                        }}
                          className="mt-4 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 text-white font-medium py-2 rounded-lg text-sm transition-all duration-150">
                          <Check size={14} /> שמור
                        </button>
                      </div>
                    ) : (
                      /* Collapsed row */
                      <div key={idx} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-indigo-600">{idx + 1}</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{child.name || `ילד ${idx + 1}`}</p>
                            <p className="text-xs text-slate-500">
                              {[child.gender === 'male' ? 'בן' : child.gender === 'female' ? 'בת' : '', child.birth_date, child.marital_status].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setEditingChildIdx(idx)}
                            className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-1 rounded-lg hover:bg-indigo-50">עריכה</button>
                          <button type="button" onClick={() => setChildren(cs => cs.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              </Card>
            )}

            {/* הטבות שהתקבלו בעבר */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-center gap-2 mb-3">
                  <Gift size={18} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-900">האם בעבר קיבלתם הטבות כלשהן מ&quot;איגוד הצאצאים&quot;?</h3>
                </div>
                <p className="text-xs text-slate-500 mb-3">סמנו את כל ההטבות שקיבלתם — ניתן לבחור יותר מאפשרות אחת. חובה לסמן לפחות אפשרות אחת:</p>
                <div className="flex flex-col gap-2">
                  {/* "לא קיבלתי" — בלעדי. סימונו מנקה את כל השאר, וסימון של
                      הטבה כלשהי מבטל אותו. */}
                  <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-150 text-sm font-medium ${pastBenefits.none ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={pastBenefits.none}
                      onChange={e => {
                        const on = e.target.checked
                        setPastBenefits(p => on
                          ? {
                              ...p, none: true,
                              recovery_home: false, food_card: false, holiday_grant: false,
                              catering: false, tishrei_5786: false, pesach_5786: false,
                              shavuot_5786: false, loan: false, loan_amount: '',
                              other: false, other_details: '',
                            }
                          : { ...p, none: false })
                      }}
                      className="w-4 h-4 accent-emerald-600"
                    />
                    לא קיבלתי הטבות בעבר
                  </label>

                  <div className="h-px bg-slate-100 my-1" />

                  {/* יולדות */}
                  {([
                    ['recovery_home', 'בית החלמה ליולדות'],
                    ['food_card', 'כרטיס מזון ליולדות'],
                  ] as const).map(([k, label]) => (
                    <label key={k} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-150 text-sm ${pastBenefits[k] ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <input
                        type="checkbox"
                        checked={pastBenefits[k] as boolean}
                        onChange={e => setPastBenefits(p => ({ ...p, [k]: e.target.checked, none: false }))}
                        className="w-4 h-4 accent-indigo-600"
                      />
                      {label}
                    </label>
                  ))}

                  {/* מענק החגים — והחגים נפתחים מיד תחתיו, לפני הקייטרינג */}
                  <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-150 text-sm ${pastBenefits.holiday_grant ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={pastBenefits.holiday_grant}
                      onChange={e => setPastBenefits(p => ({
                        ...p,
                        holiday_grant: e.target.checked,
                        none: false,
                        // ביטול המענק מנקה גם את החגים שתחתיו
                        ...(e.target.checked
                          ? {}
                          : { tishrei_5786: false, pesach_5786: false, shavuot_5786: false }),
                      }))}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    מענק לקראת החגים
                  </label>

                  {pastBenefits.holiday_grant && (
                    <div className="mr-6 pr-3 border-r-2 border-indigo-200 flex flex-col gap-2">
                      <p className="text-xs text-slate-500">באילו חגים קיבלתם את המענק?</p>
                      {([
                        ['tishrei_5786', 'תשרי תשפ"ו'],
                        ['pesach_5786', 'פסח תשפ"ו'],
                        ['shavuot_5786', 'שבועות תשפ"ו'],
                      ] as const).map(([k, label]) => (
                        <label key={k} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-150 text-sm ${pastBenefits[k] ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input
                            type="checkbox"
                            checked={pastBenefits[k] as boolean}
                            onChange={e => setPastBenefits(p => ({ ...p, [k]: e.target.checked, none: false }))}
                            className="w-4 h-4 accent-indigo-600"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  )}

                  {/* קייטרינג — אחרי החגים */}
                  <label className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-150 text-sm ${pastBenefits.catering ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={pastBenefits.catering}
                      onChange={e => setPastBenefits(p => ({ ...p, catering: e.target.checked, none: false }))}
                      className="w-4 h-4 accent-indigo-600"
                    />
                    קייטרינג מוזל &quot;ויגילו בשמחה&quot;
                  </label>
                  {/* הלוואה + סכום */}
                  <div className={`rounded-lg border ${pastBenefits.loan ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                    <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={pastBenefits.loan} onChange={e => setPastBenefits(p => ({ ...p, loan: e.target.checked, none: false }))} className="w-4 h-4 accent-indigo-600" />
                      <span className={pastBenefits.loan ? 'text-indigo-800 font-medium' : 'text-slate-600'}>הלוואה</span>
                    </label>
                    {pastBenefits.loan && (
                      <div className="px-3 pb-2.5">
                        {/* ההלוואות במטבע דולר — סימן $ קבוע לצד הסכום */}
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold pointer-events-none">$</span>
                          <TextInput value={pastBenefits.loan_amount} onChange={e => setPastBenefits(p => ({ ...p, loan_amount: e.target.value.replace(/[^\d.]/g, '') }))} placeholder="סכום ההלוואה בדולרים" dir="ltr" inputMode="numeric" className="pl-8" />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* עזרה אחרת + פירוט */}
                  <div className={`rounded-lg border ${pastBenefits.other ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
                    <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={pastBenefits.other} onChange={e => setPastBenefits(p => ({ ...p, other: e.target.checked, none: false }))} className="w-4 h-4 accent-indigo-600" />
                      <span className={pastBenefits.other ? 'text-indigo-800 font-medium' : 'text-slate-600'}>עזרה אחרת</span>
                    </label>
                    {pastBenefits.other && (
                      <div className="px-3 pb-2.5">
                        <TextInput value={pastBenefits.other_details} onChange={e => setPastBenefits(p => ({ ...p, other_details: e.target.value }))} placeholder="פרט/י..." />
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-medium text-slate-600 mb-1 block">הערות</label>
                  <textarea value={pastBenefits.notes} onChange={e => setPastBenefits(p => ({ ...p, notes: e.target.value }))} rows={3}
                    placeholder="כל מידע נוסף שתרצו להוסיף..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>

                {/* הרשמה לעדכונים שוטפים — מוסתר זמנית לבקשת הלקוח (יופעל מחדש בהמשך עם התוכן הסופי) */}
                {false && (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-1">
                    <Mail size={18} className="text-indigo-600" />
                    <h3 className="font-semibold text-slate-900">האם תרצו להירשם לקבל עדכונים שוטפים?</h3>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">בחרו את הנושאים שתרצו לקבל עליהם עדכונים — ניתן לבחור יותר מאפשרות אחת (לא חובה):</p>
                  <div className="flex flex-col gap-2">
                    {['עזר יולדות', 'הלוואות (גמ"ח)', 'סיוע רפואי', 'עזר לחגים', 'אלמנות ויתומים', 'הודעות כלליות'].map(topic => {
                      const checked = pastBenefits.update_topics.includes(topic)
                      return (
                        <label key={topic} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-150 text-sm ${checked ? 'border-indigo-300 bg-indigo-50 text-indigo-800 font-medium' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                          <input type="checkbox" checked={checked}
                            onChange={e => setPastBenefits(p => ({ ...p, update_topics: e.target.checked ? [...p.update_topics, topic] : p.update_topics.filter(t => t !== topic) }))}
                            className="w-4 h-4 accent-indigo-600" />
                          {topic}
                        </label>
                      )
                    })}
                  </div>
                </div>
                )}
              </Card>
            )}

            {/* Declaration + digital signature */}
            {regForm.marital_status && (
              <Card>
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox" id="decl" checked={declaredReg}
                    onChange={e => {
                      if (e.target.checked) {
                        // סימון ההצהרה פותח חלונית חתימה; ההצהרה תאושר רק לאחר חתימה
                        if (regSignature) setDeclaredReg(true)
                        else setSigModalOpen(true)
                      } else {
                        setDeclaredReg(false); setRegSignature('')
                      }
                    }}
                    className="mt-0.5 w-4 h-4 accent-indigo-600"
                  />
                  <label htmlFor="decl" className="text-sm text-slate-700 leading-relaxed cursor-pointer">
                    הנני מצהיר/ה שהפרטים שמסרתי נכונים ומדויקים, ואני מסכים/ה לאחסון המידע לצרכי ניהול המערכת ומאשר/ת קבלת דיוור במייל ובטלפון.
                  </label>
                </div>
                {regSignature && (
                  <div className="mt-3 flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <span className="text-xs font-medium text-slate-500 flex-shrink-0">החתימה שלך:</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={regSignature} alt="חתימה" className="h-12 bg-white border border-slate-200 rounded-lg" />
                    <button type="button" onClick={() => setSigModalOpen(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline flex-shrink-0">חתימה מחדש</button>
                  </div>
                )}
              </Card>
            )}
            <SignaturePad
              open={sigModalOpen}
              onConfirm={dataUrl => { setRegSignature(dataUrl); setDeclaredReg(true); setSigModalOpen(false) }}
              onCancel={() => { setSigModalOpen(false); if (!regSignature) setDeclaredReg(false) }}
            />

            {error && <ErrorBox message={error} />}

            {regForm.marital_status && (
              <button
                type="submit" disabled={loading}
                className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
                {loading ? 'שולח...' : 'שלח טופס רישום'}
              </button>
            )}
          </form>
        )}

        {/* ─── Step: Register Success (פופאפ מודאלי) ─── */}
        {step === 'register-success' && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
            {/* Confetti overlay */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden flex items-start justify-center">
              <div className="relative">
                {Array.from({ length: 60 }).map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    width: Math.random() * 8 + 4,
                    height: Math.random() * 8 + 4,
                    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                    background: ['#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6','#8B5CF6'][i % 6],
                    left: `${Math.random() * 400 - 200}px`,
                    top: `${Math.random() * -100}px`,
                    animation: `confetti-fall ${1.5 + Math.random() * 2}s linear ${Math.random() * 0.8}s forwards`,
                  }} />
                ))}
              </div>
            </div>

            <div
              className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto p-6"
              style={{ animation: 'pop-in 0.25s ease-out' }}
            >
              <div className="text-center py-2">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={38} className="text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">הרישום התקבל בהצלחה!</h2>
                <p className="text-slate-600 mb-5 leading-relaxed">
                  מעכשיו ניתן להגיש בקשות ישירות דרך הפורטל האישי שלך.<br />
                  בהגשה הראשונה יתבקשו ממך גם צילומי תעודת זהות.
                </p>
              </div>

              {/* תזכורת ספאם — לוודא שההודעות מהמערכת מתקבלות */}
              <div className="text-right bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
                <p className="text-sm font-bold text-amber-800 mb-1">חשוב — בדקו את תיבת המייל</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  כל העדכונים והבקשות נשלחים למייל הרשום. אנא בדקו את תיבת הדואר בהקדם, וגם את תיבת ה<strong>ספאם</strong> — ואם מצאתם שם הודעה מאיתנו, סמנו אותה כ״לא ספאם״ (Not spam). כך תקבלו את כל ההודעות, ותעזרו גם לנרשמים הבאים לקבל אותן ישירות לתיבת הדואר.
                </p>
              </div>

              {(() => {
                const rows: { label: string; value: string }[] = [
                  { label: 'שם פרטי', value: regForm.full_name },
                  { label: 'שם משפחה', value: regForm.family_name },
                  { label: 'תעודת זהות', value: regForm.id_number },
                  { label: 'מצב משפחתי', value: regForm.marital_status },
                  ...(showSpouseFields ? [
                    { label: 'שם בן/בת הזוג', value: regForm.spouse_name },
                    { label: 'ת"ז בן/בת הזוג', value: regForm.spouse_id_number },
                  ] : []),
                  { label: 'טלפון', value: regForm.phone },
                  { label: 'טלפון נוסף', value: regForm.phone2 },
                  { label: 'דוא"ל', value: regForm.email },
                  { label: 'כתובת', value: [regForm.address, regForm.city].filter(Boolean).join(', ') },
                  { label: 'תאריך לידה', value: regForm.birth_date },
                  { label: 'מספר ילדים', value: children.length ? String(children.length) : '' },
                  { label: 'שיוך (יוחסין)', value: [...lineagePath, ...manualLineage].join(' ← ') },
                  { label: 'הערות', value: regForm.notes },
                ].filter(r => r.value && r.value.trim() !== '')
                return rows.length > 0 ? (
                  <div className="mb-5">
                    <p className="text-xs font-semibold text-slate-500 mb-2">הפרטים שנקלטו:</p>
                    <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                      {rows.map((r, i) => (
                        <div key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                          <span className="text-slate-500 flex-shrink-0">{r.label}</span>
                          <span className="text-slate-900 font-medium text-left break-words">{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null
              })()}

              <button onClick={backToHome}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 text-white font-medium rounded-xl py-3 text-sm transition-all duration-150">
                <ArrowRight size={16} /> חזרה לדף הכניסה
              </button>
            </div>
          </div>
        )}

        {/* ─── Step: Dashboard ─── */}
        {step === 'dashboard' && beneficiary && (
          <div className="flex flex-col gap-4">

            {/* User header */}
            <Card>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <User size={26} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-bold text-slate-900 text-lg truncate">{displayName || beneficiary.full_name}</h2>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {/* לבקשת הלקוח — לא מציגים שום סטטוס על המסך. הסטטוס נשלח רק למייל. */}
                    {beneficiary.city && (
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <MapPin size={11} />{beneficiary.city}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Personal details */}
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
                {beneficiary.id_number && (
                  <div><span className="text-slate-400 text-xs block">ת.ז.</span><span className="text-slate-700" dir="ltr">{beneficiary.id_number}</span></div>
                )}
                {beneficiary.phone && (
                  <div><span className="text-slate-400 text-xs block">טלפון</span><span className="text-slate-700" dir="ltr">{beneficiary.phone}</span></div>
                )}
                {beneficiary.email && (
                  <div className="col-span-2"><span className="text-slate-400 text-xs block">מייל</span><span className="text-slate-700 break-all" dir="ltr">{beneficiary.email}</span></div>
                )}
                {beneficiary.marital_status && (
                  <div><span className="text-slate-400 text-xs block">מצב משפחתי</span><span className="text-slate-700">{beneficiary.marital_status}</span></div>
                )}
                {(beneficiary.marital_status || '').startsWith('נשו') && beneficiary.spouse_name && (
                  <div><span className="text-slate-400 text-xs block">שם בן/בת הזוג</span><span className="text-slate-700">{beneficiary.spouse_name}</span></div>
                )}
                {(beneficiary.marital_status || '').startsWith('נשו') && beneficiary.spouse_id_number && (
                  <div><span className="text-slate-400 text-xs block">ת.ז בן/בת הזוג</span><span className="text-slate-700" dir="ltr">{beneficiary.spouse_id_number}</span></div>
                )}
                {(beneficiary.address || beneficiary.city) && (
                  <div className="col-span-2"><span className="text-slate-400 text-xs block">כתובת</span><span className="text-slate-700">{[beneficiary.address, beneficiary.city].filter(Boolean).join(', ')}</span></div>
                )}
                {beneficiary.children_count != null && (
                  <div><span className="text-slate-400 text-xs block">מספר ילדים</span><span className="text-slate-700">{beneficiary.children_count}</span></div>
                )}
              </div>

              {/* סדר הייחוס שסומן */}
              {Array.isArray(beneficiary.lineage_chain) && beneficiary.lineage_chain.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <span className="text-slate-400 text-xs block mb-1.5">סדר הייחוס</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {beneficiary.lineage_chain.map((c, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <ChevronLeft size={11} className="text-slate-300" />}
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {c.name}
                          {(c.relation === 'son' || c.relation === 'son_in_law') && (
                            <span className="text-[10px] text-indigo-400 mr-1">({c.relation === 'son' ? 'בן' : 'חתן'})</span>
                          )}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* הודעת "כבר נרשמתם" + הפניה למייל האיגוד (ללא הצגת סטטוס) */}
            <Card>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 size={20} className="text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900 mb-1">שים לב — אתם כבר רשומים אצלנו</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    לפי המידע במערכת אתם נמנים עם רשומי <span className="font-semibold">איגוד הצאצאים</span>.
                    כדי להגיש בקשות לסיוע בעת שמחה, לגמ״ח ולשאר ההטבות — שלחו מייל לכתובת{' '}
                    <a href={igudMailto} className="font-semibold text-indigo-600 break-all">igud@chasamsofer.info</a>,
                    או קבלו כעת קישור ישירות למייל שלכם:
                  </p>

                  {benefitsSentTo ? (
                    <div className="mt-3 flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                      <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                      <span>מייל עם רשימת ההטבות וקישורי הבקשות נשלח לכתובת הרשומה על שמכם (<span dir="ltr">{benefitsSentTo}</span>). בדקו את תיבת הדואר (כולל ספאם).</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={sendBenefitsLink}
                        disabled={benefitsSending}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition-all duration-150 text-sm"
                      >
                        {benefitsSending ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                        קבלת קישור להגשת בקשות למייל
                      </button>
                      {benefitsErr && <p className="text-xs text-red-600 mt-2">{benefitsErr}</p>}
                    </>
                  )}
                </div>
              </div>
            </Card>

            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

            {/* תזכורת — השלמת שם הילד ללידות שסומנו ללא שם */}
            {pendingNames.length > 0 && (
              <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4" dir="rtl">
                <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden">
                  <div className="bg-gradient-to-l from-pink-500 to-rose-500 px-6 py-4">
                    <h2 className="text-white font-bold text-lg">השלמת שם הילד — חובה</h2>
                    <p className="text-pink-100 text-xs mt-0.5">כדי להמשיך ולהגיש בקשה חדשה (לידה, הלוואה, סיוע רפואי ועוד) יש להשלים תחילה את שם הילד</p>
                  </div>
                  <div className="px-6 py-5 flex flex-col gap-4">
                    <div className="text-sm text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      לידה מתאריך {pendingNames[0].birth_date ? new Date(pendingNames[0].birth_date).toLocaleDateString('he-IL') : ''} ({pendingNames[0].baby_gender === 'female' ? 'בת' : 'בן'})
                    </div>
                    <input value={nameInput} onChange={e => setNameInput(e.target.value)}
                      placeholder={pendingNames[0].baby_gender === 'female' ? 'שם הנולדת' : 'שם הנולד'}
                      className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                      onKeyDown={e => e.key === 'Enter' && saveBabyName()}
                      autoFocus />
                    <div className="flex items-center gap-2">
                      <button onClick={saveBabyName} disabled={savingName || !nameInput.trim()}
                        className="flex-1 flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-700 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-all duration-150">
                        {savingName ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} שמור שם והמשך
                      </button>
                    </div>
                    {pendingNames.length > 1 && <p className="text-[11px] text-slate-400 text-center">נותרו {pendingNames.length} לידות להשלמת שם</p>}
                  </div>
                </div>
              </div>
            )}

            {/* סטטוס הבקשות — נשלח למייל הרשום במערכת (לא מוצג כאן, לשמירה על פרטיות) */}
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <FileText size={16} className="text-indigo-500" />
                <h3 className="font-semibold text-slate-800 text-sm">סטטוס הבקשות שלי</h3>
              </div>
              {statusSentTo ? (
                <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
                  <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
                  <span>סטטוס הבקשות שלך נשלח למייל הרשום במערכת (<span dir="ltr">{statusSentTo}</span>). בדוק/י את תיבת הדואר (כולל תיקיית ספאם).</span>
                </div>
              ) : (
                <>
                  <button
                    onClick={sendStatusEmail}
                    disabled={statusSending}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition-all duration-150 text-sm"
                  >
                    {statusSending ? <Loader2 size={18} className="animate-spin" /> : <Mail size={18} />}
                    לקבלת סטטוס הבקשה שלך למייל המעודכן במערכת על שמך — הקש כאן
                  </button>
                  {statusErr && <p className="text-xs text-red-600 mt-2">{statusErr}</p>}
                </>
              )}
            </Card>

            {/* אזור אישי: השלמת מסמכים (לא מאושר) + עדכון פרטים אישיים. הגשת בקשות נעשית
                דרך הקישורים שבמיילים (?action=...), לא מהדשבורד. */}
            {!isRejected && !isDocsPending && (
              <div className="flex flex-col gap-3">
                {/* תזכורת השלמת מסמכים — למי שעדיין לא אושר */}
                {!isApproved && (
                  <>
                    <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">עליך עדיין להשלים את המסמכים הנדרשים:</p>
                    <button
                      onClick={() => { setError(''); setDocsPendingReason(null); setStep('docs-needed') }}
                      className="flex items-center gap-4 bg-amber-50 rounded-2xl border-2 border-amber-200 p-5 hover:border-amber-400 transition-all duration-150 text-right shadow-sm group"
                    >
                      <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200 transition-all duration-150">
                        <FileText size={22} className="text-amber-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-slate-900">העלאת מסמכים נדרשים</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {docsMissing ? 'צילומי תעודת זהות והמסמכים הנדרשים' : 'המסמכים התקבלו — ניתן לצפות או להחליף'}
                        </p>
                      </div>
                      {docsMissing
                        ? <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 rounded-full px-2 py-0.5 flex-shrink-0">נדרש</span>
                        : <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />}
                      <ChevronLeft size={18} className="text-slate-300 group-hover:text-amber-400" />
                    </button>
                  </>
                )}

                {/* עדכון פרטים אישיים — זמין לכל הסטטוסים */}
                <button
                  onClick={openEditDetails}
                  className="flex items-center gap-4 bg-indigo-50 rounded-2xl border-2 border-indigo-200 p-5 hover:border-indigo-400 transition-all duration-150 text-right shadow-sm group"
                >
                  <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-200 transition-all duration-150">
                    <User size={22} className="text-indigo-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">עדכון פרטים אישיים</p>
                    <p className="text-xs text-slate-500 mt-0.5">טלפון, כתובת, מייל ומצב משפחתי</p>
                  </div>
                  <ChevronLeft size={18} className="text-slate-300 group-hover:text-indigo-400" />
                </button>
              </div>
            )}

            <div className="text-center pt-2">
              <p className="text-xs text-slate-400">
                נרשמת ב-{new Date(beneficiary.created_at).toLocaleDateString('he-IL')}
              </p>
            </div>
          </div>
        )}

        {/* ─── Step: Widow Dashboard ─── */}
        {step === 'widow-dashboard' && beneficiary && (
          <WidowPortal beneficiary={beneficiary} onBack={backToHome} />
        )}

        {/* ─── Step: Docs Needed ─── */}
        {step === 'docs-needed' && beneficiary && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <button type="button" onClick={() => { setStep('dashboard'); setError('') }} className="text-slate-400 hover:text-slate-600">
                <ArrowRight size={20} />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">השלמת מסמכים</h2>
            </div>

            <Card>
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-indigo-600" />
                </div>
                <div>
                  {(() => {
                    const allExist = requiredDocs.every(d => existingDocs[d])
                    return (
                      <>
                        <p className="font-semibold text-slate-900 mb-1">
                          {allExist ? 'המסמכים שלך כבר התקבלו' : 'נדרשת העלאת מסמכים'}
                        </p>
                        <p className="text-sm text-slate-600 leading-relaxed">
                          {allExist
                            ? 'הקבצים שהעלית כבר נמצאים במערכת ומוצגים למטה. אם תרצה ניתן להחליף אותם — אחרת אין צורך בפעולה נוספת.'
                            : 'כדי להגיש בקשה יש לאמת את זהותך. אנא העלה את המסמכים הבאים:'}
                        </p>
                      </>
                    )
                  })()}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {requiredDocs.map(d => (
                  <div key={d}>
                    {renderIdDocSlot(
                      d,
                      d === 'id_husband'
                        ? (beneficiary.marital_status === 'נשואים' ? 'תעודת זהות — הבעל' : 'תעודת זהות שלך')
                        : (docLabel(d)),
                    )}
                  </div>
                ))}
              </div>

              {error && <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

              {(() => {
                const allExist = requiredDocs.every(d => existingDocs[d])
                const hasNew = requiredDocs.some(d => docFiles[d])
                const label = docsUploading
                  ? (hasNew ? 'שולח מסמכים...' : 'מעבד...')
                  : hasNew ? 'שלח מסמכים לאישור' : (allExist ? 'המשך' : 'שלח מסמכים לאישור')
                return (
                  <button type="button" onClick={handleDocsUpload} disabled={docsUploading}
                    className="mt-5 w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150">
                    {docsUploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                    {label}
                  </button>
                )
              })()}

              <p className="text-xs text-slate-400 text-center mt-3">
                לאחר בדיקת המסמכים במזכירות תקבלו על כך הודעה מסודרת.
              </p>
            </Card>
          </div>
        )}

        {/* ─── Step: New Birth ─── */}
        {step === 'new-birth' && (
          <form onSubmit={handleBirthRequest} className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <button type="button" onClick={backToDashboard} className="text-slate-400 hover:text-slate-600">
                <ArrowRight size={20} />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">בקשת הבראה ליולדת</h2>
            </div>

            {renderIdDocsSection()}

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Baby size={18} className="text-pink-500" />
                <h3 className="font-semibold text-slate-900">פרטי הלידה</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Field label="תאריך הלידה" required>
                    {/* ההגשה נסגרת ב-30 יום — לפני תום 6 שבועות המימוש. */}
                    <HebrewDatePicker
                      value={birthForm.birth_date}
                      onChange={iso => setBirthForm(f => ({ ...f, birth_date: iso }))}
                      maxToday
                      minDaysBack={MATERNITY_SUBMIT_DAYS}
                      minDateMessage="שימו לב: ניתן להגיש בקשה עד 30 יום מתאריך הלידה. התאריך שנבחר מוקדם מכך, ולכן אינו זמין לבחירה. אם קיימות נסיבות מיוחדות, נשמח לסייע — אנא פנו למשרד."
                    />
                  </Field>
                </div>
                {/* בורר לידת תאומים — לפני פרטי התינוקות */}
                <div className="col-span-2">
                  <Field label="סוג לידה" required>
                    <div className="flex gap-2">
                      {[{ v: false, l: 'לידה רגילה' }, { v: true, l: 'לידת תאומים' }].map(({ v, l }) => (
                        <button key={String(v)} type="button"
                          onClick={() => setIsTwins(v)}
                          className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all duration-150 ${
                            isTwins === v ? 'bg-indigo-100 text-indigo-800 border-indigo-400' : GENDER_BTN_UNSEL
                          }`}
                        >{l}</button>
                      ))}
                    </div>
                    {isTwins && <p className="mt-1.5 text-xs text-indigo-600">בלידת תאומים יש למלא את פרטי שני התינוקות בנפרד. הזכאות בבית ההחלמה תהיה 4 ימים.</p>}
                  </Field>
                </div>

                {/* תינוק ראשון (או התינוק הבודד בלידה רגילה) */}
                <BabyFields
                  title={isTwins ? 'תינוק ראשון' : undefined}
                  gender={birthForm.baby_gender} name={birthForm.baby_name}
                  idType={birthForm.baby_id_type} idNumber={birthForm.baby_id_number}
                  noName={noBabyName} idError={babyIdError}
                  onChange={(field, value) => setBirthForm(f => ({ ...f, [field]: value }))}
                  setNoName={setNoBabyName} setIdError={setBabyIdError}
                />

                {/* תינוק שני — רק בלידת תאומים */}
                {isTwins && (
                  <BabyFields
                    title="תינוק שני" accent="violet"
                    gender={baby2.baby_gender} name={baby2.baby_name}
                    idType={baby2.baby_id_type} idNumber={baby2.baby_id_number}
                    noName={noBaby2Name} idError={baby2IdError}
                    onChange={(field, value) => setBaby2(b => ({ ...b, [field]: value }))}
                    setNoName={setNoBaby2Name} setIdError={setBaby2IdError}
                  />
                )}
                <div className="col-span-2">
                  <Field label="בית החלמה" required>
                    <div className="flex flex-wrap gap-2">
                      {recoveryHomes.map(h => (
                        <button key={h} type="button"
                          onClick={() => setBirthForm(f => ({ ...f, recovery_home: f.recovery_home === h ? '' : h }))}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-150 ${
                            birthForm.recovery_home === h
                              ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                          }`}
                        >{h}</button>
                      ))}
                    </div>
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="הערות">
                    <textarea value={birthForm.notes} onChange={setBirth('notes')} rows={3}
                      placeholder="כל מידע רלוונטי נוסף..."
                      className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none w-full"
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="אישור לידה" required hint={`אישור הלידה מבית החולים. ${UPLOAD_HINT}`}>
                    {birthCertFile ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="text-sm text-green-700 flex items-center gap-2">
                          <CheckCircle2 size={14} /> {birthCertFile.name}
                        </span>
                        <button type="button" onClick={() => setBirthCertFile(null)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-pink-50 border-2 border-dashed border-slate-300 hover:border-pink-400 rounded-xl px-4 py-3 transition-all duration-150">
                        <Upload size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-500">לחץ להעלאת אישור לידה</span>
                        <input type="file" accept={UPLOAD_ACCEPT} className="hidden"
                          onChange={e => setBirthCertFile(e.target.files?.[0] ?? null)} />
                      </label>
                    )}
                  </Field>
                </div>
              </div>
            </Card>


            {error && <ErrorBox message={error} />}

            {/* קישור עדין ללידה שקטה */}
            <button type="button" onClick={() => { setError(''); setShowSilentInfo(true) }}
              className="mx-auto flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 transition-all duration-150">
              <Heart size={13} /> עברת לידה שקטה? להגשת בקשה מותאמת — לחצי כאן
            </button>

            <button type="submit" disabled={loading}
              className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              {loading ? 'שולח...' : 'שלח בקשה'}
            </button>
          </form>
        )}

        {/* ─── Step: New Silent Birth ─── */}
        {step === 'new-silent-birth' && (
          <form onSubmit={handleSilentBirthRequest} className="flex flex-col gap-4">
            <div className="flex items-center gap-3 mb-1">
              <button type="button" onClick={backToDashboard} className="text-slate-400 hover:text-slate-600">
                <ArrowRight size={20} />
              </button>
              <h2 className="font-bold text-slate-900 text-lg">בקשה לאחר לידה שקטה</h2>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 leading-relaxed">
              בבקשה זו אין צורך בפרטי תינוק (שם / ת.ז). אנא מלאו את תאריך הלידה, בחרו בית החלמה וצרפו מסמך אישור.
            </div>

            {renderIdDocsSection()}

            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Heart size={18} className="text-rose-500" />
                <h3 className="font-semibold text-slate-900">פרטי הבקשה</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <Field label="תאריך הלידה" required>
                    <HebrewDatePicker
                      value={silentForm.birth_date}
                      onChange={iso => setSilentForm(f => ({ ...f, birth_date: iso }))}
                      maxToday
                      minDaysBack={MATERNITY_SUBMIT_DAYS}
                      minDateMessage="שימו לב: ניתן להגיש בקשה עד 30 יום מתאריך הלידה. התאריך שנבחר מוקדם מכך, ולכן אינו זמין לבחירה. אם קיימות נסיבות מיוחדות, נשמח לסייע — אנא פנו למשרד."
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="בית החלמה" required>
                    <div className="flex flex-wrap gap-2">
                      {recoveryHomesSilent.map(h => (
                        <button key={h} type="button"
                          onClick={() => setSilentForm(f => ({ ...f, recovery_home: f.recovery_home === h ? '' : h }))}
                          className={`px-4 py-2 rounded-xl border text-sm font-medium transition-all duration-150 ${
                            silentForm.recovery_home === h
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:bg-rose-50'
                          }`}
                        >{h}</button>
                      ))}
                    </div>
                    {recoveryHomesSilent.length === 0 && (
                      <p className="text-xs text-slate-400 mt-1">לא הוגדרו בתי החלמה ללידה שקטה. אנא פנו למזכירות.</p>
                    )}
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="הערות">
                    <textarea value={silentForm.notes} onChange={e => setSilentForm(f => ({ ...f, notes: e.target.value }))} rows={3}
                      placeholder="כל מידע רלוונטי נוסף..."
                      className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent resize-none w-full"
                    />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="מסמך אישור" required hint={`אישור רפואי / מסמך מבית החולים. ${UPLOAD_HINT}`}>
                    {birthCertFile ? (
                      <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="text-sm text-green-700 flex items-center gap-2">
                          <CheckCircle2 size={14} /> {birthCertFile.name}
                        </span>
                        <button type="button" onClick={() => setBirthCertFile(null)} className="text-red-400 hover:text-red-600">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center gap-2 cursor-pointer bg-slate-50 hover:bg-rose-50 border-2 border-dashed border-slate-300 hover:border-rose-400 rounded-xl px-4 py-3 transition-all duration-150">
                        <Upload size={16} className="text-slate-400" />
                        <span className="text-sm text-slate-500">לחץ להעלאת מסמך אישור</span>
                        <input type="file" accept={UPLOAD_ACCEPT} className="hidden"
                          onChange={e => setBirthCertFile(e.target.files?.[0] ?? null)} />
                      </label>
                    )}
                  </Field>
                </div>
              </div>
            </Card>


            {error && <ErrorBox message={error} />}

            <button type="submit" disabled={loading}
              className="flex items-center justify-center gap-2 bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-600 hover:to-rose-800 disabled:from-rose-300 disabled:to-rose-300 shadow-[0_6px_16px_-6px_rgba(225,29,72,0.5)] hover:shadow-[0_10px_22px_-8px_rgba(225,29,72,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-rose-400 text-white font-semibold py-3 px-4 rounded-xl transition-all duration-150 text-base"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20} />}
              {loading ? 'שולח...' : 'שלח בקשה'}
            </button>
          </form>
        )}

        {/* ─── Loan Modal ─── */}
        {loanModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl z-10">
                <div className="flex items-center gap-2">
                  <CreditCard size={18} className="text-blue-600" />
                  <h3 className="font-bold text-slate-900">בקשת הלוואה</h3>
                </div>
                <button type="button" onClick={() => { setLoanModalOpen(false); setError('') }}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                  <X size={20} />
                </button>
              </div>

              {/* Modal body */}
              <form onSubmit={handleLoanRequest} className="p-6 flex flex-col gap-4">
                {renderIdDocsSection()}
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Field label="מטרת ההלוואה" required>
                      <SelectInput value={loanForm.purpose} onChange={setLoan('purpose')} required>
                        <option value="">בחר מטרה...</option>
                        {LOAN_PURPOSES.map(p => (
                          <option key={p.value} value={p.value}>{p.value}</option>
                        ))}
                      </SelectInput>
                      {loanForm.purpose && LOAN_PURPOSES.find(p => p.value === loanForm.purpose)?.desc && (
                        <p className="text-xs text-indigo-600 mt-1">
                          {LOAN_PURPOSES.find(p => p.value === loanForm.purpose)?.desc}
                        </p>
                      )}
                    </Field>
                  </div>
                  {loanForm.purpose && loanForm.purpose !== WEDDING_PURPOSE && (
                    <div className="col-span-2">
                      <Field label="פירוט הבקשה" required hint="פרט/י בהרחבה על מטרת ההלוואה והצורך">
                        <textarea value={loanForm.purpose_details} onChange={setLoan('purpose_details')} rows={4}
                          placeholder="פרט/י כאן בהרחבה על מטרת הבקשה והצורך..."
                          className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none w-full" />
                      </Field>
                    </div>
                  )}
                  {loanForm.purpose === WEDDING_PURPOSE && (
                    <div className="col-span-2">
                      <Field label="הזמנה של החתונה" required hint={`יש לצרף הזמנה של החתונה. ${UPLOAD_HINT}`}>
                        {loanWeddingFile ? (
                          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                            <span className="text-sm text-green-700 flex items-center gap-2 min-w-0"><CheckCircle2 size={14} className="flex-shrink-0" /><span className="truncate">{loanWeddingFile.name}</span></span>
                            <button type="button" onClick={() => setLoanWeddingFile(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg px-3 py-4 text-sm text-slate-500 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40">
                            <Upload size={16} /> לחץ לצירוף הזמנת החתונה
                            <input type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={e => setLoanWeddingFile(e.target.files?.[0] ?? null)} />
                          </label>
                        )}
                      </Field>
                    </div>
                  )}
                  {loanForm.purpose && loanForm.purpose !== WEDDING_PURPOSE && (
                    <div className="col-span-2">
                      <Field label="מסמך מצורף (לא חובה)" hint={`ניתן לצרף מסמך תומך. ${UPLOAD_HINT}`}>
                        {loanOtherFile ? (
                          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                            <span className="text-sm text-green-700 flex items-center gap-2 min-w-0"><CheckCircle2 size={14} className="flex-shrink-0" /><span className="truncate">{loanOtherFile.name}</span></span>
                            <button type="button" onClick={() => setLoanOtherFile(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                          </div>
                        ) : (
                          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg px-3 py-4 text-sm text-slate-500 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40">
                            <Upload size={16} /> לחץ לצירוף מסמך
                            <input type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={e => setLoanOtherFile(e.target.files?.[0] ?? null)} />
                          </label>
                        )}
                      </Field>
                    </div>
                  )}
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="סכום מבוקש (₪)" required hint="עד 30,000 ₪">
                      <TextInput
                        type="number" min="100" max="30000" step="100"
                        value={loanForm.amount} onChange={setLoanClamped('amount', 30000)}
                        placeholder="5000" required
                      />
                    </Field>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Field label="מספר תשלומים" required hint="עד 60 תשלומים">
                      <TextInput
                        type="number" min="1" max="60"
                        value={loanForm.installments} onChange={setLoanClamped('installments', 60)}
                        placeholder="12" required
                      />
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-800 font-bold">
                      <AlertCircle size={16} className="flex-shrink-0" />
                      שים לב: ההלוואה מתבצעת במטבע דולר ($).
                    </div>
                  </div>
                  {loanForm.amount && loanForm.installments && (
                    <div className="col-span-2">
                      <div className="bg-indigo-50 rounded-lg px-3 py-2.5 text-sm text-indigo-800 border border-indigo-100">
                        תשלום חודשי משוער:{' '}
                        <strong>
                        {new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 })
                            .format(parseFloat(loanForm.amount) / parseInt(loanForm.installments, 10) || 0)}
                        </strong>
                      </div>
                    </div>
                  )}
                  <div className="col-span-2">
                    <Field label='האם פנית בעבר לגמ"ח חתם סופר?' required>
                      <div className="flex flex-col gap-2">
                        {LOAN_DECLARATIONS.map(opt => (
                          <label key={opt} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="radio" name="declaration" value={opt}
                              checked={loanForm.declaration === opt}
                              onChange={setLoan('declaration')}
                              className="accent-indigo-600"
                            />
                            {opt}
                          </label>
                        ))}
                      </div>
                    </Field>
                  </div>
                  <div className="col-span-2">
                    <Field label="הערות נוספות">
                      <textarea value={loanForm.notes} onChange={setLoan('notes')} rows={3}
                        placeholder="כל מידע רלוונטי נוסף..."
                        className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none w-full"
                      />
                    </Field>
                  </div>
                </div>


                {error && <ErrorBox message={error} />}

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => { setLoanModalOpen(false); setError('') }}
                    className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all duration-150">
                    ביטול
                  </button>
                  <button type="submit" disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-2.5 rounded-xl transition-all duration-150 text-sm">
                    {loading ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                    {loading ? 'שולח...' : 'שלח בקשה'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ─── Financial Aid modal ─── */}
        {aidModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
            <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <HandCoins size={20} className="text-emerald-600" />
                  <h2 className="font-bold text-slate-900">בקשת סיוע רפואי</h2>
                </div>
                <button type="button" onClick={() => { setAidModalOpen(false); setError('') }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <form onSubmit={handleFinancialAidRequest} className="p-6 flex flex-col gap-4">
                {renderIdDocsSection()}
                <Field label="סיבת הבקשה" required hint="פרט/י כמה שיותר על המקרה — הרקע, הצורך והנסיבות. אם מדובר במצב רפואי או דומה, נסח/י בקצרה ובאופן ענייני (אבחנה, טיפול נדרש, עלויות).">
                  <textarea value={aidReason} onChange={e => setAidReason(e.target.value)} rows={5}
                    placeholder="לדוגמה: בעקבות אבחון רפואי נדרש טיפול בעלות גבוהה שאינו מכוסה... אנא פרט/י את המצב, הצרכים והעלויות המשוערות."
                    className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none w-full" />
                </Field>
                <Field label="מסמך מצורף" required hint={`צרף מסמך תומך. ${UPLOAD_HINT}`}>
                  {aidFile ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
                      <span className="text-sm text-green-700 flex items-center gap-2 min-w-0"><CheckCircle2 size={14} className="flex-shrink-0" /><span className="truncate">{aidFile.name}</span></span>
                      <button type="button" onClick={() => setAidFile(null)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg px-3 py-4 text-sm text-slate-500 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/40">
                      <Upload size={16} /> לחץ להעלאת מסמך
                      <input type="file" accept={UPLOAD_ACCEPT} className="hidden" onChange={e => setAidFile(e.target.files?.[0] ?? null)} />
                    </label>
                  )}
                </Field>
                {!isApproved && (
                  <div className="border border-amber-200 bg-amber-50/60 rounded-xl p-4">
                    <p className="font-semibold text-slate-900 text-sm mb-1">אימות זהות — חובה</p>
                    <p className="text-xs text-slate-600 leading-relaxed mb-3">
                      המשפחה טרם אושרה. חובה לצרף צילומי תעודת זהות (כולל ספח) — הבקשה והמסמכים יישלחו יחד לגורם המאשר.
                    </p>
                    <div className="flex flex-col gap-3">
                      {requiredDocs.map(d => (
                        <div key={d}>{renderIdDocSlot(d, d === 'id_husband' ? (beneficiary?.marital_status === 'נשואים' ? 'תעודת זהות — הבעל' : 'תעודת זהות שלך') : docLabel(d))}</div>
                      ))}
                    </div>
                  </div>
                )}
                {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-600 hover:to-emerald-800 disabled:from-emerald-300 disabled:to-emerald-300 shadow-[0_6px_16px_-6px_rgba(5,150,105,0.5)] hover:shadow-[0_10px_22px_-8px_rgba(5,150,105,0.6)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-emerald-400 text-white font-semibold py-3 rounded-xl transition-all duration-150">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} שלח בקשה
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ─── עדכון פרטים (משפחה מאושרת) ─── */}
        {editOpen && beneficiary && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <User size={20} className="text-indigo-600" />
                  <h2 className="font-bold text-slate-900">עדכון פרטים אישיים</h2>
                </div>
                <button type="button" onClick={() => { setEditOpen(false); setError('') }} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
              <div className="p-6 flex flex-col gap-4">
                {/* קריאה בלבד — לא ניתן לשינוי */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <p><span className="text-slate-400 text-xs block">שם</span>{[beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ')}</p>
                  <p><span className="text-slate-400 text-xs block">ת.ז (לא ניתן לשינוי)</span><span className="ltr-num">{beneficiary.id_number ?? '—'}</span></p>
                  {beneficiary.spouse_name && <p><span className="text-slate-400 text-xs block">בן/בת זוג</span>{beneficiary.spouse_name}</p>}
                  {beneficiary.spouse_id_number && <p><span className="text-slate-400 text-xs block">ת.ז בן/זוג (לא ניתן לשינוי)</span><span className="ltr-num">{beneficiary.spouse_id_number}</span></p>}
                </div>

                <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  אימות טלפון מאפשר לקבל אליו קוד כניסה בעתיד. ניתן לאמת כאן טלפון שעדיין לא אומת.
                </div>
                <Field label="טלפון בעל">
                  <TextInput value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} dir="ltr" inputMode="tel" />
                  {editForm.phone && validatePhone(editForm.phone) && isVerifiedPhone(editForm.phone) && editPhoneToken === null ? (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={13} /> מספר מאומת</p>
                  ) : (
                    <VerifyControl channel="phone" value={editForm.phone} valid={validatePhone(editForm.phone)} onToken={setEditPhoneToken} />
                  )}
                </Field>
                <Field label="טלפון אשה" hint="לא חובה">
                  <TextInput value={editForm.spouse_phone} onChange={e => setEditForm(f => ({ ...f, spouse_phone: e.target.value }))} dir="ltr" inputMode="tel" />
                  {editForm.spouse_phone && validatePhone(editForm.spouse_phone) && isVerifiedPhone(editForm.spouse_phone) && editSpousePhoneToken === null ? (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={13} /> מספר מאומת</p>
                  ) : (
                    <VerifyControl channel="phone" value={editForm.spouse_phone} valid={validatePhone(editForm.spouse_phone)} onToken={setEditSpousePhoneToken} />
                  )}
                </Field>
                <Field label="טלפון נוסף" hint="לא חובה">
                  <TextInput value={editForm.phone2} onChange={e => setEditForm(f => ({ ...f, phone2: e.target.value }))} dir="ltr" inputMode="tel" />
                  {editForm.phone2 && validatePhone(editForm.phone2) && isVerifiedPhone(editForm.phone2) && editPhone2Token === null ? (
                    <p className="mt-1.5 flex items-center gap-1 text-xs text-green-700"><CheckCircle2 size={13} /> מספר מאומת</p>
                  ) : (
                    <VerifyControl channel="phone" value={editForm.phone2} valid={validatePhone(editForm.phone2)} onToken={setEditPhone2Token} />
                  )}
                </Field>
                <Field label="מייל">
                  <TextInput value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} dir="ltr" inputMode="email" />
                  {(editForm.email ?? '').trim().toLowerCase() !== (beneficiary.email ?? '').trim().toLowerCase() && (
                    <VerifyControl channel="email" value={editForm.email} valid={validateEmail(editForm.email)} onToken={setEditEmailToken} />
                  )}
                </Field>
                <CityStreetPicker
                  city={editForm.city}
                  address={editForm.address}
                  onCityChange={v => setEditForm(f => ({ ...f, city: v }))}
                  onAddressChange={v => setEditForm(f => ({ ...f, address: v }))}
                />
                <Field label="מצב משפחתי">
                  <SelectInput value={editForm.marital_status} onChange={e => setEditForm(f => ({ ...f, marital_status: e.target.value }))}>
                    <option value="">בחר…</option>
                    {MARITAL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </SelectInput>
                </Field>

                {/* ─── מספר ילדים / פרטי הילדים ─── */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users size={16} className="text-indigo-600" />
                    <h3 className="text-sm font-semibold text-slate-900">מספר ילדים / פרטי הילדים</h3>
                  </div>
                  <Field label="מספר ילדים">
                    <TextInput
                      type="number" min="0" max="20" inputMode="numeric" placeholder="0" className="w-28"
                      value={editChildren.length === 0 ? '' : String(editChildren.length)}
                      onChange={e => {
                        const n = Math.max(0, Math.min(20, parseInt(e.target.value || '0', 10) || 0))
                        setEditChildren(cs => n > cs.length
                          ? [...cs, ...Array.from({ length: n - cs.length }, emptyChild)]
                          : cs.slice(0, n))
                      }}
                    />
                  </Field>

                  <div className="flex flex-col gap-3 mt-3">
                    {editChildren.map((child, idx) => (
                      <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-semibold text-slate-700">ילד {idx + 1}</span>
                          <button type="button"
                            onClick={() => {
                              setEditChildren(cs => cs.filter((_, i) => i !== idx))
                              setEditChildIdErrors(er => { const n = { ...er }; delete n[idx]; return n })
                            }}
                            className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-50 transition-all duration-150">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="שם הילד/ה" required>
                              <TextInput value={child.name} placeholder="שם מלא" required
                                onChange={e => setEditChildren(cs => cs.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))} />
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="תעודת זהות" required>
                              <TextInput value={child.id_number} placeholder="000000000" inputMode="numeric" maxLength={9} dir="ltr" required
                                className={editChildIdErrors[idx] ? 'border-red-400 focus:ring-red-400' : ''}
                                onChange={e => { setEditChildren(cs => cs.map((c, i) => i === idx ? { ...c, id_number: e.target.value.replace(/\D/g,'') } : c)); setEditChildIdErrors(er => ({ ...er, [idx]: '' })) }}
                                onBlur={async () => {
                                  const digits = (child.id_number || '').replace(/\D/g, '')
                                  if (digits && !validateIsraeliId(digits)) {
                                    setEditChildIdErrors(er => ({ ...er, [idx]: 'תעודת הזהות שהזנתם אינה תקינה' })); return
                                  }
                                  setEditChildIdErrors(er => ({ ...er, [idx]: '' }))
                                  if (digits.length === 9) {
                                    // בעריכה — ילד שכבר שייך למשפחה זו לא נחשב ככפילות מול עצמו
                                    const ownIds = (beneficiary?.children ?? []).map(c => (c.id_number ?? '').replace(/\D/g, ''))
                                    if (ownIds.includes(digits)) return
                                    try {
                                      const r = await fetch(`/api/portal/lookup?id=${digits}`)
                                      const d = await r.json()
                                      if (d.found || d.foundAsChild) {
                                        setEditChildIdErrors(er => ({ ...er, [idx]: 'ילד/ה זה כבר רשום/ה במערכת — לא ניתן לרשום פעם נוספת' }))
                                      }
                                    } catch { /* בדיקת שרת תיתפס בעת השליחה */ }
                                  }
                                }} />
                              {editChildIdErrors[idx] && <p className="text-xs text-red-600 mt-1">{editChildIdErrors[idx]}</p>}
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="תאריך לידה" required>
                              <HebrewDatePicker value={child.birth_date}
                                onChange={iso => setEditChildren(cs => cs.map((c, i) => i === idx ? { ...c, birth_date: iso } : c))} maxToday yearFirst />
                            </Field>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <Field label="מין" required>
                              <div className="flex gap-2">
                                {[{ v: 'male', l: 'בן' }, { v: 'female', l: 'בת' }].map(({ v, l }) => (
                                  <button key={v} type="button"
                                    onClick={() => setEditChildren(cs => cs.map((c, i) => i === idx ? { ...c, gender: v, marital_status: '' } : c))}
                                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                                      child.gender === v ? GENDER_BTN_SEL[v] : GENDER_BTN_UNSEL
                                    }`}
                                  >{l}</button>
                                ))}
                              </div>
                            </Field>
                          </div>
                          {child.gender && (
                          <div className="col-span-2">
                            <Field label="מצב משפחתי">
                              <div className="flex gap-2 flex-wrap">
                                {maritalFor(child.gender).map(({ v, l }) => (
                                  <button key={v} type="button"
                                    onClick={() => setEditChildren(cs => cs.map((c, i) => i === idx ? { ...c, marital_status: v } : c))}
                                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150 ${
                                      child.marital_status === v
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'
                                    }`}
                                  >{l}</button>
                                ))}
                              </div>
                            </Field>
                          </div>
                          )}
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={() => setEditChildren(cs => [...cs, emptyChild()])}
                      className="flex items-center justify-center gap-2 border-2 border-dashed border-indigo-200 text-indigo-600 hover:border-indigo-400 hover:bg-indigo-50 font-medium py-2.5 rounded-xl text-sm transition-all duration-150">
                      <Plus size={16} /> הוסף ילד/ה
                    </button>
                  </div>
                </div>

                {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">{error}</div>}
                <button onClick={handleUpdateDetails} disabled={editSaving}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 disabled:bg-indigo-400 text-white font-semibold py-3 rounded-xl">
                  {editSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} שמירת השינויים
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Step: Request Sent ─── */}
        {step === 'request-sent' && (
          <Card>
            <div className="text-center py-4">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={38} className="text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">הבקשה נשלחה!</h2>
              <p className="text-slate-600 mb-6 leading-relaxed">
                הבקשה התקבלה במערכת ותטופל בהקדם.
                <br />
                יישלח אליכם הודעה.
              </p>
              <div className="flex flex-col gap-2">
                <button onClick={backToDashboard}
                  className="flex items-center justify-center gap-2 bg-gradient-to-b from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 disabled:from-indigo-300 disabled:to-indigo-300 shadow-[0_6px_16px_-6px_rgba(79,70,229,0.55)] hover:shadow-[0_10px_22px_-8px_rgba(79,70,229,0.65)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:shadow-none disabled:translate-y-0 text-white font-medium py-2.5 px-4 rounded-xl transition-all duration-150 text-sm"
                >
                  <User size={16} /> חזרה לאזור האישי
                </button>
                <button onClick={backToHome}
                  className="flex items-center justify-center gap-2 text-slate-500 hover:text-slate-700 py-2 text-sm">
                  <ArrowRight size={16} /> יציאה
                </button>
              </div>
            </div>
          </Card>
        )}

        <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-1">
          <Mail size={11} />
          מערכת מאובטחת · כל הפרטים מוצפנים
        </p>
      </main>

      {/* קרדיט — מוצמד לתחתית הדף (mt-auto דוחף אותו למטה כשהתוכן קצר) */}
      <footer className="mt-auto border-t border-slate-200 bg-white/60 py-5">
        <p className="text-center text-sm text-slate-500">
          אפיון ופיתוח:{' '}
          <a
            href="https://r-lavan.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-bold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
          >
            r-lavan
          </a>
        </p>
      </footer>

      {/* אזהרת החלפת מסמך — הקובץ הקיים יימחק לצמיתות */}
      {replaceWarn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" onClick={() => setReplaceWarn(null)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-amber-50 border-b border-amber-200 px-5 py-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <h3 className="font-bold text-slate-900">שימו לב — החלפת מסמך קיים</h3>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3">
              <p className="text-sm text-slate-700 leading-relaxed">
                עבור <strong>{docLabel(replaceWarn.key)}</strong> כבר קיים מסמך במערכת.
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">
                העלאת הקובץ החדש <strong>תחליף את הקובץ הקיים</strong>. הקובץ הקודם יימחק לצמיתות ולא ניתן יהיה לשחזרו.
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-[11px] text-slate-500 mb-0.5">הקובץ החדש</p>
                <p className="text-sm font-semibold text-slate-800 truncate">{replaceWarn.file.name}</p>
              </div>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReplaceWarn(null)}
                className="text-sm font-medium text-slate-600 px-4 py-2 rounded-lg hover:bg-white transition-colors"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={confirmReplace}
                className="text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 px-4 py-2 rounded-lg transition-colors shadow-sm"
              >
                כן, החלף את הקובץ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
