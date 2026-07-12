import { createClient } from '@/lib/supabase/server'
import GratitudeTable, { type GratitudeRow } from './GratitudeTable'

export const dynamic = 'force-dynamic'

export default async function GratitudePage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('gratitude_letters')
    .select('id, source, body, signature, is_anonymous, scan_url, status, created_at, maternity_aid_id, aid:maternity_aids(birth_date, recovery_home, beneficiary:beneficiaries(family_name, spouse_name, full_name))')
    .order('created_at', { ascending: false })

  // הטבלה טרם נוצרה (המיגרציה לא הורצה) — לא מפילים את המסך
  const rows: GratitudeRow[] = error ? [] : ((data ?? []) as unknown as GratitudeRow[])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">מכתבי ברכה</h1>
        <p className="text-sm text-slate-500">
          דברי הכרת הטוב שהתקבלו מהיולדות, להעברה לנדיב
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          הטבלה טרם נוצרה במסד הנתונים. יש להריץ את המיגרציה{' '}
          <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
            20260723_gratitude_and_feedback.sql
          </code>
        </div>
      )}

      <GratitudeTable rows={rows} />
    </div>
  )
}
