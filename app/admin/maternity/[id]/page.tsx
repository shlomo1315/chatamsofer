import { guardPage } from '@/lib/pageGuard'
import Link from 'next/link'
import { ArrowRight, Baby, CreditCard, Home, FileText, User, Phone, MapPin, GitBranch, ExternalLink, Mail, Download, Heart, Star, XCircle, MessageSquare } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid, Beneficiary } from '@/types'
import Card from '@/components/ui/Card'
import Tabs, { type TabDef } from '@/components/ui/Tabs'
import { StatusControl } from '../maternityStatus'
import FamilyApprovalGate from '@/components/admin/FamilyApprovalGate'
import MaternityActions from './MaternityActions'
import MaternityInquiryPanel from './MaternityInquiryPanel'
import AdminReviewAlert from './AdminReviewAlert'
import { AdminOnly } from '@/components/StaffPermissions'
import GratitudeTab from './GratitudeTab'
import FeedbackTab from './FeedbackTab'
import ExtendEligibility from '../ExtendEligibility'
import RecoveryDaysEditor from '../RecoveryDaysEditor'
import RecoveryHomeEditor from './RecoveryHomeEditor'
import { recoveryDaysOf } from '@/lib/maternity'
import { formatIsraeliId } from '@/lib/validation'
import { getDocTypes } from '@/lib/serverDocTypes'
import { docTypeLabel } from '@/lib/docTypes'
import { docViewUrl, docDownloadUrl, docDownloadName } from '@/lib/docUrl'
import BackButton from '@/components/ui/BackButton'
import ApprovalLabelTag from '@/components/ui/ApprovalLabelTag'
import { approvalLabelOf } from '@/lib/approvalLabel'
import DownloadDocButton from '@/components/ui/DownloadDocButton'
import { ViewDocButton } from '@/components/ui/DocViewer'
import PdfCanvasView from '@/components/ui/PdfCanvasView'
import SafeDocImage from '@/components/ui/SafeDocImage'
import { pathToRoot, NODE_SELECT, type TreeNodeRow } from '@/lib/lineageSync'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { adjacentInBucket, isBucket, BUCKET_LABEL, type MaternityBucket, type AdjacentRow } from '@/lib/maternityBuckets'
import AdjacentNav from './AdjacentNav'
import BirthCertificatePreview from './BirthCertificatePreview'
import RecoveryUnlockButton from './RecoveryUnlockButton'
import LineageTreeToggle from './LineageTreeToggle'
import LineageChainChips, { type ChainGen } from '@/app/admin/beneficiaries/[id]/LineageChainChips'
import { isNodeVerified } from '@/lib/lineageDeviation'
import WantsChoiceEditor from './WantsChoiceEditor'
import CollapsibleMailThread from './CollapsibleMailThread'
import MailTabBoundary from './MailTabBoundary'
import { format, differenceInCalendarDays } from 'date-fns'
import { he } from 'date-fns/locale'
import { registrationSourceLabel } from '@/lib/distributionSources'

interface BeneficiaryDoc { doc_type: string; file_url: string | null; file_name: string | null }

async function getAid(id: string): Promise<MaternityAid | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const run = () => supabase
    .from('maternity_aids')
    // ⚡ עמודות מפורשות למוטב במקום beneficiaries(*): השליפה משכה את החתימה
    // (data-URL בבסיס64, 20-80KB) ואת 8 עמודות ה-portal_* — בהן portal_phone_code_plain,
    // קוד SMS בטקסט גלוי — שאין להן שום שימוש בכרטסת הלידה.
    //
    // ⚠️ שלושה שדות נדרשים ע"י צרכנים שאינם נראים בקריאת הדף:
    //   children      → StatusControl/syncBabyStatusInFamily. בלעדיו אישור לידה
    //                   דורס את רשימת הילדים של המשפחה (אותו באג שתוקן ברשימה).
    //   is_special    → FamilyApprovalGate
    //   required_docs → מוצג בדף עצמו
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, id_number, spouse_name, spouse_id_number, spouse_birth_date, phone, phone2, email, address, city, marital_status, children, children_count, eligibility_status, community_affiliation, registration_source, required_docs, is_special, lineage_node_id, lineage_chain, lineage_manual, lineage_manual_marks), card_center:card_centers(id, name)')
    .eq('id', id)
    .single()

  // ⚠️ מחרוזת select נפרדת ומפורשת ולא תבנית עם משתנה: הטיפוסים של
  // supabase-js נגזרים מהמחרוזת *הליטרלית*, ואינטרפולציה מבטלת את ההסקה.
  const runWithLabel = () => supabase
    .from('maternity_aids')
    .select('*, beneficiary:beneficiaries(id, full_name, family_name, id_number, spouse_name, spouse_id_number, spouse_birth_date, phone, phone2, email, address, city, marital_status, children, children_count, eligibility_status, community_affiliation, registration_source, required_docs, is_special, lineage_node_id, lineage_chain, lineage_manual, lineage_manual_marks, approval_label:approval_labels(id, name, color, notes)), card_center:card_centers(id, name)')
    .eq('id', id)
    .single()

  // ⚠️ קודם עם תווית סיבת האישור ובנפילה בלעדיה — הכרטסת חייבת להיפתח
  // גם לפני שהמיגרציה של approval_labels רצה.
  const withLabel = await runWithLabel()
  const { data, error } = withLabel.error && withLabel.error.code !== 'PGRST116' && withLabel.error.code !== '22P02'
    ? await run()
    : withLabel
  if (withLabel.error && withLabel.error.code !== 'PGRST116' && withLabel.error.code !== '22P02') {
    console.error('[maternity/:id] approval label join failed, retrying without it:', withLabel.error)
  }
  // לא נמצא (PGRST116) או מזהה לא תקין (22P02) → notFound; שאר השגיאות מופצות הלאה
  if (error && error.code !== 'PGRST116' && error.code !== '22P02') throw error
  // נפילה-לאחור: אם אין birth_certificate_url ברשומה — שליפת אישור הלידה מטבלת המסמכים
  if (data && !data.birth_certificate_url && data.beneficiary_id) {
    const { data: doc } = await supabase
      .from('documents')
      .select('file_url')
      .eq('doc_type', 'birth_cert')
      .eq('beneficiary_id', data.beneficiary_id)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (doc?.file_url) data.birth_certificate_url = doc.file_url
  }
  return data
}

