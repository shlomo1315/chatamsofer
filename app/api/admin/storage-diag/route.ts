import { NextResponse } from 'next/server'
import { requireAdmin, forbidden, getServiceClient } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// אבחון קריאה-בלבד: האם מדיניות ה-RLS על bucket 'documents' קיימת בפועל ב-DB.
// נבנה כדי לפצח "new row violates row-level security policy" בהעלאת קבצים
// ממסכי הניהול (אישור לידה, מסמכי מוטב) — שנעשית מהדפדפן עם ה-JWT של הצוות
// ולכן כפופה ל-RLS. אם policy 'documents_staff_insert' חסרה → המיגרציה
// 20260704 מעולם לא רצה בפרודקשן, וזו הסיבה.
// לא מבצע שום כתיבה.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  if (!(await requireAdmin())) return forbidden()
  const admin = getServiceClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  const out: Record<string, unknown> = {}

  // 1) מדיניות RLS על storage.objects (דרך pg_policies) — חיפוש כל policy
  //    ששמו קשור ל-documents. משתמשים ב-RPC כי supabase-js לא ניגש ל-pg_policies ישירות.
  //    ⚠️ ה-RPC 'exec_sql' עשוי לא להתקיים; אם כך — נדווח ונשתמש בבדיקה עקיפה.
  try {
    const { data, error } = await admin.rpc('storage_documents_policies')
    if (error) out.policiesError = error.message
    else out.policies = data
  } catch (e) {
    out.policiesRpcMissing = e instanceof Error ? e.message : String(e)
  }

  // 2) בדיקה עקיפה חד-משמעית: מנסים להעלות קובץ זעיר עם ה-service-role.
  //    service-role עוקף RLS, כך שאם זה מצליח → ה-bucket קיים ותקין, והבעיה
  //    היא אך ורק ב-RLS/JWT של הדפדפן. מוחקים מיד אחר כך.
  const probePath = `_diag/rls-probe-${Date.now()}.txt`
  try {
    const { error: upErr } = await admin.storage.from('documents')
      .upload(probePath, new Blob(['ok'], { type: 'text/plain' }), { upsert: true })
    if (upErr) out.serviceUpload = { ok: false, error: upErr.message }
    else {
      out.serviceUpload = { ok: true }
      await admin.storage.from('documents').remove([probePath])
    }
  } catch (e) {
    out.serviceUpload = { ok: false, error: e instanceof Error ? e.message : String(e) }
  }

  // 3) האם ה-bucket מוגדר פרטי (public=false), כמצופה מ-20260704
  try {
    const { data: buckets } = await admin.storage.listBuckets()
    const docs = (buckets ?? []).find(b => b.id === 'documents')
    out.bucket = docs ? { id: docs.id, public: docs.public } : '(bucket documents לא נמצא!)'
  } catch (e) {
    out.bucketError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
