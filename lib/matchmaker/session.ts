import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MM_COOKIE, verifySession } from './crypto'

export interface MatchmakerRow {
  id: string; first_name: string; last_name: string; email: string; phone: string
  city: string; address: string; status: string
}

/** השדכן המחובר לפי העוגייה, או null (כולל שדכן חסום). */
export async function currentMatchmaker(request: NextRequest, db: SupabaseClient): Promise<MatchmakerRow | null> {
  const id = verifySession(request.cookies.get(MM_COOKIE)?.value)
  if (!id) return null
  const { data } = await db.from('matchmakers').select('id, first_name, last_name, email, phone, city, address, status').eq('id', id).maybeSingle()
  if (!data || data.status !== 'active') return null
  return data as MatchmakerRow
}

export const JSON_HEADERS = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }
