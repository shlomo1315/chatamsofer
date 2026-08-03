import Link from 'next/link'
import { ArrowRight, Gift, CalendarDays, Pencil } from 'lucide-react'
import { notFound } from 'next/navigation'
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server'
import type { Distribution } from '@/types'
import StatusBadge from '@/components/ui/StatusBadge'
import { format, differenceInYears } from 'date-fns'
import { he } from 'date-fns/locale'
import HolidayRegistrations, { type RegistrationRow } from './HolidayRegistrations'
import type { RegisterSource } from '@/lib/distributionSources'

// ─────────────────────────────────────────────────────────────────────────────
// מסך חלוקת חגים — שלב הרישום.
//
// ⚠️ כל המספרים נגזרים מהשורות עצמן בכל טעינה ואינם נשמרים בשום מקום: הצפי
// התקציבי משתנה בכל רישום חדש, וסיכום שמור היה מציג למנהל נתון מיושן בדיוק
// ברגע שבו הוא בונה עליו תקציב.
// ─────────────────────────────────────────────────────────────────────────────

interface BenRow {
  id: string
  full_name?: string | null
  family_name?: string | null
  spouse_name?: string | null
  id_number?: string | null
  phone?: string | null
  phone2?: string | null
  email?: string | null
  address?: string | null
  city?: string | null
  community_affiliation?: string | null
  children_count?: number | null
  birth_date?: string | null
  spouse_birth_date?: string | null
}

async function getData(id: string) {
  if (!isSupabaseConfigured()) return null
  const supabase = await createClient()
  const [distRes, recRes] = await Promise.all([
    supabase.from('distributions').select('*').eq('id', id).single(),
    supabase
      .from('distribution_recipients')
      .select('id, source, registered_at, phone, notified_at, amount, beneficiary_id, beneficiary:beneficiaries(id, full_name, family_name, spouse_name, id_number, phone, phone2, email, address, city, community_affiliation, children_count, birth_date, spouse_birth_date)')
      .eq('distribution_id', id)
      .order('registered_at', { ascending: false }),
  ])
  if (distRes.error && distRes.error.code !== 'PGRST116' && distRes.error.code !== '22P02') throw distRes.error
  if (!distRes.data) return null

  const rows: RegistrationRow[] = (recRes.data ?? []).map(r => {
    const b = (r as unknown as { beneficiary?: BenRow | null }).beneficiary ?? null
    // גיל — לפי תאריך הלידה של הבעל, ובהיעדרו של האישה
    const dob = b?.birth_date || b?.spouse_birth_date
    let age: number | null = null
    if (dob) {
      try { age = differenceInYears(new Date(), new Date(dob)) } catch { age = null }
    }
    const row = r as unknown as {
      id: string; source?: string | null; registered_at?: string | null; phone?: string | null
      notified_at?: string | null; amount?: number | null; beneficiary_id?: string | null
    }
    return {
      id: String(row.id),
      source: ((row.source ?? 'admin') as RegisterSource),
      registered_at: row.registered_at ?? null,
      phone: row.phone ?? null,
      notified_at: row.notified_at ?? null,
      amount: row.amount ?? null,
      beneficiary_id: row.beneficiary_id ?? null,
      name: [b?.family_name, b?.full_name || b?.spouse_name].filter(Boolean).join(' ') || (b?.full_name ?? 'ללא שם'),
      id_number: b?.id_number ?? null,
      spouse_name: b?.spouse_name ?? null,
      ben_phone: b?.phone || b?.phone2 || null,
      email: b?.email ?? null,
      address: b?.address ?? null,
      city: b?.city ?? null,
      community: b?.community_affiliation ?? null,
      children_count: b?.children_count ?? null,
      age,
    }
  })

  return { distribution: distRes.data as Distribution, rows }
}

const fmtDate = (d?: string) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: he }) : '—'

export default async function DistributionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const data = await getData(id)
  if (!data && isSupabaseConfigured()) notFound()
  if (!data) return <div className="p-8 text-center text-slate-400">הגדר Supabase לצפייה</div>

  const { distribution: d, rows } = data
  const amount = Number(d.amount_per_family ?? 0)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/admin/distributions" className="text-slate-400 hover:text-slate-600 mt-1"><ArrowRight size={20} /></Link>
          <div className="w-11 h-11 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Gift size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2 flex-wrap">
              {d.name}
              {d.year && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">{d.year}</span>}
              <StatusBadge status={d.status} />
            </h1>
            <p className="text-xs text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
              {amount > 0 && <span className="font-bold text-emerald-700 ltr-num">{amount.toLocaleString('he-IL')} ₪ למשפחה</span>}
              {d.distribution_date && <span className="flex items-center gap-1"><CalendarDays size={12} />{fmtDate(d.distribution_date)}</span>}
              {d.description && <span>{d.description}</span>}
            </p>
          </div>
        </div>
        <Link href={`/admin/distributions/${d.id}/edit`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700">
          <Pencil size={14} /> עריכת החלוקה
        </Link>
      </div>

      {amount <= 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] font-bold text-amber-900">
          לא הוגדר סכום למשפחה — הצפי התקציבי יוצג כאפס. יש להזין את הסכום בעריכת החלוקה.
        </div>
      )}

      <HolidayRegistrations
        distributionId={d.id}
        rows={rows}
        amountPerFamily={amount}
        registrationOpen={d.registration_open === true}
        distributionName={`${d.name}${d.year ? ` ${d.year}` : ''}`}
      />
    </div>
  )
}
