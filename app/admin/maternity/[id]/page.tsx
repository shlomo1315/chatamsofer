import Link from 'next/link'
import { ArrowRight, Baby, CreditCard, Home, FileText, User, Phone, MapPin, GitBranch, ChevronLeft, ExternalLink, Mail } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid, Beneficiary, CARD_LOAD_STATUS_LABELS, type CardLoadStatus } from '@/types'
import Card from '@/components/ui/Card'
import { StatusControl } from '../MaternityTable'
import MaternityActions from './MaternityActions'
import LoadCardButton from './LoadCardButton'
import BackButton from '@/components/ui/BackButton'
import BirthCertificatePreview from './BirthCertificatePreview'
import LineageBranchView from '@/app/admin/beneficiaries/[id]/LineageBranchView'
import BeneficiaryMailThread from '@/app/admin/beneficiaries/[id]/BeneficiaryMailThread'
import { format, differenceInCalendarDays } from 'date-fns'
import { he } from 'date-fns/locale'

async function getAid(id: string): Promise<MaternityAid | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('maternity_aids')
      .select('*, beneficiary:beneficiaries(*)')
      .eq('id', id)
      .single()
    return data
  } catch {
    return null
  }
}

// סדר הדורות — נתיב משויך השושלת מהשורש ועד הצומת הנבחר
async function getLineagePath(nodeId?: string | null): Promise<string[]> {
  if (!nodeId || !isSupabaseConfigured()) return []
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('lineage_nodes').select('id, name, parent_id')
    if (!data) return []
    const map = new Map(data.map(n => [n.id, n]))
    const path: string[] = []
    let cur = map.get(nodeId)
    let guard = 0
    while (cur && guard < 50) {
      path.unshift(cur.name)
      cur = cur.parent_id ? map.get(cur.parent_id) : undefined
      guard++
    }
    return path
  } catch {
    return []
  }
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'

const CARD_LOAD_CLS: Record<CardLoadStatus, string> = {
  idle: 'bg-slate-100 text-slate-600',
  pending: 'bg-amber-100 text-amber-700',
  loaded: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  unloaded: 'bg-slate-200 text-slate-700',
}
const fmtCur = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

