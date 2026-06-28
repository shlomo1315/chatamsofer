import Link from 'next/link'
import { ArrowRight, Baby, CreditCard, Home, FileText, User, Phone, MapPin, GitBranch, ChevronLeft, ExternalLink, Mail } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import { MaternityAid, Beneficiary } from '@/types'
import Card from '@/components/ui/Card'
import Tabs, { type TabDef } from '@/components/ui/Tabs'
import { StatusControl } from '../MaternityTable'
import FamilyApprovalGate from '@/components/admin/FamilyApprovalGate'
import MaternityActions from './MaternityActions'
import ExtendEligibility from '../ExtendEligibility'
import { docViewUrl } from '@/lib/docUrl'
import BackButton from '@/components/ui/BackButton'
import BirthCertificatePreview from './BirthCertificatePreview'
import LineageBranchView from '@/app/admin/beneficiaries/[id]/LineageBranchView'
import CollapsibleMailThread from './CollapsibleMailThread'
import { format, differenceInCalendarDays } from 'date-fns'
import { he } from 'date-fns/locale'

interface BeneficiaryDoc { doc_type: string; file_url: string | null; file_name: string | null }

async function getAid(id: string): Promise<MaternityAid | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('maternity_aids')
    .select('*, beneficiary:beneficiaries(*), card_center:card_centers(id, name)')
    .eq('id', id)
    .single()
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

