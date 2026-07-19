import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { getPortalBeneficiaryId } from '@/lib/portalSession'
import { maybeMarkDocsReturned } from '@/lib/docsReturnCheck'

export const dynamic = 'force-dynamic'

const BUCKET = 'documents'
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

// סוגי קבצים מותרים בלבד — מסמכים ותמונות. ה-Content-Type נקבע בשרת לפי הסיומת.
const ALLOWED_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', gif: 'image/gif', pdf: 'application/pdf',
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  // הגבלת קצב — בולמת שימוש לרעה כהעלאת קבצים חופשית
  if (!rateLimit(`upload-docs:${clientIp(request)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי העלאות. נסה שוב מאוחר יותר.' }, { status: 429 })
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const beneficiaryId = formData.get('beneficiary_id') as string | null
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה צאצא' }, { status: 400 })

  // אימות בעלות: רק בעל הסשן בפורטל רשאי להעלות מסמכים לתיק שלו (מניעת IDOR)
  const sessionBeneficiaryId = getPortalBeneficiaryId(request)
  if (!sessionBeneficiaryId || sessionBeneficiaryId !== beneficiaryId) {
    return NextResponse.json({ error: 'לא מורשה' }, { status: 401 })
  }

  // Verify beneficiary exists
  const { data: ben, error: benErr } = await admin
    .from('beneficiaries')
    .select('id, eligibility_status')
    .eq('id', beneficiaryId)
    .maybeSingle()
  if (benErr || !ben) return NextResponse.json({ error: 'צאצא לא נמצא' }, { status: 404 })

  const uploaded: string[] = []
  let lastUrl = ''

  // איסוף כל הקבצים שנשלחו: כל שדה File שאינו 'beneficiary_id'. שם השדה = סוג המסמך.
  // תמיכה לאחור: השדה הגנרי 'file' נשמר כ-'birth_cert' (זרימת אישור לידה).
  const fileEntries: { docType: string; file: File }[] = []
  for (const [key, val] of formData.entries()) {
    if (key === 'beneficiary_id') continue
    if (typeof val === 'string') continue
    const docType = key === 'file' ? 'birth_cert' : key
    fileEntries.push({ docType, file: val as File })
  }

  for (const { docType, file: singleFile } of fileEntries) {
    if (!singleFile || typeof singleFile === 'string') continue
    if (singleFile.size > MAX_SIZE) return NextResponse.json({ error: `הקובץ ${singleFile.name} גדול מ-10MB` }, { status: 400 })

    const ext = singleFile.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const contentType = ALLOWED_TYPES[ext]
    if (!contentType) {
      return NextResponse.json({ error: `סוג הקובץ של ${singleFile.name} אינו נתמך. ניתן להעלות תמונות או PDF בלבד.` }, { status: 400 })
    }
    const path = `${beneficiaryId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const arrayBuffer = await singleFile.arrayBuffer()

    const { error: upErr } = await admin.storage.from(BUCKET).upload(path, arrayBuffer, {
      contentType,
      upsert: false,
    })
    if (upErr) return NextResponse.json({ error: `שגיאה בהעלאת ${singleFile.name}` }, { status: 500 })

    const { data: urlData } = admin.storage.from(BUCKET).getPublicUrl(path)
    lastUrl = urlData.publicUrl

    // ── החלפה, לא הוספה ──
    // קודם המערכת רק הוסיפה: מי שהעלה ת"ז שוב, נשארו לו שתיים, ואי אפשר
    // היה לדעת איזו עדכנית. עכשיו הקובץ החדש דורס את הקודם מאותו סוג —
    // גם הרשומה וגם הקובץ עצמו באחסון, כדי שלא יישארו קבצים יתומים.
    //
    // הסדר חשוב: מוחקים *אחרי* שההעלאה החדשה הצליחה. אם נמחק קודם ואז
    // ההעלאה תיכשל — המשתמש יישאר בלי שום קובץ.
    const { data: old } = await admin
      .from('documents')
      .select('id, file_url')
      .eq('beneficiary_id', beneficiaryId)
      .eq('doc_type', docType)

    if (old?.length) {
      // הקבצים מהאחסון
      const paths = old
        .map(d => {
          const u = String(d.file_url ?? '')
          const m = u.match(new RegExp(`/${BUCKET}/(.+)$`))
          return m?.[1] ? decodeURIComponent(m[1]) : null
        })
        .filter((p): p is string => Boolean(p))

      if (paths.length) {
        await admin.storage.from(BUCKET).remove(paths)
          .catch(e => console.error('[upload-docs] מחיקת קובץ ישן נכשלה:', e))
      }

      // הרשומות
      await admin.from('documents')
        .delete()
        .eq('beneficiary_id', beneficiaryId)
        .eq('doc_type', docType)
    }

    await admin.from('documents').insert({
      beneficiary_id: beneficiaryId,
      doc_type: docType,
      file_url: urlData.publicUrl,
      file_name: singleFile.name,
    })

    uploaded.push(docType)
  }

  if (uploaded.length === 0) {
    return NextResponse.json({ error: 'לא הועלו קבצים' }, { status: 400 })
  }

  // מעגל תיקונים: בסטטוס "השלמת מסמכים" — רק כשהצאצא השלים את *כל* הנדרש
  // (כל המסמכים + תיקון דורות אם סומן) הוא עובר ל"הוחזר תיקון — לבדיקה".
  // בכל מקרה אחר (כולל העלאת ת.ז כחלק מהגשת בקשה) — הסטטוס נשאר כפי שהוא.
  let returned = false
  if (ben.eligibility_status === 'docs_pending') {
    returned = await maybeMarkDocsReturned(admin, beneficiaryId)
  }

  return NextResponse.json({ ok: true, uploaded, url: lastUrl, returned })
}
