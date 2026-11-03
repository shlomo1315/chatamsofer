// נקודת הכניסה היחידה של טכנוליין (Module API), לכל שלוש המערכות.
// /api/webhooks/technoline/<main|yerid|distributors>/<סוד-המערכת>/<שלוחה>
// המרכזיה אינה שולחת כותרת אימות, ולכן הסוד נמצא בנתיב (נבדק מול משתני הסביבה של אותה מערכת בלבד).
import { NextRequest, NextResponse } from 'next/server'
import { dispatch } from '@/lib/telephony'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ system: string; secret: string; ext: string }> }

async function handle(req: NextRequest, ctx: Ctx) {
  const { system, secret, ext } = await ctx.params
  const params: Record<string, string> = Object.fromEntries(req.nextUrl.searchParams.entries())
  if (req.method === 'POST') {
    const ct = req.headers.get('content-type') ?? ''
    try {
      if (ct.includes('json')) Object.assign(params, await req.json())
      else Object.assign(params, Object.fromEntries((await req.formData()).entries()))
    } catch { /* גוף ריק או לא תקין — ממשיכים עם ה-query */ }
  }
  const r = await dispatch(system, secret, ext, params)
  return NextResponse.json(r.body, { status: r.status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(req: NextRequest, ctx: Ctx) { return handle(req, ctx) }
export async function POST(req: NextRequest, ctx: Ctx) { return handle(req, ctx) }
