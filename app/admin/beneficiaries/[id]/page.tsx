import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Phone, MapPin, Calendar, Users, GitBranch, ChevronLeft, FileText, User, Activity, Baby, CreditCard, Paperclip, Mail, Gift, AlertTriangle } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { Beneficiary } from '@/types'
import Card from '@/components/ui/Card'
import Tabs from '@/components/ui/Tabs'
import BackButton from '@/components/ui/BackButton'
import { format } from 'date-fns'
import { he } from 'date-fns/locale'
import BeneficiaryActions from './BeneficiaryActions'
import StatusControl from './StatusControl'
import ReturnedFixesBanner from './ReturnedFixesBanner'
import LineageAlertModal from './LineageAlertModal'
import LineageChainChips from './LineageChainChips'
import DocumentsManager from './DocumentsManager'
import LineageBranchView from './LineageBranchView'
import LineageReliabilityPanel from './LineageReliabilityPanel'
import LineageReliabilityHeaderButton from './LineageReliabilityHeaderButton'
import BeneficiaryMailThread from './BeneficiaryMailThread'
import EmailRow from './EmailRow'
import PhoneActivity from './PhoneActivity'

async function getBeneficiary(id: string): Promise<Beneficiary | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from('beneficiaries').select('*').eq('id', id).single()
  // לא נמצא (PGRST116) או מזהה לא תקין (22P02) → notFound; שאר השגיאות מופצות הלאה
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') throw error
  return data
}


// ⚠️ ביצועים: שאילתה אחת של lineage_nodes → גם מסלול הדורות (path) וגם מפת
// הסטיות. קודם היו שתי שאילתות *רצופות* על אותה טבלה (getLineagePath +
// getDeviatingGenerations), כל אחת מושכת את כל העץ — 2 סבבי רשת מיותרים
// שהאיטו את פתיחת הכרטסת. עכשיו סבב אחד.
type LineageNode = { id: string; name: string; parent_id: string | null; generation: number; status: string }

// שליפת כל צמתי עץ הדורות — נקראת *במקביל* לשאר השאילתות (אינה תלויה ב-beneficiary).
async function getAllLineageNodes(): Promise<LineageNode[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase.from('lineage_nodes').select('id, name, parent_id, generation, status')
  return (data ?? []) as LineageNode[]
}

// עיבוד סינכרוני מהצמתים שכבר נשלפו → מסלול הדורות + מפת הסטיות. ללא רשת נוספת.
async function computeLineageData(nodes: LineageNode[], nodeId?: string | null, chain: { generation: number; name: string }[] = []): Promise<{
  path: string[]
  deviating: Set<number>
}> {
  const out = { path: [] as string[], deviating: new Set<number>() }
  if (nodeId) {
    const map = new Map(nodes.map(n => [n.id, n]))
    let cur = map.get(nodeId)
    let guard = 0
    while (cur && guard < 50) { out.path.unshift(cur.name); cur = cur.parent_id ? map.get(cur.parent_id) : undefined; guard++ }
  }
  if (chain.length) {
    const { namesMatch } = await import('@/lib/hebrewName')
    const verified = nodes.filter(n => n.status === 'verified')
    for (const e of chain) {
      const ok = verified.some(n => n.generation === e.generation && namesMatch(n.name, e.name))
      if (!ok) out.deviating.add(e.generation)
    }
  }
  return out
}

async function getBirthCertificates(beneficiaryId: string): Promise<Record<string, string>> {
  if (!isSupabaseConfigured()) return {}
  const supabase = await createClient()
  const { data, error } = await supabase.from('maternity_aids').select('id, birth_certificate_url').eq('beneficiary_id', beneficiaryId)
  if (error) throw error
  const map: Record<string, string> = {}
  for (const r of data ?? []) if (r.birth_certificate_url) map[r.id] = r.birth_certificate_url
  return map
}

interface ActivityItem { kind: 'loan' | 'maternity'; id: string; title: string; date: string; status: string }

