import Link from 'next/link'
import { Plus, Share2 } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/apiAuth'
import { Distribution } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import NoPermission from '@/components/ui/NoPermission'
import DistributionsClient from './DistributionsClient'

async function getDistributions(): Promise<Distribution[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('distributions')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// ספירת נרשמים חיה לכל חלוקה — { distribution_id: count }. שאילתה אחת קלה
// (רק distribution_id), נספר בקוד. מוצג על כרטיס החלוקה ברשימה.
async function getRegistrationCounts(ids: string[]): Promise<Record<string, number>> {
  if (!isSupabaseConfigured() || !ids.length) return {}
  const supabase = await createClient()
  // ⚠️ בעבר נשלפו *כל* שורות הנרשמים בדפים של 1,000 רק כדי לספור אותן —
  // עשרות סבבי רשת סדרתיים לפני שהדף בכלל התרנדר, בחלוקות של אלפי משפחות.
  // (המעבר ל-fetchAllRows נעשה מסיבה נכונה: תקרת 1,000 חתכה את הספירה בשקט.)
  // כאן במקום זאת count:'exact' עם head:true — הספירה נעשית בשרת ולא מוחזרת
  // אף שורה, וכל החלוקות נספרות במקביל.
  const pairs = await Promise.all(ids.map(async (id): Promise<[string, number]> => {
    const { count, error } = await supabase
      .from('distribution_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('distribution_id', id)
    if (error) { console.error('[distributions] count failed:', id, error.message); return [id, 0] }
    return [id, count ?? 0]
  }))
  return Object.fromEntries(pairs)
}

export default async function DistributionsPage() {
  // 🔴 אכיפת הרשאת צפייה, *לפני* כל שליפה.
  //
  // עד כאן ההגנה היחידה על המסך הזה הייתה proxy.ts, והוא בודק רק שהמשתמש הוא
  // איש צוות פעיל — לא את ההרשאה הפרטנית. גם ה-RLS אינו מבחין: is_staff()
  // בודק תפקיד בלבד. התוצאה הייתה שכל בעל תפקיד צוות, גם כזה שהרשאת
  // "חלוקות חגים" שלו היא 'ללא', יכול היה להיכנס לכאן ומשם לרשימת הנרשמים.
  // ההגדרה במסך ההרשאות נראתה אכיפה ולא הייתה אכיפה.
  if (!(await requirePermission('distributions', 'view'))) {
    return <NoPermission detail="נדרשת הרשאת צפייה בחלוקות חגים." />
  }

  const distributions = await getDistributions()
  const counts = await getRegistrationCounts(distributions.map(d => d.id))
  const active = distributions.filter((d) => d.status === 'active' || d.status === 'planning').length
  const openForRegistration = distributions.filter((d) => d.registration_open === true).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="חלוקות חגים" subtitle={`${distributions.length} חלוקות`}>
        <a href="/shared/distributions" target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 transition-colors">
          <Share2 size={15} /> קישור שיתוף
        </a>
        <Link href="/admin/distributions/new">
          <Button>
            <Plus size={16} />
            חלוקת חגים חדשה
          </Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'פתוח לרישום', value: openForRegistration, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
          { label: 'בתכנון / פעיל', value: active, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
          { label: 'הושלמו', value: distributions.filter((d) => d.status === 'completed').length, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
          { label: 'סה״כ', value: distributions.length, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className={`${bg} rounded-xl p-5 text-center border ${border} shadow-sm`}>
            <p className={`text-3xl font-bold ltr-num ${color}`}>{value}</p>
            <p className="text-sm text-slate-600 mt-1">{label}</p>
          </div>
        ))}
      </div>

      <DistributionsClient distributions={distributions} counts={counts} />
    </div>
  )
}
