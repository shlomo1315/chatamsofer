'use client'
import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, Pencil, Trash2, Loader2, BookOpen, Globe, Phone, ArrowLeftRight } from 'lucide-react'
import type { BookFairBook } from '@/types/bookFair'
import { fmtAgorot } from '@/lib/bookFairPricing'
import { useTablePagination } from '@/lib/useTablePagination'
import Pagination from '@/components/ui/Pagination'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useCan } from '@/components/StaffPermissions'
import BookEditor from './BookEditor'
import ImportPanel from './ImportPanel'
import StockMover from './StockMover'

type ColKey = 'sku' | 'title' | 'author' | 'volumes' | 'price' | 'stock_web' | 'stock_phone' | 'phone_code' | 'active'

// ⚠️ headClassName נושא את הריפוד: ה-th נבנה בתוך TableHeadMenu, וריפוד
// שנכתב בצרכן לא היה מגיע אליו.
const HEAD = 'px-3 py-3 text-xs font-semibold text-slate-500'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX — בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
// ⚠️ filterable רק לעמודות עם קבוצת ערכים סגורה (פעיל/לא) — לא לשם
// או למק"ט, שערכם ייחודי כמעט בכל שורה.
const COLUMNS: ColDef<ColKey, BookFairBook>[] = [
  { key: 'sku',         label: 'מק"ט',   def: true, headClassName: HEAD, weight: 1, value: b => b.sku },
  { key: 'title',       label: 'שם הספר', def: true, headClassName: HEAD, weight: 3, value: b => b.title },
  { key: 'author',      label: 'מחבר',   def: false, headClassName: HEAD, weight: 2, value: b => b.author ?? null },
  { key: 'volumes',     label: 'כרכים',  def: true, kind: 'number', headClassName: HEAD, value: b => b.volumes },
  { key: 'price',       label: 'מחיר',   def: true, kind: 'number', headClassName: HEAD, value: b => b.price_agorot },
  { key: 'stock_web',   label: 'מלאי אתר',   def: true, kind: 'number', headClassName: HEAD, value: b => b.stock_web },
  { key: 'stock_phone', label: 'מלאי טלפון', def: true, kind: 'number', headClassName: HEAD, value: b => b.stock_phone },
  { key: 'phone_code',  label: 'קוד טלפוני', def: false, kind: 'number', headClassName: HEAD, value: b => b.phone_code ?? null },
  { key: 'active',      label: 'פעיל',   def: true, kind: 'enum', filterable: true, headClassName: HEAD,
    // ⚠️ הערך הוא התווית המוצגת ולא בוליאני: המשתמש מסנן לפי מה שהוא רואה
    value: b => b.is_active ? 'פעיל' : 'מוסתר' },
]

type Tab = 'list' | 'import'

