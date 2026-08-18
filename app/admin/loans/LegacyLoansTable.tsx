'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search, Pencil, Trash2, Loader2, Check, X, AlertTriangle, Link2, UserPlus, ExternalLink } from 'lucide-react'
import { validateIsraeliId } from '@/lib/validation'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'
import { useIncrementalRows } from '@/lib/useIncrementalRows'
import { useResizableColumns } from '@/components/ui/ResizableTable'

// ─────────────────────────────────────────────────────────────────────────────
// ההלוואות מהמערכת הקודמת — צפייה, עריכה ומחיקה.
//
// ⚠️ 1,148 שורות: הטבלה נטענת בגלילה מצטברת ולא בבת אחת, כמו LoansTable.
//
// 🔴 כל עריכה מסמנת manually_edited בשרת, וייבוא חוזר של האקסל מדלג על
// שורות כאלה — כדי שתיקון ידני לא יידרס.
// ─────────────────────────────────────────────────────────────────────────────

export interface LegacyRow {
  id: string
  file_number: string | null
  fund: string | null
  id_number: string | null
  borrower_name: string | null
  address: string | null
  city: string | null
  phone: string | null
  email: string | null
  approved_amount: number | null
  taken_amount: number | null
  installments: number | null
  source_row: number | null
  manually_edited: boolean
  /** מזהה המשפחה שאליה ההלוואה משויכת לפי ת"ז. null = אין כרטסת. מחושב בשרת. */
  beneficiary_id?: string | null
}

