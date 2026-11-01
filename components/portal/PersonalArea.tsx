'use client'

// סקירת האזור האישי: מד השלמת תיק, ארבע פעולות ראשיות, סטטוס בקשות עם שלבים,
// אילן יוחסין עם תיקון לכל דור, ופרטי המשרד. לפי המוקאפ שאושר.
import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, GitBranch, UserPen, PlusCircle, Check, Phone } from 'lucide-react'
import { REQUEST_STAGES, type RequestProgress } from '@/lib/requestStages'

interface PortalRequest {
  id: string; kind: string; kindLabel: string; statusLabel: string
  tone: 'pending' | 'progress' | 'approved' | 'rejected'
  amount: number | null; created_at: string; progress?: RequestProgress
}

export interface PersonalAreaBeneficiary {
  id: string
  full_name: string
  phone?: string
  email?: string
  address?: string
  spouse_name?: string
  children?: unknown[]
  lineage_chain?: { generation: number; name: string }[]
  lineage_fix_required?: boolean
  lineage_fixed_at?: string | null
}

interface Props {
  beneficiary: PersonalAreaBeneficiary
  docsCount: number
  contacts: { label: string; email: string }[]
  onNewRequest: () => void
  onFixLineage: (generation?: number) => void
  onEditDetails: () => void
  onOpenDocs: () => void
}

type Filter = 'all' | 'open' | 'done'

