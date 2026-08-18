'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Loader2, AlertTriangle, ShieldCheck, Undo2,
  Search, CheckCircle2, GitBranch, UserX,
} from 'lucide-react'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// משפחות שאושרו אוטומטית מהעץ.
//
// 🔴 אישור צומת בעץ מקדם אוטומטית כל משפחה שהשרשרת שלה מאומתת — גם משפחה
// שאיש לא בדק אישית. המסך הזה מציג מי הן, ומאפשר להחזיר לבדיקה.
//
// ⚠️ הזיהוי הוא *חשד* ולא ודאות: אין עמודה שמסמנת "אושר אוטומטית", והזיהוי
// נעשה בהצלבה מול תיעוד האישורים. לכן הכל מוצג לאישור המשתמש ולא נעשה
// אוטומטית — טעות כאן מפסיקה סיוע למשפחה שכן אושרה כדין.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  name: string
  id_number: string | null
  city: string | null
  email: string | null
  updated_at: string | null
  created_at: string | null
  hasNode: boolean
}

const fmt = (d?: string | null) => {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : format(dt, 'dd/MM/yy', { locale: he })
}

export default function AutoApprovedPage() {
  const toast = useToast()
  const [suspect, setSuspect] = useState<Row[]>([])
  const [noNode, setNoNode] = useState<Row[]>([])
  const [totals, setTotals] = useState({ approved: 0, human: 0, suspect: 0, noNode: 0 })
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [reverting, setReverting] = useState(false)
  const [tab, setTab] = useState<'suspect' | 'noNode'>('suspect')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/lineage/auto-approved${search ? `?q=${encodeURIComponent(search)}` : ''}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'הטעינה נכשלה'); return }
      setSuspect(json.suspect ?? [])
      setNoNode(json.noNode ?? [])
      setTotals({
        approved: json.totalApproved ?? 0,
        human: json.humanApprovedCount ?? 0,
        suspect: json.suspectTotal ?? 0,
        noNode: json.noNodeTotal ?? 0,
      })
    } catch { toast.error('שגיאת רשת') } finally { setLoading(false) }
  }, [search, toast])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  const rows = tab === 'suspect' ? suspect : noNode

  const toggle = (id: string) => setSelected(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })
  const allShown = rows.length > 0 && rows.every(r => selected.has(r.id))
  const toggleAll = () => setSelected(prev => {
    const n = new Set(prev)
    if (allShown) rows.forEach(r => n.delete(r.id))
    else rows.forEach(r => n.add(r.id))
    return n
  })

  async function revert() {
    const ids = [...selected]
    if (!ids.length) return
    // 🔴 אישור מפורש שאומר מה קורה: משפחה שהוחזרה מפסיקה לקבל סיוע עד
    // שתאושר מחדש. "האם אתה בטוח" גורף אינו אומר את זה.
    if (!confirm(
      `להחזיר ${ids.length} משפחות למצב "ממתין לאישור"?\n\n` +
      `הן יפסיקו להיחשב מאושרות עד שיאושרו מחדש ידנית.`
    )) return

    setReverting(true)
    try {
      const res = await fetch('/api/admin/lineage/auto-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'ההחזרה נכשלה'); return }
      toast.success(`${json.reverted} משפחות הוחזרו ל"ממתין לאישור"`)
      setSelected(new Set())
      await load()
    } catch { toast.error('שגיאת רשת') } finally { setReverting(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/lineage" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">משפחות שאושרו ללא החלטה מתועדת</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            מאושרות שאין להן תיעוד אישור — ככל הנראה קודמו אוטומטית מאישור צומת בעץ
          </p>
        </div>
      </div>

      {/* ⚠️ הסבר לפני הנתונים: בלעדיו המסך נראה כרשימת תקלות, והוא אינו כזה. */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4">
        <p className="flex items-center gap-2 font-extrabold text-amber-900">
          <AlertTriangle size={17} /> מה המסך הזה מציג
        </p>
        <p className="text-[13px] text-amber-800 mt-1.5 leading-relaxed">
          כשמאשרים צומת בעץ הדורות, המערכת מקדמת אוטומטית ל״מאושר״ כל משפחה שהשרשרת שלה
          מאומתת — כולל משפחות שהיו ״ממתין״ או ״בבדיקה״. הרשימה כאן היא <strong>חשד ולא ודאות</strong>:
          ייתכן שחלקן אושרו כדין ורק לא תועדו. בדקו לפני החזרה.
        </p>
      </div>

      {/* סיכום */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-1.5 text-slate-500 mb-1">
            <CheckCircle2 size={14} /><span className="text-[11px] font-bold">סה״כ מאושרות</span>
          </div>
          <p className="text-2xl font-black text-slate-800 ltr-num">{totals.approved.toLocaleString('he-IL')}</p>
        </div>
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-1.5 text-green-700 mb-1">
            <ShieldCheck size={14} /><span className="text-[11px] font-bold">עם תיעוד אישור</span>
          </div>
          <p className="text-2xl font-black text-green-700 ltr-num">{totals.human.toLocaleString('he-IL')}</p>
        </div>
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-1.5 text-amber-700 mb-1">
            <AlertTriangle size={14} /><span className="text-[11px] font-bold">ללא תיעוד</span>
          </div>
          <p className="text-2xl font-black text-amber-700 ltr-num">
            {(totals.suspect + totals.noNode).toLocaleString('he-IL')}
          </p>
        </div>
      </div>

      {/* טאבים */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => { setTab('suspect'); setSelected(new Set()) }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            tab === 'suspect' ? 'bg-amber-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-amber-300'
          }`}>
          <GitBranch size={14} /> משויכות לעץ ({totals.suspect})
        </button>
        <button onClick={() => { setTab('noNode'); setSelected(new Set()) }}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
            tab === 'noNode' ? 'bg-slate-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
          }`}>
          <UserX size={14} /> ללא שיוך לעץ ({totals.noNode})
        </button>

        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') setSearch(q) }}
            placeholder="חיפוש בשם, ת״ז, עיר… (Enter)"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
      </div>

      {tab === 'noNode' && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
          ⚠️ אלה בדרך כלל רשומות ותיקות מלפני שהתיעוד קיים — לא בהכרח קידום אוטומטי.
          החזרתן לבדיקה עלולה להיות מיותרת.
        </p>
      )}

      {/* פעולות */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex-wrap">
          <span className="text-sm font-bold text-amber-900">{selected.size} נבחרו</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
              נקה
            </button>
            <button onClick={revert} disabled={reverting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-1.5 text-xs font-extrabold text-white hover:bg-amber-700 disabled:opacity-50">
              {reverting ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
              החזר ל״ממתין לאישור״
            </button>
          </div>
        </div>
      )}

      {/* הטבלה */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <p className="px-5 py-10 text-sm text-slate-400 flex items-center justify-center gap-2">
            <Loader2 size={15} className="animate-spin" /> טוען…
          </p>
        ) : rows.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ShieldCheck size={28} className="mx-auto text-green-500 mb-2" />
            <p className="text-sm font-bold text-slate-700">
              {search ? 'לא נמצאו תוצאות' : 'אין משפחות בקטגוריה זו'}
            </p>
          </div>
        ) : (
          <div className="w-full">
            {/* בלי גלילה אופקית: התאים גולשים לשורה נוספת במקום לדחוף את הדף לרוחב. */}
            <table className="w-full text-[12px] border-collapse">
              <thead className="bg-slate-50 text-slate-500">
                <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right">
                  <th>
                    <input type="checkbox" checked={allShown} onChange={toggleAll}
                      className="h-4 w-4 accent-amber-600" aria-label="סימון הכל" />
                  </th>
                  <th>שם משפחה</th><th>ת״ז</th><th>עיר</th><th>נרשמה</th><th>עודכנה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map(r => (
                  <tr key={r.id} className={`hover:bg-slate-50 [&>td]:px-3 [&>td]:py-2.5 [&>td]:whitespace-normal [&>td]:break-words [&>td]:align-top ${selected.has(r.id) ? 'bg-amber-50' : ''}`}>
                    <td>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                        className="h-4 w-4 accent-amber-600" aria-label={`סימון ${r.name}`} />
                    </td>
                    <td className="font-bold text-slate-800">
                      <Link href={`/admin/beneficiaries/${r.id}`} className="hover:text-indigo-700 hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="text-slate-500 ltr-num">{r.id_number ?? '—'}</td>
                    <td className="text-slate-500">{r.city ?? '—'}</td>
                    <td className="text-slate-400 ltr-num">{fmt(r.created_at)}</td>
                    <td className="text-slate-400 ltr-num">{fmt(r.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-center text-[11px] text-slate-400">
        מוצגות {rows.length.toLocaleString('he-IL')} רשומות · לחיצה על שם פותחת את הכרטסת
      </p>
    </div>
  )
}
