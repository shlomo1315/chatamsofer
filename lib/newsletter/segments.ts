import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMergeData, type MergeSource } from './merge'
import { suppressionSet } from '../unsubscribe'

// ─────────────────────────────────────────────────────────────────────────────
// בונה הקהל.
//
// הערה חשובה על צאצאים: לילדים אין כתובת מייל משלהם (הם רשומות JSON בתוך
// beneficiaries.children). לכן "קהל צאצאים" מתורגם ל"מוטבים שיש להם ילד
// בטווח גילים מסוים".
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentSource = 'beneficiaries' | 'staff' | 'recovery_homes' | 'contact_list'

export interface SegmentDef {
  source: SegmentSource
  // מסננים (רלוונטיים ל-beneficiaries)
  eligibilityStatus?: string[]     // pending | approved | rejected | review | docs_pending
  isActive?: boolean
  city?: string[]
  maritalStatus?: string[]
  gender?: 'male' | 'female'
  communityAffiliation?: string    // טקסט חופשי — מסונן ב-ILIKE
  minChildren?: number
  maxChildren?: number
  childAgeFrom?: number            // "יש ילד בגיל X עד Y"
  childAgeTo?: number
  updateTopics?: string[]          // past_benefits.update_topics
  hasLoan?: boolean
  hadMaternity?: boolean
  // רשימה חיצונית
  contactListId?: string

  // ── עריכה ידנית של הרשימה שהתקבלה מהמסננים ──
  // excluded: כתובות שהוסרו ידנית (סימון ומחיקה מהרשימה)
  // manual:   כתובות שנוספו ידנית, גם אם אינן עונות על המסננים
  excluded?: string[]
  manual?: { email: string; name?: string }[]
}

export interface Recipient {
  email: string
  beneficiaryId: string | null
  mergeData: Record<string, string>
}

interface BeneficiaryRow extends MergeSource {
  id: string
  email?: string | null
  is_active?: boolean | null
  eligibility_status?: string | null
  gender?: string | null
  community_affiliation?: string | null
  children?: { birth_date?: string | null }[] | null
  past_benefits?: { update_topics?: string[] } | null
}

const AGE_MS = 365.25 * 24 * 60 * 60 * 1000

function ageOf(birthDate?: string | null): number | null {
  if (!birthDate) return null
  const t = new Date(birthDate).getTime()
  if (isNaN(t)) return null
  return (Date.now() - t) / AGE_MS
}

/**
 * מממש סגמנט לרשימת נמענים.
 * מסנן אוטומטית: כתובות חסרות/לא תקינות, כפילויות, ומי שהוסר מרשימת התפוצה.
 */
export interface SegmentStats {
  total: number
  noEmail: number
  suppressed: number
  excluded: number
}

