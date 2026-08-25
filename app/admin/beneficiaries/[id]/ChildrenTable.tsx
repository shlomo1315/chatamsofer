'use client'

// טבלת הילדים בכרטסת המוטב.
//
// ⚠️ הופרדה לרכיב לקוח בפני עצמו: דף הכרטסת הוא Server Component אסינכרוני,
// ובורר העמודות + גרירת הרוחב הם hooks. זו ההפרדה המינימלית — הנתונים
// מחושבים כמו קודם בשרת ומועברים כ-props מוכנים.

import { FileText } from 'lucide-react'
import { ViewDocButton } from '@/components/ui/DocViewer'
import { useTableColumns, type ColDef } from '@/components/ui/TableColumns'

/**
 * 🔴 שורה מוכנה לתצוגה, לא הרשומה הגולמית: השרת הוא זה שמפרמט את התאריך
 * (date-fns + locale עברי) ומחשב את תווית המצב המשפחתי. פונקציות אינן
 * ניתנות להעברה מ-Server Component ל-Client Component, וגם לא היה נכון
 * לשכפל כאן את הלוגיקה.
 */
export interface KidRow {
  name: string
  id_number?: string
  gender?: string
  /** התאריך *מפורמט* — או '—' כשאין/לא תקין. */
  birth_date_label: string
  /** התאריך הגולמי — למיון כרונולוגי בלבד. אינו מוצג. */
  birth_date?: string | null
  marital_status?: string
  marital_label: string | null
  birth_status?: 'pending' | 'approved'
  birth_cert_url?: string | null
}

type ColKey = 'index' | 'name' | 'gender' | 'status' | 'birth_date' | 'id_number'

// 🔴 value() חובה בכל עמודה שמרנדרת JSX: בלעדיה המיון עובד על אובייקט
// React ומחזיר סדר אקראי שנראה בדיוק כמו מיון תקין.
//
// ⚠️ שם ומספר זהות — מיון בלבד (filterable=false). רשימת ערכים על עמודת
// שם פותחת ערך ייחודי לכל שורה; זה חסר תועלת.
const COLUMNS: ColDef<ColKey, KidRow>[] = [
  // ⚠️ מספר סידורי — לא ניתן למיון. מיון לפי מספר השורה מחזיר את אותו
  // סדר תמיד ורק נראה כאילו הוא עושה משהו.
  { key: 'index', label: '#', def: true, align: 'center', sortable: false },
  { key: 'name', label: 'שם', def: true, value: k => k.name },
  { key: 'gender', label: 'מין', def: true, align: 'center', kind: 'enum', filterable: true,
    value: k => k.gender === 'male' ? 'בן' : k.gender === 'female' ? 'בת' : null },
  { key: 'status', label: 'סטטוס', def: true, kind: 'enum', filterable: true,
    // ⚠️ הערך הוא התווית המוצגת ולא הקוד: המשתמש מסנן לפי מה שהוא רואה.
    value: k => k.birth_status === 'pending' ? 'ממתין לאישור לידה'
      : k.birth_status === 'approved' ? 'לידה מאושרת'
      : k.marital_label ?? null },
  { key: 'birth_date', label: 'תאריך לידה', def: true, kind: 'date',
    // ⚠️ ממוין לפי התאריך הגולמי ולא לפי התווית: "כ״ג אלול" ממוין
    // אלפביתית ולא כרונולוגית.
    value: k => k.birth_date ?? null },
  { key: 'id_number', label: 'מספר זהות', def: true, kind: 'number', value: k => k.id_number ?? null },
]

export default function ChildrenTable({ kids }: { kids: KidRow[] }) {
  // ⚠️ mode:'client' — כל הילדים מגיעים כ-prop, אין דפדוף בשרת.
  const tc = useTableColumns('beneficiary-children', COLUMNS, {
    sortFilter: { mode: 'client', rows: kids },
  })

  const cell = (c: ColDef<ColKey>, k: KidRow, i: number) => {
    switch (c.key) {
      case 'index': return <span className="text-slate-400 tabular-nums">{i + 1}</span>
      case 'name': return <span className="font-medium text-slate-800">{k.name}</span>
      case 'gender':
        return k.gender
          ? <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${k.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>{k.gender === 'male' ? 'בן' : 'בת'}</span>
          : <span className="text-slate-300">—</span>
      case 'status':
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {k.birth_status === 'pending' && <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ממתין לאישור לידה</span>}
            {k.birth_status === 'approved' && <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">לידה מאושרת</span>}
            {k.birth_cert_url && (
              <ViewDocButton url={k.birth_cert_url} name="אישור לידה"
                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-colors"><FileText size={13} /></ViewDocButton>
            )}
            {k.marital_label
              ? <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${k.marital_status === 'married' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{k.marital_label}</span>
              : (!k.birth_status && <span className="text-slate-300">—</span>)}
          </div>
        )
      case 'birth_date': return k.birth_date_label === '—'
        ? <span className="text-slate-300">—</span>
        : <span className="text-slate-600">{k.birth_date_label}</span>
      case 'id_number': return k.id_number ? <span className="font-mono text-xs text-slate-600 ltr-num">{k.id_number}</span> : <span className="text-slate-300">—</span>
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="px-4 pt-3 flex flex-col gap-2">{tc.picker}{tc.activeFilters}</div>
      {/* ⚠️ בלי overflow-x — הכלל: אין גלילה לרוחב בשום טבלה. */}
      <div className="w-full">
        <table className="w-full text-sm text-right" style={tc.rt.tableStyle}>
          <colgroup>{tc.rt.cols}</colgroup>
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
              {/* כותרת אחידה לכל המערכת — מיון, סינון וגרירת רוחב. */}
              {tc.shown.map((c, i) => tc.th(c, i))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tc.rows.map((k, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {tc.shown.map(c => (
                  <td key={c.key} className={`px-4 py-2.5 ${tc.cellClass(c)}`}>{cell(c, k, i)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
