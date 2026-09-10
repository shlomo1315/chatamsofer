'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Loader2, Search, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// הייחוס המאושר — 5 הדורות הראשונים כפי שהם באקסל הרשמי.
//
// 🔴 עד היום לא הייתה שום דרך לראות את הטבלה הזו. היא יושבת במסד מאז 25.08,
// אף מסך אינו מציג אותה, ואף בדיקה אינה משווה מולה — ולכן 51 צמתים סומנו
// 'verified' ידנית בעץ וצבועים ירוק בלי שהם מופיעים בקובץ בכלל.
//
// ⚠️ המקרה שחשף זאת: "רבי יהושע צבי גולדגלנץ" יושב בעץ כבן של הכתב סופר
// (דור 3). בקובץ המאושר הוא דור 5, דרך דויטש — נין ולא בן.
// ─────────────────────────────────────────────────────────────────────────────

interface RefRow { key: string; name: string; generation: number; parent_key: string | null }
interface Mismatch {
  id: string; name: string; treeGeneration: number; treeParent: string | null
  approvedGeneration: number | null; approvedParent: string | null
  kind: 'wrong_generation' | 'not_in_reference'
}
interface Missing { name: string; generation: number; parent: string | null }
interface Data {
  reference: RefRow[]; mismatches: Mismatch[]; missing: Missing[]
  byGen: Record<number, { approved: number; verifiedInTree: number }>
  totals: { reference: number; mismatches: number; missing: number }
}

type Tab = 'reference' | 'mismatches' | 'missing'

