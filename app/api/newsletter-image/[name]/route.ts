import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// הגשת תמונות ניוזלטר בציבור.
//
// למה זה קיים: דלי ה-storage פרטי, ו-signed URL פג אחרי שבוע — תמונה
// בניוזלטר שנשלח היום הייתה נשברת אצל הנמענים בשבוע הבא.
// כאן מוגשות אך ורק תמונות מהתיקייה newsletter/, שהועלו ע"י צוות מורשה.
//
// אבטחה: הנתיב מוגבל לתיקייה אחת ולסיומות תמונה בלבד — אין דרך לחלץ
// מסמכים פרטיים דרך ה-endpoint הזה.
export const dynamic = 'force-dynamic'

const ALLOWED_EXT = /\.(jpe?g|png|gif|webp)$/i

export async function GET(_r: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const clean = decodeURIComponent(name)

  // הגנה: רק שם קובץ פשוט, בלי מעבר תיקיות
  if (clean.includes('/') || clean.includes('..') || !ALLOWED_EXT.test(clean)) {
    return new NextResponse('Not found', { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return new NextResponse('Server error', { status: 500 })

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data, error } = await db.storage.from('documents').download(`newsletter/${clean}`)
  if (error || !data) return new NextResponse('Not found', { status: 404 })

  const buffer = Buffer.from(await data.arrayBuffer())

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': data.type || 'image/jpeg',
      // cache ארוך — התמונה לא משתנה (שם הקובץ ייחודי)
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
