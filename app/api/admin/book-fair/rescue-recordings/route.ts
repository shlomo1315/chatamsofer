import { type NextRequest, NextResponse } from 'next/server'
import { requirePermission, forbidden, getServiceClient, serverMisconfigured } from '@/lib/apiAuth'
import { downloadFileFromYemot } from '@/lib/yemot'
import { listYemotFolder, timestampOf } from '@/lib/bookFairInquiryAudio'
import { transcribeHebrew } from '@/lib/elevenStt'

// ─────────────────────────────────────────────────────────────────────────────
// שחזור הקלטות שם/כתובת בהזמנות הטלפוניות + תמלול (בקשת המשתמש 08.10).
//
// 🔴 23 הזמנות הציגו "ההקלטה לא נמצאה": הגיבוי בזמן השיחה חיפש בסל המיחזור
// של ימות רק בדף הראשון (1,000 מתוך 1,543 קבצים), וההזמנות שהקבצים שלהן
// נפלו מעבר — נשארו בלי עותק. ועוד ~85 הקלטות עם עותק אבל בלי תמלול.
//
// כללי ההתאמה (נבדקו מול 417 עותקים ידועים לפני ההרצה):
//   · שם — הקובץ האחרון בשיחה (94%).
//   · כתובת — רק כשבשיחה בדיוק שני קבצים. אחרת אין כלל אמין (הטוב
//     ביותר 78%), וכתובת שגויה פירושה משלוח למקום הלא נכון — ולכן כל
//     הקלטות השיחה מצורפות כ"הקלטה נוספת" עם תמלול, והצוות בוחר.
//
// ⚠️ רץ בשרת ולא בסקריפט מקומי: NetFree חוסם הורדת שמע מ-Supabase.
// ⚠️ במנות ועם תקציב זמן — מריצים שוב עד ש-remaining=0. בטוח להרצה חוזרת.
//
//   GET ?apply=1  ← ביצוע · בלי apply ← תצוגה בלבד
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BUDGET_MS = 200_000
const TRASH = ['ivr2:/Trash/ApiRecord', 'ivr2:/Trash/ApiVoice'] as const
const WINDOW_BEFORE = 20 * 60
const WINDOW_AFTER = 2 * 60

type Rec = {
  id: string; order_id: string; kind: string; storage_path: string | null; transcript: string | null
  order: { order_number: string; created_at: string; customer_phone: string | null } |
         { order_number: string; created_at: string; customer_phone: string | null }[]
}

const phoneKey = (p: string | null | undefined) =>
  String(p ?? '').replace(/\D/g, '').replace(/^972/, '').replace(/^0/, '')
const one = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v)

export async function GET(request: NextRequest) {
  return run(request.nextUrl.searchParams.get('apply') === '1')
}

// ⚠️ POST = ביצוע, מהכפתור בהגדרות היריד. NetFree חוסם ניווט ישיר לכתובת
// API חדשה ("unknown"), ולכן ההפעלה היא מתוך דף המערכת.
export async function POST() {
  return run(true)
}

