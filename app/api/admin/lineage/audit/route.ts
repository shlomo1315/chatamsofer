import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, forbidden } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { normalizeName, husbandName } from '@/lib/lineageChainDiff'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// ביקורת תקינות של עץ הדורות — בדיקה שיטתית במקום מקרה-מקרה.
//
// 🔴 מה שהוביל לזה: משתמש הצביע על משפחה שבה דור 3 רשום
// "רבי אברהם שמואל בנימין ורחל פריי" — כלומר החתן קיבל את שמו של *חותנו*
// (הכתב סופר). החתן האמיתי, "רבי יצחק צבי פריי", קיים בעץ אבל מסומן
// כ'ממתין', בעוד הרשומה השגויה מסומנת 'מאושר'.
//
// הבדיקה גילתה שזה לא מקרה בודד: מתוך 357 הצמתים ה"מאושרים", **211 (59%)
// נוצרו בייבוא של 16.06.2026 שסימן אותם verified אוטומטית ובלי relation**
// (בן/חתן). כלומר רוב מה שנראה "מאושר" בעץ מעולם לא אושר בפועל — הוא רק
// הגיע כך מקובץ הייבוא. תלויים בהם 1,154 צמתים.
//
// הבדיקות כאן רצות על כל העץ ומחזירות רשימות קונקרטיות לטיפול.
// ─────────────────────────────────────────────────────────────────────────────

function getAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

interface Row {
  id: string; name: string; parent_id: string | null; generation: number
  status: string | null; relation: string | null; created_at: string
}

/** סוגי הממצאים. ⚠️ מקור אמת יחיד — גם הממשק קורא מכאן. */
export const AUDIT_KINDS = {
  approved_no_relation: {
    title: 'מאושר בלי סוג קשר',
    why: 'הצומת מסומן מאושר אך לא צוין אם הוא בן או חתן. רובם הגיעו מייבוא שסימן אותם מאושרים אוטומטית — כלומר איש לא אישר אותם בפועל.',
    severity: 'high' as const,
  },
  same_name_as_parent: {
    title: 'שם זהה לאב',
    why: 'שם הילד זהה לשם אביו. לרוב זה חתן שקיבל בטעות את שם החותן, או רשומה שנוצרה פעמיים.',
    severity: 'high' as const,
  },
  duplicate_siblings: {
    title: 'אחים בעלי אותו שם',
    why: 'שני ילדים של אותו אב עם שם זהה — כמעט תמיד אותו אדם שנרשם פעמיים.',
    severity: 'high' as const,
  },
  generation_gap: {
    title: 'קפיצת דורות',
    why: 'דור הילד אינו דור האב ועוד אחד — שרשרת הייחוס שבורה.',
    severity: 'high' as const,
  },
  orphan_parent: {
    title: 'אב שאינו קיים',
    why: 'הצומת מצביע על אב שנמחק. הענף מנותק מהעץ.',
    severity: 'high' as const,
  },
  cycle: {
    title: 'לולאה בעץ',
    why: 'הצומת הוא צאצא של עצמו — מצב בלתי אפשרי שנוצר ממיזוג שגוי.',
    severity: 'high' as const,
  },
  approved_under_pending: {
    title: 'מאושר תחת אב שאינו מאושר',
    why: 'לא ייתכן שדור מאושר בעוד אביו לא — השרשרת אינה שלמה.',
    severity: 'medium' as const,
  },
}

export type AuditKind = keyof typeof AUDIT_KINDS

