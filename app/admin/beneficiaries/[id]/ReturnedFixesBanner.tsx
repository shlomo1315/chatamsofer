import { ClipboardCheck, FileText, GitBranch } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { getDocTypes } from '@/lib/serverDocTypes'
import { Beneficiary } from '@/types'
import { format } from 'date-fns'

type ChainEntry = { generation: number; name: string; relation: 'son' | 'son_in_law' | null }

const relLabel = (r: ChainEntry['relation']) => r === 'son' ? 'בן' : r === 'son_in_law' ? 'חתן' : null

// באנר "מה חזר מהצאצא" — מוצג בסטטוס "הוחזר תיקון — לבדיקה": המסמכים שהועלו
// מאז שליחת בקשת התיקון האחרונה (docs_sent_at) + השוואת שרשרת הדורות הישנה
// (ה-snapshot שנשמר לפני התיקון) מול החדשה, עם הדגשת הדורות שהשתנו.
export default async function ReturnedFixesBanner({ beneficiary }: { beneficiary: Beneficiary }) {
  if (!isSupabaseConfigured()) return null

  // מסמכים שהועלו מאז שליחת הבקשה
  let newDocs: { doc_type: string; file_name: string | null; uploaded_at: string }[] = []
  if (beneficiary.docs_sent_at) {
    const supabase = await createClient()
    const { data } = await supabase
      .from('documents')
      .select('doc_type, file_name, uploaded_at')
      .eq('beneficiary_id', beneficiary.id)
      .gte('uploaded_at', beneficiary.docs_sent_at)
      .order('uploaded_at', { ascending: false })
    newDocs = data ?? []
  }
  const types = await getDocTypes()
  const docLabel = (k: string) => types.find(t => t.value === k)?.label ?? k

  const oldChain = (beneficiary.lineage_chain_before_fix ?? []) as ChainEntry[]
  const newChain = (beneficiary.lineage_chain ?? []) as ChainEntry[]
  const lineageFixed = !!beneficiary.lineage_fixed_at && oldChain.length > 0

  // שורות ההשוואה — לפי מיקום בשרשרת; דור נחשב "שונה" אם השם או הקשר השתנו
  const maxLen = Math.max(oldChain.length, newChain.length)
  const diffRows = Array.from({ length: maxLen }, (_, i) => {
    const o = oldChain[i], n = newChain[i]
    const changed = (o?.name ?? '') !== (n?.name ?? '') || (o?.relation ?? null) !== (n?.relation ?? null)
    return { gen: n?.generation ?? o?.generation ?? i + 1, old: o, next: n, changed }
  })

  return (
    <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
          <ClipboardCheck size={18} className="text-teal-700" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-teal-900">הוחזר תיקון — מה חזר מהצאצא</h2>
          <p className="text-xs text-teal-700">
            הבקשה נשלחה {beneficiary.docs_sent_at ? format(new Date(beneficiary.docs_sent_at), 'dd/MM/yyyy') : '—'} ·
            הושלמה {beneficiary.docs_returned_at ? format(new Date(beneficiary.docs_returned_at), 'dd/MM/yyyy HH:mm') : '—'}
          </p>
        </div>
      </div>

      {newDocs.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-teal-800 mb-2 flex items-center gap-1.5"><FileText size={13} /> מסמכים שהועלו בסבב זה (בטאב "מסמכים מצורפים")</h3>
          <ul className="flex flex-wrap gap-2">
            {newDocs.map((d, i) => (
              <li key={i} className="text-xs bg-white border border-teal-200 text-teal-900 rounded-full px-3 py-1.5">
                {docLabel(d.doc_type)} · {format(new Date(d.uploaded_at), 'dd/MM HH:mm')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {lineageFixed && (
        <div>
          <h3 className="text-xs font-semibold text-teal-800 mb-1 flex items-center gap-1.5"><GitBranch size={13} /> תיקון עץ הדורות</h3>
          {beneficiary.lineage_fix_note && (
            <p className="text-xs text-teal-700 mb-2">מה התבקש לתקן: <span className="font-semibold">{beneficiary.lineage_fix_note}</span></p>
          )}
          <div className="bg-white border border-teal-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[3rem_1fr_1fr] text-[11px] font-bold text-slate-500 bg-slate-50 border-b border-slate-200">
              <span className="px-2 py-1.5">דור</span>
              <span className="px-2 py-1.5">לפני התיקון</span>
              <span className="px-2 py-1.5">אחרי התיקון</span>
            </div>
            {diffRows.map((r, i) => (
              <div key={i} className={`grid grid-cols-[3rem_1fr_1fr] text-xs border-b border-slate-100 last:border-b-0 ${r.changed ? 'bg-amber-50' : ''}`}>
                <span className="px-2 py-1.5 text-slate-400 font-semibold">{r.gen}</span>
                <span className={`px-2 py-1.5 ${r.changed ? 'text-slate-500 line-through decoration-red-300' : 'text-slate-700'}`}>
                  {r.old ? <>{r.old.name}{relLabel(r.old.relation) ? ` (${relLabel(r.old.relation)})` : ''}</> : '—'}
                </span>
                <span className={`px-2 py-1.5 font-medium ${r.changed ? 'text-amber-800' : 'text-slate-700'}`}>
                  {r.next ? <>{r.next.name}{relLabel(r.next.relation) ? ` (${relLabel(r.next.relation)})` : ''}</> : '—'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-teal-600 mt-1.5">דורות חדשים שנוספו ממתינים לאימות בעץ (מודגשים בתצוגת הענף בטאב "עץ הדורות").</p>
        </div>
      )}

      {newDocs.length === 0 && !lineageFixed && (
        <p className="text-xs text-teal-700">הצאצא סיים את הסבב בלי העלאות חדשות (המסמכים הנדרשים כבר היו במערכת).</p>
      )}
    </div>
  )
}