async function run(apply: boolean) {
  if (!(await requirePermission('book_fair', 'edit'))) return forbidden()
  const db = getServiceClient()
  if (!db) return serverMisconfigured()

  const started = Date.now()
  const outOfTime = () => Date.now() - started > BUDGET_MS
  const log: string[] = []
  const r = { name_rescued: 0, addr_rescued: 0, addr_for_staff: 0, extra_recordings: 0, not_found: 0, transcribed: 0 }

  const { data, error } = await db.from('book_fair_recordings')
    .select('id, order_id, kind, storage_path, transcript, order:book_fair_orders!inner(order_number, created_at, customer_phone, status, channel)')
    .eq('order.channel', 'phone')
    .not('order.status', 'in', '(cancelled,pending_payment,failed)')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const recs = (data ?? []) as unknown as Rec[]

  // ── 1. הקלטות חסרות ──
  const byOrder = new Map<string, Rec[]>()
  for (const x of recs) {
    if (x.storage_path || (x.kind !== 'name' && x.kind !== 'address')) continue
    const list = byOrder.get(x.order_id) ?? []
    list.push(x)
    byOrder.set(x.order_id, list)
  }

  // ⚠️ הזמנה שכבר קיבלה "הקלטות נוספות" מהשחזור — לא מצרפים שוב.
  const { data: prevNotes } = await db.from('book_fair_recordings')
    .select('order_id').eq('kind', 'note').like('provider_path', 'ivr2:/Trash/%')
  const alreadyNoted = new Set((prevNotes ?? []).map(n => n.order_id as string))

  const files: { path: string; ts: number }[] = []
  if (byOrder.size) {
    for (const folder of TRASH) {
      for (const name of await listYemotFolder(folder)) {
        const ts = timestampOf(name)
        if (ts !== null) files.push({ path: `${folder}/${name}`, ts })
      }
    }
  }

  let pendingOrders = 0
  for (const [orderId, missing] of byOrder) {
    // ⚠️ כבר טופלה: חסרה רק כתובת לא-ודאית, והקלטות השיחה כבר צורפו —
    // אין מה להוריד ולתמלל שוב בכל הרצה.
    if (alreadyNoted.has(orderId) && missing.every(m => m.kind === 'address')) {
      r.addr_for_staff++
      continue
    }
    if (outOfTime()) { pendingOrders++; continue }
    const o = one(missing[0].order)
    const t = Math.floor(new Date(o.created_at).getTime() / 1000)
    const ph = phoneKey(o.customer_phone)
    const cands = ph.length >= 7
      ? files.filter(f => f.path.includes(ph) && f.ts >= t - WINDOW_BEFORE && f.ts <= t + WINDOW_AFTER)
          .sort((a, b) => a.ts - b.ts)
      : []
    if (!cands.length) { r.not_found += missing.length; log.push(`${o.order_number} — לא נמצאו קבצים`); continue }
    if (!apply) { log.push(`${o.order_number} — ${cands.length} הקלטות בשיחה · חסרות: ${missing.map(m => m.kind).join('+')}`); continue }

    const got: { path: string; storage: string; text: string | null }[] = []
    for (const c of cands) {
      let buf: ArrayBuffer | undefined
      for (const scope of ['bookFair', 'default'] as const) {
        const f = await downloadFileFromYemot(c.path, scope)
        if (f.ok && f.data && f.data.byteLength > 1000) { buf = f.data; break }
      }
      if (!buf) continue
      const storage = `book-fair/rescued/${orderId}/${c.ts}.wav`
      const up = await db.storage.from('documents').upload(storage, buf, { contentType: 'audio/wav', upsert: true })
      if (up.error) continue
      got.push({ path: c.path, storage, text: await transcribeHebrew(buf, { timeoutMs: 30_000 }) })
    }
    if (!got.length) { r.not_found += missing.length; log.push(`${o.order_number} — ההורדה מימות נכשלה`); continue }

    const used = new Set<string>()
    const nameRec = missing.find(m => m.kind === 'name')
    const addrRec = missing.find(m => m.kind === 'address')
    if (nameRec) {
      const n = got[got.length - 1]
      used.add(n.path)
      await db.from('book_fair_recordings').update({
        storage_path: n.storage, provider_path: n.path, transcript: n.text, transcript_source: 'scribe',
      }).eq('id', nameRec.id)
      r.name_rescued++
    }
    if (addrRec) {
      if (got.length === 2) {
        const a = got[0]
        used.add(a.path)
        await db.from('book_fair_recordings').update({
          storage_path: a.storage, provider_path: a.path, transcript: a.text, transcript_source: 'scribe',
        }).eq('id', addrRec.id)
        r.addr_rescued++
      } else {
        r.addr_for_staff++
      }
    }
    if (!alreadyNoted.has(orderId)) {
      for (const g of got) {
        if (used.has(g.path)) continue
        await db.from('book_fair_recordings').insert({
          order_id: orderId, kind: 'note', provider_path: g.path, storage_path: g.storage,
          transcript: g.text, transcript_source: 'scribe',
        })
        r.extra_recordings++
      }
    }
    log.push(`${o.order_number} — שוחזר (${got.length} הקלטות בשיחה)`)
  }

  // ── 2. תמלול להקלטות שיש להן עותק ואין תמלול ──
  let remainingStt = 0
  for (const x of recs) {
    if (!x.storage_path || (x.transcript ?? '').trim()) continue
    if (!apply || outOfTime()) { remainingStt++; continue }
    const { data: blob } = await db.storage.from('documents').download(x.storage_path)
    if (!blob) continue
    const text = await transcribeHebrew(await blob.arrayBuffer(), { timeoutMs: 30_000 })
    if (!text) continue
    await db.from('book_fair_recordings').update({ transcript: text, transcript_source: 'scribe' }).eq('id', x.id)
    r.transcribed++
  }

  return NextResponse.json({
    mode: apply ? 'בוצע' : 'תצוגה בלבד — הוסיפו ?apply=1 לביצוע',
    ...r,
    stt_remaining: remainingStt,
    orders_remaining: pendingOrders,
    done: apply && pendingOrders === 0 && remainingStt === 0,
    hint: outOfTime() ? 'נגמר זמן המנה — רעננו את הדף להמשך' : undefined,
    log,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
