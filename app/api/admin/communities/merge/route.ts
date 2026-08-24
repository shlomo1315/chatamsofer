import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { logActivity } from '@/lib/activityLog'

export const dynamic = 'force-dynamic'

const BACKUP_KEY = 'community_merge_backups'
const MAX_BACKUPS = 20

type Backup = { at: string; to: string; rows: { id: string; from: string }[] }
type Db = NonNullable<ReturnType<typeof getServiceClient>>

// ⚠️ app_settings.value היא עמודת text — חובה JSON.stringify. שמירת
// אובייקט גולמי נכשלת *בשקט* ומאחסנת "[object Object]", והגיבוי היה
// מתגלה כריק בדיוק ברגע שצריך אותו.
async function loadBackups(db: Db): Promise<Backup[]> {
  const { data } = await db.from('app_settings').select('value').eq('key', BACKUP_KEY).maybeSingle()
  try {
    const raw = (data as { value?: string } | null)?.value
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function saveBackups(db: Db, list: Backup[]) {
  await db.from('app_settings').upsert(
    {
      key: BACKUP_KEY,
      value: JSON.stringify(list.slice(0, MAX_BACKUPS)),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  )
}

// מיזוג שמות קהילה לשם אחד.
//
// 🔒 מנהל בלבד — הפעולה משנה אלפי רשומות פרודקשן.
//
// ⚠️ preview:true מחזיר את מספר הרשומות המושפעות בלי לשנות דבר. המסך
// מציג אותו לפני הביצוע, כי מיזוג שגוי מתגלה רק בדוח הבא.
export async function POST(request: NextRequest) {
  const staff = await requireAdmin()
  if (!staff) return forbidden('מיזוג קהילות שמור למנהל המערכת')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const body = (await request.json().catch(() => null)) as
    | { from?: string[]; to?: string; preview?: boolean }
    | null
  const from = Array.isArray(body?.from) ? body!.from.filter(Boolean) : []
  const to = (body?.to ?? '').trim()
  if (!from.length || !to) {
    return NextResponse.json({ error: 'חסרים שמות למיזוג' }, { status: 400 })
  }

  // ⚠️ fetchAllRows: מיזוג יחיד עלול לגעת ביותר מ-1,000 רשומות
  // ("ליטאי" לבדו הוא 918), ותקרת התקרה השקטה הייתה משאירה חלק מהן
  // מאחור — עם שם ישן, ובלי שום סימן שמשהו נשמט.
  const { rows, error } = await fetchAllRows<{ id: string; community_affiliation: string | null }>(
    (f, t) =>
      db
        .from('beneficiaries')
        .select('id, community_affiliation')
        .in('community_affiliation', from)
        .range(f, t),
  )
  if (error) return NextResponse.json({ error }, { status: 500 })

  const affected = rows.filter(r => (r.community_affiliation ?? '') !== to)
  if (body?.preview) return NextResponse.json({ affected: affected.length })
  if (!affected.length) return NextResponse.json({ ok: true, affected: 0 })

  // 🔴 גיבוי לפני השינוי — בלעדיו המיזוג בלתי הפיך.
  const backups = await loadBackups(db)
  backups.unshift({
    at: new Date().toISOString(),
    to,
    rows: affected.map(r => ({ id: r.id, from: r.community_affiliation ?? '' })),
  })
  await saveBackups(db, backups)

  const { error: upErr } = await db
    .from('beneficiaries')
    .update({ community_affiliation: to })
    .in('id', affected.map(r => r.id))
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await logActivity(db, {
    userId: staff.userId,
    action: 'community_merged',
    entityType: 'beneficiary',
    details: { from, to, affected: affected.length },
  })

  return NextResponse.json({ ok: true, affected: affected.length })
}

// ביטול המיזוג האחרון — מחזיר לכל רשומה את השם שהיה לה.
export async function DELETE() {
  const staff = await requireAdmin()
  if (!staff) return forbidden('ביטול מיזוג שמור למנהל המערכת')

  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const backups = await loadBackups(db)
  const last = backups[0]
  if (!last) return NextResponse.json({ error: 'אין מיזוג לביטול' }, { status: 404 })

  // ⚠️ שחזור מקובץ לפי השם המקורי ולא כתיבה אחידה: לכל רשומה היה ערך
  // אחר לפני המיזוג, וכתיבה אחת הייתה מוחקת בדיוק את ההבחנה שהמיזוג
  // איחד — ואז הביטול היה הרסני יותר מהמיזוג עצמו.
  const byName = new Map<string, string[]>()
  for (const r of last.rows) {
    const list = byName.get(r.from) ?? []
    list.push(r.id)
    byName.set(r.from, list)
  }
  for (const [name, ids] of byName) {
    await db.from('beneficiaries').update({ community_affiliation: name }).in('id', ids)
  }

  await saveBackups(db, backups.slice(1))
  await logActivity(db, {
    userId: staff.userId,
    action: 'community_merge_undone',
    entityType: 'beneficiary',
    details: { to: last.to, restored: last.rows.length },
  })

  return NextResponse.json({ ok: true, restored: last.rows.length })
}