export async function GET() {
  if (!(await requirePermission('lineage', 'view'))) return forbidden()
  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })

  // ⚠️ שליפה בדפים — העץ מכיל 10,500+ צמתים ו-.limit() אינו עוקף את
  // db-max-rows=1000. ראו lib/fetchAllRows.
  const { rows: nodes } = await fetchAllRows<Row>((from, to) =>
    admin.from('lineage_nodes')
      .select('id, name, parent_id, generation, status, relation, created_at')
      .range(from, to),
  )
  const { rows: bens } = await fetchAllRows<{ lineage_node_id: string | null }>((from, to) =>
    admin.from('beneficiaries').select('lineage_node_id').not('lineage_node_id', 'is', null).range(from, to),
  )
  const famCount = new Map<string, number>()
  for (const b of bens) {
    if (!b.lineage_node_id) continue
    famCount.set(b.lineage_node_id, (famCount.get(b.lineage_node_id) ?? 0) + 1)
  }

  const byId = new Map(nodes.map(n => [n.id, n]))
  const kids = new Map<string, Row[]>()
  for (const n of nodes) {
    if (!n.parent_id) continue
    const l = kids.get(n.parent_id)
    if (l) l.push(n); else kids.set(n.parent_id, [n])
  }
  const st = (n: Row) => (n.status === 'verified' || n.status === 'rejected' ? n.status : 'pending')

  /** כמה צמתים תלויים בצומת (כל תת-העץ) — מדד ההשפעה של הממצא. */
  const subtreeSize = (id: string): number => {
    let n = 0
    const stack = [id]
    const seen = new Set<string>()
    while (stack.length) {
      const cur = stack.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      for (const c of kids.get(cur) ?? []) { n++; stack.push(c.id) }
    }
    return n
  }

  const findings: {
    kind: AuditKind; nodeId: string; name: string; generation: number
    status: string; detail: string; families: number; descendants: number
  }[] = []

  const push = (kind: AuditKind, n: Row, detail: string) => findings.push({
    kind, nodeId: n.id, name: n.name, generation: n.generation,
    status: st(n), detail,
    families: famCount.get(n.id) ?? 0,
    descendants: subtreeSize(n.id),
  })

  for (const n of nodes) {
    const parent = n.parent_id ? byId.get(n.parent_id) : null

    // 🔴 הממצא המרכזי — ראו ההערה בראש הקובץ.
    if (st(n) === 'verified' && !n.relation && n.parent_id) {
      push('approved_no_relation', n, `נוצר ב-${n.created_at.slice(0, 10)}`)
    }

    if (n.parent_id && !parent) push('orphan_parent', n, 'האב אינו קיים בעץ')
    if (n.parent_id === n.id) push('cycle', n, 'הצומת הוא האב של עצמו')

    if (parent) {
      if (n.generation !== parent.generation + 1) {
        push('generation_gap', n, `דור ${n.generation} תחת אב בדור ${parent.generation}`)
      }
      // ⚠️ ההשוואה על *שם הבעל*: 79% מהצמתים כתובים "רבי X ומרת Y", ושם
      // האישה שונה בין אב לבן גם כשמדובר בטעות של העתקת שם החותן.
      if (husbandName(n.name) && husbandName(n.name) === husbandName(parent.name)) {
        push('same_name_as_parent', n, `זהה לאב: ${parent.name}`)
      }
      if (st(n) === 'verified' && st(parent) !== 'verified') {
        push('approved_under_pending', n, `האב "${parent.name}" בסטטוס ${st(parent) === 'pending' ? 'ממתין' : 'נדחה'}`)
      }
    }
  }

  // אחים בעלי שם זהה
  for (const [pid, list] of kids) {
    const seen = new Map<string, Row>()
    for (const c of list) {
      const key = normalizeName(c.name)
      if (!key) continue
      const first = seen.get(key)
      if (first) {
        push('duplicate_siblings', c, `זהה לאח: ${first.name}${byId.get(pid) ? ` (תחת ${byId.get(pid)!.name})` : ''}`)
      } else seen.set(key, c)
    }
  }

  // ── סיכום לפי סוג ──
  const summary = (Object.keys(AUDIT_KINDS) as AuditKind[]).map(kind => ({
    kind,
    ...AUDIT_KINDS[kind],
    count: findings.filter(f => f.kind === kind).length,
  }))

  // 🔴 ממוין לפי השפעה: ממצא שתלויים בו 1,000 צמתים חמור מממצא בודד.
  findings.sort((a, b) =>
    (b.families * 10 + b.descendants) - (a.families * 10 + a.descendants))

  return NextResponse.json({
    checkedNodes: nodes.length,
    totalFindings: findings.length,
    summary,
    findings: findings.slice(0, 500),
  })
}
