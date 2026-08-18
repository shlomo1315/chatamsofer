'use client'
import { useState, useMemo } from 'react'
import { Search, Columns3 } from 'lucide-react'
import { useResizableColumns } from '@/components/ui/ResizableTable'

// ─────────────────────────────────────────────────────────────────────────────
// טבלת הנרשמים בדף השיתוף.
//
// 🔴 כל נתון בעמודה נפרדת, בלי גלילה לרוחב, ועם בורר עמודות — בדיוק כמו
// בממשק הניהול. איחוד עמודות נוסה ונפסל: הוא ערבב ערכים שונים בתא אחד
// והפך את הטבלה לקשה לסריקה.
//
// ⚠️ החיפוש על *כל* השדות ולא על עמודה נבחרת: מי שמחפש "לוי" לא אמור
// לדעת מראש אם זה שם משפחה או שם פרטי.
// ─────────────────────────────────────────────────────────────────────────────

export interface SharedBen {
  full_name?: string | null
  family_name?: string | null
  spouse_name?: string | null
  id_number?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  children_count?: number | null
  birth_date?: string | null
  spouse_birth_date?: string | null
}

export interface SharedRecipient {
  id: string
  phone?: string | null
  registered_at?: string | null
  beneficiary?: SharedBen | null
}

type Col = 'family' | 'first' | 'id' | 'spouse' | 'phone' | 'email' | 'city' | 'address' | 'age' | 'kids' | 'registered'

const COLS: { key: Col; label: string; def: boolean; center?: boolean }[] = [
  { key: 'family', label: 'שם משפחה', def: true },
  { key: 'first', label: 'שם פרטי', def: true },
  { key: 'id', label: 'ת״ז', def: true },
  { key: 'spouse', label: 'בן/בת זוג', def: false },
  { key: 'phone', label: 'טלפון', def: true },
  { key: 'email', label: 'מייל', def: false },
  { key: 'city', label: 'עיר', def: true },
  { key: 'address', label: 'כתובת', def: false },
  { key: 'age', label: 'גיל', def: false, center: true },
  { key: 'kids', label: 'ילדים', def: true, center: true },
  { key: 'registered', label: 'תאריך רישום', def: true },
]

const ageOf = (b?: SharedBen | null): number | null => {
  const dob = b?.birth_date || b?.spouse_birth_date
  if (!dob) return null
  try {
    return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
  } catch { return null }
}

const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) : '—'

export default function SharedRecipientsTable({ rows }: { rows: SharedRecipient[] }) {
  const [q, setQ] = useState('')
  const [picker, setPicker] = useState(false)
  const [cols, setCols] = useState<Set<Col>>(() => new Set(COLS.filter(c => c.def).map(c => c.key)))

  const shown = COLS.filter(c => cols.has(c.key))

  // גרירת רוחב עמודות — רכיב מערכתי משותף.
  const rt = useResizableColumns(`shared-recipients-${shown.length}`, shown.length)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(r => {
      const b = r.beneficiary
      return [b?.family_name, b?.full_name, b?.spouse_name, b?.id_number,
        b?.phone, b?.phone2, r.phone, b?.email, b?.city, b?.address]
        .filter(Boolean).join(' ').toLowerCase().includes(needle)
    })
  }, [rows, q])

  if (!rows.length) {
    return <p className="px-4 py-10 text-center text-slate-400 text-sm font-medium">אין נרשמים לחלוקה זו</p>
  }

  const cell = (k: Col, r: SharedRecipient) => {
    const b = r.beneficiary
    switch (k) {
      case 'family': return <span className="font-semibold text-slate-800">{b?.family_name ?? '—'}</span>
      case 'first': return <span className="text-slate-700">{b?.full_name || b?.spouse_name || '—'}</span>
      case 'id': return <span className="font-mono text-slate-600 ltr-num">{b?.id_number ?? '—'}</span>
      case 'spouse': return <span className="text-slate-600">{b?.spouse_name ?? '—'}</span>
      case 'phone': return <span className="font-mono text-slate-600 ltr-num">{b?.phone ?? b?.phone2 ?? r.phone ?? '—'}</span>
      // ⚠️ text-right מפורש: dir="ltr" הופך את ברירת המחדל לשמאל, והמייל
      // היה נצמד לצד ההפוך מהכותרת.
      case 'email': return <span className="block text-slate-600 text-right break-all" dir="ltr">{b?.email ?? '—'}</span>
      case 'city': return <span className="text-slate-600">{b?.city ?? '—'}</span>
      case 'address': return <span className="block text-slate-600">{b?.address ?? '—'}</span>
      case 'age': return <span className="text-slate-600 ltr-num">{ageOf(b) ?? '—'}</span>
      case 'kids': return <span className="text-slate-600 ltr-num">{b?.children_count ?? '—'}</span>
      case 'registered': return <span className="text-slate-500 ltr-num text-[11px]">{fmtDateTime(r.registered_at)}</span>
    }
  }

  const toggle = (k: Col) => setCols(prev => {
    const n = new Set(prev)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute top-1/2 -translate-y-1/2 right-3 text-slate-400 pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="חיפוש בשם, ת״ז, טלפון, מייל, עיר…"
            className="w-full rounded-xl border border-slate-200 py-2 pr-9 pl-3 text-[12px] outline-none focus:border-indigo-400" />
        </div>
        <button type="button" onClick={() => setPicker(o => !o)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600">
          <Columns3 size={13} /> בחירת עמודות ({shown.length}/{COLS.length})
          <span className="text-slate-400">{picker ? '▲' : '▼'}</span>
        </button>
        <span className="text-[11px] text-slate-400">
          {filtered.length.toLocaleString('he-IL')} רשומות
        </span>
      </div>

      {picker && (
        <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          {COLS.map(c => (
            <button key={c.key} type="button" onClick={() => toggle(c.key)}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                cols.has(c.key)
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
              }`}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
      <div className="w-full">
        <table className="w-full text-[12px] border-collapse" style={rt.tableStyle}>
          <colgroup>{rt.cols}</colgroup>
          <thead className="bg-slate-50 text-slate-500">
            <tr className="[&>th]:px-2.5 [&>th]:py-2.5 [&>th]:font-bold [&>th]:text-right [&>th]:border-l [&>th]:border-slate-200 [&>th:last-child]:border-l-0">
              {shown.map((c, i) => (
                <th key={c.key} className={`relative ${c.center ? 'text-center' : ''}`}>
                  {c.label}{rt.handle(i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.slice(0, 500).map(r => (
              <tr key={r.id} className="hover:bg-indigo-50/40 align-middle [&>td]:px-2.5 [&>td]:py-2 [&>td]:border-l [&>td]:border-slate-100 [&>td:last-child]:border-l-0">
                {shown.map(c => (
                  <td key={c.key} className={`${rt.cellClass} ${c.center ? 'text-center' : ''}`}>
                    {cell(c.key, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {/* ⚠️ תקרת 500 מוצהרת ולא שקטה: רשימה שנחתכת בלי לומר זאת נראית כתקלה. */}
        {filtered.length > 500 && (
          <p className="pt-3 text-center text-[11px] text-slate-400">
            מוצגות 500 הראשונות מתוך {filtered.length.toLocaleString('he-IL')} · השתמשו בחיפוש לצמצום
          </p>
        )}
      </div>
    </div>
  )
}