export default async function MaternityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const aid = await getAid(id)
  const ben = aid?.beneficiary as Beneficiary | undefined
  const lineagePath = await getLineagePath(ben?.lineage_node_id)
  const lineageManual = Array.isArray(ben?.lineage_manual) ? (ben.lineage_manual as string[]) : []

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

  const expiresIn = aid.card_expires_at
    ? Math.ceil((new Date(aid.card_expires_at).getTime() - Date.now()) / 86400000)
    : null

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BackButton fallback="/admin/maternity" />
          <div>
            <h1 className="text-xl font-bold text-slate-900">{motherName}</h1>
            {motherId && <p className="text-sm text-slate-500 ltr-num">ת.ז. {motherId}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusControl aid={aid} />
          <MaternityActions aid={aid} />
        </div>
      </div>

      {/* כרטסת המשפחה — כל הפרטים, סדר הדורות וקישור לכרטסת המלאה */}
      {ben && (
        <Card className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-indigo-600">
              <User size={16} />
              <span className="text-xs font-semibold text-slate-500 uppercase">כרטסת המשפחה</span>
            </div>
            <Link
              href={`/admin/beneficiaries/${ben.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              לכרטסת המלאה <ExternalLink size={13} />
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">פרטי הבעל</p>
              <DetailRow label="שם מלא" value={[ben.family_name, ben.full_name].filter(Boolean).join(' ') || '—'} />
              <DetailRow label="ת.ז." value={ben.id_number ?? '—'} ltr />
              <DetailRow label="מצב משפחתי" value={ben.marital_status ?? '—'} />
              <DetailRow label="מספר ילדים" value={String(ben.children_count ?? 0)} />
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
                {ben.spouse_id_number && <DetailRow label="ת.ז." value={ben.spouse_id_number} ltr />}
                {ben.spouse_birth_date && <DetailRow label="תאריך לידה" value={fmtDate(ben.spouse_birth_date)} />}
              </div>
            )}
          </div>

          {(lineagePath.length > 0 || lineageManual.length > 0 || ben.lineage_node_id) && (
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch size={14} className="text-violet-500" />
                <span className="text-xs font-semibold text-slate-500 uppercase">סדר הדורות</span>
              </div>
              {(lineagePath.length > 0 || lineageManual.length > 0) && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {lineagePath.map((name, i) => (
                    <span key={`l-${i}`} className="flex items-center gap-1.5">
                      {i > 0 && <ChevronLeft size={12} className="text-slate-300" />}
                      <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100"><span className="text-violet-400 ml-1">דור {i + 1}</span>{name}</span>
                    </span>
                  ))}
                  {lineageManual.map((name, i) => (
                    <span key={`m-${i}`} className="flex items-center gap-1.5">
                      <ChevronLeft size={12} className="text-slate-300" />
                      <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100"><span className="text-amber-400 ml-1">דור {lineagePath.length + 1 + i}</span>{name}</span>
                    </span>
                  ))}
                </div>
              )}
              {ben.lineage_node_id && (
                <div className="mt-3">
                  <LineageBranchView nodeId={ben.lineage_node_id} />
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* תכתובות מייל עם המשפחה */}
      {ben?.email && (
        <Card className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-indigo-600">
            <Mail size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">תכתובות מייל</span>
            <span className="text-xs text-slate-400 ltr-num" dir="ltr">{ben.email}</span>
          </div>
          <BeneficiaryMailThread email={ben.email} name={motherName} beneficiaryId={ben.id} />
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <Baby size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">פרטי התינוק</span>
          </div>
          <p className="text-sm"><span className="text-slate-500">שם התינוק: </span><span className="font-medium text-slate-800">{aid.baby_name ?? '—'}</span></p>
          {aid.baby_gender && (
            <p className="text-sm">
              <span className="text-slate-500">מין: </span>
              <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${aid.baby_gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                {aid.baby_gender === 'male' ? 'בן' : 'בת'}
              </span>
            </p>
          )}
          <p className="text-sm"><span className="text-slate-500">תאריך לידה: </span><span className="ltr-num font-medium text-slate-800">{fmtDate(aid.birth_date)}</span></p>
          {aid.baby_id_number && (
            <p className="text-sm"><span className="text-slate-500">{aid.baby_id_type === 'passport' ? 'דרכון' : 'ת.ז.'}: </span><span className="ltr-num font-mono text-xs">{aid.baby_id_number}</span></p>
          )}
          {aid.six_weeks_end && (
            <p className="text-sm"><span className="text-slate-500">6 שבועות לאחר הלידה: </span><span className="ltr-num text-indigo-600 font-medium">{fmtDate(aid.six_weeks_end)}</span></p>
          )}
          {aid.six_weeks_end && differenceInCalendarDays(new Date(aid.six_weeks_end), new Date()) > 0 && (
            <p className="text-sm"><span className="text-slate-500">ימים שנותרו: </span><span className="font-medium text-amber-600">{differenceInCalendarDays(new Date(aid.six_weeks_end), new Date())} ימים</span></p>
          )}
        </Card>

        <Card className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-indigo-600 mb-2">
            <CreditCard size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">נדרים קארד</span>
          </div>
          <p className="text-sm"><span className="text-slate-500">מספר כרטיס: </span><span className="ltr-num font-mono text-xs">{aid.card_number ?? '—'}</span></p>
          <p className="text-sm"><span className="text-slate-500">יתרה: </span><span className="text-green-700 font-bold">{fmtCur(aid.card_balance)}</span></p>
          {expiresIn !== null && (
            <p className={`text-xs font-medium mt-1 ${expiresIn <= 7 ? 'text-red-600' : 'text-slate-500'}`}>
              {expiresIn > 0 ? `פג תוקף בעוד ${expiresIn} ימים` : 'תוקף הכרטיס פג'}
            </p>
          )}
          {aid.card_expires_at && (
            <p className="text-xs text-slate-400 ltr-num">
              תאריך פקיעה: {fmtDate(aid.card_expires_at)}
            </p>
          )}

          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
            <span className="text-slate-500 text-sm">סטטוס הטענה:</span>
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${CARD_LOAD_CLS[aid.card_load_status ?? 'idle']}`}>
              {CARD_LOAD_STATUS_LABELS[aid.card_load_status ?? 'idle']}
            </span>
          </div>
          {aid.card_loaded_at && (
            <p className="text-xs text-slate-400 ltr-num">הוטען בתאריך: {fmtDate(aid.card_loaded_at)}</p>
          )}
          {aid.card_unloaded_at && (
            <p className="text-xs text-slate-400 ltr-num">נפרק בתאריך: {fmtDate(aid.card_unloaded_at)}</p>
          )}
          {aid.card_load_status === 'failed' && aid.card_load_error && (
            <p className="text-xs text-red-600">{aid.card_load_error}</p>
          )}

          <LoadCardButton aid={aid} />
        </Card>
      </div>

      {aid.recovery_home && (
        <Card>
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <Home size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">בית החלמה</span>
          </div>
          <div className="text-sm">
            <span className="text-slate-500">שם: </span>{aid.recovery_home}
          </div>
        </Card>
      )}

      {aid.birth_certificate_url && (
        <Card>
          <div className="flex items-center gap-2 text-indigo-600 mb-3">
            <FileText size={16} />
            <span className="text-xs font-semibold text-slate-500 uppercase">אישור לידה</span>
          </div>
          <BirthCertificatePreview aidId={aid.id} beneficiaryId={aid.beneficiary_id} url={aid.birth_certificate_url} />
        </Card>
      )}

      {aid.notes && (
        <Card>
          <h2 className="text-xs font-semibold text-slate-500 uppercase mb-2">הערות</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{aid.notes}</p>
        </Card>
      )}
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
