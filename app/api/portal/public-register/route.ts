import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { registrationReceivedEmail } from '@/lib/emailTemplates'
import { deliverMail } from '@/lib/sendMail'
import { mailFor } from '@/lib/departments'
import { rateLimit, clientIp } from '@/lib/rateLimit'
import { validateIsraeliId } from '@/lib/validation'
import { getRegistrationGate, registrationAllowed } from '@/lib/registrationGate'
import { placeAnnouncementCall } from '@/lib/yemotCall'
import { getRegistrationCallText, getRegistrationCallAudio } from '@/lib/registrationCallMessage'
import { verifyVerifyToken } from '@/lib/verifyToken'
import { normalizePhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request: NextRequest) {
  // הגבלת קצב — מניעת רישומי ספאם המוניים
  if (!rateLimit(`public-register:${clientIp(request)}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'יותר מדי ניסיונות רישום. נסה שוב מאוחר יותר.' }, { status: 429 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  const {
    id_number, id_doc_type, full_name, family_name, phone, phone2, email,
    address, city, birth_date, gender, marital_status,
    spouse_name, spouse_id_number, spouse_id_doc_type, spouse_phone, spouse_birth_date, children, children_count, notes, lineage_node_id, lineage_manual, lineage_chain, lineage_new_nodes, past_benefits,
    email_verify_token, phone_verify_token, phone_tokens,
  } = body

  if (!id_number || !full_name || !family_name) {
    return NextResponse.json({ error: 'שדות חובה חסרים' }, { status: 400 })
  }

  // חייב להיות לפחות מספר טלפון אחד (בעל / אשה / נוסף)
  const phoneList = [phone, spouse_phone, phone2].map(p => (p ? String(p).trim() : '')).filter(Boolean)
  if (phoneList.length === 0) {
    return NextResponse.json({ error: 'יש להזין לפחות מספר טלפון אחד' }, { status: 400 })
  }

  // כתובת מלאה חובה — עיר, רחוב ומספר בית (הכתובת מגיעה כמחרוזת "רחוב מספר")
  if (!city || !String(city).trim()) {
    return NextResponse.json({ error: 'יש להזין עיר מגורים' }, { status: 400 })
  }
  {
    const addr = String(address ?? '').trim()
    const m = addr.match(/^(.*?)\s*(\d[\d/א-ת\s]*)$/)
    const streetPart = (m ? m[1] : addr).trim()
    const housePart = (m ? m[2] : '').trim()
    if (!streetPart || !housePart) {
      return NextResponse.json({ error: 'יש להזין כתובת מלאה — רחוב ומספר בית' }, { status: 400 })
    }
  }

  // אימות חובה: כתובת המייל חייבת להיות מאומתת בקוד.
  if (!email || !verifyVerifyToken(email_verify_token as string | undefined, 'email', String(email))) {
    return NextResponse.json({ error: 'יש לאמת את כתובת המייל בקוד שנשלח אליה לפני סיום הרישום.' }, { status: 400 })
  }
  // טלפונים — חובה לפחות מספר אחד מאומת. אוספים את כל המספרים המאומתים (verified_phones).
  const verifiedPhones: string[] = []
  const rawTokens = Array.isArray(phone_tokens) ? (phone_tokens as { value?: unknown; token?: unknown }[]) : []
  for (const t of rawTokens) {
    const val = t?.value ? String(t.value).trim() : ''
    const tok = t?.token ? String(t.token) : ''
    if (val && tok && verifyVerifyToken(tok, 'phone', val)) {
      const norm = normalizePhone(val)
      if (norm && !verifiedPhones.includes(norm)) verifiedPhones.push(norm)
    }
  }
  // תאימות לאחור — לקוח ישן ששלח phone_verify_token יחיד לטלפון הבעל
  if (verifiedPhones.length === 0 && phone && verifyVerifyToken(phone_verify_token as string | undefined, 'phone', String(phone))) {
    const norm = normalizePhone(String(phone))
    if (norm) verifiedPhones.push(norm)
  }
  if (verifiedPhones.length === 0) {
    return NextResponse.json({ error: 'יש לאמת לפחות מספר טלפון אחד בקוד שיוקרא בשיחה לפני סיום הרישום.' }, { status: 400 })
  }

  const isPassport = String(id_doc_type ?? 'id') === 'passport'
  const cleanId = isPassport
    ? String(id_number).trim()
    : String(id_number).replace(/\D/g, '')

  if (isPassport) {
    if (cleanId.length < 5 || cleanId.length > 20) {
      return NextResponse.json({ error: 'מספר דרכון לא תקין' }, { status: 400 })
    }
  } else {
    // תעודת זהות ישראלית — כולל אימות ספרת ביקורת (מונע ת"ז שגויה/מומצאת)
    if (!validateIsraeliId(cleanId)) {
      return NextResponse.json({ error: 'מספר תעודת זהות לא תקין' }, { status: 400 })
    }
  }

  const admin = getAdminClient()
  if (!admin) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

  // שער ההרשמה — חסום אם ההרשמה סגורה, אלא אם הוצג קוד עוקף תקין (לטסטים)
  const gate = await getRegistrationGate(admin)
  if (!registrationAllowed(gate, body.bypass as string | undefined)) {
    return NextResponse.json({ error: 'ההרשמה למערכת סגורה כעת. לפרטים ניתן לפנות למזכירות.' }, { status: 403 })
  }

  const { data: existing } = await admin.from('beneficiaries').select('id').eq('id_number', cleanId).maybeSingle()
  if (existing) return NextResponse.json({ error: 'תעודת זהות זו כבר רשומה במערכת' }, { status: 409 })

  const isSpousePassport = String(spouse_id_doc_type ?? 'id') === 'passport'
  const cleanSpouseId = spouse_id_number
    ? (isSpousePassport ? String(spouse_id_number).trim() : String(spouse_id_number).replace(/\D/g, ''))
    : ''

  // מניעת כפילות תעודת זהות של הילדים — קריטי למניעת טעויות
  if (Array.isArray(children) && children.length) {
    const seen = new Set<string>()
    for (const c of children as { name?: string; id_number?: string }[]) {
      const cid = (c?.id_number ?? '').replace(/\D/g, '')
      if (!cid) continue
      const childName = (c?.name ?? '').trim() || 'הילד/ה'
      // א. כפילות בתוך אותה משפחה (אותה רשימה / זהה להורה) — מציינים שם
      if (seen.has(cid)) return NextResponse.json({ error: `תעודת הזהות של ${childName} מופיעה פעמיים ברשימת הילדים.` }, { status: 409 })
      if (cid === cleanId || (cleanSpouseId && cid === cleanSpouseId)) {
        return NextResponse.json({ error: `תעודת הזהות של ${childName} זהה לזו של ההורה. יש להזין תעודת זהות נכונה.` }, { status: 409 })
      }
      seen.add(cid)
      // ב. כבר קיים במערכת על שם רשומה אחרת — לא חושפים פרטים
      const { data: asBen } = await admin.from('beneficiaries').select('id').or(`id_number.eq.${cid},spouse_id_number.eq.${cid}`).limit(1)
      const { data: asChild } = await admin.from('beneficiaries').select('id').contains('children', [{ id_number: cid }]).limit(1)
      if ((asBen?.length || asChild?.length)) {
        return NextResponse.json({ error: `תעודת הזהות ${cid} כבר קיימת במערכת. לא ניתן לרשום אותה פעם נוספת.` }, { status: 409 })
      }
    }
  }

  const isMarried = String(marital_status) === 'נשואים'
  const cleanChildCount = Array.isArray(children) ? children.length : (typeof children_count === 'number' ? children_count : parseInt(String(children_count || '0'), 10))
  const childrenJson = Array.isArray(children) && children.length > 0 ? children : null
  const sharedFields = {
    // טלפון ראשי — של הבעל אם הוזן, אחרת המספר הראשון שהוזן (בעל אינו חובה יותר)
    phone: phone ? String(phone).trim() : (phoneList[0] ?? null),
    phone2: phone2 ? String(phone2).trim() : null,
    verified_phones: verifiedPhones.length ? verifiedPhones : null,
    email: email ? String(email).toLowerCase().trim() : null,
    address: address ? String(address).trim() : null,
    city: city ? String(city).trim() : null,
    marital_status: marital_status ? String(marital_status) : null,
    children_count: cleanChildCount,
    children: childrenJson,
    notes: notes ? String(notes).trim() : null,
    lineage_node_id: lineage_node_id ? String(lineage_node_id) : null,
    lineage_manual: Array.isArray(lineage_manual) && lineage_manual.length > 0 ? lineage_manual : null,
    lineage_chain: Array.isArray(lineage_chain) && lineage_chain.length > 0 ? lineage_chain : null,
    past_benefits: past_benefits && typeof past_benefits === 'object' ? past_benefits : null,
    eligibility_status: 'pending',
    is_active: true,
  }

  // נשואים = משפחה אחת = כרטסת אחת. הבעל והאשה נשמרים על אותה רשומה
  // (full_name + spouse_name), ולא כשתי רשומות נפרדות.
  const records: Record<string, unknown>[] = [{
    id_number: cleanId,
    id_doc_type: isPassport ? 'passport' : 'id',
    full_name: String(full_name).trim(),
    family_name: String(family_name).trim(),
    birth_date: birth_date || null,
    gender: isMarried ? 'male' : (gender || null),
    spouse_name: spouse_name ? String(spouse_name).trim() : null,
    spouse_id_number: cleanSpouseId || null,
    spouse_phone: spouse_phone ? String(spouse_phone).trim() : null,
    spouse_birth_date: spouse_birth_date || null,
    ...sharedFields,
  }]

  let { error } = await admin.from('beneficiaries').insert(records)

  // Retry without optional columns that may not exist in DB yet (pending migrations)
  if (error && error.message?.includes('column') && error.message?.includes('does not exist')) {
    console.error('[public-register] column missing, retrying without optional fields:', error.message)
    const stripped = records.map(r => {
      const { spouse_phone, spouse_birth_date, children, lineage_manual, lineage_chain, past_benefits, verified_phones, ...rest } = r as Record<string, unknown>
      void spouse_phone; void spouse_birth_date; void children; void lineage_manual; void lineage_chain; void past_benefits; void verified_phones
      return rest
    })
    const retry = await admin.from('beneficiaries').insert(stripped)
    error = retry.error
  }

  if (error) {
    console.error('[public-register] insert error:', error.code, error.message, error.details)
    if (error.code === '23505') return NextResponse.json({ error: 'פרטים אלו כבר קיימים במערכת' }, { status: 409 })
    return NextResponse.json({ error: 'שגיאה בשמירת הנתונים. אנא נסה שוב.' }, { status: 500 })
  }

  // הכנסת הדורות שהנרשם הוסיף ידנית (אבות + הנרשם) לעץ הדורות בסטטוס "ממתין לאימות",
  // משורשרים תחת הצומת המאומת שנבחר. הנרשם מקושר לצומת האחרון (מיקומו בעץ).
  try {
    if (lineage_node_id && Array.isArray(lineage_new_nodes) && lineage_new_nodes.length) {
      const { data: sel } = await admin.from('lineage_nodes').select('id, generation').eq('id', String(lineage_node_id)).maybeSingle()
      if (sel) {
        let parentId: string = sel.id
        let gen: number = sel.generation as number
        let lastId: string = sel.id
        const newPendingNames: string[] = []
        for (const n of lineage_new_nodes as { name?: string; relation?: string }[]) {
          const nm = (n?.name ?? '').toString().trim().replace(/\s+/g, ' ')
          if (!nm) continue
          gen += 1
          const rel = n?.relation === 'son' || n?.relation === 'son_in_law' ? n.relation : null
          // שם שכבר אושר (מאומת) תחת אותו אב — שימוש חוזר בצומת הקיים, בלי ליצור כפילות
          // "ממתין לאישור" שתדרוש אישור חוזר. זה מונע את הבאג של אישור חוזר לשם מאושר.
          const { data: existing } = await admin.from('lineage_nodes')
            .select('id, generation').eq('parent_id', parentId).eq('status', 'verified').ilike('name', nm).limit(1).maybeSingle()
          if (existing?.id) { parentId = existing.id; lastId = existing.id; gen = (existing.generation as number) ?? gen; continue }
          const { data: node } = await admin.from('lineage_nodes')
            .insert({ name: nm, parent_id: parentId, generation: gen, relation: rel, status: 'pending' })
            .select('id').single()
          if (node?.id) { parentId = node.id; lastId = node.id; newPendingNames.push(nm) }
        }
        if (lastId !== sel.id) {
          await admin.from('beneficiaries').update({ lineage_node_id: lastId }).eq('id_number', cleanId)
        }
        // אישור אוטומטי — שם שנעשה בו שימוש ע"י 10 נרשמים או יותר (מופיע ב-lineage_chain
        // של 10 משפחות) מאושר אוטומטית ומופיע לכולם ברשימת הבחירה.
        const AUTO_VERIFY_THRESHOLD = 10
        for (const nm of [...new Set(newPendingNames)]) {
          try {
            const { count } = await admin.from('beneficiaries')
              .select('id', { count: 'exact', head: true })
              .contains('lineage_chain', [{ name: nm }])
            if ((count ?? 0) >= AUTO_VERIFY_THRESHOLD) {
              await admin.from('lineage_nodes').update({ status: 'verified' }).eq('name', nm).eq('status', 'pending')
            }
          } catch { /* ספירה/אישור לא חוסמים את הרישום */ }
        }
      }
    }
  } catch (e) {
    console.error('[public-register] lineage nodes insert failed:', e)
  }

  // Send confirmation email (non-blocking) — מעוצב עם כל פרטי הרישום + קישור לפורטל
  if (email) {
    const reg = registrationReceivedEmail({
      full_name: full_name ? String(full_name) : null,
      family_name: family_name ? String(family_name) : null,
      id_number: id_number ? String(id_number) : null,
      phone: phone ? String(phone) : null,
      email: String(email),
      address: address ? String(address) : null,
      city: city ? String(city) : null,
      marital_status: marital_status ? String(marital_status) : null,
      spouse_name: spouse_name ? String(spouse_name) : null,
      spouse_id_number: spouse_id_number ? String(spouse_id_number) : null,
      children_count: cleanChildCount,
    })
    deliverMail(String(email), reg.subject, reg.html, undefined, mailFor('igud'))
      .catch(e => console.error('[public-register] confirmation email failed:', e))
  }

  // שיחה טלפונית יוצאת (לא-חוסמת): הקראת אישור קליטת הרישום למספר של הנרשם.
  // אם ימות אינו מוגדר — placeAnnouncementCall מחזיר notConfigured ולא מבצע שיחה.
  if (phone) {
    // הטקסט ניתן לעריכה מדף ההגדרות (registration_call_message). הכתובת מוקראת
    // בעברית מדוברת ואז אות-אות באנגלית — לפי הנוסח השמור.
    Promise.all([getRegistrationCallText(), getRegistrationCallAudio()])
      .then(([text, audio]) => placeAnnouncementCall(String(phone), text, { audioFile: audio }))
      .then((r) => {
        if (r && !r.ok && !r.notConfigured) console.error('[public-register] announcement call failed:', r.error)
      })
      .catch((e) => console.error('[public-register] announcement call error:', e))
  }

  return NextResponse.json({ ok: true })
}
