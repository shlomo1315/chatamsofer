import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireNonMailStaff } from '@/lib/apiAuth'
import { getPendingTasks } from '@/lib/pendingTasks'

export const dynamic = 'force-dynamic'

export async function GET() {
  // הגנת הרשאה מפורשת (defense-in-depth מעבר ל-RLS) — מחזיר PII של בקשות ממתינות
  if (!(await requireNonMailStaff())) return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  try {
    const supabase = await createClient()
    // מקור אמת יחיד — אותה פונקציה שהכרטיס בדשבורד סופר ממנה, כדי שלא יהיה פער.
    const tasks = await getPendingTasks(supabase)
    return NextResponse.json({ tasks })
  } catch {
    return NextResponse.json({ tasks: [] }, { status: 500 })
  }
}
