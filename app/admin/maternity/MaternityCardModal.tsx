'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Download, RotateCw, ZoomIn, ZoomOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCan } from '@/components/StaffPermissions'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import type { MaternityAid } from '@/types'
import { babyNameLabel, type AidNameFields } from '@/lib/babyNames'
import { STATUS_PILL, type MotherRef } from './maternityStatus'
import { useCardActivity, CardPanel, CardHistory, money, cardStatusKey } from './MaternityCardsTab'
import SafeDocImage from '@/components/ui/SafeDocImage'
import PdfCanvasView from '@/components/ui/PdfCanvasView'
import { loadDocBlob, openDocInNewTab, downloadDocViaData } from '@/lib/docBlob'
import RecordModal, { modalBtn, type RecordTone } from '@/components/admin/system/RecordModal'

// כרטסת לידה: הגדרות בלבד, התצוגה ב-RecordModal המשותף.
// ⚠️ אישור, דחייה, הארכת זכאות וטעינת כרטיס מתבצעים בכרטסת המלאה ולא משוכפלים כאן.
// ⚠️ ליולדות אין שרשור התכתבות במסד (שליחת קישור תיקון שם בלבד), ולכן אין לשונית התכתבות.

type Extra = Partial<MaternityAid> & { beneficiary?: (MotherRef & { email?: string; city?: string; address?: string }) | null }

type FixHistory = { requestedAt: string; requestedBy: string | null; notes: string | null; complete: boolean; items: { docType: string; label: string; doneAt: string | null }[] }

const TONE:Record<string, RecordTone> = { pending: 'wait', deep_review: 'chk', active: 'ok', completed: 'ok', cancelled: 'no' }
const STEP_OF: Record<string, number> = { pending: 0, deep_review: 1, active: 2, completed: 3, cancelled: 1 }
const STEPS = ['התקבלה', 'בדיקה', 'מאושרת', 'הושלמה']

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('he-IL') : '—')
const fmtTime = (d?: string | null) => (d ? new Date(d).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const motherName =(m?: MotherRef) => {
  if (!m) return '—'
  if (m.spouse_name) return [m.family_name, m.spouse_name].filter(Boolean).join(' ')
  return [m.family_name, m.full_name].filter(Boolean).join(' ') || '—'
}

// מסמך חי במסך: תמונה או PDF ישר בקובייה, עם הגדלה, סיבוב, הורדה ופתיחה בחלון חדש
// ⚠️ אין זיהוי טקסט במסמך, ולכן ההתאמה לשדות התיק מוצגת בשורה מתחת ולא כסימון על המסמך
// טעינת המסמך דרך ערוץ הנתונים (הדלי פרטי, כתובת ציבורית ישירה מחזירה NoSuchBucket); מזהה כשל לפני ההצגה
function useDocStatus(url: string): 'loading' | 'ok' | 'error' {
  const [st, setSt] = useState<{ url: string; v: 'ok' | 'error' } | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    loadDocBlob(url).then(() => alive && setSt({ url, v: 'ok' })).catch(() => alive && setSt({ url, v: 'error' }))
    return () => { alive = false }
  }, [url])
  return st && st.url === url ? st.v : 'loading'
}