// היסטוריית פעילות — כל מה שהמשפחה הגישה (הלוואות + לידות) עם תאריך וסטטוס
async function getActivity(id: string): Promise<ActivityItem[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const [loans, maternity] = await Promise.all([
    supabase.from('loans').select('id, amount, purpose, status, created_at').eq('beneficiary_id', id),
    supabase.from('maternity_aids').select('id, baby_name, status, created_at').eq('beneficiary_id', id),
  ])
  if (loans.error) throw loans.error
  if (maternity.error) throw maternity.error
  const items: ActivityItem[] = []
  for (const l of loans.data ?? []) {
    items.push({ kind: 'loan', id: l.id, title: `בקשת הלוואה${l.purpose ? ` — ${l.purpose}` : ''}${l.amount ? ` (₪${Math.round(Number(l.amount)).toLocaleString('he-IL')})` : ''}`, date: l.created_at, status: l.status })
  }
  for (const m of maternity.data ?? []) {
    items.push({ kind: 'maternity', id: m.id, title: `פתיחת תיק לידה${m.baby_name ? ` — ${m.baby_name}` : ''}`, date: m.created_at, status: m.status })
  }
  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  return items
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'ממתין לאישור', cls: 'bg-amber-100 text-amber-800' },
  active: { label: 'מאושר', cls: 'bg-green-100 text-green-800' },
  approved: { label: 'מאושר', cls: 'bg-green-100 text-green-800' },
  completed: { label: 'הושלם', cls: 'bg-slate-100 text-slate-700' },
  rejected: { label: 'לא מאושר', cls: 'bg-red-100 text-red-800' },
  cancelled: { label: 'לא מאושר', cls: 'bg-red-100 text-red-800' },
  defaulted: { label: 'לא מאושר', cls: 'bg-red-100 text-red-800' },
}