export default function BooksClient({ books }: { books: BookFairBook[] }) {
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()
  const canEdit = useCan('book_fair', 'edit')
  const canAdd = useCan('book_fair', 'add')

  const [tab, setTab] = useState<Tab>('list')
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<BookFairBook | null>(null)
  const [creating, setCreating] = useState(false)
  const [moving, setMoving] = useState<BookFairBook | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // חיפוש חופשי על מק"ט, שם ומחבר
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return books
    return books.filter(b =>
      b.sku.toLowerCase().includes(q) ||
      b.title.toLowerCase().includes(q) ||
      (b.author ?? '').toLowerCase().includes(q)
    )
  }, [books, query])

  // 🔴 הסדר חובה: useTableColumns קודם (מסנן וממיין), ורק אז הדפדוף
  // על התוצאה. חיתוך לעמוד לפני סינון היה מציג עמוד ריק על סינון תקין.
  // ⚠️ mode:'client' חובה — הקטלוג נשלף במלואו לשרת ומסונן בזיכרון.
  const tc = useTableColumns<ColKey, BookFairBook>('book_fair_books', COLUMNS, {
    sortFilter: { mode: 'client', rows: filtered },
  })
  const pg = useTablePagination(tc.rows)

  const totals = useMemo(() => ({
    titles: books.length,
    web: books.reduce((s, b) => s + b.stock_web, 0),
    phone: books.reduce((s, b) => s + b.stock_phone, 0),
  }), [books])

  const del = useCallback(async (b: BookFairBook) => {
    const ok = await confirm({
      title: 'מחיקת ספר',
      message: `למחוק את "${b.title}" מהקטלוג? היסטוריית ההזמנות תישמר.`,
      confirmLabel: 'מחק', danger: true,
    })
    if (!ok) return
    setBusyId(b.id)
    try {
      const res = await fetch(`/api/admin/book-fair/books/${b.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error ?? 'המחיקה נכשלה'); return }
      router.refresh()
    } finally {
      setBusyId(null)
    }
  }, [confirm, router])

  return (
    <div className="flex flex-col gap-4">
      {confirmDialog}

      {/* סיכום מלאי — שני הערוצים בנפרד, כי הם נפרדים בפועל */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard icon={BookOpen} label="כותרים בקטלוג" value={totals.titles} tone="slate" />
        <SummaryCard icon={Globe}    label="עותקים זמינים באתר" value={totals.web} tone="indigo" />
        <SummaryCard icon={Phone}    label="עותקים זמינים בטלפון" value={totals.phone} tone="emerald" />
      </div>

      {/* לשוניות */}
      <div className="flex items-center gap-1 border-b border-slate-200">
        <TabButton active={tab === 'list'}   onClick={() => setTab('list')}>הקטלוג</TabButton>
        <TabButton active={tab === 'import'} onClick={() => setTab('import')}>ייבוא מאקסל</TabButton>
      </div>

      {tab === 'import' ? (
        <ImportPanel canImport={canAdd} onDone={() => { setTab('list'); router.refresh() }} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="חיפוש לפי מק״ט, שם או מחבר…"
                className="w-full rounded-xl border border-slate-200 py-2 pr-9 pl-3 text-sm outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            {tc.picker}
            {tc.activeFilters}
            {canAdd && (
              <button
                onClick={() => setCreating(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <Plus size={16} /> ספר חדש
              </button>
            )}
          </div>

          {/* ⚠️ בלי overflow-x: הגלילה לרוחב אסורה ונאכפת בלינט.
              עמודות משניות מוסתרות במסכים צרים דרך hidden xl:table-cell. */}
          <div className="rounded-2xl border border-slate-200 bg-white">
            <table className="w-full table-fixed">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {tc.shown.map((c, i) => tc.th(c, i))}
                  <th className={`${HEAD} w-28 text-left`}>פעולות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pg.rows.map(b => (
                  <tr key={b.id} className={`text-sm hover:bg-slate-50 ${b.is_active ? '' : 'opacity-50'}`}>
                    {tc.shown.map(col => (
                      <td key={col.key} className={`px-3 py-2.5 ${tc.cellClass(col)}`}>
                        {renderCell(col.key, b)}
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-left">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <>
                            <IconButton title="העברת מלאי בין ערוצים" onClick={() => setMoving(b)}>
                              <ArrowLeftRight size={15} />
                            </IconButton>
                            <IconButton title="עריכה" onClick={() => setEditing(b)}>
                              <Pencil size={15} />
                            </IconButton>
                            <IconButton title="מחיקה" danger disabled={busyId === b.id} onClick={() => del(b)}>
                              {busyId === b.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                            </IconButton>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!pg.rows.length && (
                  <tr>
                    <td colSpan={tc.shown.length + 1} className="px-4 py-12 text-center text-sm text-slate-400">
                      {books.length ? 'לא נמצאו ספרים התואמים לחיפוש' : 'הקטלוג ריק — הוסיפו ספר או ייבאו מאקסל'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pagination page={pg.page} size={pg.size} total={pg.total} onPage={pg.setPage} onSize={pg.setSize} />
          </div>
        </>
      )}

      {(creating || editing) && (
        <BookEditor
          book={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); router.refresh() }}
        />
      )}
      {moving && (
        <StockMover
          book={moving}
          onClose={() => setMoving(null)}
          onSaved={() => { setMoving(null); router.refresh() }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function renderCell(key: ColKey, b: BookFairBook) {
  switch (key) {
    case 'sku':
      return <span className="font-mono text-xs text-slate-600">{b.sku}</span>
    case 'title':
      return <span className="font-medium text-slate-900 truncate block" title={b.title}>{b.title}</span>
    case 'author':
      return <span className="truncate block text-slate-500" title={b.author ?? ''}>{b.author || '—'}</span>
    case 'volumes':
      return <span className="tabular-nums">{b.volumes}</span>
    case 'price':
      return <span className="tabular-nums font-medium">{fmtAgorot(b.price_agorot)}</span>
    case 'stock_web':
      return <StockBadge n={b.stock_web} />
    case 'stock_phone':
      return <StockBadge n={b.stock_phone} />
    case 'phone_code':
      return b.phone_code ? <span className="font-mono text-xs">{b.phone_code}</span> : <span className="text-slate-300">—</span>
    case 'active':
      return b.is_active
        ? <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">פעיל</span>
        : <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">מוסתר</span>
  }
}

/** ⚠️ אפס מודגש באדום: "אזל" הוא המידע החשוב ביותר בטבלה הזו. */
function StockBadge({ n }: { n: number }) {
  if (n === 0) return <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">אזל</span>
  const low = n <= 3
  return (
    <span className={`tabular-nums text-sm ${low ? 'font-medium text-amber-700' : 'text-slate-700'}`}>
      {n}
    </span>
  )
}

function SummaryCard({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: number; tone: 'slate' | 'indigo' | 'emerald'
}) {
  const tones = {
    slate:   'bg-slate-100 text-slate-600',
    indigo:  'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}>
        <Icon size={18} />
      </span>
      <span className="flex flex-col">
        <span className="text-xl font-bold tabular-nums text-slate-900">{value.toLocaleString('en-US')}</span>
        <span className="text-xs text-slate-500">{label}</span>
      </span>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium transition border-b-2 -mb-px ${
        active ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

function IconButton({ title, onClick, children, danger, disabled }: {
  title: string; onClick: () => void; children: React.ReactNode; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg p-1.5 transition disabled:opacity-40 ${
        danger ? 'text-slate-400 hover:bg-red-50 hover:text-red-600' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  )
}
