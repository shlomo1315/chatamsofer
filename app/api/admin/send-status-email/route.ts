import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  sendEmail,
  templateStatusApproved,
  templateStatusRejected,
  templateDocsPendingWithNotes,
} from '@/lib/email'

export const dynamic = 'force-dynamic'

function getClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  const { id, status, reason, docsNotes } = await request.json()
  if (!id || !status) return NextResponse.json({ error: 'missing fields' }, { status: 400 })

  const client = getClient()
  const { data: ben, error } = await client
    .from('beneficiaries')
    .select('email, full_name')
    .eq('id', id)
    .maybeSingle()

  if (error || !ben) return NextResponse.json({ error: 'beneficiary not found' }, { status: 404 })
  if (!ben.email) return NextResponse.json({ ok: true, skipped: 'no email' })

  let payload
  if (status === 'approved') {
    payload = templateStatusApproved(ben.full_name)
  } else if (status === 'rejected') {
    payload = templateStatusRejected(ben.full_name, reason)
  } else if (status === 'docs_pending') {
    payload = templateDocsPendingWithNotes(ben.full_name, docsNotes)
  } else {
    return NextResponse.json({ ok: true, skipped: 'no template for status' })
  }

  const result = await sendEmail({ ...payload, to: ben.email })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ ok: true })
}
