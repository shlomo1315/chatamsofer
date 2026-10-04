import { NextResponse, type NextRequest } from 'next/server'
import { requirePermission, getServiceClient } from '@/lib/apiAuth'
import { uploadFileToYemot, deleteFileFromYemot, yemotConfigured } from '@/lib/yemot'
import { generateSpeech } from '@/lib/elevenTts'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────────
// הקלטה קולית לכל ספר בשלוחה הטלפונית.
//
// 🔴 למה: שם הספר מוקרא ב-TTS של ימות מתוך {title}, ושמות ספרי קודש
// ("שו״ת חתם סופר", "ליקוטי הערות") יוצאים משובשים. הקלטה לכל ספר
// נשמעת נכון.
//
// ⚠️ 🔴 MP3, כמו בחגים וביולדות — **לא** PCM 8kHz. ההמרה המקדימה
// ל-PCM היא מה שהפיל את השלוחה: כל שיחה עם טוקן `f-` נותקה מיד אחרי
// הברכה, בכל תצורה, בעוד כל שיחה עם `t-` עבדה (הלוגים של 04.10).
// `uploadFileToYemot` שולח `convertAudio=1` — ימות ממירה בעצמה.
//
// ⚠️ חותמת זמן בשם הקובץ: ימות מחזיקה מטמון לפי שם, ושם קבוע גרם
// לכך שההקלטה *הישנה* המשיכה להתנגן אחרי כל עדכון, בלי שום סימן.
// ─────────────────────────────────────────────────────────────────────────────

const EXT = process.env.YEMOT_BOOK_FAIR_EXT || '9'

/** העלאת אודיו לשלוחה והחזרת שם הקובץ (בלי סיומת). */
async function putAudio(
  baseName: string,
  bytes: ArrayBuffer,
  prevName: string | null,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const up = await uploadFileToYemot(
    `ivr2:/${EXT}/${baseName}.mp3`,
    new Blob([bytes], { type: 'audio/mpeg' }),
    `${baseName}.mp3`,
  )
  if (!up.ok) return { ok: false, error: `העלאה לימות נכשלה: ${up.error}` }

  // ניקוי הקודם — best-effort ואחרי ההעלאה: כישלון מחיקה משאיר קובץ
  // מיותר, אבל לא שובר את ההשמעה החדשה.
  //
  // ⚠️ שתי הסיומות: הקבצים שנוצרו עד 04.10 הם `.wav` (PCM) ששברו את
  // השלוחה. מחיקת `.mp3` בלבד הייתה משאירה אותם שם.
  if (prevName && prevName !== baseName) {
    for (const ext of ['mp3', 'wav'] as const) {
      const gone = await deleteFileFromYemot(`ivr2:/${EXT}/${prevName}.${ext}`)
      if (!gone.ok) console.warn(`[book-audio] מחיקת הקובץ הקודם נכשלה (${prevName}.${ext}): ${gone.error}`)
    }
  }
  return { ok: true, name: baseName }
}

