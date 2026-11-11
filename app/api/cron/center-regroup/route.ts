// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ זמני: מפריד את גרליץ ועולם הדיגיטל מהלקוחות הפרטיים שלהם בנדרים (506911, 425709).
// מבטל רק את תלוש ה-600 ₪ של נובמבר, מקים לכל מוקד לקוח נפרד וטוען מחדש 600 ₪ (תוקף חודשיים).
// המלאי נשאר: הכרטיס שנוכה כבר היום מוחזר ביומן ומנוכה שוב בטעינה המחודשת.
// mode=plan (ברירת מחדל): קריאה בלבד. mode=apply: חייב expect_<מוקד>=<יתרה נוכחית בשקלים> מתוצאת ה-plan.
// מוגן ב-CRON_SECRET. להסיר מהקוד מיד אחרי ההרצה.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronSecret, getServiceClient } from '@/lib/apiAuth'
import { israelMonth, runMonthlyLoad, type CenterAccount } from '@/lib/centerMonthlyLoad'
import { getNedarimCreds, getClientCard, prikatTlush } from '@/lib/nedarim'
import { getStockBalance } from '@/lib/cardStock'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TARGETS = [
  { key: 'garlitz', id: '5b776472-0758-433f-b7f2-f34d8d4fbaa7', privateClient: '506911', name: "מוקד בית שמש רמה ד' 3 - משפחת גרליץ" },
  { key: 'digital', id: '7d0aca64-d63d-4cd7-939e-804305323d04', privateClient: '425709', name: 'מוקד בני ברק - אזור חזון איש נחמיה - חנות "עולם הדיגיטל" רחוב הרב לנדא' },
] as const

export async function GET(request: NextRequest) {
  if (!process.env.CRON_SECRET || !verifyCronSecret(request)) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'חיבור Supabase לא מוגדר' }, { status: 500 })
  const creds = await getNedarimCreds()
  if (!creds) return NextResponse.json({ error: 'נדרים לא מוגדר' }, { status: 500 })

  const sp = request.nextUrl.searchParams
  const apply = sp.get('mode') === 'apply'
  const month = israelMonth()
  const out: Record<string, unknown>[] = []

  for (const t of TARGETS) {
    const row: Record<string, unknown> = { center: t.key }
    out.push(row)
    try {
      const { data: card } = await db.from('center_monthly_cards').select('center_id, phone, card_number, nedarim_client_id, id_number').eq('center_id', t.id).maybeSingle()
      const { data: load } = await db.from('center_monthly_loads').select('status, tlush_id, amount').eq('center_id', t.id).eq('month', month).maybeSingle()
      const priv = await getClientCard(creds, t.privateClient)
      Object.assign(row, { dbClient: card?.nedarim_client_id, cardNumberKept: card?.card_number ?? null, load, privateBalanceBefore: priv?.totalFreeAmount ?? null })
      if (!card || card.nedarim_client_id !== t.privateClient || load?.status !== 'loaded' || !load.tlush_id || !priv) { row.stopped = 'מצב לא צפוי'; continue }
      if (!apply) continue
      if (Number(sp.get(`expect_${t.key}`)) !== priv.totalFreeAmount) { row.stopped = 'היתרה שונה מהצפוי'; continue }
      // resume=1: התלוש כבר בוטל בנדרים בריצה קודמת (נעצרה אחרי הביטול); expect_<מוקד> = היתרה הנוכחית (0) ולא מבטלים שוב
      if (sp.get('resume') !== '1') {
        if (priv.totalFreeAmount < load.amount) { row.stopped = 'היתרה קטנה מהטעינה (נעשה שימוש)'; continue }
        const un = await prikatTlush(creds, load.tlush_id)
        row.unload = un
        if (!un.ok) { row.stopped = 'ביטול הטעינה נכשל'; continue }
        try { row.privateBalanceAfter = (await getClientCard(creds, t.privateClient))?.totalFreeAmount ?? null } catch { row.stopped = 'התלוש בוטל; להמשיך בריצה נוספת עם resume=1'; continue }
      } else if (priv.totalFreeAmount !== 0) { row.stopped = 'resume: היתרה הנוכחית לא 0'; continue }

      // מכאן הטעינה הישנה בוטלה: מנתקים את המוקד מהלקוח הפרטי (הכרטיס נשאר רשום כמו שהוא)
      await db.from('card_centers').update({ name: t.name }).eq('id', t.id)
      await db.from('center_monthly_cards').update({ nedarim_client_id: null, id_number: null, updated_at: new Date().toISOString() }).eq('center_id', t.id)
      const { data: del } = await db.from('center_monthly_loads').delete().eq('center_id', t.id).eq('month', month).eq('status', 'loaded').select('id')
      if (del?.length) await db.from('card_stock_ledger').insert({ delta: 1, reason: 'adjust', note: `החזרה — טעינה חודשית בוטלה והוקמה מחדש במוקד נפרד · ${t.id} · ${month}` })

      const acc: CenterAccount = { center_id: t.id, phone: card.phone, card_number: card.card_number, nedarim_client_id: null, id_number: null, center_name: t.name }
      row.reload = await runMonthlyLoad(db, acc)
      const { data: nc } = await db.from('center_monthly_cards').select('nedarim_client_id, id_number').eq('center_id', t.id).maybeSingle()
      row.newClient = nc?.nedarim_client_id ?? null
      row.newTsad3 = nc?.id_number ?? null
      if (nc?.nedarim_client_id) row.newBalance = (await getClientCard(creds, nc.nedarim_client_id))?.totalFreeAmount ?? null
    } catch (e) {
      row.error = e instanceof Error ? e.message : 'שגיאה'
    }
  }
  return NextResponse.json({ mode: apply ? 'apply' : 'plan', month, stock: await getStockBalance(db).catch(() => null), results: out })
}
