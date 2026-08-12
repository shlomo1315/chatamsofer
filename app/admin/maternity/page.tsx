import Link from 'next/link'
import { Plus, Baby, Home, AlertTriangle } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid } from '@/types'
import Button from '@/components/ui/Button'
import PageHeader from '@/components/ui/PageHeader'
import { Can } from '@/components/StaffPermissions'
import MaternityTable from './MaternityTable'
import ExportExcelButton from '@/components/admin/ExportExcelButton'

async function getMaternityAids(): Promise<MaternityAid[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  // ⚡ עמודות מפורשות במקום select('*'): הרשימה משכה שדות כבדים שאינם בשימוש
  // בטבלה (children JSON, notes, deep_review_reason וכו') לכל אלפי השורות. כאן
  // רק העמודות שהטבלה באמת מציגה — מקטין דרסטית את ה-payload בכל טעינה.
  const { data, error } = await supabase
    .from('maternity_aids')
    // ⚠️ babies + baby_gender + baby_id_type: דרושים ל-syncBabyStatusInFamily
    // (maternityStatus.tsx) שרץ מכפתור אישור הלידה *ברשימה עצמה*. בלעדיהם
    // התינוק נכנס לכרטסת המשפחה בלי מגדר/סוג מסמך, ובתאומים נרשם רק אחד.
    //
    // 🛑 children: חובה! זהו שדה שהסנכרון *קורא לפניו כותב* (mother.children).
    // בלעדיו existing=[] והעדכון דרס את רשימת הילדים של המשפחה כולה — כלומר
    // אישור לידה מהרשימה מחק את כל הילדים הרשומים ואיפס את children_count.
    // (מסכי בית ההחלמה והלידה השקטה שולפים אותו, ולכן שם זה עבד תקין.)
    .select('id, beneficiary_id, birth_date, baby_name, baby_gender, baby_id_number, baby_id_type, babies, is_twins, recovery_home, recovery_nights, recovery_arrived, recovery_amount, recovery_amount_status, wants_food_card, wants_recovery, card_status, card_number, card_load_amount, card_loaded_at, card_tlush_id, card_picked_up_at, birth_certificate_url, six_weeks_end, source, status, birth_type, created_at, beneficiary:beneficiaries(id, full_name, family_name, phone, spouse_name, spouse_id_number, children, children_count, eligibility_status), card_center:card_centers(name)')
    // לידות שקטות מוצגות בלשונית נפרדת ("לידה שקטה") — מסננים ב-DB כדי לא למשוך שורות שנזרקות (כולל birth_type=NULL שנחשב "רגיל")
    .or('birth_type.is.null,birth_type.neq.silent')
    .order('created_at', { ascending: false })
  if (error) throw error
  // ⚡ select מצומצם לעמודות שהטבלה מציגה בלבד — לכן ה-cast דרך unknown:
  // שדות כבדים שאינם בשימוש בטבלה (card_balance, weekly_amount, total_weeks,
  // updated_at) הושמטו מהשליפה בכוונה כדי לצמצם את ה-payload.
  const aids = (data ?? []) as unknown as MaternityAid[]
  // נפילה-לאחור: רשומות שאין בהן birth_certificate_url — שליפת אישור הלידה מטבלת המסמכים
  const missing = aids.filter(a => !a.birth_certificate_url && a.beneficiary_id)
  if (missing.length) {
    const benIds = [...new Set(missing.map(a => a.beneficiary_id))]
    const { data: docs } = await supabase
      .from('documents')
      .select('beneficiary_id, file_url, uploaded_at')
      .eq('doc_type', 'birth_cert')
      .in('beneficiary_id', benIds)
      .order('uploaded_at', { ascending: false })
    const byBen: Record<string, string> = {}
    for (const d of docs ?? []) if (d.file_url && !byBen[d.beneficiary_id]) byBen[d.beneficiary_id] = d.file_url
    for (const a of aids) if (!a.birth_certificate_url && byBen[a.beneficiary_id]) a.birth_certificate_url = byBen[a.beneficiary_id]
  }
  return aids
}


export default async function MaternityPage() {
  const aids = await getMaternityAids()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="יולדות" subtitle={`כל הלידות · ${aids.length}`}>
        {/* ⚠️ דוח נפרד מהייצוא הרגיל: הייצוא מחזיר את status הבקשה, שאינו
            אומר אם היולדת מימשה בפועל בית החלמה. */}
        <Link href="/admin/maternity/recovery-report"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors">
          <Home size={14} /> מימוש בתי החלמה
        </Link>
        {/* ⚠️ תיקים שטעינת הכרטיס בהם נכשלה אינם מנסים שוב מעצמם — הם
            תקועים ב-failed עד שמישהו מריץ אותם. בלי כפתור, יולדת נשארת
            בלי כרטיס בלי שאיש יודע. */}
        <Can section="maternity" action="edit">
          <Link href="/admin/maternity/failed-cards"
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-700 hover:border-amber-400 transition-colors">
            <AlertTriangle size={14} /> כרטיסים שנכשלו
          </Link>
        </Can>
        <ExportExcelButton type="maternity" />
        {/* ⚠️ מותנה בהרשאת מחלקת היולדות ולא ב-isAdmin: /api/admin/maternity/create
            אוכף requirePermission('maternity','edit') — בדיוק ההרשאה שיש למזכירות
            (היא מאשרת ודוחה לידות). הכפתור הוסתר ממנה בלי סיבה אמיתית. */}
        <Can section="maternity" action="edit">
          <Link href="/admin/maternity/new">
            <Button>
              <Plus size={16} />
              לידה חדשה
            </Button>
          </Link>
        </Can>
      </PageHeader>

      {aids.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Baby size={28} className="text-slate-400" />
          </div>
          <p className="text-slate-500 font-medium">לא נמצאו תיקי יולדות</p>
          <p className="text-slate-400 text-sm mt-1">הוסף תיק יולדת חדש להתחלה</p>
        </div>
      ) : (
        <MaternityTable data={aids} showCard defaultFilter="pending" />
      )}
    </div>
  )
}
