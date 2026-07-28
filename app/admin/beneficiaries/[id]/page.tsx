import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Phone, MapPin, Calendar, Users, GitBranch, ChevronLeft, FileText, User, Activity, Baby, CreditCard, Paperclip, Mail, Gift, AlertTriangle } from 'lucide-react'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { getDocTypes } from '@/lib/serverDocTypes'
import { docViewUrl } from '@/lib/docUrl'
import DocsFixHistoryBanner from './DocsFixHistoryBanner'
import LineageAssignEditor from './LineageAssignEditor'
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

// ⏱️ עזר מדידה זמני — מודד כמה כל שאילתה לוקחת ומדפיס ללוג השרת.
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t = performance.now()
  try { return await fn() }
  finally { console.log(`[perf][beneficiary] ${label}: ${Math.round(performance.now() - t)}ms`) }
}

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

// סטטוס דור לצביעה: verified=כחול (מאושר) · pending=כתום (ממתין) · rejected=אדום (נדחה).
// null = אין צומת תואם במאגר כלל (נחשב "ממתין" — כתום).
export type GenStatus = 'verified' | 'pending' | 'rejected' | null

// עיבוד סינכרוני מהצמתים שכבר נשלפו → מסלול הדורות + מפת סטטוס לכל דור. ללא רשת נוספת.
async function computeLineageData(nodes: LineageNode[], nodeId?: string | null, chain: { generation: number; name: string }[] = []): Promise<{
  path: string[]
  deviating: Set<number>
  genStatus: Map<number, GenStatus>
}> {
  const out = { path: [] as string[], deviating: new Set<number>(), genStatus: new Map<number, GenStatus>() }
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
      // הסטטוס האמיתי של הדור: הצומת התואם (לפי דור+שם) והסטטוס שלו בעץ.
      // מעדיפים צומת verified; אם אין — לוקחים כל צומת תואם (pending/rejected);
      // אם אין כלל — null (אין במאגר → נחשב ממתין).
      const matches = nodes.filter(n => n.generation === e.generation && namesMatch(n.name, e.name))
      const vNode = matches.find(n => n.status === 'verified')
      const status: GenStatus = vNode ? 'verified'
        : matches.find(n => n.status === 'rejected') ? 'rejected'
        : matches.length ? 'pending'
        : null
      out.genStatus.set(e.generation, status)
      // deviating נשמר לתאימות: דור ≤5 שאינו verified = חשוד (להתראה הקופצת)
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
// היסטוריית בקשות תיקון/השלמת מסמכים — כל בקשה שנשלחה לצאצא (החדשה ראשונה).
interface DocsFixRequest {
  id: string
  required_docs: string | null
  docs_notes: string | null
  lineage_fix_required: boolean
  lineage_fix_note: string | null
  requested_by_name: string | null
  created_at: string
}
async function getDocsFixHistory(id: string): Promise<DocsFixRequest[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('docs_fix_requests')
    .select('id, required_docs, docs_notes, lineage_fix_required, lineage_fix_note, requested_by_name, created_at')
    .eq('beneficiary_id', id)
    .order('created_at', { ascending: false })
  return (data ?? []) as DocsFixRequest[]
}

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

// ילדים מבקשות הלידה של הצאצא — כולל בקשות שעדיין ממתינות לאישור. מוחזרים
// לצורך מיזוג לרשימת הילדים (children) כדי שתינוק מלידה יוצג מיד, גם לפני אישור.
interface BirthChild { name: string; id_number?: string; gender?: string; birth_date?: string; status?: string; maternity_aid_id?: string; pending?: boolean }
async function getBirthRequestChildren(id: string): Promise<BirthChild[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('maternity_aids')
    .select('id, baby_name, baby_gender, baby_id_number, birth_date, babies, status, is_twins')
    .eq('beneficiary_id', id)
    .neq('status', 'cancelled')
  const out: BirthChild[] = []
  for (const m of (data ?? []) as { id: string; baby_name?: string | null; baby_gender?: string | null; baby_id_number?: string | null; birth_date?: string | null; babies?: unknown; status?: string }[]) {
    // תאומים — מ-babies; אחרת התינוק הבודד מהשדות baby_*
    const babies = Array.isArray(m.babies) && m.babies.length
      ? (m.babies as { name?: string | null; gender?: string | null; id_number?: string | null }[])
      : [{ name: m.baby_name, gender: m.baby_gender, id_number: m.baby_id_number }]
    for (const b of babies) {
      out.push({
        name: b.name ?? '', id_number: b.id_number ?? undefined, gender: b.gender ?? undefined,
        birth_date: m.birth_date ?? undefined, status: m.status, maternity_aid_id: m.id,
        pending: m.status !== 'active' && m.status !== 'completed',
      })
    }
  }
  return out
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
  // ⏱️ מדידת ביצועים זמנית — לאבחון האיטיות בטעינת הכרטסת (מופיע בלוגי השרת).
  const _t0 = performance.now()
  const [beneficiary, birthCerts, activity, allNodes, docsFixHistory, docTypeOpts, birthKids] = await Promise.all([
    timed('getBeneficiary', () => getBeneficiary(id)),
    timed('getBirthCertificates', () => getBirthCertificates(id)),
    timed('getActivity', () => getActivity(id)),
    timed('getAllLineageNodes', () => getAllLineageNodes()),
    timed('getDocsFixHistory', () => getDocsFixHistory(id)),
    timed('getDocTypes', () => getDocTypes()),
    timed('getBirthRequestChildren', () => getBirthRequestChildren(id)),
  ])
  // מפת מפתח→תווית להמרת required_docs לשמות קריאים בבאנר
  const docLabelMap: Record<string, string> = Object.fromEntries(docTypeOpts.map(o => [o.value, o.label]))
  console.log(`[perf][beneficiary/${id}] all queries: ${Math.round(performance.now() - _t0)}ms · nodes=${allNodes.length}`)
  const typedChain = Array.isArray(beneficiary?.lineage_chain)
    ? (beneficiary!.lineage_chain as { generation: number; name: string }[])
    : []
  const lineageData = await computeLineageData(allNodes, beneficiary?.lineage_node_id, typedChain)
  const lineagePath = lineageData.path
  const deviatingGens = lineageData.deviating
  const genStatus = lineageData.genStatus   // דור → סטטוס הצומת בעץ (לצביעה כחול/כתום/אדום)
  // חריג (אדום) = דור ≤5 שאינו מאושר (verified), או צומת rejected בכל דור.
  // כלל הצבע (זהה ל-statusColor ב-LineageChainChips):
  //   verified→כחול · rejected→אדום · אחר: דור ≤5→אדום (חריג!) · דור >5→כתום.
  const genColor = (s: 'verified' | 'pending' | 'rejected' | null, generation: number): 'blue' | 'orange' | 'red' =>
    s === 'verified' ? 'blue' : s === 'rejected' ? 'red' : generation <= 5 ? 'red' : 'orange'
  // הדורות החריגים (אדומים) בתוך 5 הראשונים → מקפיצים את חלונית ההתראה.
  const earlyRedGens = [...genStatus.entries()]
    .filter(([g, s]) => g <= 5 && g > 1 && genColor(s, g) === 'red')
    .map(([g]) => g)
  const earlyDeviation = earlyRedGens.length > 0
  // שרשרת (עם relation) לתגיות בן/חתן, וסימוני הצבע הידניים שנשמרו.
  const chainForMarks = Array.isArray(beneficiary?.lineage_chain)
    ? (beneficiary!.lineage_chain as { generation: number; name: string; relation: string | null }[])
    : []
  const manualMarks = ((beneficiary as { lineage_manual_marks?: Record<string, 'red' | 'green'> } | null)?.lineage_manual_marks) ?? {}

  // כל הדורות בצבעים לחלונית ההתראה (דור 1 = החתם סופר תמיד כחול/מאושר).
  const CHATAM_SOFER_ROOT = 'מרן החתם סופר זי"ע'
  const alertGens: { generation: number; name: string; color: 'blue' | 'red' | 'orange' }[] =
    [...chainForMarks].sort((a, b) => a.generation - b.generation).map(c => ({
      generation: c.generation,
      name: c.generation === 1 ? CHATAM_SOFER_ROOT : c.name,
      color: c.generation === 1 ? 'blue' : genColor(genStatus.get(c.generation) ?? null, c.generation),
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
  const registeredKids = Array.isArray(beneficiary.children)
    ? (beneficiary.children as { name: string; id_number?: string; gender?: string; birth_date?: string; marital_status?: string; birth_status?: 'pending' | 'approved'; maternity_aid_id?: string }[])
    : []
  // מיזוג ילדים מבקשות הלידה (כולל ממתינות לאישור) — כדי שתינוק מלידה יוצג
  // מיד בטאב "ילדים", גם לפני אישור. לא מכפילים ילד שכבר קיים ב-children (לפי ת"ז).
  const existingIds = new Set(registeredKids.map(k => (k.id_number ?? '').replace(/\D/g, '')).filter(Boolean))
  const extraFromBirths = birthKids
    .filter(b => { const n = (b.id_number ?? '').replace(/\D/g, ''); return n && !existingIds.has(n) })
    .map(b => ({
      name: b.name, id_number: b.id_number, gender: b.gender, birth_date: b.birth_date,
      marital_status: undefined as string | undefined,
      birth_status: (b.pending ? 'pending' : 'approved') as 'pending' | 'approved',
      maternity_aid_id: b.maternity_aid_id,
    }))
  const kids = [...registeredKids, ...extraFromBirths]
  const maritalLabel = (c: { gender?: string; marital_status?: string }) => {
    if (c.marital_status === 'married') return c.gender === 'female' ? 'נשואה' : 'נשוי'
    if (c.marital_status === 'single') return c.gender === 'female' ? 'לא נשואה' : 'לא נשוי'
    return null
  }
  const hasLineage = lineagePath.length > 0 || (Array.isArray(beneficiary.lineage_manual) && beneficiary.lineage_manual.length > 0)
  // אדם חריג (אינו צאצא) — אין לו ייחוס. מסתירים טאב עץ הדורות ואת באנר
  // הבדיקה המעמיקה. (undefined לפני שהעמודה קיימת → falsy → התנהגות רגילה.)
  const isSpecial = (beneficiary as { is_special?: boolean }).is_special === true

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
                      <a href={docViewUrl(birthCerts[c.maternity_aid_id])} target="_blank" rel="noopener noreferrer" title="צפייה באישור הלידה"
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

      {/* ציון אמינות יוחסין — ייעוצי, לא מאשר. ממוקם למעלה וניתן לכיווץ. */}
      <LineageReliabilityPanel beneficiaryId={id} />

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
            // צבע לפי סטטוס הצומת בעץ (כחול=מאושר / כתום=ממתין / אדום=נדחה). דור 1 תמיד מאושר.
            status: isRoot ? 'verified' : (genStatus.get(c.generation) ?? null),
            relation: isRoot ? null : ((c.relation as 'son' | 'son_in_law' | null | undefined) ?? null),
          }
        })
        // אם משום מה אין דור 1 כלל בשרשרת — מוסיפים אותו בראש (החתם סופר קבוע).
        if (!gens.some(g => g.generation === 1)) {
          gens.unshift({ generation: 1, name: CHATAM_SOFER, status: 'verified', relation: null })
        }
        return <LineageChainChips beneficiaryId={id} gens={gens} initialMarks={manualMarks} allNodes={allNodes} />
      })()}

      {/* עריכת שיוך ידנית — בחירת צומת העלה בעץ (השרשרת נגזרת אוטומטית).
          כלי משלים לבורר הדור-לפי-דור שבצ'יפים. */}
      <div className="flex justify-end">
        <LineageAssignEditor beneficiaryId={id} currentNodeId={beneficiary.lineage_node_id ?? null} />
      </div>

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
  // אילו חגים סומנו — מוצגים כרשימה אנכית (כל חג בשורה) מתחת ל"מענק לקראת החגים"
  const holidayNames = pb ? ([
    pb.tishrei_5786 && 'תשרי תשפ"ו',
    pb.pesach_5786 && 'פסח תשפ"ו',
    pb.shavuot_5786 && 'שבועות תשפ"ו',
  ].filter(Boolean) as string[]) : []
  // פריטי ההטבות הפשוטים (מחרוזת אחת לכל פריט). מענק החגים מטופל בנפרד ברינדור
  // כי הוא מציג רשימת חגים אנכית ולא מחרוזת בודדת.
  const pastBenefitItems = pb ? ([
    pb.recovery_home && 'בית החלמה ליולדות',
    pb.food_card && 'כרטיס מזון ליולדות',
    pb.catering && 'קייטרינג מוזל "ויגילו בשמחה"',
    pb.loan && `הלוואה${pb.loan_amount ? ` — $${pb.loan_amount}` : ''}`,
    pb.other && `עזרה אחרת${pb.other_details ? ` — ${pb.other_details}` : ''}`,
  ].filter(Boolean) as string[]) : []
  // האם יש הטבה כלשהי להצגה (כולל מענק חגים שמטופל בנפרד)
  const hasAnyPastBenefit = pastBenefitItems.length > 0 || !!(pb && pb.holiday_grant)
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
          {hasAnyPastBenefit ? (
            <ul className="flex flex-col gap-2">
              {pastBenefitItems.map((it, i) => (
                <li key={i} className="flex items-center gap-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" /> {it}
                </li>
              ))}
              {/* מענק החגים — כותרת ואז כל חג בשורה נפרדת מתחתיה */}
              {pb.holiday_grant && (
                <li className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" /> מענק לקראת החגים
                  </div>
                  {holidayNames.length > 0 && (
                    <ul className="mt-1.5 mr-4.5 flex flex-col gap-1">
                      {holidayNames.map((h, i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-300 flex-shrink-0" /> {h}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-slate-400 py-2">המבקש סימן שלא קיבל הטבות בעבר מאיגוד הצאצאים.</p>
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
  // ── Tab: הערות המבקש (past_benefits.notes) — הופרד מטאב "הטבות בעבר" ──
  const requestNotesTab = (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <FileText size={16} className="text-amber-500" />
        <h2 className="text-xs font-semibold text-slate-500 uppercase">הערות המבקש</h2>
      </div>
      {pb?.notes ? (
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{pb.notes}</p>
      ) : (
        <p className="text-center text-slate-400 text-sm py-6">לא נכתבו הערות על ידי המבקש</p>
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

      {/* התראה קופצת בכניסה — יש דור חריג (אדום) בתוך 5 הדורות הראשונים */}
      {!isSpecial && earlyDeviation && <LineageAlertModal generations={earlyRedGens} allGens={alertGens} />}

      {beneficiary.eligibility_status === 'docs_returned' && <ReturnedFixesBanner beneficiary={beneficiary} />}

      {/* מה ביקשנו מהצאצא — היסטוריית בקשות התיקון/השלמת מסמכים (מודגש כשעדיין ממתין) */}
      <DocsFixHistoryBanner
        history={docsFixHistory}
        docLabelMap={docLabelMap}
        active={beneficiary.eligibility_status === 'docs_pending'}
      />

      {/* בדיקה מעמיקה — הסבר המזכיר למה היחוס דורש בדיקה (מוצג למנהל האחראי).
          ⚠️ הדגל deep_review "נדבק" ברישום ומתעדכן רק בנתיב assign — לכן משפחה
          שדורותיה כבר אושרו (בכל דרך אחרת) נותרה עם הדגל, והבאנר הופיע בטעות.
          לכן מציגים את הבאנר רק כשהסטייה עדיין *אמיתית*: או שהמזכיר העביר ידנית
          (deep_review_reason), או שבפועל יש דור חריג (earlyDeviation). */}
      {!isSpecial && beneficiary.eligibility_status === 'deep_review'
        && (!!(beneficiary as { deep_review_reason?: string | null }).deep_review_reason || earlyDeviation) && (
        <div className="rounded-2xl border-2 border-orange-300 bg-orange-50 px-5 py-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-orange-600" />
          </div>
          <div>
            <p className="font-bold text-sm text-orange-900">בדיקת יחוס מעמיקה — ממתין לאישור מנהל</p>
            <p className="text-sm text-orange-800 mt-1 leading-relaxed">
              {/* "אושרו ע"י המזכירות" מוצג רק כשהמזכירות העבירה ידנית לבדיקה מעמיקה
                  (יש deep_review_reason). בכניסה אוטומטית ל-deep_review (סטייה ב-5
                  הדורות הראשונים בעת הרישום) המזכירות לא אישרה דבר — לכן לא מוצג. */}
              {(beneficiary as { deep_review_reason?: string | null }).deep_review_reason
                ? <>המסמכים והפרטים אושרו ע"י המזכירות. סדר היחוס דורש בדיקה מעמיקה. <span className="font-semibold">הערת המזכיר:</span> {(beneficiary as { deep_review_reason?: string | null }).deep_review_reason}</>
                : 'סדר היחוס דורש בדיקה מעמיקה (סטייה בסדר הדורות זוהתה אוטומטית בעת הרישום).'}
            </p>
            {/* פירוט הדורות הבעייתיים — רק עד דור 5. דורות 6+ הם דורות חדשים
                (מעבר לעץ המאושר, מסומנים כתום), ואינם "לא תואמים" — אין טעם
                להציגם כאן. רק סטיות בדורות 1-5 (שאמורים להיות מאושרים) בעייתיות. */}
            {[...deviatingGens].some(g => g <= 5) && (
              <p className="text-sm text-red-800 mt-2 font-semibold flex items-center gap-1.5">
                <AlertTriangle size={14} className="flex-shrink-0" />
                דורות שאינם תואמים לנתיב המאושר: {[...deviatingGens].filter(g => g <= 5).sort((a, b) => a - b).map(g => `דור ${g}`).join(', ')}
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
        { key: 'request_notes', label: 'הערות המבקש', accent: 'amber', icon: <FileText size={15} />, content: requestNotesTab },
        // עץ הדורות — מוסתר לאדם חריג (אינו צאצא, אין לו ייחוס)
        ...(isSpecial ? [] : [{ key: 'lineage', label: 'עץ הדורות', accent: 'violet' as const, icon: <GitBranch size={15} />, content: lineageTab }]),
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