export default async function BeneficiaryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // הרצה מקבילית: getBeneficiary/getBirthCertificates/getActivity תלויים רק ב-id.
  // רק getLineagePath תלוי בצומת היחוס של המוטב, לכן נשלף אחרי שיש beneficiary.
  // (בעבר כל ה-queries רצו בסדרה = 4 סבבי רשת רצופים; זו הייתה סיבת האיטיות בטעינת הכרטסת.)
  // ⚠️ ביצועים: כל השאילתות במקביל, כולל עץ הדורות (lineage_nodes אינו תלוי
  // ב-beneficiary — רק העיבוד שלו). קודם עץ הדורות נשלף *אחרי* ה-Promise.all
  // = סבב רשת נוסף שהאיט את פתיחת הכרטסת. עכשיו הכל בסבב אחד.
  const [beneficiary, birthCerts, activity, allNodes] = await Promise.all([
    getBeneficiary(id),
    getBirthCertificates(id),
    getActivity(id),
    getAllLineageNodes(),
  ])
  const typedChain = Array.isArray(beneficiary?.lineage_chain)
    ? (beneficiary!.lineage_chain as { generation: number; name: string }[])
    : []
  const lineageData = await computeLineageData(allNodes, beneficiary?.lineage_node_id, typedChain)
  const lineagePath = lineageData.path
  const deviatingGens = lineageData.deviating
  // סטייה בתוך 5 הדורות הראשונים = סדר דורות חשוד → התראה קופצת בכניסה.
  const earlyDeviation = [...deviatingGens].some(g => g <= 5)
  // שרשרת (עם relation) לתגיות בן/חתן, וסימוני הצבע הידניים שנשמרו.
  const chainForMarks = Array.isArray(beneficiary?.lineage_chain)
    ? (beneficiary!.lineage_chain as { generation: number; name: string; relation: string | null }[])
    : []
  const manualMarks = ((beneficiary as { lineage_manual_marks?: Record<string, 'red' | 'green'> } | null)?.lineage_manual_marks) ?? {}

  // כל הדורות בצבעים לחלונית ההתראה (דור 1 = החתם סופר תמיד ירוק).
  const CHATAM_SOFER_ROOT = 'מרן החתם סופר זי"ע'
  const alertGens: { generation: number; name: string; color: 'green' | 'red' | 'orange' }[] =
    [...chainForMarks].sort((a, b) => a.generation - b.generation).map(c => ({
      generation: c.generation,
      name: c.generation === 1 ? CHATAM_SOFER_ROOT : c.name,
      color: c.generation === 1 ? 'green' : (c.generation > 5 ? 'orange' : (deviatingGens.has(c.generation) ? 'red' : 'green')),
    }))

  if (!beneficiary && isSupabaseConfigured()) notFound()

  if (!beneficiary) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Link href="/admin/beneficiaries" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <h1 className="text-xl font-bold text-slate-900">פרטי צאצא</h1>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-400">
          צאצא זה אינו זמין. הגדר Supabase כדי לראות נתונים אמיתיים.
        </div>
      </div>
    )
  }

  const formatDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'
  const formatDateTime = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy HH:mm', { locale: he }) : '—'
  const fullName = [beneficiary.family_name, beneficiary.full_name].filter(Boolean).join(' ')
  const kids = Array.isArray(beneficiary.children)
    ? (beneficiary.children as { name: string; id_number?: string; gender?: string; birth_date?: string; marital_status?: string; birth_status?: 'pending' | 'approved'; maternity_aid_id?: string }[])
    : []
  const maritalLabel = (c: { gender?: string; marital_status?: string }) => {
    if (c.marital_status === 'married') return c.gender === 'female' ? 'נשואה' : 'נשוי'
    if (c.marital_status === 'single') return c.gender === 'female' ? 'לא נשואה' : 'לא נשוי'
    return null
  }
  const hasLineage = lineagePath.length > 0 || (Array.isArray(beneficiary.lineage_manual) && beneficiary.lineage_manual.length > 0)

  // ── Tab: פרטים אישיים ──
  const personalTab = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">פרטי הבעל</h2>
          <div className="space-y-2.5">
            <DetailRow label="שם משפחה" value={beneficiary.family_name ?? '—'} />
            <DetailRow label="שם פרטי" value={beneficiary.full_name} />
            <DetailRow label={beneficiary.id_doc_type === 'passport' ? 'דרכון' : 'ת.ז.'} value={beneficiary.id_number} ltr />
            <DetailRow label="תאריך לידה" value={formatDate(beneficiary.birth_date)} />
            <DetailRow label="מצב משפחתי" value={beneficiary.marital_status ?? '—'} />
            <DetailRow label="מספר ילדים" value={String(beneficiary.children_count)} />
            {beneficiary.nedarim_id && <DetailRow label="מזהה משפחה בנדרים קארד" value={beneficiary.nedarim_id} ltr />}
          </div>
        </Card>
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">פרטי קשר</h2>
          <div className="space-y-2.5">
            <DetailRow label="טלפון ראשי" value={beneficiary.phone ?? '—'} ltr icon={<Phone size={13} />} />
            <DetailRow label="טלפון משני" value={beneficiary.phone2 ?? '—'} ltr />
            <EmailRow email={beneficiary.email} name={fullName} />
            <DetailRow label="כתובת" value={beneficiary.address ?? '—'} icon={<MapPin size={13} />} />
            <DetailRow label="עיר" value={beneficiary.city ?? '—'} />
          </div>
        </Card>
      </div>
      {beneficiary.spouse_name && (
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-3">פרטי האישה</h2>
          <div className="space-y-2.5">
            <DetailRow label="שם" value={beneficiary.spouse_name} />
            {beneficiary.spouse_id_number && <DetailRow label={beneficiary.spouse_doc_type === 'passport' ? 'דרכון' : 'ת.ז.'} value={beneficiary.spouse_id_number} ltr />}
            {beneficiary.spouse_birth_date && <DetailRow label="תאריך לידה" value={formatDate(beneficiary.spouse_birth_date)} />}
          </div>
        </Card>
      )}
      {beneficiary.notes && (
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">הערות</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{beneficiary.notes}</p>
        </Card>
      )}
      {beneficiary.signature && (
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">חתימת ההצהרה</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beneficiary.signature} alt="חתימה" className="max-h-32 bg-white border border-slate-200 rounded-lg" />
        </Card>
      )}
      <div className="grid grid-cols-3 gap-3 text-center text-xs text-slate-400">
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <Calendar size={16} className="mx-auto mb-1 text-slate-300" />
          <p className="font-medium text-slate-600">תאריך רישום</p>
          <p>{formatDate(beneficiary.created_at)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <Calendar size={16} className="mx-auto mb-1 text-slate-300" />
          <p className="font-medium text-slate-600">עדכון אחרון</p>
          <p className="ltr-num">{formatDateTime(beneficiary.updated_at)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-3">
          <div className={`w-2 h-2 rounded-full mx-auto mb-1 ${beneficiary.is_active ? 'bg-green-500' : 'bg-slate-300'}`} />
          <p className="font-medium text-slate-600">סטטוס</p>
          <p>{beneficiary.is_active ? 'פעיל' : 'לא פעיל'}</p>
        </div>
      </div>
    </div>
  )

  // ── Tab: ילדים ──
  const childrenTab = kids.length === 0 ? (
    <Card><p className="text-center text-slate-400 text-sm py-6">לא נרשמו ילדים</p></Card>
  ) : (
    <Card padding="none">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-emerald-500" />
          <h2 className="text-xs font-semibold text-slate-500 uppercase">ילדים ({kids.length})</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">נשואים: {kids.filter(c => c.marital_status === 'married').length}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">לא נשואים: {kids.filter(c => c.marital_status === 'single').length}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-right">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-xs text-slate-500">
              <th className="px-4 py-2">#</th><th className="px-4 py-2">שם</th><th className="px-4 py-2">מין</th><th className="px-4 py-2">סטטוס</th><th className="px-4 py-2">תאריך לידה</th><th className="px-4 py-2">מספר זהות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {kids.map((c, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-400 tabular-nums">{i + 1}</td>
                <td className="px-4 py-2.5 font-medium text-slate-800">{c.name}</td>
                <td className="px-4 py-2.5">
                  {c.gender ? <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${c.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>{c.gender === 'male' ? 'בן' : 'בת'}</span> : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {c.birth_status === 'pending' && <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">ממתין לאישור לידה</span>}
                    {c.birth_status === 'approved' && <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">לידה מאושרת</span>}
                    {c.maternity_aid_id && birthCerts[c.maternity_aid_id] && (
                      <a href={birthCerts[c.maternity_aid_id]} target="_blank" rel="noopener noreferrer" title="צפייה באישור הלידה"
                        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-indigo-600 hover:bg-indigo-50 border border-indigo-200 transition-colors"><FileText size={13} /></a>
                    )}
                    {maritalLabel(c) ? <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${c.marital_status === 'married' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{maritalLabel(c)}</span> : (!c.birth_status && <span className="text-slate-300">—</span>)}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{c.birth_date ? formatDate(c.birth_date) : <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-600 ltr-num">{c.id_number || <span className="text-slate-300">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )

  // ── Tab: עץ הדורות ──
  const lineageTab = !hasLineage ? (
    <Card><p className="text-center text-slate-400 text-sm py-6">לא הוגדר שיוך שושלת</p></Card>
  ) : (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <GitBranch size={16} className="text-violet-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase">שיוך שושלת — עץ הדורות</h2>
      </div>

      {/* breadcrumb — צביעה אוטומטית (ירוק=תואם עד דור 5 · אדום=שונה · כתום=נוסף)
          + סימון ידני של המנהל. */}
      {(() => {
        // ⚠️ החתם סופר הוא *תמיד* דור 1 — קבוע, לא משתנה לעולם. אם ב-lineage_chain
        // נשמר שם אחר בדור 1 (טעות/עקיפה), כופים כאן את השם הקבוע וירוק. הבחירה
        // של הנרשם מתחילה מדור 2. בונים מהשרשרת הממוינת לפי דור.
        const chainSorted = [...chainForMarks].sort((a, b) => a.generation - b.generation)
        const CHATAM_SOFER = 'מרן החתם סופר זי"ע'
        const source = chainSorted.length
          ? chainSorted
          : lineagePath.map((name, i) => ({ generation: i + 1, name, relation: null as string | null }))
        const gens: import('./LineageChainChips').ChainGen[] = source.map(c => {
          const isRoot = c.generation === 1
          return {
            generation: c.generation,
            name: isRoot ? CHATAM_SOFER : c.name,   // דור 1 תמיד החתם סופר
            verified: isRoot ? true : !deviatingGens.has(c.generation),
            relation: isRoot ? null : ((c.relation as 'son' | 'son_in_law' | null | undefined) ?? null),
          }
        })
        // אם משום מה אין דור 1 כלל בשרשרת — מוסיפים אותו בראש (החתם סופר קבוע).
        if (!gens.some(g => g.generation === 1)) {
          gens.unshift({ generation: 1, name: CHATAM_SOFER, verified: true, relation: null })
        }
        return <LineageChainChips beneficiaryId={id} gens={gens} initialMarks={manualMarks} />
      })()}

      {/* ציון אמינות יוחסין — ייעוצי, לא מאשר */}
      <LineageReliabilityPanel beneficiaryId={id} />

      {/* visual tree with this beneficiary's branch highlighted */}
      <LineageBranchView nodeId={beneficiary.lineage_node_id ?? null} />
    </Card>
  )

  // ── Tab: היסטוריית פעילות ──
  const activityTab = activity.length === 0 ? (
    <Card><p className="text-center text-slate-400 text-sm py-6">אין פעילות רשומה למשפחה זו</p></Card>
  ) : (
    <Card padding="none">
      <div className="divide-y divide-slate-100">
        {activity.map(item => {
          const badge = STATUS_BADGE[item.status] ?? { label: item.status, cls: 'bg-slate-100 text-slate-600' }
          const Icon = item.kind === 'loan' ? CreditCard : Baby
          const href = item.kind === 'loan' ? `/admin/loans/${item.id}` : `/admin/maternity/${item.id}`
          const tone = item.kind === 'loan' ? 'bg-blue-50 text-blue-600' : 'bg-pink-50 text-pink-600'
          return (
            <Link key={`${item.kind}-${item.id}`} href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
              <span className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}><Icon size={17} /></span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                <p className="text-xs text-slate-400 ltr-num">{formatDate(item.date)}</p>
              </div>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.cls}`}>{badge.label}</span>
            </Link>
          )
        })}
      </div>
    </Card>
  )

  // ── Tab: הטבות בעבר (מה שסומן בעת ההרשמה) ──
  const pb = beneficiary.past_benefits
  const pastBenefitItems = pb ? ([
    pb.recovery_home && 'בית החלמה ליולדות',
    pb.food_card && 'כרטיס מזון ליולדות',
    pb.holiday_grant && 'מענק לקראת החגים',
    pb.catering && 'קייטרינג מוזל "ויגילו בשמחה"',
    pb.loan && `הלוואה${pb.loan_amount ? ` — ₪${pb.loan_amount}` : ''}`,
    pb.other && `עזרה אחרת${pb.other_details ? ` — ${pb.other_details}` : ''}`,
  ].filter(Boolean) as string[]) : []
  const pastBenefitsTab = (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Gift size={16} className="text-rose-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase">הטבות שהתקבלו בעבר מאיגוד הצאצאים</h2>
      </div>
      {!pb ? (
        <p className="text-center text-slate-400 text-sm py-6">לא מולא מידע על הטבות בעבר בעת ההרשמה</p>
      ) : (
        <>
          {pastBenefitItems.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {pastBenefitItems.map((it, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" /> {it}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 py-2">המבקש סימן שלא קיבל הטבות בעבר מאיגוד הצאצאים.</p>
          )}
          {pb.notes && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 mb-1">הערות המבקש</h3>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{pb.notes}</p>
            </div>
          )}
          {pb.update_topics && pb.update_topics.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-500 mb-2">רשום/ה לקבלת עדכונים שוטפים בנושאים</h3>
              <ul className="flex flex-wrap gap-1.5">
                {pb.update_topics.map((t, i) => <li key={i} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full px-2.5 py-1">{t}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton fallback="/admin/beneficiaries" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{fullName}</h1>
            <p className="text-sm text-slate-500 ltr-num">{beneficiary.id_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LineageReliabilityHeaderButton beneficiaryId={id} />
          <StatusControl id={id} status={beneficiary.eligibility_status} advance />
          <BeneficiaryActions id={id} name={fullName} />
        </div>
      </div>

      {/* התראה קופצת בכניסה — סדר דורות לא תקין (סטייה ב-5 הדורות הראשונים) */}
      {earlyDeviation && <LineageAlertModal generations={[...deviatingGens].filter(g => g <= 5)} allGens={alertGens} />}

      {beneficiary.eligibility_status === 'docs_returned' && <ReturnedFixesBanner beneficiary={beneficiary} />}

      {/* בדיקה מעמיקה — הסבר המזכיר למה היחוס דורש בדיקה (מוצג למנהל האחראי) */}
      {beneficiary.eligibility_status === 'deep_review' && (
        <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-orange-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-orange-900">בדיקת יחוס מעמיקה — ממתין לאישור מנהל</p>
            <p className="text-sm text-orange-800 mt-1 leading-relaxed">
              המסמכים והפרטים אושרו ע"י המזכירות. סדר היחוס דורש בדיקה מעמיקה.
              {(beneficiary as { deep_review_reason?: string | null }).deep_review_reason
                ? <> <span className="font-semibold">הערת המזכיר:</span> {(beneficiary as { deep_review_reason?: string | null }).deep_review_reason}</>
                : ''}
            </p>
            {/* פירוט הדורות שסוטים מהנתיב המאושר — מסומנים גם באדום בעץ הדורות */}
            {deviatingGens.size > 0 && (
              <p className="text-sm text-red-800 mt-2 font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} className="flex-shrink-0" />
                דורות שאינם תואמים לנתיב המאושר: {[...deviatingGens].sort((a, b) => a - b).map(g => `דור ${g}`).join(', ')}
                <span className="font-normal text-red-600">(מסומנים באדום בעץ הדורות)</span>
              </p>
            )}
          </div>
        </div>
      )}

      <Tabs tabs={[
        { key: 'personal', label: 'פרטים אישיים', accent: 'indigo', icon: <User size={15} />, content: personalTab },
        { key: 'children', label: `ילדים (${kids.length})`, accent: 'emerald', icon: <Users size={15} />, content: childrenTab },
        { key: 'past_benefits', label: 'הטבות בעבר', accent: 'rose', icon: <Gift size={15} />, content: pastBenefitsTab },
        { key: 'lineage', label: 'עץ הדורות', accent: 'violet', icon: <GitBranch size={15} />, content: lineageTab },
        { key: 'documents', label: 'מסמכים מצורפים', accent: 'sky', icon: <Paperclip size={15} />, content: <DocumentsManager beneficiaryId={id} beneficiaryName={fullName} /> },
        { key: 'activity', label: 'היסטוריית פעילות', accent: 'amber', icon: <Activity size={15} />, content: activityTab },
        { key: 'phone', label: 'פעילות טלפון', accent: 'rose', icon: <Phone size={15} />, content: <PhoneActivity beneficiaryId={id} /> },
        ...(beneficiary.email ? [{
          key: 'mail',
          label: 'הודעות מיילים',
          accent: 'indigo' as const,
          icon: <Mail size={15} />,
          content: <BeneficiaryMailThread email={beneficiary.email} name={fullName} beneficiaryId={id} />,
        }] : []),
      ]} />
    </div>
  )
}

function DetailRow({ label, value, ltr, icon }: { label: string; value: string; ltr?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-slate-500 flex-shrink-0 flex items-center gap-1">{icon}{label}</span>
      <span className={`text-sm text-slate-800 ${ltr ? 'ltr-num text-left' : ''}`}>{value}</span>
    </div>
  )
}