// ניווט בין יולדות בלי לחזור לרשימה: מחזיר את מזהי היולדת הקודמת/הבאה לפי
// אותו סדר של הרשימה הראשית (created_at יורד — חדש→ישן). "הבאה" = הישנה יותר
// (הבאה למטה ברשימה), "הקודמת" = החדשה יותר.
//
// 🔴 נעול ללשונית שממנה נכנסו (?st=). קודם הניווט רץ על *כל* הטבלה, ומי שנכנס
// מ"ממתין לאישור" ולחץ "הבאה" נחת על יולדת מאושרת ואיבד את הרצף שבו עבד.
//
// ⚠️ "ממתין לתיקונים" אינו סטטוס במסד אלא נגזרת (דגל שם + מצב המסמכים של
// המשפחה), ולכן אי אפשר לסנן אותו ב-SQL. במקום זה נשלפות העמודות הקלות של כל
// הלידות והשכנים נמצאים בזיכרון — אותו כלל בדיוק ששולט ברשימה עצמה.
async function getAdjacentAids(currentId: string, createdAt: string | null, bucket: MaternityBucket) {
  const none = { prevId: null, nextId: null, allPrevId: null, allNextId: null }
  if (!isSupabaseConfigured() || !createdAt) return none
  const supabase = await createClient()

  // ללא נעילה — שתי שאילתות קלות מאונדקסות, כמו קודם.
  if (bucket === 'all') {
    const [{ data: next }, { data: prev }] = await Promise.all([
      supabase.from('maternity_aids').select('id').lt('created_at', createdAt)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('maternity_aids').select('id').gt('created_at', createdAt)
        .order('created_at', { ascending: true }).limit(1).maybeSingle(),
    ])
    const p = (prev as { id: string } | null)?.id ?? null
    const n = (next as { id: string } | null)?.id ?? null
    return { prevId: p, nextId: n, allPrevId: p, allNextId: n }
  }

  // ⚠️ שליפה בדפים: .limit() לבדו נחתך ל-1000 (db-max-rows), והניווט היה
  // מדלג בשקט על כל מה שמעבר. ראו lib/fetchAllRows.
  const { rows, error } = await fetchAllRows<AdjacentRow & { id: string }>((from, to) =>
    supabase.from('maternity_aids')
      .select('id, created_at, status, baby_name, baby_name_pending, babies, beneficiary:beneficiaries(eligibility_status)')
      .or('birth_type.is.null,birth_type.neq.silent')
      .range(from, to))
  if (error) return none

  const current = { id: currentId, created_at: createdAt }
  return {
    ...adjacentInBucket(rows, current, bucket),
    ...(({ prevId, nextId }) => ({ allPrevId: prevId, allNextId: nextId }))(
      adjacentInBucket(rows, current, 'all')),
  }
}

async function getBeneficiaryDocs(beneficiaryId: string): Promise<BeneficiaryDoc[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('doc_type, file_url, file_name')
    .eq('beneficiary_id', beneficiaryId)
    .in('doc_type', ['id_husband', 'id_husband_appx', 'id_wife', 'id_wife_appx'])
    .order('uploaded_at', { ascending: false })
  if (!data) return []
  // מחזיר doc אחד לכל סוג (הכי חדש)
  const seen = new Set<string>()
  return data.filter(d => { if (seen.has(d.doc_type)) return false; seen.add(d.doc_type); return true })
}

// מטמון קצר-מועד למפת צמתי השושלת — נמנע מסריקת כל הטבלה בכל טעינת כרטסת.
// השושלת כמעט ואינה משתנה, ולכן TTL של 5 דקות מזרז מאוד טעינות חוזרות.
// generation + status נדרשים לצביעת הצ'יפים (ירוק=מאומת / אדום=סוטה / כתום=נוסף),
// בדיוק כמו בכרטסת הצאצא.
type LineageNodeLite = { id: string; name: string; parent_id: string | null; generation: number; status: string; relation?: string | null }

// ⚡ מטמון *משותף* (getCachedLineageTree) ולא מטמון פרטי לדף הזה.
//
// ⚠️ עד כה היה כאן מטמון נפרד משלו עם אותן שורות בדיוק (אותו NODE_SELECT)
// שכרטסת הצאצא כבר טוענת — כלומר כפל זיכרון על ~5000 צמתים, ובלי שתי
// התכונות שיש למטמון המשותף: single-flight (שתי כרטסות שנפתחות יחד סרקו
// את העץ פעמיים במקביל) ו-stale-while-revalidate (אחרי כל רישום ציבורי
// המטמון נפסל, והפתיחה הבאה נחסמה על סריקה מלאה במקום לקבל עותק מיושן מיד).
async function getLineageMap(): Promise<Map<string, LineageNodeLite>> {
  // ⚠️ service client (ולא createClient מבוסס-הסשן): RLS על lineage_nodes חוסם
  // את המשתמש המחובר ומחזיר 0 שורות בשקט, וכל הצ'יפים נצבעים כתום. זהה לתיקון
  // ב-getAllLineageNodes בכרטסת הצאצא.
  const { getServiceClient } = await import('@/lib/apiAuth')
  const supabase = getServiceClient()
  if (!supabase) return new Map()
  const { getCachedLineageTree } = await import('@/lib/lineageSync')
  const rows = await getCachedLineageTree(async () => {
    // ⚠️ שליפה בדפים — .limit() לבדו נחתך ל-1000 (db-max-rows), והצ'יפים הציגו
    // עץ חלקי בעצים גדולים. ראו lib/fetchAllRows.
    const { fetchAllRows } = await import('@/lib/fetchAllRows')
    const { rows, error } = await fetchAllRows<TreeNodeRow>((from, to) =>
      supabase.from('lineage_nodes').select(NODE_SELECT).range(from, to),
    )
    if (error) throw new Error(error)
    return rows
  })
  return new Map((rows as unknown as LineageNodeLite[]).map(n => [n.id, n]))
}

