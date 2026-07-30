import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, forbidden, getServiceClient } from '@/lib/apiAuth'
import { addBeneficiaryNote, resolveAuthorName } from '@/lib/beneficiaryNotes'
import { DEFAULT_DOC_TYPES, docTypeLabel, type DocTypeOption } from '@/lib/docTypes'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// שמירת רשומת היסטוריה לבקשת תיקון/השלמת מסמכים.
//
// נקרא מ-StatusControl ברגע שהמזכירות מסמנת "השלמת מסמכים" ומבקשת תיקונים.
// כל בקשה נשמרת כרשומה נפרדת (היסטוריה מלאה), כדי שתמיד יהיה אפשר לראות
// בדיעבד מה בדיוק ביקשנו מהצאצא — כולל ההערות החופשיות שעד היום נעלמו.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const staff = await requirePermission('beneficiaries', 'edit')
  if (!staff) return forbidden()
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  let body: {
    beneficiaryId?: string
    required_docs?: string
    docs_notes?: string
    lineage_fix_required?: boolean
    lineage_fix_note?: string
  }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 }) }

  const { beneficiaryId, required_docs, docs_notes, lineage_fix_required, lineage_fix_note } = body
  if (!beneficiaryId) return NextResponse.json({ error: 'חסר מזהה נרשם' }, { status: 400 })

  // אין טעם לשמור רשומה ריקה לגמרי (בלי מסמכים, בלי הערות, בלי תיקון דורות)
  const hasContent = !!(required_docs?.trim() || docs_notes?.trim() || lineage_fix_required)
  if (!hasContent) return NextResponse.json({ ok: true, skipped: true })

  // שם הצוות שביקש — לנוחות התצוגה
  const requestedByName = await resolveAuthorName(db, staff.userId)

  const { error } = await db.from('docs_fix_requests').insert({
    beneficiary_id: String(beneficiaryId),
    required_docs: required_docs?.trim() || null,
    docs_notes: docs_notes?.trim() || null,
    lineage_fix_required: lineage_fix_required === true,
    lineage_fix_note: lineage_fix_note?.trim() || null,
    requested_by: staff.userId,
    requested_by_name: requestedByName,
  })
  if (error) return NextResponse.json({ error: 'שמירת ההיסטוריה נכשלה' }, { status: 500 })

  // ─────────────────────────────────────────────────────────────────────────
  // תיעוד המשפחה — מה ביקשנו וההערה שנכתבה, בתיבת התיעוד שבראש הכרטסת.
  //
  // ⚠️ עד כה זה נשמר רק בטבלת docs_fix_requests, שאין לה תצוגה בכרטסת:
  // המזכיר סימן מסמכים, כתב הערה — ובתיעוד לא הופיע דבר. התיעוד הוא המקום
  // שאליו מסתכלים כשרוצים לדעת מה קרה עם המשפחה, ולכן זה חייב להגיע לשם.
  // ─────────────────────────────────────────────────────────────────────────
  const docLabels = await readDocTypes(db)
  const lines = ['📄 נדרשת השלמת מסמכים']
  const docKeys = (required_docs ?? '').split(',').map(s => s.trim()).filter(Boolean)
  if (docKeys.length) lines.push(`מסמכים שנדרשו: ${docKeys.map(k => docTypeLabel(k, docLabels)).join(' · ')}`)
  if (lineage_fix_required) lines.push(`עץ הדורות דרוש תיקון: ${lineage_fix_note?.trim() || '(ללא פירוט)'}`)
  if (docs_notes?.trim()) lines.push(`הערה שנשלחה לצאצא: ${docs_notes.trim()}`)

  void addBeneficiaryNote(db, {
    beneficiaryId: String(beneficiaryId),
    body: lines.join('\n'),
    authorId: staff.userId,
    authorName: requestedByName,
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

// סוגי המסמכים כפי שהוגדרו בהגדרות (ברירת מחדל אם אין/נכשל) — כדי שהתיעוד
// יציג "ת.ז. הבעל" ולא את המפתח הגולמי "id_husband".
async function readDocTypes(db: ReturnType<typeof getServiceClient>): Promise<DocTypeOption[]> {
  try {
    const { data } = await db!.from('app_settings').select('value').eq('key', 'doc_types').maybeSingle()
    if (data?.value) {
      const parsed = JSON.parse(data.value as string)
      if (Array.isArray(parsed) && parsed.length) return parsed
    }
  } catch { /* ברירת מחדל */ }
  return DEFAULT_DOC_TYPES
}
