import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { maybeMarkDocsReturned } from '@/lib/docsReturnCheck'

export const dynamic = 'force-dynamic'

const MAX_CHAIN = 15
const MAX_NAME = 120

type ChainEntry = { generation: number; name: string; relation: 'son' | 'son_in_law' | null }

// מעגל תיקונים: הצאצא מגיש שרשרת דורות מתוקנת מהפורטל (אחרי שהמזכירות סימנה
// שעץ הדורות דרוש תיקון). המבנה זהה לזה של ההרשמה: עוגן מאומת + דורות חדשים
// שנכנסים לעץ בסטטוס "ממתין לאימות". השרשרת הישנה נשמרת פעם אחת ב-
// lineage_chain_before_fix כדי שהמזכירות תוכל להשוות ישן מול חדש.
export async function POST(request: NextRequest) {
  if (!rateLimit(`fix-lineage:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  let body: {
    beneficiary_id?: string
    lineage_node_id?: string
    lineage_manual?: string[]
    lineage_chain?: ChainEntry[]
    lineage_new_nodes?: { name?: string; relation?: string }[]
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const beneficiaryId = body.beneficiary_id
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה צאצא' }, { status: 400 })

  // אימות בעלות: רק בעל הסשן בפורטל רשאי לתקן את הדורות של התיק שלו (מניעת IDOR)
  const sessionBeneficiaryId = getPortalBeneficiaryId(request)
  if (!sessionBeneficiaryId || sessionBeneficiaryId !== beneficiaryId) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  // ולידציה של השרשרת שנשלחה
  const chain = Array.isArray(body.lineage_chain) ? body.lineage_chain : []
  if (!chain.length || chain.length > MAX_CHAIN) {
    return NextResponse.json({ error: 'שרשרת דורות לא תקינה' }, { status: 400 })
  }
  for (const c of chain) {
    if (typeof c?.name !== 'string' || !c.name.trim() || c.name.length > MAX_NAME || typeof c?.generation !== 'number') {
      return NextResponse.json({ error: 'שרשרת דורות לא תקינה' }, { status: 400 })
    }
    if (c.relation != null && c.relation !== 'son' && c.relation !== 'son_in_law') {
      return NextResponse.json({ error: 'שרשרת דורות לא תקינה' }, { status: 400 })
    }
  }

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status, lineage_fix_required, lineage_chain, lineage_chain_before_fix')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'צאצא לא נמצא' }, { status: 404 })
  if (ben.eligibility_status !== 'docs_pending' || !ben.lineage_fix_required) {
    return NextResponse.json({ error: 'לא התבקש תיקון דורות' }, { status: 400 })
  }

  // הדורות החדשים נשרשרים תחת הצומת המאומת שנבחר, בסטטוס "ממתין לאימות" —
  // אותה התנהגות כמו בהרשמה (public-register): שם שכבר מאומת תחת אותו אב
  // ממוחזר במקום ליצור כפילות ממתינה.
  let lastNodeId: string | null = body.lineage_node_id ? String(body.lineage_node_id) : null
  try {
    const newNodes = Array.isArray(body.lineage_new_nodes) ? body.lineage_new_nodes : []
    if (lastNodeId && newNodes.length) {
      const { data: sel } = await admin.from('lineage_nodes').select('id, generation').eq('id', lastNodeId).maybeSingle()
      if (!sel) return NextResponse.json({ error: 'הצומת שנבחר בעץ לא נמצא' }, { status: 400 })
      let parentId: string = sel.id
      let gen: number = sel.generation as number
      let lastId: string = sel.id
      for (const n of newNodes) {
        const nm = (n?.name ?? '').toString().trim().replace(/\s+/g, ' ')
        if (!nm || nm.length > MAX_NAME) continue
        gen += 1
        const rel = n?.relation === 'son' || n?.relation === 'son_in_law' ? n.relation : null
        const { data: existing } = await admin.from('lineage_nodes')
          .select('id, generation').eq('parent_id', parentId).eq('status', 'verified').ilike('name', nm).limit(1).maybeSingle()
        if (existing?.id) { parentId = existing.id; lastId = existing.id; gen = (existing.generation as number) ?? gen; continue }
        const { data: node } = await admin.from('lineage_nodes')
          .insert({ name: nm, parent_id: parentId, generation: gen, relation: rel, status: 'pending' })
          .select('id').single()
        if (node?.id) { parentId = node.id; lastId = node.id }
      }
      lastNodeId = lastId
    }
  } catch (e) {
    console.error('[fix-lineage] lineage nodes insert failed:', e)
    return NextResponse.json({ error: 'שגיאה בעדכון עץ הדורות. אנא נסה שוב.' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error: upErr } = await admin
    .from('beneficiaries')
    .update({
      // ה-snapshot נשמר רק בפעם הראשונה — סבבי תיקון חוזרים לא דורסים את המקור
      ...(ben.lineage_chain_before_fix == null ? { lineage_chain_before_fix: ben.lineage_chain ?? [] } : {}),
      lineage_node_id: lastNodeId,
      lineage_chain: chain,
      lineage_manual: Array.isArray(body.lineage_manual) ? body.lineage_manual : [],
      lineage_fixed_at: now,
      updated_at: now,
    })
    .eq('id', beneficiaryId)
  if (upErr) {
    console.error('[fix-lineage] beneficiary update failed:', upErr.message)
    return NextResponse.json({ error: 'שגיאה בשמירת התיקון. אנא נסה שוב.' }, { status: 500 })
  }

  const returned = await maybeMarkDocsReturned(admin, beneficiaryId)
  return NextResponse.json({ ok: true, returned })
}