function LiveDoc({ docs, matches }: { docs: { url: string; label: string }[]; matches: { label: string; value: string }[] }) {
  const [page, setPage] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [rot, setRot] = useState(0)
  const cur = docs[Math.min(page, docs.length - 1)]
  const btn = 'grid h-9 w-9 place-items-center rounded-md border border-[#D9CFB9] bg-white text-[#14213D] hover:border-[#14213D] disabled:opacity-40'
  const status = useDocStatus(cur?.url ?? '')
  if (!cur) return <section className="rounded-xl border border-[#E6DFCF] bg-[#FFFDF8] p-5 text-sm text-[#6B6352]">לא צורף אישור לידה</section>
  const pdf = /\.pdf(\?|#|$)/i.test(cur.url)
  const turn = rot % 180 !== 0
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-[#E6DFCF] bg-[#FFFDF8] shadow-[0_1px_2px_rgba(20,33,61,.05),0_8px_24px_rgba(20,33,61,.06)]">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[#E6DFCF] bg-[#F4F1E8] px-2.5 py-2">
        <b className="ml-auto text-sm text-[#14213D]">{cur.label}</b>
        <button type="button" className={btn} title="הקטנה" aria-label="הקטנה" disabled={pdf || zoom <= 0.5} onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}><ZoomOut size={16} /></button>
        <button type="button" className={btn} title="הגדלה" aria-label="הגדלה" disabled={pdf || zoom >= 3} onClick={() => setZoom(z => Math.min(3, z + 0.25))}><ZoomIn size={16} /></button>
        <button type="button" className={btn} title="סיבוב" aria-label="סיבוב" disabled={pdf} onClick={() => setRot(r => (r + 90) % 360)}><RotateCw size={16} /></button>
        <button type="button" className={btn} title="הורדה" aria-label="הורדה" onClick={() => { downloadDocViaData(cur.url).catch(() => {}) }}><Download size={16} /></button>
        <button type="button" className={btn} title="פתיחה בחלון חדש" aria-label="פתיחה בחלון חדש" onClick={() => { openDocInNewTab(cur.url).catch(() => {}) }}><ExternalLink size={16} /></button>
      </div>
      <div className="min-h-[380px] flex-1 overflow-auto bg-[#EFEBDD] p-2">
        {status === 'loading' && <p className="py-16 text-center text-sm text-[#6B6352]">טוען מסמך…</p>}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm font-medium text-[#8A2B2B]">לא הצלחנו להציג את המסמך כאן</p>
            <button type="button" onClick={() => { openDocInNewTab(cur.url).catch(() => {}) }}
              className="rounded-md border border-[#14213D] bg-white px-3 py-1.5 text-sm font-bold text-[#14213D] hover:bg-[#F4F1E8]">פתח בחלון חדש</button>
          </div>
        )}
        {status === 'ok' && (pdf
          ? <PdfCanvasView url={cur.url} className="w-full rounded bg-white" />
          : <div style={{ width: `${zoom * 100}%`, transform: `rotate(${rot}deg)`, margin: turn ? '12% 0' : undefined }} className="mx-auto transition-transform">
              <SafeDocImage path={cur.url} alt={cur.label} className="block w-full rounded bg-white" />
            </div>)}
      </div>
      {docs.length > 1 && (
        <div className="flex items-center gap-2 border-t border-[#E6DFCF] px-2.5 py-2">
          {docs.map((d, i) => (
            <button key={d.url} type="button" onClick={() => { setPage(i); setRot(0); setZoom(1) }} aria-pressed={page === i}
              className={`rounded-md border px-2.5 py-1 text-xs ${page === i ? 'border-[#C0912F] bg-[#FFF8E6] font-bold text-[#8A6316]' : 'border-[#D9CFB9] bg-white text-[#6B6352]'}`}>{d.label}</button>
          ))}
          <span className="mr-auto text-xs text-[#6B6352]">מסמך {page + 1} מתוך {docs.length}</span>
        </div>
      )}
      <div className="border-t border-[#E6DFCF] bg-[#FFF8E6] px-3 py-2 text-xs text-[#5C4512]">
        <b className="block text-[#8A6316]">לבדיקה מול התיק</b>
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {matches.map(m => <li key={m.label}>{m.label}: <b className="tabular-nums">{m.value || '—'}</b></li>)}
        </ul>
      </div>
    </section>
  )
}