// GET — רשימת הספרים עם מצב ההקלטה שלהם.
export async function GET() {
  if (!(await requirePermission('book_fair', 'view'))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'המסד אינו מוגדר' }, { status: 500 })

  const { data, error } = await db
    .from('book_fair_books')
    .select('id, sku, title, description, audio_name, is_active, is_hidden')
    .eq('is_active', true)
    .eq('is_hidden', false)
    .order('sku')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // הקלטות הקטגוריות — ב-app_settings, כי קטגוריה אינה טבלה אלא ערך
  // בשדה description. ⚠️ העמודה היא text: תמיד JSON.parse/stringify.
  const { data: catRow } = await db.from('app_settings')
    .select('value').eq('key', 'book_fair_category_audio').maybeSingle()
  let categories: Record<string, string> = {}
  try { categories = JSON.parse(String(catRow?.value ?? '{}')) } catch { /* ריק */ }

  return NextResponse.json({
    books: data ?? [],
    categories,
    hasVoice: yemotConfigured(),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

// POST — יצירת קול נוירוני לספר או לקטגוריה, או העלאת קובץ ידני.
export async function POST(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  if (!yemotConfigured()) {
    return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'המסד אינו מוגדר' }, { status: 500 })

  const ct = request.headers.get('content-type') ?? ''

  // ── העלאת קובץ ידנית ──
  if (ct.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    const bookId = String(form.get('book_id') ?? '')
    const category = String(form.get('category') ?? '')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'לא נשלח קובץ' }, { status: 400 })
    }
    // ⚠️ הקובץ עובר ל-convertAudio של ימות (uploadFileToYemot), והיא
    // ממירה אותו לפורמט שלה. העלאה ידנית אינה חייבת להיות 8kHz.
    const bytes = await file.arrayBuffer()
    const stamp = Date.now().toString(36)

    if (bookId) {
      const { data: prev } = await db.from('book_fair_books')
        .select('audio_name, sku').eq('id', bookId).maybeSingle()
      if (!prev) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })
      const r = await putAudio(`rec_bk_${prev.sku}_${stamp}`, bytes, prev.audio_name ?? null)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
      const { error } = await db.from('book_fair_books')
        .update({ audio_name: r.name }).eq('id', bookId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, audio: r.name })
    }

    if (category) {
      const { data: row } = await db.from('app_settings')
        .select('value').eq('key', 'book_fair_category_audio').maybeSingle()
      let map: Record<string, string> = {}
      try { map = JSON.parse(String(row?.value ?? '{}')) } catch { /* ריק */ }
      const r = await putAudio(`rec_cat_${stamp}`, bytes, map[category] ?? null)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
      map[category] = r.name
      const { error } = await db.from('app_settings').upsert({
        key: 'book_fair_category_audio',
        value: JSON.stringify(map),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, audio: r.name })
    }
    return NextResponse.json({ error: 'יש לציין ספר או קטגוריה' }, { status: 400 })
  }

  // ── יצירת קול נוירוני ──
  const body = await request.json().catch(() => ({})) as {
    book_id?: string; category?: string; all?: boolean
  }

  /** יוצר ומעלה קול אחד. */
  const one = async (text: string, base: string, prev: string | null) => {
    // 🔴 MP3 ולא pcm_8000: ראו ההערה בראש הקובץ.
    const sp = await generateSpeech(text)
    if (!sp.ok || !sp.audio) return { ok: false as const, error: sp.error ?? 'יצירת הקול נכשלה' }
    return putAudio(base, sp.audio, prev)
  }

  if (body.book_id) {
    const { data: b } = await db.from('book_fair_books')
      .select('id, sku, title, audio_name').eq('id', body.book_id).maybeSingle()
    if (!b) return NextResponse.json({ error: 'הספר לא נמצא' }, { status: 404 })
    const r = await one(b.title, `tts_bk_${b.sku}_${Date.now().toString(36)}`, b.audio_name ?? null)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
    const { error } = await db.from('book_fair_books')
      .update({ audio_name: r.name }).eq('id', b.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, audio: r.name })
  }

  if (body.category) {
    const { data: row } = await db.from('app_settings')
      .select('value').eq('key', 'book_fair_category_audio').maybeSingle()
    let map: Record<string, string> = {}
    try { map = JSON.parse(String(row?.value ?? '{}')) } catch { /* ריק */ }
    const r = await one(body.category, `tts_cat_${Date.now().toString(36)}`, map[body.category] ?? null)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 502 })
    map[body.category] = r.name
    const { error } = await db.from('app_settings').upsert({
      key: 'book_fair_category_audio',
      value: JSON.stringify(map),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, audio: r.name })
  }

  // ── כל הספרים בבת אחת ──
  //
  // ⚠️ מוגבל ל-25 בקריאה: 111 ספרים הם דקות ארוכות והבקשה הייתה
  // נקטעת ב-timeout באמצע — חלק מוקלט וחלק לא, בלי לדעת היכן נעצר.
  // הלקוח קורא שוב עד ש-remaining מתאפס.
  if (body.all) {
    const { data: books } = await db.from('book_fair_books')
      .select('id, sku, title, audio_name')
      .eq('is_active', true).eq('is_hidden', false)
      .is('audio_name', null)
      .order('sku').limit(25)
    const list = books ?? []
    let done = 0
    const failed: string[] = []
    for (const b of list) {
      const r = await one(b.title, `tts_bk_${b.sku}_${Date.now().toString(36)}`, null)
      if (!r.ok) { failed.push(`${b.sku}: ${r.error}`); continue }
      await db.from('book_fair_books').update({ audio_name: r.name }).eq('id', b.id)
      done++
    }
    const { count } = await db.from('book_fair_books')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true).eq('is_hidden', false).is('audio_name', null)
    return NextResponse.json({ ok: true, done, failed, remaining: count ?? 0 })
  }

  return NextResponse.json({ error: 'יש לציין ספר, קטגוריה או all' }, { status: 400 })
}

// DELETE — הסרת הקלטה (חזרה ל-TTS).
export async function DELETE(request: NextRequest) {
  if (!(await requirePermission('book_fair', 'edit'))) {
    return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 })
  }
  const db = getServiceClient()
  if (!db) return NextResponse.json({ error: 'המסד אינו מוגדר' }, { status: 500 })

  const bookId = request.nextUrl.searchParams.get('book_id')
  const category = request.nextUrl.searchParams.get('category')

  if (bookId) {
    const { data: b } = await db.from('book_fair_books')
      .select('audio_name').eq('id', bookId).maybeSingle()
    // ⚠️ שתי הסיומות — ראו ההערה ב-putAudio.
    if (b?.audio_name) {
      for (const ex of ['mp3', 'wav'] as const) {
        await deleteFileFromYemot(`ivr2:/${EXT}/${b.audio_name}.${ex}`)
      }
    }
    const { error } = await db.from('book_fair_books')
      .update({ audio_name: null }).eq('id', bookId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (category) {
    const { data: row } = await db.from('app_settings')
      .select('value').eq('key', 'book_fair_category_audio').maybeSingle()
    let map: Record<string, string> = {}
    try { map = JSON.parse(String(row?.value ?? '{}')) } catch { /* ריק */ }
    if (map[category]) {
      for (const ex of ['mp3', 'wav'] as const) {
        await deleteFileFromYemot(`ivr2:/${EXT}/${map[category]}.${ex}`)
      }
    }
    delete map[category]
    await db.from('app_settings').upsert({
      key: 'book_fair_category_audio',
      value: JSON.stringify(map),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'יש לציין ספר או קטגוריה' }, { status: 400 })
}
