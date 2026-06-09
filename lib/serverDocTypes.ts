import { createClient } from '@supabase/supabase-js'
import { DEFAULT_DOC_TYPES, type DocTypeOption } from './docTypes'

// קריאת סוגי המסמכים מצד השרת (app_settings), עם נפילה לברירת המחדל.
export async function getDocTypes(): Promise<DocTypeOption[]> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return DEFAULT_DOC_TYPES
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data } = await admin.from('app_settings').select('value').eq('key', 'doc_types').maybeSingle()
    if (data?.value) {
      const parsed = JSON.parse(data.value)
      if (Array.isArray(parsed) && parsed.length) return parsed as DocTypeOption[]
    }
  } catch { /* נופלים לברירת המחדל */ }
  return DEFAULT_DOC_TYPES
}