export default function PersonalArea({ beneficiary: b, docsCount, contacts, onNewRequest, onFixLineage, onEditDetails, onOpenDocs }: Props) {
  const [requests, setRequests] = useState<PortalRequest[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    let alive = true
    fetch(`/api/portal/my-requests?beneficiary_id=${encodeURIComponent(b.id)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(d => { if (alive) setRequests(d.requests ?? []) })
      .catch(() => { if (alive) { setFailed(true); setRequests([]) } })
    return () => { alive = false }
  }, [b.id])

  // מד השלמה: כל פריט הוא שדה שחסר או מסמך שלא הועלה
  const checks = useMemo(() => [
    { ok: !!b.phone, label: 'מספר טלפון', fix: onEditDetails },
    { ok: !!b.email, label: 'כתובת מייל', fix: onEditDetails },
    { ok: !!b.address, label: 'כתובת מגורים', fix: onEditDetails },
    { ok: !!b.spouse_name, label: 'פרטי בן/בת הזוג', fix: onEditDetails },
    { ok: (b.children?.length ?? 0) > 0, label: 'פרטי הילדים', fix: onEditDetails },
    { ok: (b.lineage_chain?.length ?? 0) > 0, label: 'אילן יוחסין', fix: () => onFixLineage() },
    { ok: docsCount > 0, label: 'מסמכים בתיק', fix: onOpenDocs },
  ], [b, docsCount, onEditDetails, onFixLineage, onOpenDocs])
  const done = checks.filter(c => c.ok).length
  const pct = Math.round((done / checks.length) * 100)
  const missing = checks.filter(c => !c.ok)

  const shown = (requests ?? []).filter(r => {
    const closed = r.progress ? r.progress.stage === 3 || r.progress.stage === -1 : false
    return filter === 'all' ? true : filter === 'done' ? closed : !closed
  })
  const lineageNeedsFix = !!b.lineage_fix_required && !b.lineage_fixed_at
  const R = 28, C = 2 * Math.PI * R

  const actions = [
    { icon: PlusCircle, title: 'בקשה חדשה', hint: 'הלוואה, סיוע, יולדת, חגים', onClick: onNewRequest },
    { icon: GitBranch, title: 'תיקון אילן יוחסין', hint: 'הוספה או תיקון של דור', onClick: () => onFixLineage() },
    { icon: UserPen, title: 'עדכון פרטים אישיים', hint: 'טלפון, כתובת, ילדים', onClick: onEditDetails },
    { icon: ClipboardList, title: 'סטטוס הבקשות שלי', hint: 'איפה כל בקשה עומדת', onClick: () => document.getElementById('pa-requests')?.scrollIntoView({ behavior: 'smooth' }) },
  ]

  return (
    <div className="flex flex-col gap-4" dir="rtl">
      {/* פתיח + מד השלמה */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <svg width="72" height="72" viewBox="0 0 72 72" className="flex-shrink-0" role="img" aria-label={`התיק מלא ב-${pct} אחוז`}>
            <circle cx="36" cy="36" r={R} fill="none" stroke="#E2E8F0" strokeWidth="7" />
            <circle cx="36" cy="36" r={R} fill="none" stroke={pct === 100 ? '#15803D' : '#4338CA'} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 36 36)" />
            <text x="36" y="41" textAnchor="middle" fontSize="17" fontWeight="800" fill="#16162A">{pct}%</text>
          </svg>
          <div className="min-w-0">
            <h2 className="font-extrabold text-slate-900 text-lg leading-tight truncate">שלום, {b.full_name}</h2>
            <p className="text-sm text-slate-600 mt-0.5">
              {missing.length === 0 ? 'התיק שלך מלא. תודה!' : `התיק שלך מלא ב-${pct}%. נשארו ${missing.length} פרטים להשלמה.`}
            </p>
          </div>
        </div>
        {missing.length > 0 && (
          <ul className="flex flex-wrap sm:justify-end gap-2">
            {missing.map(m => (
              <li key={m.label}>
                <button type="button" onClick={m.fix}
                  className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5 hover:bg-amber-100">
                  להשלים: {m.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ארבע פעולות */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {actions.map(a => (
          <button key={a.title} type="button" onClick={a.onClick}
            className="text-right bg-white rounded-2xl border border-slate-200 p-4 hover:border-indigo-400 hover:shadow-sm transition min-h-[104px] flex flex-col gap-2">
            <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center"><a.icon size={20} /></span>
            <span className="font-bold text-slate-900 text-sm leading-tight">{a.title}</span>
            <span className="text-xs text-slate-500 leading-snug">{a.hint}</span>
          </button>
        ))}
      </section>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* סטטוס בקשות */}
        <section id="pa-requests" className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 scroll-mt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <h3 className="font-extrabold text-slate-900">הבקשות שלי</h3>
            <div className="flex gap-1">
              {([['all', 'הכל'], ['open', 'פתוחות'], ['done', 'סגורות']] as const).map(([k, l]) => (
                <button key={k} type="button" onClick={() => setFilter(k)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border ${filter === k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>{l}</button>
              ))}
            </div>
          </div>
          {requests === null && <p className="text-sm text-slate-500">טוען…</p>}
          {failed && <p className="text-sm text-amber-700">לא הצלחנו לטעון את הבקשות. נסו לרענן את הדף.</p>}
          {requests !== null && !failed && shown.length === 0 && (
            <p className="text-sm text-slate-500">{requests.length === 0 ? 'עדיין לא הוגשו בקשות.' : 'אין בקשות בסינון הזה.'}</p>
          )}
          <ul className="flex flex-col gap-3">
            {shown.map(r => {
              const p = r.progress
              return (
                <li key={`${r.kind}-${r.id}`} className="border border-slate-200 rounded-xl p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 text-sm">{r.kindLabel}</div>
                      <div className="text-xs text-slate-500">הוגשה ב-{new Date(r.created_at).toLocaleDateString('he-IL')}{r.amount ? ` · ₪${r.amount.toLocaleString('he-IL')}` : ''}</div>
                    </div>
                    <span className={`text-xs font-bold rounded-full px-2.5 py-1 whitespace-nowrap ${
                      r.tone === 'approved' ? 'bg-green-50 text-green-800' : r.tone === 'rejected' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{r.statusLabel}</span>
                  </div>
                  {p && p.stage >= 0 && (
                    <ol className="grid grid-cols-4 gap-1 mt-3" aria-label="שלבי הבקשה">
                      {REQUEST_STAGES.map((s, i) => (
                        <li key={s} className="flex flex-col items-center gap-1 text-center">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${i <= p.stage ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                            {i < p.stage ? <Check size={13} /> : i + 1}
                          </span>
                          <span className={`text-[11px] leading-tight ${i === p.stage ? 'font-bold text-slate-900' : 'text-slate-500'}`}>{s}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {p && (
                    <p className="text-xs text-slate-600 mt-3 bg-slate-50 rounded-lg px-3 py-2">
                      <span className="font-bold">הצעד הבא:</span> {p.next} <span className="text-slate-400">·</span> <span className="font-bold">אצל:</span> {p.owner}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>

        {/* אילן יוחסין + משרד */}
        <div className="flex flex-col gap-4">
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-extrabold text-slate-900">אילן היוחסין</h3>
              <button type="button" onClick={() => onFixLineage()} className="text-xs font-bold text-indigo-700 border border-indigo-200 rounded-lg px-2.5 py-1 hover:bg-indigo-50">
                {(b.lineage_chain?.length ?? 0) > 0 ? 'בקשת תיקון' : 'הוספה'}
              </button>
            </div>
            {lineageNeedsFix && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">המשרד ביקש לתקן את האילן. אפשר לעשות זאת כאן.</p>}
            {(b.lineage_chain?.length ?? 0) === 0 ? (
              <p className="text-sm text-slate-500">עדיין לא נוסף אילן. [להשלים]</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {b.lineage_chain!.map(g => (
                  <li key={g.generation} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <span className="min-w-0 text-sm"><span className="text-xs text-slate-400">דור {g.generation}</span><br /><span className="font-bold text-slate-900 break-words">{g.name}</span></span>
                    <button type="button" onClick={() => onFixLineage(g.generation)} className="text-xs font-bold text-indigo-700 flex-shrink-0">תיקון</button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5">
            <h3 className="font-extrabold text-slate-900 mb-2 flex items-center gap-2"><Phone size={16} />צריכים עזרה?</h3>
            <ul className="flex flex-col gap-1.5">
              {contacts.map(c => (
                <li key={c.email} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-600">{c.label}</span>
                  <a href={`mailto:${c.email}`} dir="ltr" className="font-bold text-indigo-700 break-all">{c.email}</a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
