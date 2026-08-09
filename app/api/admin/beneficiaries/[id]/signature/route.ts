import { NextResponse } from 'next/server'
import { requireStaff, getServiceClient } from '@/lib/apiAuth'

// ─────────────────────────────────────────────────────────────────────────────
// חתימת ההצהרה של המוטב, כתמונה.
//
// ⚠️ למה נוצר: החתימה נשמרת כ-data-URL בבסיס64 (20-80KB לחתימה) בעמודה
// beneficiaries.signature, והכרטסת הטמיעה אותה ישירות ב-<img src> — כלומר
// הבסיס64 נכנס ל-HTML של כל טעינת כרטסת, גם כשהמשתמש בטאב אחר לגמרי ולא ראה
// אותה מעולם. עכשיו הכרטסת מפנה לכתובת הזו, והדפדפן מושך את התמונה בעצמו,
// במקביל, ומטמן אותה — במקום להשמין את ה-HTML של הדף.
// ─────────────────────────────────────────────────────────────────────────────
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireStaff())) return new NextResponse('לא מורשה', { status: 401 })

  const { id } = await params
  const db = getServiceClient()
  if (!db) return new NextResponse('חיבור Supabase לא מוגדר', { status: 500 })

  const { data, error } = await db
    .from('beneficiaries')
    .select('signature')
    .eq('id', id)
    .maybeSingle()

  const sig = data?.signature as string | null | undefined
  if (error || !sig) return new NextResponse('לא נמצאה חתימה', { status: 404 })

  // data:image/png;base64,XXXX → בייטים גולמיים עם סוג התוכן הנכון.
  // [\s\S] במקום דגל s — היעד אינו es2018.
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(sig)
  if (!m) {
    // ערך שאינו data-URL (למשל קישור ישיר לאחסון) — מפנים אליו.
    return NextResponse.redirect(sig)
  }

  const [, contentType, b64] = m
  const bytes = Buffer.from(b64, 'base64')

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(bytes.length),
      // private — תוכן אישי; מותר במטמון הדפדפן של אותו משתמש בלבד.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
