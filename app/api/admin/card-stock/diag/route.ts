import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'
import { getStockBalance } from '@/lib/cardStock'
import { getNedarimCreds } from '@/lib/nedarim'
import { isAwaitingCard } from '@/lib/awaitingFilter'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון מלאי הכרטיסים — למה יולדת לא קיבלה כרטיס/שובר.
// מציג את המצב האמיתי ב-DB: מי בתור, באיזה סטטוס, והאם נדרים מוגדר.
// קריאה בלבד — לא משנה דבר.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

export async function GET() {
  const staff = await requireAdmin()
  if (!staff) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const balance = await getStockBalance(admin)
  const creds = await getNedarimCreds()

  // ⚠️ בדיקה חיה מול נדרים — זה מה שלא ניתן לראות מהקוד. מחזירה את
  // הודעת השגיאה המקורית שלהם, כדי לדעת אם הבעיה בחשבון או אצלנו.
  let nedarimCheck: { ok: boolean; families?: number; error?: string } = { ok: false, error: 'לא מוגדר' }
  if (creds) {
    try {
      const { getClientsTable } = await import('@/lib/nedarim')
      const { families } = await getClientsTable(creds)
      nedarimCheck = { ok: true, families: families.length }
    } catch (e) {
      nedarimCheck = { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // ⚠️ ללא סינון status — כדי לתפוס גם לידות שנתקעו במצב שאינו 'active'
  // (למשל כשל בהקמת המשפחה בנדרים שהשאיר את התיק במצב ביניים ולכן לא נכנס
  // לתור ולא נראה קודם). ממוין לפי created_at יורד: הלידה האחרונה שאושרה
  // מופיעה ראשונה — זו שהמשתמש בדרך כלל שואל עליה.
  const { data: aids, error } = await admin
    .from('maternity_aids')
    .select('id, status, birth_type, card_status, card_voucher_status, card_load_status, card_load_error, card_tlush_id, card_center_id, wants_food_card, created_at, updated_at, beneficiary:beneficiaries(family_name, full_name, spouse_name, email, id_number, spouse_id_number, nedarim_id)')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (aids ?? []).map(a => {
    const benRaw = (a as Record<string, unknown>).beneficiary
    const ben = (Array.isArray(benRaw) ? benRaw[0] : benRaw) as Record<string, string | null> | null
    // ⚠️ אותו סינון בדיוק כמו processAwaitingStock — אחרת האבחון מדווח
    // "לא ייטען לעולם" על יולדת שהתור דווקא כן מטפל בה.
    // התור דורש status='active' — לידה במצב אחר לא נכנסת אליו לעולם.
    const isActive = a.status === 'active'
    const inQueue = isActive && isAwaitingCard(a)
    const loaded = a.card_load_status === 'loaded' || !!a.card_tlush_id
    return {
      id: a.id,
      name: [ben?.family_name, ben?.spouse_name || ben?.full_name].filter(Boolean).join(' ') || '—',
      email: ben?.email || '(אין מייל!)',
      // ⚠️ status התיק — לידה שנתקעה במצב שאינו 'active' מעולם לא נכנסה לתור
      status: a.status,
      created_at: a.created_at,
      card_status: a.card_status,
      card_voucher_status: a.card_voucher_status,
      card_load_status: a.card_load_status,
      // ⚠️ שדות שנדרשים להטענה בנדרים — בלעדיהם ההקמה נכשלת
      zeout: ben?.id_number || ben?.spouse_id_number || '(אין ת"ז!)',
      nedarimId: ben?.nedarim_id || '(טרם הוקמה)',
      lastLoadError: a.card_load_error || null,
      hasTlush: !!a.card_tlush_id,
      inQueue,
      loaded,
      // ההסבר המעשי — למה היולדת לא מקבלת כרטיס
      // ⚠️ "לא ביקשה כרטיס מזון" הופרד מ"נתקעה": זו החלטה של היולדת ולא תקלה,
      // ואין מה להתערב בה. כשהשניים היו מאוחדים היא נראתה כמו כשל שדורש טיפול.
      diagnosis: loaded ? 'נטען — תקין'
        : inQueue ? (balance > 0 ? 'בתור ויש מלאי — אמור להיטען בהוספה הבאה' : 'בתור, אין מלאי')
        : (a as { wants_food_card?: boolean }).wants_food_card === false ? 'לא ביקשה כרטיס מזון — לא אמורה לקבל'
        : 'לא בתור ולא נטען — לא ייטען לעולם ללא התערבות',
    }
  })

  return NextResponse.json({
    balance,
    nedarimConfigured: !!creds,
    nedarimCheck,
    inQueueCount: rows.filter(r => r.inQueue).length,
    stuckCount: rows.filter(r => !r.inQueue && !r.loaded).length,
    rows,
  })
}
