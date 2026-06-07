import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary, WidowRequest } from '@/types'
import { HeartHandshake, Users, Baby, Clock, CheckCircle2 } from 'lucide-react'
import WidowsDashboard from './WidowsDashboard'

async function getData(): Promise<{ widows: Beneficiary[]; requests: WidowRequest[] }> {
  if (!isSupabaseConfigured()) return { widows: [], requests: [] }
  try {
    const supabase = await createClient()
    const [{ data: widows }, { data: requests }] = await Promise.all([
      supabase
        .from('beneficiaries')
        .select('*')
        .in('marital_status', ['אלמן', 'אלמנה'])
        .order('created_at', { ascending: false }),
      supabase
        .from('widow_requests')
        .select('*, beneficiary:beneficiaries(full_name,family_name,id_number)')
        .order('created_at', { ascending: false }),
    ])
    return { widows: widows ?? [], requests: (requests as WidowRequest[]) ?? [] }
  } catch {
    return { widows: [], requests: [] }
  }
}

export default async function WidowsPage() {
  const { widows, requests } = await getData()

  const totalOrphans = widows.reduce((sum, w) => sum + (w.children_count ?? 0), 0)
  const pendingRequests = requests.filter(r => r.status === 'pending').length
  const approvedRequests = requests.filter(r => r.status === 'approved').length

  const tiles = [
    { label: 'אלמנות ואלמנים', value: widows.length, icon: Users, color: 'bg-purple-50 text-purple-600', border: 'border-purple-100' },
    { label: 'ילדים יתומים', value: totalOrphans, icon: Baby, color: 'bg-pink-50 text-pink-600', border: 'border-pink-100' },
    { label: 'בקשות ממתינות', value: pendingRequests, icon: Clock, color: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
    { label: 'בקשות שאושרו', value: approvedRequests, icon: CheckCircle2, color: 'bg-green-50 text-green-600', border: 'border-green-100' },
  ]

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <HeartHandshake size={20} className="text-purple-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">אגף אלמנות ויתומים</h1>
          <p className="text-sm text-slate-500">{widows.length} משפחות רשומות</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map(t => (
          <div key={t.label} className={`bg-white rounded-2xl border ${t.border} p-4 flex items-center gap-3 shadow-sm`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${t.color} bg-opacity-50`}>
              <t.icon size={18} />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{t.value}</p>
              <p className="text-xs text-slate-500">{t.label}</p>
            </div>
          </div>
        ))}
      </div>

      <WidowsDashboard widows={widows} requests={requests} />
    </div>
  )
}