type GenStatus = 'verified' | 'pending' | 'rejected' | null
// מחשב את סטטוס הצומת התואם בעץ לכל דור ב-lineage_chain (verified=כחול /
// pending/אין=כתום / rejected=אדום). זהה ללוגיקה בכרטסת הצאצא.
async function computeGenStatus(
  chain: { generation: number; name: string }[],
  nodeId?: string | null,
): Promise<Map<number, GenStatus>> {
  const out = new Map<number, GenStatus>()
  if (!isSupabaseConfigured()) return out
  const map = await getLineageMap()

  // ✅ מקור האמת: כשיש שיוך לצומת בעץ, הסטטוס נגזר מהמסלול לפי מזהי צמתים.
  // התאמת שמות (למטה) נשארת רק לשרשרת ידנית בלי שיוך — אחרת הבדל ניסוח בשם
  // ("רבי נתן יהודה סופר" מול "רבי נתן יהודה (נטע)") צובע דור מאושר באדום.
  const allNodes = [...map.values()]

  const path = pathToRoot(map as unknown as Map<string, TreeNodeRow>, nodeId)
  if (path.length) {
    // ✅ צבע לפי הצומת הספציפי במסלול של הצאצא — לא כלל-על שמעלה דור שלם לכחול
    // כי יש בו צומת verified אחר. צומת pending (כתום בעץ) נשאר כתום בצ'יפ, ומרגע
    // שמאשרים אותו בעץ הוא נהיה כחול מיד. זהה לכרטסת הצאצא.
    for (const n of path) {
      const status: GenStatus =
        isNodeVerified(n.status) ? 'verified'
        : n.status === 'rejected' ? 'rejected'
        : 'pending'
      out.set(n.generation, status)
    }
    return out
  }

  if (!chain.length) return out
  const nodes = allNodes
  // ⚠️ אותה לוגיקה בדיוק כמו בכרטסת הצאצא: קודם הליכה בעץ מהשורש (השרשרת
  // המוקלדת נושאת ניסוח מורכב שאינו שווה לשם הצומת), ואחר כך התאמת שמות שטוחה
  // למה שלא זוהה. שתי לוגיקות שונות לאותה שאלה היו מציגות צבע אחר באותו דור.
  const { resolveChainAgainstTree } = await import('@/lib/lineageResolve')
  for (const [gen, r] of resolveChainAgainstTree(nodes, chain)) out.set(gen, r.status)
  const { namesMatch } = await import('@/lib/hebrewName')
  for (const e of chain) {
    if (out.has(e.generation)) continue
    const matches = nodes.filter(n => n.generation === e.generation && namesMatch(n.name, e.name))
    const status: GenStatus = matches.find(n => isNodeVerified(n.status)) ? 'verified'
      : matches.find(n => n.status === 'rejected') ? 'rejected'
      : matches.length ? 'pending'
      : null
    out.set(e.generation, status)
  }
  // ✅ אין כלל-על שמעלה דור שלם לכחול — הצבע לפי הצומת התואם בלבד. זהה לכרטסת הצאצא.
  return out
}

// סדר הדורות — נתיב משויך השושלת מהשורש ועד הצומת הנבחר.
// ⚠️ אם ליולדת אין lineage_node_id (שיוך לעץ המאושר) אלא רק lineage_chain
// (שרשרת שהוקלדה בטופס) — משתמשים ב-chain המלא, כדי שיוצג *כל* סדר הדורות
// (חתם סופר דור 1 והלאה) ולא רק חלק. בדיוק כמו כרטיס הצאצאים.
async function getLineagePath(
  nodeId?: string | null,
  chain?: { generation: number; name: string }[] | null,
): Promise<string[]> {
  // (1) נתיב מהעץ המאושר — המקור המדויק ביותר
  if (nodeId && isSupabaseConfigured()) {
    const map = await getLineageMap()
    const path: string[] = []
    let cur = map.get(nodeId)
    let guard = 0
    while (cur && guard < 50) {
      path.unshift(cur.name)
      cur = cur.parent_id ? map.get(cur.parent_id) : undefined
      guard++
    }
    if (path.length) return path
  }
  // (2) נפילה-לאחור: השרשרת שהוקלדה בטופס, ממוינת לפי דור (1..N)
  if (Array.isArray(chain) && chain.length) {
    return [...chain]
      .filter(e => e && typeof e.name === 'string' && e.name.trim())
      .sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0))
      .map(e => e.name.trim())
  }
  return []
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'

