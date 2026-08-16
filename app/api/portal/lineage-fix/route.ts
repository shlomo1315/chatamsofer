// ─────────────────────────────────────────────────────────────────────────────
// בקשת תיקון סדר הדורות — מהאזור האישי.
//
// 🔴 מסלול נפרד מ-/api/public/lineage-review/suggest: שם ההרשאה היא טוקן
// שהמזכירות שולחת ביוזמתה (lineage_share_invites), וכאן היא סשן הפורטל.
// צאצא שראה טעות בייחוס שלו לא יכול היה להודיע עליה אלא אם המשרד פנה
// אליו קודם — והייחוס הוא מה שקובע זכאות.
//
// ⚠️ אינו נוגע בעץ: ההצעה נכנסת ל-lineage_review_suggestions וממתינה
// לאישור המנהל, בדיוק כמו הצעה שמגיעה מקישור. עריכה ישירה בידי המבקש
// הייתה עוקפת את הבדיקה שכל הייחוס נשען עליה.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { validateFixRequest, cleanFixText } from '@/lib/lineageFixRequest'
import { rateLimit, clientIp } from '@/lib/rateLimit'

export const dynamic = 'force-dynamic'

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const beneficiaryId = getPortalBeneficiaryId(request)
  if (!beneficiaryId) {
    return NextResponse.json({ error: 'נדרש אימות מחדש' }, { status: 401 })
  }

  // ⚠️ מגבלה לפי כתובת: הטופס פתוח לכל מי שמחובר, ובלי המגבלה אפשר
  // להציף את תיבת ההצעות של המנהל בלחיצות חוזרות.
  if (!rateLimit(`lineage-fix:${clientIp(request)}`, 5, 60_000)) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד דקה' }, { status: 429 })
  }

  interface ChainRow { generation?: unknown; name?: unknown; relation?: unknown }
  let body: { text?: unknown; chain?: unknown }
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  // 🔴 שרשרת דורות מובנית — המסלול המועדף.
  //
  // ⚠️ עד כה התקבל טקסט חופשי בלבד ("בדור 4 השם צריך להיות..."), והמנהל
  // נדרש לפענח מהמלל מה בדיוק לשנות ולהקליד זאת בעצמו. עכשיו המבקש עורך
  // את הדורות באותו רכיב שבו הוא מילא אותם בהרשמה, וההצעה מגיעה מפורשת.
  //
  // ⚠️ הטקסט החופשי נשאר נתמך: הוא הדרך היחידה לתאר בעיה שאינה "שם שגוי
  // בדור מסוים" (למשל ספק לגבי ענף שלם), והוא גם התאימות לאחור.
  const rawChain = Array.isArray(body.chain) ? (body.chain as ChainRow[]) : null
  const MAX_CHAIN = 15
  const MAX_NAME = 120

  let chain: { generation: number; name: string; relation: string | null }[] | null = null
  if (rawChain?.length) {
    if (rawChain.length > MAX_CHAIN) {
      return NextResponse.json({ error: 'שרשרת הדורות ארוכה מדי' }, { status: 400 })
    }
    chain = rawChain.map((r, i) => ({
      generation: Number(r?.generation) || i + 1,
      name: String(r?.name ?? '').trim().slice(0, MAX_NAME),
      relation: r?.relation === 'son' || r?.relation === 'son_in_law' ? String(r.relation) : null,
    }))
    if (chain.some(r => !r.name)) {
      return NextResponse.json({ error: 'יש דור ללא שם' }, { status: 400 })
    }
  }

  // ⚠️ הטקסט נדרש רק כשאין שרשרת: אחרת ההצעה כבר מפורשת, ואילוץ הסבר
  // בן 10 תווים היה חוסם שליחה תקינה לגמרי.
  const text = chain ? String(body.text ?? '').trim().slice(0, 1000) : cleanFixText(body.text)
  if (!chain) {
    const invalid = validateFixRequest(body.text)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
  }

  const admin = getAdmin()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const { data: ben } = await admin
    .from('beneficiaries')
    .select('id, full_name, family_name, lineage_node_id, lineage_chain')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (!ben) return NextResponse.json({ error: 'לא נמצאה כרטסת' }, { status: 404 })

  const who = [ben.family_name, ben.full_name].filter(Boolean).join(' ')

  // סיכום קריא לתיבת ההצעות של המנהל, שמציגה את payload.text כמחרוזת.
  const REL = (r: string | null) => r === 'son_in_law' ? 'חתן' : r === 'son' ? 'בן' : ''
  const summary = chain
    ? `בקשת תיקון סדר הדורות מהאזור האישי — ${who}:\n\n` +
      chain.map(r => `דור ${r.generation}: ${r.name}${REL(r.relation) ? ` (${REL(r.relation)})` : ''}`).join('\n') +
      (text ? `\n\nהערת המבקש:\n${text}` : '')
    : `בקשת תיקון מהאזור האישי — ${who}:\n${text}`

  // ⚠️ שם הפונה נשמר בגוף ההערה: ההצעה מגיעה בלי טוקן, ולכן אין
  // recipient_name להיתלות בו, והמנהל צריך לדעת מי ביקש בלי לחפש.
  // ⚠️ הטקסט נשמר ב-payload ולא בעמודה משלו — זה המבנה הקיים של
  // kind='note', והמסך של המנהל כבר קורא ממנו.
  // ⚠️ השרשרת נשמרת גם כמבנה (payload.chain) לצד הסיכום: המסך מציג היום
  // מחרוזת בלבד, אבל הנתון המובנה נדרש כדי שאישור ההצעה יוכל בעתיד
  // להחיל את השינוי בלי הקלדה חוזרת.
  const { error } = await admin.from('lineage_review_suggestions').insert({
    token: null,
    root_node_id: ben.lineage_node_id ?? null,
    kind: 'note',
    node_id: ben.lineage_node_id ?? null,
    payload: {
      text: summary,
      ...(chain ? { chain, chain_before: ben.lineage_chain ?? null, source: 'portal_editor' } : {}),
    },
    beneficiary_id: ben.id,
  })

  if (error) {
    console.error('[lineage-fix] insert failed:', error.message)
    return NextResponse.json({ error: 'שמירת הבקשה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
