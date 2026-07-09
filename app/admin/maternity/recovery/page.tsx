import { Baby } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid } from '@/types'
import RecoveryHomesView from './RecoveryHomesView'
import RecoveryHomeLinks from '../RecoveryHomeLinks'
import RecoveryBillingSummary from '../RecoveryBillingSummary'
import RecoveryAlerts, { type RecoveryEvent } from './RecoveryAlerts'

const DEFAULT_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']

type HomeObj = { name: string; availability: string; report_email: string | null }

async function getData(): Promise<{ aids: MaternityAid[]; homes: string[]; homeObjs: HomeObj[] }> {
  const defaultObjs: HomeObj[] = DEFAULT_HOMES.map(name => ({ name, availability: 'regular', report_email: null }))
  if (!isSupabaseConfigured()) return { aids: [], homes: DEFAULT_HOMES, homeObjs: defaultObjs }
  const supabase = await createClient()
  const [aidsRes, homesRes] = await Promise.all([
    supabase
      .from('maternity_aids')
      .select('*, beneficiary:beneficiaries(id, full_name, family_name, phone, spouse_name, spouse_id_number, children, children_count)')
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase.from('recovery_homes').select('*'),
  ])
  if (aidsRes.error) throw aidsRes.error
  // טבלת recovery_homes עשויה שלא להתקיים בסביבת פיתוח — מתעלמים רק מ"טבלה לא קיימת"
  if (homesRes.error && homesRes.error.code !== '42P01') throw homesRes.error
  const map = new Map<string, { availability: string; report_email: string | null }>()
  for (const n of DEFAULT_HOMES) map.set(n, { availability: 'regular', report_email: null })
  for (const r of (homesRes.data ?? []) as { name?: string; availability?: string; report_email?: string | null }[]) {
    if (r.name) map.set(r.name, { availability: r.availability ?? 'regular', report_email: r.report_email ?? null })
  }
  const homeObjs: HomeObj[] = [...map.entries()].map(([name, v]) => ({ name, availability: v.availability, report_email: v.report_email }))
  return { aids: aidsRes.data ?? [], homes: homeObjs.map(h => h.name), homeObjs }
}

export default async function RecoveryPage() {
  const { aids, homes, homeObjs } = await getData()

  // אירועים לחלונית ההתראה: מימוש זכאות / בקשת תיקון
  const events: RecoveryEvent[] = aids.flatMap((a) => {
    const b = (a as { beneficiary?: { family_name?: string; full_name?: string; spouse_name?: string } }).beneficiary
    const name = b ? [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || '—' : '—'
    const out: RecoveryEvent[] = []
    if (a.recovery_amount_at) out.push({ id: a.id, name, kind: 'realized', at: a.recovery_amount_at })
    if (a.recovery_edit_requested_at) out.push({ id: a.id, name, kind: 'edit', at: a.recovery_edit_requested_at })
    return out
  })

  return (
    <div className="flex flex-col gap-5">
      <RecoveryAlerts events={events} />
      <div className="flex items-center gap-2">
        <Baby size={20} className="text-pink-500" />
        <div>
          <h1 className="text-xl font-bold text-slate-900">עזר יולדות</h1>
          <p className="text-sm text-slate-500 mt-0.5">בית החלמה · לפי מוקד וסטטוס פעילות</p>
        </div>
      </div>

      <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
        מוצגות כאן רק לידות שאושרו. כדי לאשר לידות חדשות יש להיכנס לשונית הראשית <strong>יולדות</strong>.
      </div>

      <RecoveryBillingSummary aids={aids} />

      {aids.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <Baby size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm">לא נמצאו תיקי יולדות</p>
        </div>
      ) : (
        <RecoveryHomesView aids={aids} homes={homes} />
      )}

      {/* קישור ישיר + סיסמה לכל בית החלמה — מכווץ, בתחתית הדף */}
      <details className="bg-white rounded-2xl border border-slate-200 shadow-sm group">
        <summary className="cursor-pointer list-none px-5 py-3.5 flex items-center justify-between text-sm font-semibold text-slate-700 hover:bg-slate-50 rounded-2xl">
          <span className="flex items-center gap-2">🔗 פורטל בתי החלמה — קישורים וסיסמאות</span>
          <span className="text-xs text-slate-400 group-open:hidden">לחץ להרחבה</span>
        </summary>
        <div className="px-2 pb-2">
          <RecoveryHomeLinks homes={homeObjs} />
        </div>
      </details>
    </div>
  )
}
