import { createClient } from '@/lib/supabase/server'
import FeedbackTable, { type FeedbackRow, type SurveyQuestion } from './FeedbackTable'

export const dynamic = 'force-dynamic'

export default async function MaternityFeedbackPage() {
  let rows: FeedbackRow[] = []
  let questions: SurveyQuestion[] = []
  let missing = false

  try {
    const supabase = await createClient()
    const [resp, qs] = await Promise.all([
      supabase
        .from('survey_responses')
        .select('id, recovery_home, source, answers, free_text, created_at, maternity_aid_id, aid:maternity_aids(beneficiary:beneficiaries(family_name, spouse_name, full_name))')
        .order('created_at', { ascending: false }),
      supabase
        .from('survey_questions')
        .select('id, position, text, type')
        .eq('survey', 'recovery')
        .order('position'),
    ])
    // הטבלאות טרם נוצרו (המיגרציה לא הורצה) — לא מפילים את המסך
    if (resp.error || qs.error) missing = true
    rows = (resp.data ?? []) as unknown as FeedbackRow[]
    questions = (qs.data ?? []) as unknown as SurveyQuestion[]
  } catch {
    missing = true
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">משוב בתי החלמה</h1>
        <p className="text-sm text-slate-500">מה היולדות חושבות על השהות</p>
      </div>

      {missing && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          טבלאות המשוב טרם נוצרו במסד הנתונים. יש להריץ את המיגרציה{' '}
          <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
            20260723_gratitude_and_feedback.sql
          </code>
        </div>
      )}

      <FeedbackTable rows={rows} questions={questions} />
    </div>
  )
}