function FixesList({ list }: { list: FixHistory[] }) {
  return (
    <section className="rounded-xl border border-[#E6DFCF] bg-[#FFFDF8] px-5 pb-4 pt-1 shadow-[0_1px_2px_rgba(20,33,61,.05)]">
      <h3 className="border-b-[1.5px] border-[#14213D] pb-2.5 pt-3.5 text-[15px] font-bold text-[#14213D]">תיקונים ({list.length})</h3>
      <div className="mt-3 flex flex-col gap-3">
        {list.map(h => (
          <div key={h.requestedAt} className="rounded-xl border border-line bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-bold text-navy-dark">נשלחה בקשה · {fmtTime(h.requestedAt)}{h.requestedBy ? ` · ${h.requestedBy}` : ''}</span>
              <span className={h.complete ? 'font-medium text-emerald-700' : 'font-medium text-amber-700'}>{h.complete ? 'כל המסמכים הושלמו' : 'חסרים מסמכים'}</span>
            </div>
            {h.notes && <p className="mt-1 text-xs text-[#6B6352]">{h.notes}</p>}
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {h.items.map(i => (
                <li key={i.docType} className="flex items-center justify-between gap-2 border-t border-line pt-1">
                  <span>{i.label}</span>
                  <span className={i.doneAt ? 'text-emerald-700' : 'text-amber-700'}>{i.doneAt ? `הושלם · ${fmtTime(i.doneAt)}` : 'טרם הושלם'}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function MaternityCardModal({ rows, index, onIndex, onClose }: {
  rows: MaternityAid[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const a = rows[index]
  const toast = useToast()
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('maternity', 'edit')
  const [now] = useState(() => Date.now())
  const [reloadKey, setReloadKey] = useState(0)
  const [retrying, setRetrying] = useState(false)
  const [centers, setCenters] = useState<Record<string, string>>({})
  const [loaded, setLoaded] = useState<{ id: string; data: Extra } | null>(null)
  const ready = loaded && loaded.id === a.id ? loaded.data : null

  useEffect(() => {
    let alive = true
    createClient().from('maternity_aids')
      .select('*, beneficiary:beneficiaries(email, city, address)')
      .eq('id', a.id).single()
      .then(({ data }) => { if (alive && data) setLoaded({ id: a.id, data: data as unknown as Extra }) })
    return () => { alive = false }
  }, [a.id, reloadKey])

  useEffect(() => {
    let alive = true
    fetch('/api/admin/card-centers')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.centers) setCenters(Object.fromEntries((d.centers as { id: string; name: string }[]).map(c => [c.id, c.name]))) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const [fixes, setFixes] = useState<{ id: string; list: FixHistory[] } | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/admin/maternity/docs-history?aidId=${a.id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive && d?.history) setFixes({ id: a.id, list: d.history }) })
      .catch(() => {})
    return () => { alive = false }
  }, [a.id])
  const fixList = fixes && fixes.id === a.id ? fixes.list : []

  const m = a.beneficiary as MotherRef | undefined
  const email = ((ready?.beneficiary as { email?: string } | null | undefined)?.email ?? '').trim()
  const merged = { ...a, ...(ready ?? {}) } as MaternityAid
  const baby = babyNameLabel(merged as AidNameFields)
  const days = Math.max(0, Math.floor((now - new Date(a.created_at).getTime()) / 86400000))
  const cert = merged.birth_certificate_url
  const cert2 = merged.birth_certificate_url_2
  const pill = STATUS_PILL[a.status]
  const full = `/admin/maternity/${a.id}`
  const activity = useCardActivity(a.id, reloadKey)
  const key = cardStatusKey(merged)
  const voucher = (merged as MaternityAid & { voucher_serial?: string | null }).voucher_serial ?? null
  const canRetry = canEdit && merged.card_load_status === 'failed' && !merged.card_tlush_id

  // הרצה חוזרת של טעינה לתיק הזה בלבד (אותו ראוט של מסך "טעינות שנכשלו")
  const retryLoad = async () => {
    setRetrying(true)
    try {
      const res = await fetch('/api/admin/maternity/retry-failed-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [a.id] }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'הטעינה נכשלה')
      const r = d.results?.[0]
      if (r?.ok) toast.success(r.awaitingStock ? 'אין מלאי כרגע, התיק ממתין לכרטיס' : 'הכרטיס נטען')
      else toast.error(r?.error || d.note || 'הטעינה נכשלה')
      setReloadKey(k => k + 1)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'הטעינה נכשלה') }
    finally { setRetrying(false) }
  }

  // "בקש": שליחת קישור ייחודי ליולדת במייל להשלמת שם התינוק (אותה פעולה של הכרטסת המלאה).
  const askName = async () => {
    if (!(await confirm({ message: 'לשלוח ליולדת במייל קישור להשלמת שם התינוק?' }))) return
    try {
      const res = await fetch('/api/admin/maternity/send-name-fix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aidId: a.id }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'השליחה נכשלה')
      toast.success('הקישור נשלח ליולדת')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'השליחה נכשלה') }
  }

  return (<>
    <RecordModal
      kind="לידה"
      crumb={`יולדות / תיק ${a.id.slice(0, 8)}`}
      title={motherName(m)}
      meta={[
        { label: 'ת״ז יולדת', value: m?.spouse_id_number || '—', ltr: true },
        { label: 'תאריך לידה', value: fmt(a.birth_date) },
        { label: 'תינוק', value: baby.text || '—' },
      ]}
      statusLabel={pill?.label ?? a.status}
      statusTone={TONE[a.status] ?? 'wait'}
      stampDate={fmt(a.created_at)}
      facts={[
        { label: 'תיק', value: `#${a.id.slice(0, 6)}`, ltr: true },
        { label: 'תינוקות', value: String(merged.babies?.length || 1) },
        { label: 'תאריך אישור', value: a.approved_at ? fmt(a.approved_at) : '—' },
        { label: 'סוף זכאות', value: fmt(merged.six_weeks_end) },
        { label: 'ימים בטיפול', value: String(days) },
        { label: 'כרטיס', hl: true, ltr: !!merged.card_number, value: merged.card_number ? `··${merged.card_number.slice(-4)}` : key === 'failed' ? 'נכשל' : 'ממתין' },
        { label: 'יתרה', hl: true, value: activity.data?.balance != null ? money(activity.data.balance) : '—' },
      ]}
      readiness={[
        { label: 'ת״ז הוזנה', ok: !!(m?.spouse_id_number || m?.id_number) },
        { label: 'שם התינוק', ok: !baby.missing && !baby.pending, onAsk: canEdit && !!email ? askName : undefined },
        { label: 'אישור לידה', ok: !!cert },
        { label: 'טלפון', ok: !!m?.phone },
      ]}
      steps={{ labels: STEPS, current: STEP_OF[a.status] ?? 0, rejected: a.status === 'cancelled', dates: [fmt(a.created_at)] }}
      sections={[
        { title: 'פרטי היולדת', fields: [
          { label: 'שם', value: motherName(m) },
          { label: 'ת״ז יולדת', value: m?.spouse_id_number, ltr: true, copy: true, lock: 'נעול' },
          { label: 'שם הבעל', value: m?.full_name },
          { label: 'ת״ז הבעל', value: m?.id_number, ltr: true, copy: true, lock: 'נעול' },
        ] },
        { title: 'יצירת קשר', fields: [
          { label: 'טלפון', value: m?.phone, ltr: true, copy: true },
          { label: 'מייל', value: email, ltr: true, copy: true },
          { label: 'עיר', value: ready?.beneficiary?.city },
          { label: 'כתובת', value: ready?.beneficiary?.address },
        ] },
        { title: 'הלידה וההטבות', wide: true, fields: [
          { label: 'תאריך לידה', value: fmt(a.birth_date) },
          { label: 'שם התינוק', value: baby.text },
          { label: 'כרטיס מזון', value: merged.wants_food_card === false ? 'לא ביקשה' : (merged.card_number ? `שויך · ${merged.card_number}` : 'ביקשה') },
          { label: 'בית החלמה', value: merged.wants_recovery === false ? 'לא ביקשה' : (merged.recovery_home || 'ביקשה') },
          { label: 'תאריך אישור', value: a.approved_at ? fmtTime(a.approved_at) : '—' },
          { label: 'סיבת דחייה', value: merged.rejection_reason, full: true },
        ] },
      ]}
      note={{ title: 'הערת משרד', text: (merged.notes ?? '').trim() }}
      overview={{
        doc: <LiveDoc
          docs={[...(cert ? [{ url: cert, label: 'אישור לידה' }] : []), ...(cert2 ? [{ url: cert2, label: 'אישור לידה, תינוק שני' }] : [])]}
          matches={[
            { label: 'שם', value: motherName(m) },
            { label: 'ת״ז', value: m?.spouse_id_number ?? '' },
            { label: 'תאריך לידה', value: fmt(a.birth_date) },
          ]} />,
        main: <CardPanel aid={merged} data={activity.data} state={activity.state}
          centerName={merged.card_center_id ? (centers[merged.card_center_id] ?? null) : null}
          voucher={voucher} holder={motherName(m)}
          onRetry={canRetry ? retryLoad : undefined} retrying={retrying} />,
        below: <>
          <CardHistory data={activity.data} state={activity.state} />
          {fixList.length > 0 && <FixesList list={fixList} />}
        </>,
      }}
      actions={<>
        <Link href={full} title="האישור מתבצע בכרטסת המלאה" className={modalBtn.primary}>טיפול בתיק</Link>
        <Link href={full} className={modalBtn.ghost}>פתיחת כרטסת מלאה</Link>
      </>}
      index={index}
      total={rows.length}
      onIndex={onIndex}
      onClose={onClose}
    />
    {confirmDialog}
  </>)
}
