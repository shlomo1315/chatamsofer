import { Bell, Database, Users } from 'lucide-react'
import Card from '@/components/ui/Card'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Profile, ROLE_LABELS } from '@/types'
import LineageTreeManager from '@/components/admin/LineageTreeManager'
import AddUserButton from './AddUserButton'
import EditUserButton from './EditUserButton'
import RecoveryHomeLinks from '../maternity/RecoveryHomeLinks'
import DocTypesManager from './DocTypesManager'

async function getProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    return data ?? []
  } catch {
    return []
  }
}

// רשימת בתי ההחלמה הקבועה — תמיד מוצגת, גם אם אין כרגע אף יולדת בבית מסוים
const RECOVERY_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']

async function getRecoveryHomes(): Promise<string[]> {
  if (!isSupabaseConfigured()) return RECOVERY_HOMES
  try {
    const supabase = await createClient()
    const [homesTable, maternity] = await Promise.all([
      supabase.from('recovery_homes').select('name').order('name'),
      supabase.from('maternity_aids').select('recovery_home').not('recovery_home', 'is', null),
    ])
    const fromTable = (homesTable.data ?? []).map((r: { name: string }) => r.name).filter(Boolean)
    const fromMaternity = (maternity.data ?? []).map((r: { recovery_home: string }) => r.recovery_home).filter(Boolean)
    // איחוד: ברירת מחדל + טבלת הבתים + בתים שנמצאו בתיקי לידה
    return [...new Set([...RECOVERY_HOMES, ...fromTable, ...fromMaternity])]
  } catch {
    return RECOVERY_HOMES
  }
}

export default async function SettingsPage() {
  const [profiles, recoveryHomes] = await Promise.all([getProfiles(), getRecoveryHomes()])

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">הגדרות</h1>
        <p className="text-sm text-slate-500 mt-0.5">ניהול המערכת והמשתמשים</p>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Database size={18} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">חיבור Supabase</h2>
          </div>
          <div className={`rounded-xl p-4 text-sm ${isSupabaseConfigured() ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
            {isSupabaseConfigured() ? (
              <div>
                <p className="font-semibold">מחובר ✓</p>
                <p className="mt-1 text-xs ltr-num">{process.env.NEXT_PUBLIC_SUPABASE_URL}</p>
              </div>
            ) : (
              <div>
                <p className="font-semibold">לא מחובר</p>
                <p className="mt-1">עדכן את NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY בקובץ .env.local</p>
              </div>
            )}
          </div>
        </Card>

        <Card padding="none">
          <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-700">משתמשי מערכת</h2>
            </div>
            <AddUserButton />
          </div>
          {profiles.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm">
              {isSupabaseConfigured() ? 'לא נמצאו משתמשים' : 'חיבור Supabase נדרש לצפייה במשתמשים'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {profiles.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">
                      {p.full_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.full_name}</p>
                      <p className="text-xs text-slate-500 ltr-num">{p.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5 font-medium">
                      {ROLE_LABELS[p.role]}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <EditUserButton profile={p} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <LineageTreeManager />
        </Card>

        <RecoveryHomeLinks homes={recoveryHomes} />

        <Card>
          <DocTypesManager />
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} className="text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-700">הגדרות התראות</h2>
          </div>
          <div className="space-y-3">
            {[
              { label: 'תזכורת תפוגת כרטיס יולדת', desc: '7 ימים לפני תפוגה' },
              { label: 'פיגורים בהלוואות', desc: 'כשתשלום עובר 30 יום' },
              { label: 'בקשות ממתינות לאישור', desc: 'סיכום יומי' },
              { label: 'אישורי חלוקה', desc: 'שבוע לפני מועד החלוקה' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
                <button className="relative w-10 h-5 bg-indigo-500 rounded-full transition-colors">
                  <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm translate-x-5 transition-transform" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
