import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { verifyPortalToken } from '@/lib/portalSession'
import { getAdminClient } from '@/lib/govData'
import type { Beneficiary } from '@/types'
import AidWizard, { type AidPrefill } from './AidWizard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'בקשת סיוע | איגוד צאצאי החתם סופר',
  description: 'טופס בקשת סיוע ממחלקת הסיוע: סיוע רפואי, אלמנות, יתומים ומצוקה כלכלית. ממלאים פעם אחת ומצרפים מסמכים.',
}

// צאצא שמחובר לאזור האישי מקבל את הפרטים מהכרטיס. בלי סשן: טופס מלא כמו בקישור.
async function loadPrefill(): Promise<{ who: string; prefill: AidPrefill } | null> {
  const id = verifyPortalToken((await cookies()).get('pb_session')?.value)
  const admin = id ? getAdminClient() : null
  if (!id || !admin) return null
  const { data } = await admin.from('beneficiaries').select('*').eq('id', id).maybeSingle()
  const b = data as Beneficiary | null
  if (!b) return null
  const s = (v?: string | null) => v ?? ''
  return {
    who: `${s(b.full_name)} ${s(b.family_name)}`.trim(),
    prefill: {
      first: s(b.full_name), last: s(b.family_name), id: s(b.id_number), birth: s(b.birth_date).slice(0, 10),
      phone: s(b.phone), phone2: s(b.phone2), email: s(b.email), marital: s(b.marital_status),
      address: s(b.address), city: s(b.city),
      wife: { name: s(b.spouse_name), id: s(b.spouse_id_number), birth: s(b.spouse_birth_date).slice(0, 10), phone: s(b.spouse_phone) },
    },
  }
}

export default async function Page() {
  const r = await loadPrefill()
  return <AidWizard who={r?.who} prefill={r?.prefill} />
}