export async function resolveSegment(
  db: SupabaseClient,
  def: SegmentDef,
): Promise<{ recipients: Recipient[]; stats: SegmentStats }> {
  const suppressed = await suppressionSet(db)

  let rows: { email: string; beneficiaryId: string | null; src: MergeSource }[] = []
  let noEmail = 0

  if (def.source === 'staff') {
    const { data } = await db.from('profiles').select('email, full_name').eq('is_active', true)
    rows = (data ?? [])
      .filter(p => p.email)
      .map(p => ({ email: String(p.email), beneficiaryId: null, src: { full_name: p.full_name } }))

  } else if (def.source === 'recovery_homes') {
    const { data } = await db.from('recovery_homes').select('name, report_email')
    rows = (data ?? [])
      .filter(h => h.report_email)
      .map(h => ({ email: String(h.report_email), beneficiaryId: null, src: { full_name: h.name } }))

  } else if (def.source === 'contact_list' && def.contactListId) {
    const { data } = await db.from('contacts').select('email, data').eq('list_id', def.contactListId)
    rows = (data ?? []).map(c => ({
      email: String(c.email),
      beneficiaryId: null,
      src: (c.data ?? {}) as MergeSource,
    }))

  } else {
    // ── מוטבים — המקור העיקרי ──
    let q = db.from('beneficiaries').select(
      'id, email, family_name, full_name, spouse_name, marital_status, city, children_count, children, gender, eligibility_status, is_active, community_affiliation, past_benefits',
    )

    if (def.isActive !== undefined) q = q.eq('is_active', def.isActive)
    if (def.eligibilityStatus?.length) q = q.in('eligibility_status', def.eligibilityStatus)
    if (def.city?.length) q = q.in('city', def.city)
    if (def.maritalStatus?.length) q = q.in('marital_status', def.maritalStatus)
    if (def.gender) q = q.eq('gender', def.gender)
    if (def.minChildren != null) q = q.gte('children_count', def.minChildren)
    if (def.maxChildren != null) q = q.lte('children_count', def.maxChildren)
    // community_affiliation הוא טקסט חופשי (לא enum) — לכן ILIKE ולא שוויון
    if (def.communityAffiliation) q = q.ilike('community_affiliation', `%${def.communityAffiliation}%`)

    const { data } = await q
    let list = (data ?? []) as BeneficiaryRow[]

    // סינון בזיכרון — דברים ש-PostgREST לא יודע לעשות על JSON
    if (def.childAgeFrom != null || def.childAgeTo != null) {
      const from = def.childAgeFrom ?? 0
      const to = def.childAgeTo ?? 200
      list = list.filter(b =>
        (b.children ?? []).some(c => {
          const age = ageOf(c.birth_date)
          return age != null && age >= from && age <= to
        }),
      )
    }

    if (def.updateTopics?.length) {
      list = list.filter(b => {
        const topics = b.past_benefits?.update_topics ?? []
        return def.updateTopics!.some(t => topics.includes(t))
      })
    }

    // joins — יש הלוואה פעילה / קיבל עזר יולדות
    if (def.hasLoan) {
      const { data: loans } = await db.from('loans')
        .select('beneficiary_id').in('status', ['approved', 'active'])
      const ids = new Set((loans ?? []).map(l => String(l.beneficiary_id)))
      list = list.filter(b => ids.has(b.id))
    }

    if (def.hadMaternity) {
      const { data: aids } = await db.from('maternity_aids').select('beneficiary_id')
      const ids = new Set((aids ?? []).map(a => String(a.beneficiary_id)))
      list = list.filter(b => ids.has(b.id))
    }

    noEmail = list.filter(b => !b.email?.trim()).length
    rows = list
      .filter(b => b.email?.trim())
      .map(b => ({ email: String(b.email).trim(), beneficiaryId: b.id, src: b }))
  }

  // ── תוספות ידניות — נכנסות גם אם אינן עונות על המסננים ──
  for (const m of def.manual ?? []) {
    const email = String(m.email ?? '').toLowerCase().trim()
    if (email.includes('@')) {
      rows.push({
        email,
        beneficiaryId: null,
        src: { family_name: m.name ?? '', full_name: '' },
      })
    }
  }

  // כתובות שהוסרו ידנית מהרשימה
  const excluded = new Set((def.excluded ?? []).map(e => e.toLowerCase().trim()))

  // דה-דופליקציה + סינון suppression + ולידציית כתובת
  const seen = new Set<string>()
  const recipients: Recipient[] = []
  let suppressedCount = 0
  let excludedCount = 0

  for (const r of rows) {
    const email = r.email.toLowerCase().trim()
    if (!email.includes('@')) { noEmail++; continue }
    if (seen.has(email)) continue
    seen.add(email)

    // הסרה מרשימת תפוצה — לא ניתן לעקוף, גם לא בתוספת ידנית
    if (suppressed.has(email)) { suppressedCount++; continue }

    // הוסר ידנית ע"י המשתמש
    if (excluded.has(email)) { excludedCount++; continue }

    recipients.push({
      email,
      beneficiaryId: r.beneficiaryId,
      // הסנאפשוט — קישור ההסרה מתווסף בזמן השליחה (הוא תלוי בקמפיין)
      mergeData: buildMergeData(r.src),
    })
  }

  return {
    recipients,
    stats: {
      total: recipients.length,
      noEmail,
      suppressed: suppressedCount,
      excluded: excludedCount,
    },
  }
}
