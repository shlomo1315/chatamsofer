import { Bell, Database, Users, UserPlus, GitBranch, Home, FileText, MapPin, Mail, CreditCard, Banknote, Phone, ScrollText, HardDriveDownload } from 'lucide-react'
import Collapsible from '@/components/ui/Collapsible'
import PageHeader from '@/components/ui/PageHeader'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Profile, ROLE_LABELS } from '@/types'
import LineageTreeManager from '@/components/admin/LineageTreeManager'
import AddUserButton from './AddUserButton'
import EditUserButton from './EditUserButton'
import RecoveryHomeLinks from '../maternity/RecoveryHomeLinks'
import DocTypesManager from './DocTypesManager'
import EmailTemplatesManager from './EmailTemplatesManager'
import NedarimSettings from './NedarimSettings'
import LoansPortalSettings from './LoansPortalSettings'
import YemotCallLog from './YemotCallLog'
import YemotMaternitySettings from './YemotMaternitySettings'
import RegistrationCallSettings from './RegistrationCallSettings'
import BackupSettings from './BackupSettings'
import RegistrationGate from './RegistrationGate'
import GovDataSettings from './GovDataSettings'

async function getProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('*').order('full_name')
  if (error) throw error
  return data ?? []
}

// רשימת בתי ההחלמה הקבועה — תמיד מוצגת, גם אם אין כרגע אף יולדת בבית מסוים
const RECOVERY_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']

async function getRecoveryHomes(): Promise<{ name: string; availability: string }[]> {
  if (!isSupabaseConfigured()) return RECOVERY_HOMES.map(name => ({ name, availability: 'regular' }))
  const supabase = await createClient()
  const [homesTable, maternity] = await Promise.all([
    // select('*') — עמיד גם אם עמודת availability טרם נוספה
    supabase.from('recovery_homes').select('*').order('name'),
    supabase.from('maternity_aids').select('recovery_home').not('recovery_home', 'is', null),
  ])
  // טבלת recovery_homes עשויה שלא להתקיים בסביבת פיתוח — מתעלמים רק מ"טבלה לא קיימת"
  if (homesTable.error && homesTable.error.code !== '42P01') throw homesTable.error
  if (maternity.error) throw maternity.error
  const map = new Map<string, string>()
  for (const n of RECOVERY_HOMES) map.set(n, 'regular')
  for (const r of (homesTable.data ?? []) as { name?: string; availability?: string }[]) {
    if (r.name) map.set(r.name, r.availability ?? 'regular')
  }
  for (const r of (maternity.data ?? []) as { recovery_home: string }[]) {
    if (r.recovery_home && !map.has(r.recovery_home)) map.set(r.recovery_home, 'regular')
  }
  return [...map.entries()].map(([name, availability]) => ({ name, availability }))
}

export default async function SettingsPage() {
  const [profiles, recoveryHomes] = await Promise.all([getProfiles(), getRecoveryHomes()])

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <PageHeader title="הגדרות" subtitle="ניהול המערכת והמשתמשים" />

      <div className="flex flex-col gap-3">
        {/* Supabase connection */}
        <Collapsible title="חיבור Supabase" icon={<Database size={16} className="text-indigo-500" />}>
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
        </Collapsible>

        {/* Users table */}
        <Collapsible title={`משתמשי מערכת (${profiles.length})`} icon={<Users size={16} className="text-indigo-500" />} headerRight={<AddUserButton />}>
          {profiles.length === 0 ? (
            <div className="py-6 text-center text-slate-400 text-sm">
              {isSupabaseConfigured() ? 'לא נמצאו משתמשים' : 'חיבור Supabase נדרש לצפייה במשתמשים'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 -mx-1">
              {profiles.map((p) => (
                <div key={p.id} className="px-1 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-sm font-bold flex-shrink-0">
                      {p.full_name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.full_name}</p>
                      <p className="text-xs text-slate-500 ltr-num">{p.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2.5 py-0.5 font-medium">
                      {ROLE_LABELS[p.role]}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
                    <EditUserButton profile={p} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Collapsible>

        {/* Lineage tree */}
        <Collapsible title="שיוך שושלת — עץ הדורות" icon={<GitBranch size={16} className="text-violet-500" />}>
          <LineageTreeManager />
        </Collapsible>

        {/* Recovery homes */}
        <Collapsible title="בתי החלמה ליולדות" icon={<Home size={16} className="text-emerald-500" />}>
          <RecoveryHomeLinks homes={recoveryHomes} />
        </Collapsible>

        {/* Doc types */}
        <Collapsible title="סוגי מסמכים" icon={<FileText size={16} className="text-sky-500" />}>
          <DocTypesManager />
        </Collapsible>

        {/* Gov address data (cities/streets from Ministry of Interior) */}
        <Collapsible title="נתוני כתובות (משרד הפנים)" icon={<MapPin size={16} className="text-rose-500" />}>
          <GovDataSettings />
        </Collapsible>

        {/* Email templates */}
        <Collapsible title="תבניות מייל" icon={<Mail size={16} className="text-indigo-500" />}>
          <EmailTemplatesManager />
        </Collapsible>

        {/* Nedarim Card connection */}
        <Collapsible title="נדרים קארד" icon={<CreditCard size={16} className="text-emerald-500" />}>
          <NedarimSettings />
        </Collapsible>

        {/* Loans portal */}
        <Collapsible title="פורטל הלוואות" icon={<Banknote size={16} className="text-amber-500" />}>
          <LoansPortalSettings />
        </Collapsible>

        {/* Yemot maternity messages (editable text / human recordings) */}
        <Collapsible title="הקלטות שלוחת יולדות (ימות)" icon={<Phone size={16} className="text-teal-500" />}>
          <YemotMaternitySettings />
        </Collapsible>

        {/* Full system backup (DB + files) to Google Drive */}
        <Collapsible title="גיבוי מערכת (Google Drive)" icon={<HardDriveDownload size={16} className="text-green-600" />}>
          <BackupSettings />
        </Collapsible>

        {/* Registration call announcement (editable text + ElevenLabs preview) */}
        <Collapsible title="הקלטת הודעת רישום (שיחה יוצאת)" icon={<Phone size={16} className="text-teal-500" />}>
          <RegistrationCallSettings />
        </Collapsible>

        {/* Yemot telephony log */}
        <Collapsible title="יומן שיחות ימות" icon={<ScrollText size={16} className="text-teal-500" />}>
          <YemotCallLog />
        </Collapsible>

        {/* Public registration gate */}
        <Collapsible title="הרשמה ציבורית" icon={<UserPlus size={16} className="text-indigo-500" />}>
          <RegistrationGate />
        </Collapsible>

        {/* Notifications */}
        <Collapsible title="הגדרות התראות" icon={<Bell size={16} className="text-indigo-500" />}>
          <div className="space-y-1">
            {[
              { label: 'תזכורת תפוגת כרטיס יולדת', desc: '7 ימים לפני תפוגה' },
              { label: 'פיגורים בהלוואות', desc: 'כשתשלום עובר 30 יום' },
              { label: 'בקשות ממתינות לאישור', desc: 'סיכום יומי' },
              { label: 'אישורי חלוקה', desc: 'שבוע לפני מועד החלוקה' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
                <div>
                  <p className="text-sm font-medium text-slate-800">{label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                </div>
                <button className="relative w-10 h-5 bg-indigo-500 rounded-full transition-colors flex-shrink-0">
                  <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm translate-x-5 transition-transform" />
                </button>
              </div>
            ))}
          </div>
        </Collapsible>
      </div>
    </div>
  )
}
