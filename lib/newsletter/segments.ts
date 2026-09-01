import type { SupabaseClient } from '@supabase/supabase-js'
import { buildMergeData, type MergeSource } from './merge'
import { suppressionSet } from '../unsubscribe'
import { fetchAllRows } from '../fetchAllRows'
import { joinOne } from '../joinOne'

// ─────────────────────────────────────────────────────────────────────────────
// בונה הקהל.
//
// הערה חשובה על צאצאים: לילדים אין כתובת מייל משלהם (הם רשומות JSON בתוך
// beneficiaries.children). לכן "קהל צאצאים" מתורגם ל"מוטבים שיש להם ילד
// בטווח גילים מסוים".
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentSource = 'beneficiaries' | 'staff' | 'recovery_homes' | 'contact_list' | 'distribution'

/**
 * מצבי הנרשמים בחלוקת חגים.
 *
 * ⚠️ הסמנטיקה זהה לשאר המסננים (סטטוס זכאות, מצב משפחתי): ריבוי ערכים
 * *באותה* קטגוריה הוא איחוד — "בחר מוקד או טרם בחר" = שניהם. בין קטגוריות
 * שונות זו הצטלבות — "בחר מוקד" + "מאושר" = גם וגם. כך זה עובד בצאצאים,
 * וסמנטיקה אחרת כאן הייתה מפתיעה בדיוק במקום שבו טעות עולה בשליחה שגויה.
 */
export type DistributionCenterState = 'has_center' | 'no_center'
export type DistributionLoadState = 'loaded' | 'not_loaded'

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

  // ── חלוקת חגים ──
  // ⚠️ כל קטגוריה מסננת בנפרד, וריקה = בלי סינון (כל הנרשמים).
  distributionId?: string
  distCenterState?: DistributionCenterState[]  // בחר מוקד / טרם בחר
  distApproval?: string[]                      // approved | pending | rejected
  distLoadState?: DistributionLoadState[]      // נטען / טרם נטען
  distCenterIds?: string[]                     // מוקדים מסוימים
  distCity?: string[]                          // עיר המשפחה

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

/**
 * שורת רישום לחלוקה, עם המשפחה שממנה נלקח המייל.
 *
 * 🔴 beneficiary הוא מערך *או* אובייקט — Supabase מחזיר join מקונן בשתי
 * הצורות, וגישה ישירה לשדה על מערך מחזירה undefined בשקט. זו בדיוק
 * המלכודת שהסתירה את מוקדי החלוקה מהטבלה. לכן joinOne בכל קריאה.
 */