export default function ApprovedRefPage() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('reference')
  const [gen, setGen] = useState<number | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    fetch('/api/admin/lineage/approved-ref')
      .then(r => r.json())
      .then(d => setData(d.error ? null : d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const norm = (s: string) => s.replace(/["'׳״]/g, '').toLowerCase()

  const refRows = useMemo(() => {
    if (!data) return []
    return data.reference.filter(r =>
      (gen === null || r.generation === gen) &&
      (!q.trim() || norm(r.name).includes(norm(q)) || norm(r.parent_key ?? '').includes(norm(q))))
  }, [data, gen, q])

  const misRows = useMemo(() => {
    if (!data) return []
    return data.mismatches.filter(m =>
      (gen === null || m.treeGeneration === gen) &&
      (!q.trim() || norm(m.name).includes(norm(q))))
  }, [data, gen, q])

  const missRows = useMemo(() => {
    if (!data) return []
    return data.missing.filter(m =>
      (gen === null || m.generation === gen) &&
      (!q.trim() || norm(m.name).includes(norm(q))))
  }, [data, gen, q])

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-400 gap-2">
      <Loader2 className="animate-spin" size={18} /> טוען…
    </div>
  }
  if (!data) {
    return <div className="p-8 text-center text-rose-600">שגיאה בטעינת הייחוס המאושר</div>
  }

  const TABS: { key: Tab; label: string; n: number; cls: string }[] = [
    { key: 'reference', label: 'הייחוס המאושר', n: data.totals.reference, cls: 'text-emerald-700' },
    { key: 'mismatches', label: 'ירוק בעץ — לא בקובץ', n: data.totals.mismatches, cls: 'text-rose-700' },
    { key: 'missing', label: 'בקובץ — חסר בעץ', n: data.totals.missing, cls: 'text-amber-700' },
  ]

  return (
    <div dir="rtl" className="flex flex-col gap-5 max-w-6xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">הייחוס המאושר</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            5 הדורות הראשונים לפי האקסל הרשמי — מקור האמת לאישור ייחוס
          </p>
        </div>
        <Link href="/admin/lineage"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <ArrowRight size={15} /> לעץ הדורות
        </Link>
      </div>

      {/* ⚠️ הפער מוצג ראשון: זו הסיבה שהמסך נבנה. */}
      {data.totals.mismatches > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-rose-800">
            <AlertTriangle size={16} />
            {data.totals.mismatches} צמתים מסומנים מאושר בעץ ואינם בקובץ המאושר
          </p>
          <p className="mt-1 text-xs text-rose-700 leading-relaxed">
            הם מוצגים ירוק אף שאינם חלק מהייחוס הרשמי. עד שיוכרעו — אין להסתמך על הצבע.
          </p>
        </div>
      )}

      {/* לשוניות */}
      <div className="flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-xl border px-4 py-2 text-sm font-bold transition-all ${
              tab === t.key ? 'border-indigo-300 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-100'
                            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>
            {t.label} <span className={`mr-1 tabular-nums ${t.cls}`}>{t.n.toLocaleString('he-IL')}</span>
          </button>
        ))}
      </div>

      {/* סינון לפי דור + חיפוש */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3">
        <span className="text-xs font-bold text-slate-500">דור:</span>
        {[null, 1, 2, 3, 4, 5].map(g => (
          <button key={String(g)} onClick={() => setGen(g)}
            className={`rounded-full border px-3 py-1 text-xs font-bold transition-all ${
              gen === g ? 'border-indigo-400 bg-indigo-600 text-white'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'}`}>
            {g === null ? 'הכל' : g}
            {g !== null && data.byGen[g] && (
              <span className="mr-1 opacity-70">({data.byGen[g].approved})</span>
            )}
          </button>
        ))}
        <div className="relative mr-auto">
          <Search size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש שם…"
            className="w-56 rounded-lg border border-slate-200 py-1.5 pr-8 pl-2 text-sm focus:border-indigo-300 focus:outline-none" />
        </div>
      </div>

      {/* ── הייחוס המאושר ── */}
      {tab === 'reference' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
            <span className="w-12 shrink-0 text-center">דור</span>
            <span className="flex-1">שם</span>
            <span className="flex-1">האב לפי הקובץ</span>
          </div>
          {refRows.length === 0
            ? <p className="py-10 text-center text-sm text-slate-400">אין תוצאות</p>
            : refRows.map(r => (
              <div key={r.key} className="flex items-center gap-3 border-b border-slate-50 px-4 py-2 text-sm last:border-0 hover:bg-slate-50">
                <span className="w-12 shrink-0 text-center font-bold text-indigo-600 tabular-nums">{r.generation}</span>
                <span className="flex-1 font-semibold text-slate-800">{r.name}</span>
                <span className="flex-1 text-slate-500">{r.parent_key ?? '—'}</span>
              </div>
            ))}
        </div>
      )}

      {/* ── ירוק בעץ אך לא בקובץ ── */}
      {tab === 'mismatches' && (
        <div className="overflow-hidden rounded-2xl border border-rose-200 bg-white">
          {misRows.length === 0
            ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-emerald-600">
                <CheckCircle2 size={16} /> אין פערים
              </p>
            : misRows.map(m => (
              <div key={m.id} className="border-b border-rose-50 px-4 py-3 text-sm last:border-0 hover:bg-rose-50/40">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                    דור {m.treeGeneration} בעץ
                  </span>
                  <span className="font-bold text-slate-800">{m.name}</span>
                  {m.kind === 'wrong_generation' && m.approvedGeneration && (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                      בקובץ: דור {m.approvedGeneration}
                    </span>
                  )}
                  {m.kind === 'not_in_reference' && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                      אינו בקובץ כלל
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-slate-500">
                  <span>האב בעץ: <b className="text-slate-700">{m.treeParent ?? '—'}</b></span>
                  {m.approvedParent && <span>האב בקובץ: <b className="text-emerald-700">{m.approvedParent}</b></span>}
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── בקובץ אך חסר בעץ ── */}
      {tab === 'missing' && (
        <div className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
          {missRows.length === 0
            ? <p className="flex items-center justify-center gap-2 py-10 text-sm text-emerald-600">
                <CheckCircle2 size={16} /> הכול קיים בעץ
              </p>
            : missRows.map((m, i) => (
              <div key={`${m.name}-${i}`} className="flex items-center gap-3 border-b border-amber-50 px-4 py-2 text-sm last:border-0">
                <span className="w-12 shrink-0 text-center font-bold text-amber-600 tabular-nums">{m.generation}</span>
                <span className="flex-1 font-semibold text-slate-800">{m.name}</span>
                <span className="flex-1 text-slate-500">{m.parent ?? '—'}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
