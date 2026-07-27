import { FileText, GitBranch, Clock, ClipboardList } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// באנר "מה ביקשנו מהצאצא" — היסטוריית בקשות התיקון/השלמת מסמכים.
//
// עד כה, לאחר סימון "השלמת מסמכים" לא הייתה דרך לראות מה בדיוק ביקשנו:
// ההערות החופשיות (docs_notes) לא נשמרו כלל. עכשיו כל בקשה נשמרת כרשומה,
// והבאנר מציג את כולן כרונולוגית (החדשה ראשונה ומודגשת).
// ─────────────────────────────────────────────────────────────────────────────

export interface DocsFixRequestItem {
  id: string
  required_docs: string | null
  docs_notes: string | null
  lineage_fix_required: boolean
  lineage_fix_note: string | null
  requested_by_name: string | null
  created_at: string
}

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
  } catch { return iso }
}

function RequestBody({ req, docLabelMap }: { req: DocsFixRequestItem; docLabelMap: Record<string, string> }) {
  const docKeys = (req.required_docs ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const docLabels = docKeys.map(k => docLabelMap[k] ?? k)
  return (
    <div className="flex flex-col gap-2.5">
      {docLabels.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1"><FileText size={13} /> מסמכים שהתבקשו</p>
          <ul className="flex flex-col gap-1">
            {docLabels.map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" /> {l}
              </li>
            ))}
          </ul>
        </div>
      )}
      {req.docs_notes && (
        <div>
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1"><ClipboardList size={13} /> הערות שנשלחו לצאצא</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.docs_notes}</p>
        </div>
      )}
      {req.lineage_fix_required && (
        <div>
          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1"><GitBranch size={13} /> תיקון עץ הדורות</p>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{req.lineage_fix_note || 'התבקש תיקון של שרשרת הדורות'}</p>
        </div>
      )}
    </div>
  )
}

export default function DocsFixHistoryBanner({
  history, docLabelMap, active,
}: {
  history: DocsFixRequestItem[]
  docLabelMap: Record<string, string>
  active: boolean   // האם המוטב עדיין במצב docs_pending (הבקשה האחרונה פתוחה)
}) {
  if (!history.length) return null
  const [latest, ...older] = history

  return (
    <div className={`rounded-2xl border p-4 ${active ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <ClipboardList size={16} className={active ? 'text-amber-600' : 'text-slate-500'} />
        <h2 className="text-sm font-bold text-slate-900">
          {active ? 'ממתינים להשלמה מהצאצא — מה שביקשנו' : 'היסטוריית בקשות תיקון'}
        </h2>
      </div>

      {/* הבקשה האחרונה — מודגשת */}
      <div className="rounded-xl bg-white border border-amber-200 p-3.5">
        <div className="flex items-center justify-between mb-2 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Clock size={12} /> {fmtDateTime(latest.created_at)}</span>
          {latest.requested_by_name && <span>ביקש/ה: {latest.requested_by_name}</span>}
        </div>
        <RequestBody req={latest} docLabelMap={docLabelMap} />
      </div>

      {/* בקשות קודמות — היסטוריה מקופלת */}
      {older.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
            הצג בקשות קודמות ({older.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {older.map(req => (
              <div key={req.id} className="rounded-xl bg-white/70 border border-slate-200 p-3.5">
                <div className="flex items-center justify-between mb-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><Clock size={12} /> {fmtDateTime(req.created_at)}</span>
                  {req.requested_by_name && <span>ביקש/ה: {req.requested_by_name}</span>}
                </div>
                <RequestBody req={req} docLabelMap={docLabelMap} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
