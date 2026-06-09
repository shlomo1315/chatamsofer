import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DEFAULT_DOC_TYPES, newDocTypeValue, PROTECTED_DOC_TYPES, type DocTypeOption } from '@/lib/docTypes'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function read(): Promise<DocTypeOption[]> {
  try {
    const { data } = await admin().from('app_settings').select('value').eq('key', 'doc_types').maybeSingle()
    if (data?.value) {
      const parsed = JSON.parse(data.value)
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch { /* fallthrough */ }
  return DEFAULT_DOC_TYPES
}

async function write(list: DocTypeOption[]) {
  await admin().from('app_settings').upsert({
    key: 'doc_types',
    value: JSON.stringify(list),
    updated_at: new Date().toISOString(),
  })
}

export async function GET() {
  return NextResponse.json({ docTypes: await read() })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action } = body

  if (action === 'add') {
    const label = (body.label ?? '').trim()
    if (!label) return NextResponse.json({ error: 'חסר שם' }, { status: 400 })
    const list = await read()
    if (list.some(t => t.label === label)) return NextResponse.json({ ok: true, docTypes: list })
    const next = [...list, { value: newDocTypeValue(), label }]
    await write(next)
    return NextResponse.json({ ok: true, docTypes: next })
  }

  if (action === 'delete') {
    const value = body.value as string
    if (PROTECTED_DOC_TYPES.includes(value)) {
      return NextResponse.json({ error: 'לא ניתן למחוק סוג מסמך בסיסי' }, { status: 400 })
    }
    const list = await read()
    const next = list.filter(t => t.value !== value)
    await write(next)
    return NextResponse.json({ ok: true, docTypes: next })
  }

  if (action === 'rename') {
    const { value, label } = body
    const list = await read()
    const next = list.map(t => t.value === value ? { ...t, label: (label ?? '').trim() || t.label } : t)
    await write(next)
    return NextResponse.json({ ok: true, docTypes: next })
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
}