export default async function MaternityDetailPage(
  { params, searchParams }: {
    params: Promise<{ id: string }>
    // st = הלשונית שממנה נכנסו, ועליה ננעל ניווט הבאה/קודמת.
    searchParams?: Promise<Record<string, string | string[] | undefined>>
  },
) {
  await guardPage('maternity')
  const _t0 = Date.now()
  const { id } = await params
  // ⚠️ מאומת מול רשימת הלשוניות ולא מועבר כמות שהוא: ערך שרירותי מהכתובת
  // היה נכנס ישר להשוואת סטטוס ומרוקן את הניווט בלי שום הסבר.
  const stRaw = (await searchParams)?.st
  const bucket: MaternityBucket = isBucket(stRaw) ? stRaw : 'all'
  const aid = await getAid(id)
  const _tAid = Date.now()
  const ben = aid?.beneficiary as Beneficiary | undefined
  const typedChain = Array.isArray(ben?.lineage_chain)
    ? (ben.lineage_chain as { generation: number; name: string; relation?: string | null }[])
    : []
  const [lineagePath, idDocs, genStatus, docTypeList, adjacent] = await Promise.all([
    getLineagePath(ben?.lineage_node_id, typedChain),
    aid?.beneficiary_id ? getBeneficiaryDocs(aid.beneficiary_id) : Promise.resolve([]),
    computeGenStatus(typedChain, ben?.lineage_node_id),
    // לתוויות בבאנר "השלמת מסמכים" — כולל סוגים שנוספו בהגדרות
    getDocTypes(),
    // ניווט הבאה/קודמת — לפי סדר הרשימה הראשית (created_at), נעול ללשונית
    getAdjacentAids(id, (aid as { created_at?: string } | null)?.created_at ?? null, bucket),
  ])
  // מדידת זמן זמנית לאבחון האיטיות — נראה ב-Railway logs היכן הזמן מתבזבז
  console.log(`[perf] maternity/${id}: getAid=${_tAid - _t0}ms, lineage+docs=${Date.now() - _tAid}ms, total=${Date.now() - _t0}ms`)
  const lineageManual = Array.isArray(ben?.lineage_manual) ? (ben.lineage_manual as string[]) : []
  // סימונים ידניים (override צבע) — כמו בכרטסת הצאצא
  const manualMarks = ((ben as { lineage_manual_marks?: Record<string, 'red' | 'green'> } | undefined)?.lineage_manual_marks) ?? {}
  // כל צמתי העץ — לבורר "בחר צומת אחר לדור" (מה-Map הממוטמן, ללא רשת נוספת)
  const lineageNodesArr = isSupabaseConfigured() ? [...(await getLineageMap()).values()] : []

  if (!aid && isSupabaseConfigured()) notFound()

  if (!aid) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <Link href="/admin/maternity" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <h1 className="text-xl font-bold">פרטי תיק יולדת</h1>
        </div>
        <div className="bg-white rounded-xl border p-8 text-center text-slate-400">הגדר Supabase לצפייה בנתונים</div>
      </div>
    )
  }

  const beneficiary = aid.beneficiary as {
    id: string; full_name: string; family_name?: string; phone?: string; phone2?: string
    email?: string; address?: string; city?: string; id_number: string
    marital_status?: string; gender?: string; eligibility_status?: string
    spouse_name?: string; spouse_id_number?: string
    children_count?: number
  } | undefined

  // שם היולדת (האישה) = שם משפחה + שם האישה. נפילה לשם הרשומה אם חסר
  const motherName = beneficiary?.spouse_name
    ? [beneficiary.family_name, beneficiary.spouse_name].filter(Boolean).join(' ')
    : [beneficiary?.family_name, beneficiary?.full_name].filter(Boolean).join(' ') || 'תיק יולדת'
  const motherId = beneficiary?.spouse_id_number ?? beneficiary?.id_number
  const approvalLabel = approvalLabelOf(beneficiary)

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton fallback="/admin/maternity" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{motherName}</h1>
              <ApprovalLabelTag label={approvalLabel} />
            </div>
            {motherId && <p className="text-sm text-slate-500 ltr-num">ת.ז. {formatIsraeliId(motherId)}</p>}
            {/* ההסבר המלא של התווית — בכרטסת יש מקום לשורה, בשורת טבלה אין. */}
            {approvalLabel?.notes && <p className="text-xs text-slate-500 mt-0.5">{approvalLabel.notes}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* ניווט בין יולדות בלי לחזור לרשימה — נעול ללשונית שממנה נכנסו */}
          <AdjacentNav {...adjacent} bucket={bucket} bucketLabel={BUCKET_LABEL[bucket]} />
          <StatusControl aid={aid} advance familyApproved={beneficiary?.eligibility_status === 'approved'} />
          <MaternityActions aid={aid} />
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────────────
          סיבת הדחייה — גלויה על כרטסת הלידה עצמה.
          ⚠️ עד כה הסיבה נשמרה בעמודה rejection_reason ונשלחה במייל ליולדת,
          אך לא הוצגה בשום מקום בממשק: חודשיים אחר כך אי אפשר היה לענות על
          "למה דחינו לה את הלידה" בלי לפתוח את ה-DB. התיעוד המלא (עם שם
          המזכיר, התאריך וההערה הפנימית) נמצא בתיעוד המשפחה בכרטסת המלאה.
          ───────────────────────────────────────────────────────────────────── */}
      {aid.status === 'cancelled' && (aid as { rejection_reason?: string | null }).rejection_reason && (
        <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-red-800 mb-1">
            <XCircle size={14} /> סיבת דחיית הלידה (נשלחה ליולדת במייל)
          </p>
          <p className="text-sm text-red-900 whitespace-pre-wrap leading-relaxed">
            {(aid as { rejection_reason?: string | null }).rejection_reason}
          </p>
          {ben && (
            <Link href={`/admin/beneficiaries/${ben.id}`}
              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:text-red-900 underline">
              לתיעוד המלא בכרטסת המשפחה <ExternalLink size={12} />
            </Link>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          בקשת השלמת מסמכים פתוחה — גלויה על כרטסת הלידה.
          ⚠️ הבקשה נשלחת מכאן ("השלמת מסמכים" בתפריט הסטטוס), אבל היא משנה את
          סטטוס *המשפחה* ולא את סטטוס הלידה. בלי הבאנר הזה המזכיר שפותח את
          התיק שוב רואה בקשה "ממתינה" בלי שום רמז שכבר ביקשנו מסמכים וממתינים
          להם — והבקשה הייתה נשלחת פעם אחר פעם.
          ───────────────────────────────────────────────────────────────────── */}
      {ben && (ben.eligibility_status === 'docs_pending' || ben.eligibility_status === 'docs_returned') && (
        <div className={`rounded-xl border-2 px-4 py-3 ${
          ben.eligibility_status === 'docs_pending' ? 'border-blue-200 bg-blue-50' : 'border-teal-200 bg-teal-50'
        }`}>
          <p className={`flex items-center gap-1.5 text-xs font-bold mb-1 ${
            ben.eligibility_status === 'docs_pending' ? 'text-blue-800' : 'text-teal-800'
          }`}>
            <FileText size={14} />
            {ben.eligibility_status === 'docs_pending'
              ? 'נשלחה ליולדת בקשת השלמת מסמכים — ממתינים לקבצים'
              : 'היולדת השלימה את המסמכים — ממתין לבדיקה'}
          </p>
          {ben.eligibility_status === 'docs_pending' && (ben.required_docs ?? '').trim() && (
            <p className="text-sm text-blue-900 leading-relaxed">
              נדרשו: {(ben.required_docs ?? '').split(',').map(s => s.trim()).filter(Boolean).map(k => docTypeLabel(k, docTypeList)).join(' · ')}
            </p>
          )}
          <Link href={`/admin/beneficiaries/${ben.id}`}
            className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold underline ${
              ben.eligibility_status === 'docs_pending' ? 'text-blue-700 hover:text-blue-900' : 'text-teal-700 hover:text-teal-900'
            }`}>
            לתיעוד המלא בכרטסת המשפחה <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* שער אישור המשפחה — חוסם אישור לידה לפני אישור המשפחה ומאפשר אישור ישיר (פרטי המשפחה מוצגים בכרטיס למטה) */}
      {ben && <FamilyApprovalGate beneficiary={ben as Parameters<typeof FamilyApprovalGate>[0]['beneficiary']} compact />}

      {/* טאבים מסודרים לכל נתוני התיק */}
      {/* 🔴 חלונית שמסבירה למנהל למה התיק הגיע לאישורו. בלעדיה הוא ראה
          תיק ב"ממתין לאישור מנהל" בלי לדעת מה המזכירה ביקשה שיבדוק.
          ⚠️ AdminOnly — למזכירה שהעבירה את התיק היא מיותרת. */}
      {aid.status === 'deep_review' && (
        <AdminOnly>
          <AdminReviewAlert
            reason={(aid as { deep_review_reason?: string | null }).deep_review_reason}
            motherName={[ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || undefined}
          />
        </AdminOnly>
      )}

      <Tabs tabs={[
        // 🔴 בירור מול היולדת — שרשור שנשמר בתיק, כמו בהלוואות.
        // עד כה המזכיר שלח מייל מהתיבה הרגילה והתשובה נעלמה מהתיק.
        {
          key: 'inquiry', label: 'בירור', accent: 'rose' as const,
          icon: <MessageSquare size={15} />,
          content: (
            <MaternityInquiryPanel
              aidId={aid.id}
              motherName={[ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || undefined}
              hasEmail={!!ben?.email}
            />
          ),
        },
        ...(ben ? [{
          key: 'family', label: 'משפחה', accent: 'indigo' as const, icon: <User size={15} />,
          content: (
            <Card className="flex flex-col gap-4">
              <div className="flex items-center justify-end">
                <Link href={`/admin/beneficiaries/${ben.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                  לכרטסת המלאה <ExternalLink size={13} />
                </Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400">פרטי הבעל</p>
                  <DetailRow label="שם מלא" value={[ben.family_name, ben.full_name].filter(Boolean).join(' ') || '—'} />
                  <DetailRow label="ת.ז." value={formatIsraeliId(ben.id_number) || '—'} ltr />
                  <DetailRow label="מצב משפחתי" value={ben.marital_status ?? '—'} />
                  <DetailRow label="קהילה" value={(ben as { community_affiliation?: string | null }).community_affiliation?.trim() || '—'} />
                  <DetailRow label="מספר ילדים" value={String(ben.children_count ?? 0)} />
                  <DetailRow label="אופן ההרשמה" value={registrationSourceLabel((ben as { registration_source?: string | null }).registration_source)} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400">פרטי קשר</p>
                  <DetailRow label="טלפון" value={ben.phone ?? '—'} ltr icon={<Phone size={12} />} />
                  <DetailRow label="טלפון נוסף" value={ben.phone2 ?? '—'} ltr />
                  <DetailRow label="אימייל" value={ben.email ?? '—'} ltr />
                  <DetailRow label="כתובת" value={[ben.address, ben.city].filter(Boolean).join(', ') || '—'} icon={<MapPin size={12} />} />
                </div>
                {ben.spouse_name && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-400">פרטי האישה</p>
                    <DetailRow label="שם" value={ben.spouse_name} />
                    {ben.spouse_id_number && <DetailRow label="ת.ז." value={formatIsraeliId(ben.spouse_id_number)} ltr />}
                    {ben.spouse_birth_date && <DetailRow label="תאריך לידה" value={fmtDate(ben.spouse_birth_date)} />}
                  </div>
                )}
              </div>
              {(idDocs.length > 0 || aid.birth_certificate_url) && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-indigo-500" />
                    <span className="text-xs font-semibold text-slate-500 uppercase">מסמכים</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {idDocs.find(d => d.doc_type === 'id_husband') && (
                      <DocCard label="ת.ז. הבעל" person={motherName} url={idDocs.find(d => d.doc_type === 'id_husband')!.file_url ?? undefined} />
                    )}
                    {/* ספח ת"ז הבעל — קובץ נפרד ליד תעודת הזהות עצמה */}
                    {idDocs.find(d => d.doc_type === 'id_husband_appx') && (
                      <DocCard label="ספח ת.ז. הבעל" person={motherName} url={idDocs.find(d => d.doc_type === 'id_husband_appx')!.file_url ?? undefined} />
                    )}
                    {idDocs.find(d => d.doc_type === 'id_wife') && (
                      <DocCard label="ת.ז. האישה" person={motherName} url={idDocs.find(d => d.doc_type === 'id_wife')!.file_url ?? undefined} />
                    )}
                    {/* ספח ת"ז האישה — קובץ נפרד ליד תעודת הזהות עצמה */}
                    {idDocs.find(d => d.doc_type === 'id_wife_appx') && (
                      <DocCard label="ספח ת.ז. האישה" person={motherName} url={idDocs.find(d => d.doc_type === 'id_wife_appx')!.file_url ?? undefined} />
                    )}
                    {aid.birth_certificate_url && (
                      <DocCard label="אישור לידה" person={motherName} url={aid.birth_certificate_url} />
                    )}
                  </div>
                </div>
              )}
              {(lineagePath.length > 0 || lineageManual.length > 0 || ben.lineage_node_id) && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <GitBranch size={14} className="text-violet-500" />
                    <span className="text-xs font-semibold text-slate-500 uppercase">סדר הדורות</span>
                  </div>
                  {/* צ'יפים צבועים לפי סטטוס (ירוק=מאומת / אדום=סוטה / כתום=נוסף)
                      + סימון ידני — זהה לכרטסת הצאצא. מקור אחד בלבד (chain או path),
                      כדי שלא תחזור ההכפלה בין lineagePath ל-lineage_manual. */}
                  {(() => {
                    const CHATAM_SOFER = 'מרן החתם סופר זי"ע'
                    const chainSorted = [...typedChain]
                      .filter(e => e && typeof e.name === 'string' && e.name.trim())
                      .sort((a, b) => (a.generation ?? 0) - (b.generation ?? 0))
                    // המסלול בעץ קודם לעותק השמור — כמו בכרטסת הצאצא. השם מגיע
                    // מהעץ העדכני; תגית בן/חתן נלקחת מהעותק לפי מספר הדור.
                    const fromTree = !!ben?.lineage_node_id && lineagePath.length > 0
                    const relOf = (g: number) => chainSorted.find(c => c.generation === g)?.relation ?? null
                    const source: { generation: number; name: string; relation?: string | null }[] =
                      fromTree
                        ? lineagePath.map((name, i) => ({ generation: i + 1, name, relation: relOf(i + 1) }))
                        : chainSorted.length
                        ? chainSorted
                        : [
                            ...lineagePath.map((name, i) => ({ generation: i + 1, name, relation: null })),
                            ...lineageManual.map((name, i) => ({ generation: lineagePath.length + 1 + i, name, relation: null })),
                          ]
                    if (!source.length) return null
                    const gens: ChainGen[] = source.map(c => {
                      const isRoot = c.generation === 1
                      return {
                        generation: c.generation,
                        name: isRoot ? CHATAM_SOFER : c.name,
                        // צבע לפי סטטוס הצומת בעץ (כחול=מאושר / כתום=ממתין / אדום=נדחה)
                        status: isRoot ? 'verified' : (genStatus.get(c.generation) ?? null),
                        relation: isRoot ? null : ((c.relation as 'son' | 'son_in_law' | null | undefined) ?? null),
                      }
                    })
                    if (!gens.some(g => g.generation === 1)) {
                      gens.unshift({ generation: 1, name: CHATAM_SOFER, status: 'verified', relation: null })
                    }
                    // ⚡ הצמתים לבורר *אינם* נשלחים כ-prop: קודם כל ~5000 צמתי העץ
                    // עברו סריאליזציה ל-HTML ולפיילואד בכל טעינת כרטסת. הבורר מושך
                    // לבדו את הדור שהוא צריך (/api/admin/lineage/generation).
                    return <LineageChainChips beneficiaryId={ben.id} gens={gens} initialMarks={manualMarks} />
                  })()}
                  {ben.lineage_node_id && (
                    <div className="mt-3">
                      <LineageTreeToggle nodeId={ben.lineage_node_id} />
                    </div>
                  )}
                </div>
              )}
            </Card>
          ),
        }] : []),
        {
          key: 'baby', label: 'תינוק ולידה', accent: 'violet' as const, icon: <Baby size={15} />,
          content: (
            <div className="flex flex-col gap-4">
              <Card className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-indigo-600 mb-2">
                  <Baby size={16} />
                  <span className="text-xs font-semibold text-slate-500 uppercase">{aid.is_twins ? 'פרטי התאומים' : 'פרטי התינוק'}</span>
                  {aid.is_twins && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                      <Baby size={11} /> לידת תאומים
                    </span>
                  )}
                </div>
                {(() => {
                  // רשימת התינוקות — תאומים (babies) או התינוק הבודד (שדות baby_*)
                  const babies = Array.isArray(aid.babies) && aid.babies.length
                    ? aid.babies
                    : [{ name: aid.baby_name, gender: aid.baby_gender, id_type: aid.baby_id_type, id_number: aid.baby_id_number }]
                  return babies.map((b, i) => (
                    <div key={i} className={i > 0 ? 'mt-3 pt-3 border-t border-slate-100' : ''}>
                      {aid.is_twins && <p className="text-xs font-semibold text-indigo-600 mb-1">תינוק {i + 1}</p>}
                      <p className="text-sm flex items-center gap-2 flex-wrap"><span className="text-slate-500">שם התינוק: </span>
                        {b.name
                          ? <span className="font-medium text-slate-800">{b.name}</span>
                          : (aid as { baby_name_pending?: boolean }).baby_name_pending
                            ? <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">⏳ היולדת ציינה: עדיין אין שם</span>
                            : <span className="font-medium text-slate-400">—</span>}
                      </p>
                      {b.id_number && (
                        <p className="text-sm"><span className="text-slate-500">{b.id_type === 'passport' ? 'דרכון' : 'ת.ז'} התינוק: </span><span className="font-medium text-slate-800 ltr-num">{b.id_number}</span></p>
                      )}
                      {b.gender && (
                        <p className="text-sm">
                          <span className="text-slate-500">מין: </span>
                          <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${b.gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                            {b.gender === 'male' ? 'בן' : 'בת'}
                          </span>
                        </p>
                      )}
                    </div>
                  ))
                })()}
                <p className="text-sm mt-3 pt-3 border-t border-slate-100"><span className="text-slate-500">תאריך לידה: </span><span className="ltr-num font-medium text-slate-800">{fmtDate(aid.birth_date)}</span></p>
                {/* בחירת ההטבות של היולדת — לחיץ לעריכת אדמין */}
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-500 mb-1.5">הטבות שהיולדת ביקשה (לחצו לעריכה):</p>
                  <WantsChoiceEditor
                    aidId={aid.id}
                    initialFoodCard={aid.wants_food_card !== false}
                    initialRecovery={aid.wants_recovery !== false}
                  />
                </div>
                {aid.six_weeks_end && (
                  <p className="text-sm">
                    <span className="text-slate-500">{aid.eligibility_extended ? 'סיום זכאות: ' : '6 שבועות לאחר הלידה: '}</span>
                    <span className="ltr-num text-indigo-600 font-medium">{fmtDate(aid.six_weeks_end)}</span>
                    {aid.eligibility_extended && (
                      <span className="mr-2 inline-block text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">הוארך ידנית</span>
                    )}
                  </p>
                )}
                {aid.eligibility_extended && aid.eligibility_extension_reason && (
                  <p className="text-xs text-slate-400">סיבת ההארכה: {aid.eligibility_extension_reason}</p>
                )}
                {aid.six_weeks_end && differenceInCalendarDays(new Date(aid.six_weeks_end), new Date()) > 0 && (
                  <p className="text-sm"><span className="text-slate-500">ימים שנותרו: </span><span className="font-medium text-amber-600">{differenceInCalendarDays(new Date(aid.six_weeks_end), new Date())} ימים</span></p>
                )}
                <div className="pt-2">
                  <ExtendEligibility aid={aid} />
                </div>
              </Card>
              {aid.birth_certificate_url && (
                <Card>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2 text-indigo-600">
                      <FileText size={16} />
                      <span className="text-xs font-semibold text-slate-500 uppercase">אישור לידה</span>
                    </div>
                    <DownloadDocButton url={aid.birth_certificate_url} docType="אישור לידה" person={motherName} name={aid.birth_certificate_url} variant="button" />
                  </div>
                  <BirthCertificatePreview aidId={aid.id} beneficiaryId={aid.beneficiary_id} url={aid.birth_certificate_url} person={motherName} />
                </Card>
              )}
              {aid.notes && (
                <Card>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">הערות</h2>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{aid.notes}</p>
                </Card>
              )}
            </div>
          ),
        },
        {
          key: 'card', label: 'כרטיס מזון', accent: 'emerald' as const, icon: <CreditCard size={15} />,
          content: (
            <Card className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-emerald-600 mb-2">
                <CreditCard size={16} />
                <span className="text-xs font-semibold text-slate-500 uppercase">כרטיס מזון</span>
              </div>
              {(() => {
                const cs = aid.card_status ?? 'pending'
                const meta: Record<string, { label: string; cls: string }> = {
                  pending:        { label: 'ממתין לאישור',     cls: 'bg-amber-100 text-amber-800' },
                  approved:       { label: 'אושר',              cls: 'bg-blue-100 text-blue-800' },
                  awaiting_stock: { label: 'אושר — ממתין למלאי', cls: 'bg-orange-100 text-orange-800' },
                  loaded:         { label: 'נטען',              cls: 'bg-green-100 text-green-800' },
                  rejected:       { label: 'נדחה',              cls: 'bg-red-100 text-red-800' },
                }
                const m = meta[cs] ?? meta.pending
                const center = (aid as { card_center?: { name?: string } }).card_center
                const cardNum = (aid as { card_number?: string | null }).card_number
                // מציגים מספר כרטיס רק אם נדרים אישר את החיבור (card_picked_up_at נקבע בהצלחה),
                // אחרת ייתכן שהמספר הוקש אך לא חובר בפועל — נציג "עדיין לא שויך כרטיס".
                const cardLinked = !!(aid as { card_picked_up_at?: string | null }).card_picked_up_at
                // ימים עד פריקה אוטומטית (סוף הזכאות: שישה שבועות מהלידה או six_weeks_end)
                const endRaw = aid.six_weeks_end
                  ?? (aid.birth_date ? format(new Date(new Date(aid.birth_date).getTime() + 42 * 86400000), 'yyyy-MM-dd') : null)
                const daysToUnload = endRaw ? differenceInCalendarDays(new Date(endRaw), new Date()) : null
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-sm">סטטוס:</span>
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${m.cls}`}>{m.label}</span>
                    </div>
                    {center?.name && <p className="text-sm mt-1"><span className="text-slate-500">מוקד: </span><span className="font-medium text-slate-800">{center.name}</span></p>}
                    {/* מספר כרטיס נדרים — רק אם החיבור אושר; אחרת חיווי שטרם שויך */}
                    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      {cardNum && cardLinked ? (
                        <>
                          <p className="text-sm"><span className="text-slate-500">מספר כרטיס: </span><span className="font-semibold text-slate-800 ltr-num">{cardNum}</span></p>
                          {daysToUnload != null && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {daysToUnload > 0 ? `${daysToUnload} ימים עד לפריקה` : 'הגיע מועד הפריקה'}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="text-sm text-amber-700 font-medium">עדיין לא שויך כרטיס</p>
                          {daysToUnload != null && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {daysToUnload > 0 ? `${daysToUnload} ימים עד לפריקה` : 'הגיע מועד הפריקה'}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    {aid.card_loaded_at && <p className="text-xs text-slate-400 mt-1 text-right">נטען בתאריך: <span className="ltr-num">{fmtDate(aid.card_loaded_at)}</span></p>}
                  </>
                )
              })()}
              <Link href={`/admin/maternity/cards${aid.beneficiary?.id_number ? `?zeout=${encodeURIComponent(aid.beneficiary.id_number)}` : ''}`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 border border-emerald-200 hover:bg-emerald-50 rounded-lg px-3 py-1.5 transition-colors self-start">
                ניהול הכרטיס
              </Link>
            </Card>
          ),
        },
        ...((aid.recovery_home || aid.wants_recovery !== false) ? [{
          key: 'recovery', label: 'בית החלמה', accent: 'sky' as const, icon: <Home size={15} />,
          content: (
            <Card>
              <div className="flex items-center gap-2 text-indigo-600 mb-3">
                <Home size={16} />
                <span className="text-xs font-semibold text-slate-500 uppercase">בית החלמה</span>
              </div>
              {/* בית ההחלמה — ניתן להחלפה מהירה ישירות מהכרטסת (גם למזכירות) */}
              <RecoveryHomeEditor aidId={aid.id} current={aid.recovery_home ?? null} />
              {/* ימי זכאות בבית ההחלמה — ניתן לעריכה ידנית (ברירת מחדל: רגילה 2 · תאומים 4) */}
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="mb-2 inline-flex items-center gap-2 text-sm">
                  <span className="text-slate-500">אישור זכאות:</span>
                  <span className="inline-flex items-center gap-1 text-sm font-bold px-2.5 py-0.5 rounded-full bg-sky-100 text-sky-800">
                    {recoveryDaysOf(aid)} ימים
                  </span>
                  {aid.is_twins && <span className="text-xs text-indigo-600">(לידת תאומים)</span>}
                </div>
                <RecoveryDaysEditor aid={aid} />
              </div>
              {aid.recovery_arrived != null && (
                <div className="text-sm mt-2">
                  <span className="text-slate-500">הגעה: </span>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${aid.recovery_arrived ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-600'}`}>
                    {aid.recovery_arrived ? 'הגיעה' : 'לא הגיעה'}
                  </span>
                </div>
              )}
              {aid.recovery_stay_from && aid.recovery_stay_to && (
                <div className="text-sm mt-2">
                  <span className="text-slate-500">שהתה בפועל: </span>
                  <span className="font-semibold text-slate-700">
                    {new Date(aid.recovery_stay_from).toLocaleDateString('he-IL')} – {new Date(aid.recovery_stay_to).toLocaleDateString('he-IL')}
                  </span>
                </div>
              )}
              {aid.recovery_amount != null && (
                <div className="text-sm mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-slate-500">סכום שמומש ע״י בית ההחלמה: </span>
                  <span className="font-bold text-emerald-700">₪{Number(aid.recovery_amount).toLocaleString('he-IL')}</span>
                  {aid.recovery_amount_status === 'rejected' ? (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">נדחה</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      מומש{aid.recovery_amount_at ? ` בתאריך ${fmtDate(aid.recovery_amount_at)}` : ''}
                    </span>
                  )}
                </div>
              )}
              {aid.recovery_receipt_number && (
                <div className="text-sm mt-2">
                  <span className="text-slate-500">מספר קבלה (בית ההחלמה): </span>
                  <span className="font-bold text-slate-800 ltr-num">{aid.recovery_receipt_number}</span>
                </div>
              )}
              {aid.recovery_receipt_url && (
                <div className="mt-2">
                  <DownloadDocButton url={aid.recovery_receipt_url} docType="קבלה" person={motherName} name={aid.recovery_receipt_url} label="קובץ קבלה" variant="button" />
                </div>
              )}
              {aid.recovery_locked && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {aid.recovery_edit_requested_at && (
                    <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">בית ההחלמה ביקש תיקון</span>
                  )}
                  <RecoveryUnlockButton aidId={aid.id} />
                </div>
              )}
            </Card>
          ),
        }] : []),
        ...(ben?.email ? [{
          key: 'mail', label: 'מיילים', accent: 'amber' as const, icon: <Mail size={15} />,
          content: <MailTabBoundary><CollapsibleMailThread email={ben.email} name={motherName} beneficiaryId={ben.id} /></MailTabBoundary>,
        }] : []),
        {
          key: 'gratitude', label: 'מכתבי ברכה', accent: 'amber' as const, icon: <Heart size={15} />,
          content: <GratitudeTab aidId={aid.id} />,
        },
        {
          key: 'feedback', label: 'משוב', accent: 'sky' as const, icon: <Star size={15} />,
          content: <FeedbackTab aidId={aid.id} />,
        },
      ] as TabDef[]} />
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