interface DistRegRow {
  id: string
  center_id?: string | null
  approval_status?: string | null
  load_status?: string | null
  beneficiary?: BeneficiaryRow | BeneficiaryRow[] | null
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
    const { rows: data } = await fetchAllRows<{ email: string | null; full_name: string | null }>(
      (from, to) => db.from('profiles').select('email, full_name').eq('is_active', true).range(from, to))
    rows = (data ?? [])
      .filter(p => p.email)
      .map(p => ({ email: String(p.email), beneficiaryId: null, src: { full_name: p.full_name } }))

  } else if (def.source === 'recovery_homes') {
    const { rows: data } = await fetchAllRows<{ name: string | null; report_email: string | null }>(
      (from, to) => db.from('recovery_homes').select('name, report_email').range(from, to))
    rows = (data ?? [])
      .filter(h => h.report_email)
      .map(h => ({ email: String(h.report_email), beneficiaryId: null, src: { full_name: h.name } }))

  } else if (def.source === 'distribution' && def.distributionId) {
    // ── נרשמי חלוקת חגים ──
    //
    // 🔴 המייל מגיע מהמשפחה (beneficiaries) ולא מהרישום: לרישום עצמו אין
    // כתובת. לכן join, ומכאן גם שמשפחה בלי מייל נספרת ב-noEmail כרגיל.
    //
    // ⚠️ fetchAllRows ולא await: 6,051 נרשמים בחלוקה אחת — הרבה מעבר
    // לתקרת ה-1,000 ששלחה את הניוזלטר ל-15% מהרשימה.
    const { rows: regs } = await fetchAllRows<DistRegRow>((from, to) => db
      .from('distribution_recipients')
      .select('id, center_id, approval_status, load_status, beneficiary:beneficiaries(id, email, family_name, full_name, spouse_name, marital_status, city, address, phone, phone2, id_number, children_count, children, gender, eligibility_status, is_active, community_affiliation, past_benefits)')
      .eq('distribution_id', def.distributionId!)
      .range(from, to))

    let list = regs

    // ⚠️ ריק = בלי סינון. ריבוי ערכים באותה קטגוריה הוא איחוד.
    if (def.distCenterState?.length) {
      const wantHas = def.distCenterState.includes('has_center')
      const wantNo = def.distCenterState.includes('no_center')
      list = list.filter(r => (r.center_id ? wantHas : wantNo))
    }
    if (def.distApproval?.length) {
      const want = new Set(def.distApproval)
      list = list.filter(r => want.has(r.approval_status ?? 'pending'))
    }
    if (def.distLoadState?.length) {
      const wantLoaded = def.distLoadState.includes('loaded')
      const wantNot = def.distLoadState.includes('not_loaded')
      list = list.filter(r => (r.load_status === 'loaded' ? wantLoaded : wantNot))
    }
    if (def.distCenterIds?.length) {
      const want = new Set(def.distCenterIds)
      list = list.filter(r => r.center_id && want.has(r.center_id))
    }
    if (def.distCity?.length) {
      const want = new Set(def.distCity)
      list = list.filter(r => want.has((joinOne(r.beneficiary)?.city ?? '').trim()))
    }

    const bens = list
      .map(r => joinOne(r.beneficiary))
      .filter((b): b is BeneficiaryRow => !!b)

    noEmail = bens.filter(b => !b.email?.trim()).length
    rows = bens
      .filter(b => b.email?.trim())
      .map(b => ({ email: String(b.email).trim(), beneficiaryId: b.id, src: b }))

  } else if (def.source === 'contact_list' && def.contactListId) {
    const { rows: data } = await fetchAllRows<{ email: string; data: unknown }>(
      (from, to) => db.from('contacts').select('email, data').eq('list_id', def.contactListId!).range(from, to))
    rows = (data ?? []).map(c => ({
      email: String(c.email),
      beneficiaryId: null,
      src: (c.data ?? {}) as MergeSource,
    }))

  } else {
    // ── מוטבים — המקור העיקרי ──
    // 🔴 השאילתה נבנית מחדש בכל דף, ולא פעם אחת מחוץ ללולאה.
    //
    // ⚠️ אובייקט שאילתה של supabase-js הוא בר-שימוש *חד-פעמי*: קריאה
    // חוזרת ל-.range() על אותו אובייקט מוסיפה תנאי במקום להחליפו, ולכן
    // הדפים אינם דפים. כך בדיוק הוצגו 954 נמענים במקום 6,615 — אחרי
    // שהתקרה כבר "תוקנה". פונקציה שבונה מאפס היא הדפוס היחיד שעובד
    // (ראו app/api/admin/distributions/[id]/rows/route.ts).
    const page = (from: number, to: number) => {
      let q = db.from('beneficiaries').select(
        'id, email, family_name, full_name, spouse_name, marital_status, city, address, phone, phone2, id_number, children_count, children, gender, eligibility_status, is_active, community_affiliation, past_benefits',
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
      // ⚠️ סדר יציב חובה בשליפה בדפים: בלעדיו PostgREST רשאי להחזיר
      // שורות בסדר שונה בכל דף, וחלק מהשורות יופיעו פעמיים או ייעלמו.
      return q.order('id', { ascending: true }).range(from, to)
    }

    const { rows: allBens } = await fetchAllRows<BeneficiaryRow>(page)
    let list = allBens

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
      const { rows: loans } = await fetchAllRows<{ beneficiary_id: string }>((from, to) => db.from('loans')
        .select('beneficiary_id').in('status', ['approved', 'active']).range(from, to))
      const ids = new Set((loans ?? []).map(l => String(l.beneficiary_id)))
      list = list.filter(b => ids.has(b.id))
    }

    if (def.hadMaternity) {
      const { rows: aids } = await fetchAllRows<{ beneficiary_id: string }>(
        (from, to) => db.from('maternity_aids').select('beneficiary_id').range(from, to))
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