async function getBeneficiaryDocs(beneficiaryId: string): Promise<BeneficiaryDoc[]> {
  if (!isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('doc_type, file_url, file_name')
    .eq('beneficiary_id', beneficiaryId)
    .in('doc_type', ['id_husband', 'id_wife'])
    .order('uploaded_at', { ascending: false })
  if (!data) return []
  // מחזיר doc אחד לכל סוג (הכי חדש)
  const seen = new Set<string>()
  return data.filter(d => { if (seen.has(d.doc_type)) return false; seen.add(d.doc_type); return true })
}

// סדר הדורות — נתיב משויך השושלת מהשורש ועד הצומת הנבחר
async function getLineagePath(nodeId?: string | null): Promise<string[]> {
  if (!nodeId || !isSupabaseConfigured()) return []
  const supabase = await createClient()
  const { data, error } = await supabase.from('lineage_nodes').select('id, name, parent_id')
  if (error) throw error
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
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'

export default async function MaternityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const aid = await getAid(id)
  const ben = aid?.beneficiary as Beneficiary | undefined
  const [lineagePath, idDocs] = await Promise.all([
    getLineagePath(ben?.lineage_node_id),
    aid?.beneficiary_id ? getBeneficiaryDocs(aid.beneficiary_id) : Promise.resolve([]),
  ])
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
          <StatusControl aid={aid} advance familyApproved={beneficiary?.eligibility_status === 'approved'} />
          <MaternityActions aid={aid} />
        </div>
      </div>

      {/* שער אישור המשפחה — חוסם אישור לידה לפני אישור המשפחה ומאפשר אישור ישיר (פרטי המשפחה מוצגים בכרטיס למטה) */}
      {ben && <FamilyApprovalGate beneficiary={ben as Parameters<typeof FamilyApprovalGate>[0]['beneficiary']} compact />}

      {/* טאבים מסודרים לכל נתוני התיק */}
      <Tabs tabs={[
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
              {(idDocs.length > 0 || aid.birth_certificate_url) && (
                <div className="pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText size={14} className="text-indigo-500" />
                    <span className="text-xs font-semibold text-slate-500 uppercase">מסמכים</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {idDocs.find(d => d.doc_type === 'id_husband') && (
                      <DocCard label="ת.ז. הבעל" url={idDocs.find(d => d.doc_type === 'id_husband')!.file_url ?? undefined} />
                    )}
                    {idDocs.find(d => d.doc_type === 'id_wife') && (
                      <DocCard label="ת.ז. האישה" url={idDocs.find(d => d.doc_type === 'id_wife')!.file_url ?? undefined} />
                    )}
                    {aid.birth_certificate_url && (
                      <DocCard label="אישור לידה" url={aid.birth_certificate_url} />
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
          ),
        }] : []),
        {
          key: 'baby', label: 'תינוק ולידה', accent: 'violet' as const, icon: <Baby size={15} />,
          content: (
            <div className="flex flex-col gap-4">
              <Card className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-indigo-600 mb-2">
                  <Baby size={16} />
                  <span className="text-xs font-semibold text-slate-500 uppercase">פרטי התינוק</span>
                </div>
                <p className="text-sm"><span className="text-slate-500">שם התינוק: </span><span className="font-medium text-slate-800">{aid.baby_name ?? '—'}</span></p>
                {aid.baby_id_number && (
                  <p className="text-sm"><span className="text-slate-500">{aid.baby_id_type === 'passport' ? 'דרכון' : 'ת.ז'} התינוק: </span><span className="font-medium text-slate-800 ltr-num">{aid.baby_id_number}</span></p>
                )}
                {aid.baby_gender && (
                  <p className="text-sm">
                    <span className="text-slate-500">מין: </span>
                    <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${aid.baby_gender === 'male' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'}`}>
                      {aid.baby_gender === 'male' ? 'בן' : 'בת'}
                    </span>
                  </p>
                )}
                <p className="text-sm"><span className="text-slate-500">תאריך לידה: </span><span className="ltr-num font-medium text-slate-800">{fmtDate(aid.birth_date)}</span></p>
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
                    {/* מספר כרטיס נדרים — או חיווי שטרם בוצע שיוך */}
                    <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                      {cardNum ? (
                        <>
                          <p className="text-sm"><span className="text-slate-500">מספר כרטיס: </span><span className="font-semibold text-slate-800 ltr-num">{cardNum}</span></p>
                          {daysToUnload != null && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {daysToUnload > 0 ? `${daysToUnload} ימים עד לפריקה` : 'הגיע מועד הפריקה'}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="text-sm text-amber-700 font-medium">עדיין לא בוצע שיוך כרטיס</p>
                      )}
                    </div>
                    {aid.card_loaded_at && <p className="text-xs text-slate-400 ltr-num mt-1">נטען בתאריך: {fmtDate(aid.card_loaded_at)}</p>}
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
        ...(aid.recovery_home ? [{
          key: 'recovery', label: 'בית החלמה', accent: 'sky' as const, icon: <Home size={15} />,
          content: (
            <Card>
              <div className="flex items-center gap-2 text-indigo-600 mb-3">
                <Home size={16} />
                <span className="text-xs font-semibold text-slate-500 uppercase">בית החלמה</span>
              </div>
              <div className="text-sm">
                <span className="text-slate-500">שם: </span>{aid.recovery_home}
              </div>
              {aid.recovery_arrived != null && (
                <div className="text-sm mt-2">
                  <span className="text-slate-500">הגעה: </span>
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${aid.recovery_arrived ? 'bg-green-100 text-green-700' : 'bg-rose-100 text-rose-600'}`}>
                    {aid.recovery_arrived ? 'הגיעה' : 'לא הגיעה'}
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
            </Card>
          ),
        }] : []),
        ...(ben?.email ? [{
          key: 'mail', label: 'מיילים', accent: 'amber' as const, icon: <Mail size={15} />,
          content: <CollapsibleMailThread email={ben.email} name={motherName} beneficiaryId={ben.id} />,
        }] : []),
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

function DocCard({ label, url }: { label: string; url?: string }) {
  if (!url) return (
    <div className="flex flex-col items-center gap-1.5 p-3 border border-dashed border-slate-200 rounded-xl bg-slate-50 text-center">
      <FileText size={18} className="text-slate-300" />
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <span className="text-[10px] text-slate-300">לא הועלה</span>
    </div>
  )
  const isImage = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(url)
  const isPdf = /\.pdf(\?|$)/i.test(url)
  const href = docViewUrl(url)
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="flex flex-col gap-2 p-2 border border-slate-200 rounded-xl bg-white hover:border-indigo-300 hover:shadow-sm transition-all group text-center">
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={href} alt={label} className="w-full h-28 object-cover rounded-lg bg-slate-100" />
      ) : isPdf ? (
        <iframe src={`${href}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`} title={label} tabIndex={-1}
          className="w-full h-28 rounded-lg bg-white border-0 pointer-events-none" />
      ) : (
        <div className="w-full h-28 bg-slate-50 border border-slate-100 rounded-lg flex items-center justify-center">
          <FileText size={24} className="text-slate-400" />
        </div>
      )}
      <span className="text-[11px] font-medium text-slate-600 group-hover:text-indigo-600 flex items-center justify-center gap-1">
        {label} <ExternalLink size={10} />
      </span>
    </a>
  )
}