function DocCard({ label, url, person }: { label: string; url?: string; person?: string }) {
  if (!url) return (
    <div className="flex flex-col items-center gap-1.5 p-3 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-center">
      <FileText size={18} className="text-slate-300" />
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span className="text-[10px] text-slate-300">לא הועלה</span>
    </div>
  )
  const isImage = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url)
  const isPdf = /\.pdf(\?|$)/i.test(url)
  return (
    <div className="flex flex-col gap-1.5">
      <ViewDocButton url={url}
         className="flex flex-col gap-2 p-2 border border-slate-200 rounded-xl bg-white hover:border-indigo-300 hover:shadow-sm transition-all group text-center">
        {isImage ? (
          <SafeDocImage path={url} name={label} alt={label} className="w-full h-28 object-cover rounded-lg bg-slate-100" />
        ) : isPdf ? (
          // תצוגה מקדימה אמיתית — העמוד הראשון מצויר על canvas
          <PdfCanvasView url={url} name={label} maxPages={1} cover className="w-full h-28 rounded-lg overflow-hidden bg-white" />
        ) : (
          <div className="w-full h-28 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center">
            <FileText size={24} className="text-slate-400" />
          </div>
        )}
        <span className="text-[11px] font-medium text-slate-600 group-hover:text-indigo-600 flex items-center justify-center gap-1">
          {label} <ExternalLink size={10} />
        </span>
      </ViewDocButton>
      <DownloadDocButton url={url} docType={label} person={person} variant="button" className="justify-center" />
    </div>
  )
}