const fmtCur = (n: number | null) =>
  n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString('he-IL')}`

// 🔴 בדיקת ת"ז מלאה — כולל **ספרת ביקורת** (לוהן), ולא רק אורך.
//
// ⚠️ קודם נבדק רק שהאורך 5–9, ולכן ת"ז עם ספרה שגויה אחת (שגיאת הקלדה
// קלאסית) נראתה תקינה — אבל לא התאימה לאף משפחה, והרשומה נשארה תלויה
// באוויר בלי שאיש ידע למה.
//
// ⚠️ validateIsraeliId מ-lib/validation ולא מימוש מקומי: זו אותה בדיקה
// שכל המערכת משתמשת בה. מימוש שני היה נפרד ממנה בשינוי הראשון.
const badId = (v: string | null) => {
  const d = String(v ?? '').replace(/D/g, '')
  if (!d) return true
  return !validateIsraeliId(d)
}

type Filter = 'all' | 'taken' | 'not_taken' | 'unlinkable' | 'linked' | 'unlinked'

export default function LegacyLoansTable({ rows }: { rows: LegacyRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const canEdit = useCan('loans', 'edit')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<LegacyRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [linking, setLinking] = useState<LegacyRow | null>(null)

  // ⚡ מעבר אחד על 1,148 השורות במקום אחד לכל מונה.
  const stats = useMemo(() => {
    let taken = 0, notTaken = 0, unlinkable = 0, edited = 0, linked = 0
    let sumApproved = 0, sumTaken = 0
    for (const r of rows) {
      // ⚠️ null בלבד = לא נלקח. אפס הוא ערך אמיתי.
      if (r.taken_amount !== null && r.taken_amount !== undefined) { taken++; sumTaken += Number(r.taken_amount) }
      else notTaken++
      if (badId(r.id_number)) unlinkable++
      if (r.beneficiary_id) linked++
      if (r.manually_edited) edited++
      sumApproved += Number(r.approved_amount ?? 0)
    }
    return { taken, notTaken, unlinkable, edited, linked, unlinked: rows.length - linked, sumApproved, sumTaken }
  }, [rows])

  // ⚡ מחרוזת החיפוש נבנית פעם אחת ולא בכל הקלדה.
  const haystacks = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) {
      m.set(r.id, [r.file_number, r.borrower_name, r.id_number, r.city, r.phone, r.email]
        .filter(Boolean).join(' ').toLowerCase())
    }
    return m
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(r => {
      const isTaken = r.taken_amount !== null && r.taken_amount !== undefined
      if (filter === 'taken' && !isTaken) return false
      if (filter === 'not_taken' && isTaken) return false
      if (filter === 'unlinkable' && !badId(r.id_number)) return false
      if (filter === 'linked' && !r.beneficiary_id) return false
      if (filter === 'unlinked' && r.beneficiary_id) return false
      return q === '' || (haystacks.get(r.id) ?? '').includes(q)
    })
  }, [rows, query, filter, haystacks])

  // גרירת רוחב עמודות — רכיב מערכתי משותף.
  const rt = useResizableColumns('legacy-loans', 9)

  const { rows: visible, sentinelRef, hasMore, shown, total } = useIncrementalRows(filtered)

  const save = async (form: LegacyRow) => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/legacy-loans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'השמירה נכשלה'); return }
      toast.success('נשמר')
      setEditing(null)
      router.refresh()
    } catch { toast.error('השמירה נכשלה') } finally { setSaving(false) }
  }

  const remove = async (r: LegacyRow) => {
    if (!confirm(`למחוק את ההלוואה של ${r.borrower_name ?? 'הרשומה'}? הפעולה אינה הפיכה.`)) return
    setDeletingId(r.id)
    try {
      const res = await fetch(`/api/admin/legacy-loans?id=${encodeURIComponent(r.id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'המחיקה נכשלה'); return }
      toast.success('נמחק')
      router.refresh()
    } catch { toast.error('המחיקה נכשלה') } finally { setDeletingId(null) }
  }

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[11px] font-bold transition ${
      on ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
    }`

  return (
    <div className="flex flex-col gap-4">
      {/* ── סיכום — כל קובייה היא כפתור סינון ── */}
      {/* ⚠️ הקוביות היו תצוגה בלבד: לראות "509 לא נלקחו" ולא יכולת ללחוץ
          כדי לראות מי הם הוא בדיוק החיכוך שהסינון נועד לפתור. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <button type="button" onClick={() => setFilter('all')}
          className={`rounded-2xl border p-4 text-right transition ${filter === 'all' ? 'border-indigo-400 ring-2 ring-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
          <p className="text-[11px] font-bold text-slate-400">סה״כ הלוואות</p>
          <p className="text-2xl font-extrabold text-slate-800 tabular-nums">{rows.length.toLocaleString('he-IL')}</p>
        </button>
        <button type="button" onClick={() => setFilter(filter === 'taken' ? 'all' : 'taken')}
          className={`rounded-2xl border p-4 text-right transition ${filter === 'taken' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-emerald-200 hover:border-emerald-300'} bg-emerald-50`}>
          <p className="text-[11px] font-bold text-emerald-600">נלקחו בפועל</p>
          <p className="text-2xl font-extrabold text-emerald-800 tabular-nums">{stats.taken.toLocaleString('he-IL')}</p>
          <p className="text-[11px] text-emerald-700 tabular-nums">{fmtCur(stats.sumTaken)}</p>
        </button>
        <button type="button" onClick={() => setFilter(filter === 'not_taken' ? 'all' : 'not_taken')}
          className={`rounded-2xl border p-4 text-right transition ${filter === 'not_taken' ? 'border-slate-400 ring-2 ring-slate-200' : 'border-slate-200 hover:border-slate-300'} bg-slate-50`}>
          <p className="text-[11px] font-bold text-slate-500">אושרו ולא נלקחו</p>
          <p className="text-2xl font-extrabold text-slate-700 tabular-nums">{stats.notTaken.toLocaleString('he-IL')}</p>
          <p className="text-[11px] text-slate-500 tabular-nums">מתוך {fmtCur(stats.sumApproved)} שאושרו</p>
        </button>
        {/* 🔴 הקובייה שהמשתמש ביקש: כמה מחוברות לכרטסת וכמה לא. */}
        <button type="button" onClick={() => setFilter(filter === 'linked' ? 'all' : 'linked')}
          className={`rounded-2xl border p-4 text-right transition ${filter === 'linked' ? 'border-sky-400 ring-2 ring-sky-200' : 'border-sky-200 hover:border-sky-300'} bg-sky-50`}>
          <p className="text-[11px] font-bold text-sky-600">משויכות לכרטסת</p>
          <p className="text-2xl font-extrabold text-sky-800 tabular-nums">{stats.linked.toLocaleString('he-IL')}</p>
          <p className="text-[11px] text-sky-700 tabular-nums">{stats.unlinked.toLocaleString('he-IL')} ללא כרטסת</p>
        </button>
        <button type="button" onClick={() => setFilter(filter === 'unlinkable' ? 'all' : 'unlinkable')}
          className={`rounded-2xl border p-4 text-right transition ${filter === 'unlinkable' ? 'border-amber-400 ring-2 ring-amber-200' : stats.unlinkable > 0 ? 'border-amber-300 hover:border-amber-400' : 'border-slate-200 hover:border-slate-300'} ${stats.unlinkable > 0 ? 'bg-amber-50' : 'bg-white'}`}>
          <p className={`text-[11px] font-bold ${stats.unlinkable > 0 ? 'text-amber-700' : 'text-slate-400'}`}>ת״ז לא תקינה</p>
          <p className={`text-2xl font-extrabold tabular-nums ${stats.unlinkable > 0 ? 'text-amber-800' : 'text-slate-700'}`}>
            {stats.unlinkable}
          </p>
          {stats.unlinkable > 0 && <p className="text-[11px] text-amber-700">כולל ספרת ביקורת</p>}
        </button>
      </div>

      {/* ── חיפוש וסינון ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-56">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="חיפוש בשם, ת״ז, מספר תיק, עיר, טלפון…"
            className="w-full pr-9 pl-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200" />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className={chip(filter === 'all')} onClick={() => setFilter('all')}>הכל ({rows.length})</button>
          <button className={chip(filter === 'taken')} onClick={() => setFilter('taken')}>נלקחו ({stats.taken})</button>
          <button className={chip(filter === 'not_taken')} onClick={() => setFilter('not_taken')}>לא נלקחו ({stats.notTaken})</button>
          <button className={chip(filter === 'unlinked')} onClick={() => setFilter(filter === 'unlinked' ? 'all' : 'unlinked')}>
            ללא כרטסת ({stats.unlinked})
          </button>
          {stats.unlinkable > 0 && (
            <button className={chip(filter === 'unlinkable')} onClick={() => setFilter(filter === 'unlinkable' ? 'all' : 'unlinkable')}>
              דורש תיקון ({stats.unlinkable})
            </button>
          )}
        </div>
      </div>

      {/* ── הטבלה ── */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {/* 🔴 בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
        <div className="w-full">
          <table className="w-full text-sm text-right" style={rt.tableStyle}>
            <colgroup>{rt.cols}</colgroup>
            <thead>
              <tr className="bg-gradient-to-b from-slate-50 to-slate-100/60 border-b border-slate-200">
                {['תיק', 'שם הלווה', 'ת.ז.', 'כרטסת', 'עיר', 'אושר', 'נלקח בפועל', 'תשלומים', ''].map((h, i) => (
                  <th key={h || i} className="relative px-3 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 text-right">
                    {h}{rt.handle(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">לא נמצאו רשומות</td></tr>
              ) : visible.map(r => {
                const taken = r.taken_amount !== null && r.taken_amount !== undefined
                const problem = badId(r.id_number)
                return (
                  <tr key={r.id} className="even:bg-slate-50/50 hover:bg-indigo-50/40 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400 tabular-nums whitespace-nowrap">{r.file_number ?? '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{r.borrower_name ?? '—'}</span>
                        {/* ⚠️ מסומן כדי שיהיה ברור שהשורה לא תשויך לאף משפחה
                            עד שהת"ז תתוקן — אחרת היעדרה מהכרטסת נראה כתקלה. */}
                        {problem && (
                          <span title="ת״ז חסרה או שגויה — הרשומה אינה משויכת למשפחה"
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            <AlertTriangle size={10} /> דורש תיקון
                          </span>
                        )}
                        {r.manually_edited && (
                          <span title="נערך ידנית — ייבוא חוזר לא ידרוס את השינוי"
                            className="inline-flex items-center rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                            נערך
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-slate-500"><span className="ltr-num">{r.id_number ?? '—'}</span></td>
                    {/* 🔴 עמודת השיוך: מי כבר מחובר לכרטסת ומי לא.
                        משויך → קישור ישיר לכרטסת. לא משויך → כפתור שיוך ידני. */}
                    <td className={`px-3 py-3 ${rt.cellClass}`}>
                      {r.beneficiary_id ? (
                        <Link href={`/admin/beneficiaries/${r.beneficiary_id}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-sky-50 border border-sky-200 px-2 py-1 text-[10px] font-bold text-sky-700 hover:bg-sky-100 transition">
                          <ExternalLink size={10} /> לכרטסת
                        </Link>
                      ) : canEdit ? (
                        <button type="button" onClick={() => setLinking(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition">
                          <UserPlus size={10} /> שייך
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.city ?? '—'}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900 tabular-nums whitespace-nowrap">{fmtCur(r.approved_amount)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {taken
                        ? <span className="font-semibold text-emerald-700 tabular-nums">{fmtCur(r.taken_amount)}</span>
                        : <span className="text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">לא נלקח</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">{r.installments ?? '—'}</td>
                    <td className="px-4 py-3">
                      {canEdit && (
                        <div className="flex items-center gap-1.5">
                          <button type="button" onClick={() => setEditing(r)}
                            className="inline-flex items-center gap-1 text-xs text-slate-600 hover:text-indigo-600 px-2 py-1 rounded-lg border border-slate-200 hover:border-indigo-300 transition">
                            <Pencil size={12} /> עריכה
                          </button>
                          <button type="button" onClick={() => void remove(r)} disabled={deletingId === r.id}
                            className="inline-flex items-center text-xs text-slate-400 hover:text-rose-600 px-2 py-1 rounded-lg border border-slate-200 hover:border-rose-300 transition disabled:opacity-50">
                            {deletingId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {hasMore && (
                <tr ref={sentinelRef as React.Ref<HTMLTableRowElement>}>
                  <td colSpan={8} className="px-4 py-4 text-center text-slate-400 text-[11px] font-medium">
                    טוען עוד… ({shown} מתוך {total})
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditDialog row={editing} saving={saving}
          onClose={() => setEditing(null)} onSave={save} />
      )}

      {linking && (
        <LinkFamilyDialog row={linking} onClose={() => setLinking(null)}
          onDone={() => { setLinking(null); router.refresh() }} />
      )}
    </div>
  )
}

// ── דיאלוג העריכה ──
function EditDialog({ row, saving, onClose, onSave }: {
  row: LegacyRow
  saving: boolean
  onClose: () => void
  onSave: (r: LegacyRow) => void
}) {
  const [form, setForm] = useState<LegacyRow>(row)
  const set = (k: keyof LegacyRow, v: string) =>
    setForm(f => ({ ...f, [k]: v }))

  const field = (k: keyof LegacyRow, label: string, hint?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-bold text-slate-500">{label}</span>
      <input value={String(form[k] ?? '')} onChange={e => set(k, e.target.value)}
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:border-indigo-400" />
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </label>
  )

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
          <h3 className="font-bold text-slate-800">עריכת הלוואה קודמת</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {/* ⚠️ נאמר במפורש: העריכה משנה את ההתנהגות בייבוא הבא, וזה לא
              מובן מאליו מהמסך. */}
          <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
            שינוי כאן מסמן את הרשומה כ״נערכה ידנית״. ייבוא חוזר של האקסל
            ידלג עליה ולא ידרוס את התיקון.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {field('borrower_name', 'שם הלווה')}
            {field('id_number', 'תעודת זהות', 'ספרות בלבד — מפתח השיוך למשפחה')}
            {field('file_number', 'מספר תיק')}
            {field('city', 'עיר')}
            {field('address', 'כתובת')}
            {field('phone', 'טלפון')}
            {field('email', 'אימייל')}
            {field('installments', 'מספר תשלומים')}
            {field('approved_amount', 'סכום שאושר')}
            {/* 🔴 ההסבר הקריטי: ריק ≠ אפס. */}
            {field('taken_amount', 'סכום שנלקח בפועל', 'ריק = אושר ולא נלקח · 0 = בוצע בסכום אפס')}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-3 flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            ביטול
          </button>
          <button onClick={() => onSave(form)} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            שמירה
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// שיוך ידני של הלוואה היסטורית למשפחה.
//
// 🔴 השיוך במערכת הוא **לפי ת"ז ולא לפי מזהה** (ראה lib/legacyLoans): כך
// משפחה שנרשמת אחרי הייבוא מתחברת מאליה. לכן "שיוך" כאן פירושו לכתוב את
// ת"ז המשפחה על הרשומה ההיסטורית — ולא לשמור מצביע.
//
// ⚠️ המשמעות: מרגע השיוך הרשומה תתחבר לכל משפחה שת"ז זו שייכת לה, גם אם
// הכרטסת תיווצר מחדש. זו התנהגות מכוונת ולא תופעת לוואי.
// ─────────────────────────────────────────────────────────────────────────────
function LinkFamilyDialog({ row, onClose, onDone }: {
  row: LegacyRow
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [q, setQ] = useState(row.borrower_name ?? '')
  const [results, setResults] = useState<{ id: string; name: string; id_number?: string | null; city?: string | null; phone?: string | null }[]>([])
  const [searching, setSearching] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const reqRef = useRef(0)

  // ⚠️ אותו דפוס כמו ב-AddRecipientDialog: השהיה + דחיית תשובה מיושנת,
  // אחרת תשובה איטית של חיפוש קודם דורסת תוצאה חדשה יותר.
  useEffect(() => {
    const s = q.trim()
    if (s.length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    const my = ++reqRef.current
    const t = setTimeout(() => {
      fetch(`/api/admin/beneficiary-search?q=${encodeURIComponent(s)}&limit=15`)
        .then(r => r.ok ? r.json() : { results: [] })
        .then(d => { if (my === reqRef.current) setResults(Array.isArray(d.results) ? d.results : []) })
        .catch(() => { if (my === reqRef.current) setResults([]) })
        .finally(() => { if (my === reqRef.current) setSearching(false) })
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  const link = async (benIdNumber: string | null | undefined, name: string) => {
    const digits = String(benIdNumber ?? '').replace(/\D/g, '')
    if (!digits) { toast.error(`ל${name} אין ת״ז במערכת — לא ניתן לשייך`); return }
    setBusy(digits)
    try {
      // ⚠️ שולחים id_number ולא beneficiary_id: השיוך מתבצע דרך ת"ז,
      // וה-PATCH הקיים כבר מנרמל אותה בשרת ומסמן manually_edited.
      const res = await fetch('/api/admin/legacy-loans', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, id_number: digits }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'השיוך נכשל'); return }
      toast.success(`שויך ל${name}`)
      onDone()
    } catch { toast.error('השיוך נכשל') } finally { setBusy(null) }
  }

  return (
    <div onClick={onClose} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4">
      <div onClick={e => e.stopPropagation()} className="w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-800">שיוך למשפחה</h3>
            <p className="text-[11px] text-slate-500 truncate">
              {row.borrower_name} · תיק {row.file_number ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {/* ⚠️ נאמר במפורש: השיוך מחליף את הת"ז ברשומה, וזה לא מובן מאליו. */}
          <p className="text-xs text-slate-500 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            השיוך יכתוב את ת״ז המשפחה על הרשומה ההיסטורית
            {row.id_number ? <> (במקום <span className="font-mono ltr-num">{row.id_number}</span>)</> : null}.
            כך ההלוואה תופיע בהיסטוריה של אותה משפחה.
          </p>

          <div className="relative">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="חיפוש משפחה בשם, ת״ז או טלפון…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pr-10 pl-3 text-sm outline-none focus:border-indigo-400" />
            {searching && <Loader2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-500" />}
          </div>

          <div className="flex flex-col gap-1.5 max-h-[45vh] overflow-y-auto">
            {q.trim().length < 2 && <p className="py-6 text-center text-sm text-slate-400">הקלידו לפחות שתי אותיות</p>}
            {q.trim().length >= 2 && !searching && results.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">לא נמצאה משפחה מתאימה</p>
            )}
            {results.map(b => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 hover:border-indigo-300 transition">
                <div className="min-w-0 flex flex-col">
                  <span className="text-sm font-bold text-slate-800 truncate">{b.name || '—'}</span>
                  <span className="text-[11px] text-slate-500 truncate ltr-num">
                    {[b.id_number, b.city, b.phone].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>
                <button type="button" onClick={() => void link(b.id_number, b.name)} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50 flex-shrink-0">
                  {busy === String(b.id_number ?? '').replace(/\D/g, '') ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                  שייך
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
