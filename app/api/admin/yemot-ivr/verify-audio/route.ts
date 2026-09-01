import { NextResponse } from 'next/server'
import { requireStaff, unauthorized } from '@/lib/apiAuth'
import { getIvrConfig, saveIvrConfig, type IvrNodeDef } from '@/lib/ivrBuilder'


export const dynamic = 'force-dynamic'

const API = 'https://www.call2all.co.il/ym/api'
const IVR_EXT = process.env.YEMOT_FOLDER_IVR_FILES || '1'

// ─────────────────────────────────────────────────────────────────────────────
// ניקוי הפניות לקבצי קול שאינם קיימים עוד בימות.
//
// 🔴 למה זה קיים: הודעה שיש לה `file` נשלחת לימות כאסימון f-<שם>,
// והטקסט נזרק. ימות **מדלגת בשקט** על קובץ שאינו קיים וממשיכה הלאה —
// כלומר השלוחה משמיעה שקט מוחלט. המתקשר אינו יודע מה להקיש, ההקשה
// נדחית, והשיחה חוזרת על עצמה עד שהיא מתנתקת. אין שגיאה בשום צד.
//
// כך בדיוק מת התפריט הראשי: שמות הקבצים קיבלו חותמת זמן (כדי לעקוף את
// מטמון ימות), וההפניות הישנות — ivr_root_prompt וכדומה — נשארו
// מצביעות על שמות שכבר אינם קיימים.
//
// ⚠️ מנקים את ההפניה בלבד ולא את הטקסט: ברגע ש-file מתרוקן, ההודעה
// חוזרת להיקרא ב-TTS מהטקסט השמור — כלומר השלוחה מדברת שוב מיד, בלי
// להמתין ליצירת קול חדשה.
// ─────────────────────────────────────────────────────────────────────────────

/** שמות הקבצים שקיימים בפועל בתיקיית בונה השלוחות. */
async function existingFiles(token: string): Promise<Set<string> | null> {
  try {
    const url = `${API}/GetIVR2Dir?token=${encodeURIComponent(token)}`
      + `&path=${encodeURIComponent(`ivr2:/${IVR_EXT}`)}`
    const res = await fetch(url, { cache: 'no-store' })
    const json = await res.json().catch(() => null) as { files?: unknown } | null
    if (!Array.isArray(json?.files)) return null
    const out = new Set<string>()
    for (const f of json.files) {
      const name = typeof f === 'string'
        ? f
        : String((f as { name?: unknown; fileName?: unknown }).name
            ?? (f as { fileName?: unknown }).fileName ?? '')
      if (name) out.add(name.replace(/\.(mp3|wav)$/i, ''))
    }
    return out
  } catch {
    // ⚠️ null ולא סט ריק: סט ריק היה נראה כ"אין אף קובץ" ומנקה הכל.
    return null
  }
}

export async function POST() {
  if (!(await requireStaff(['admin']))) return unauthorized()

  const token = process.env.YEMOT_TOKEN
  if (!token) return NextResponse.json({ error: 'YEMOT_TOKEN אינו מוגדר בשרת' }, { status: 500 })

  const cfg = await getIvrConfig()
  if (!cfg) return NextResponse.json({ ok: true, cleaned: 0, nodes: [] })

  const files = await existingFiles(token)
  if (!files) {
    return NextResponse.json({ error: 'קריאת התיקייה בימות נכשלה — לא בוצע ניקוי' }, { status: 502 })
  }

  const cleaned: string[] = []
  const nodes: IvrNodeDef[] = cfg.nodes.map(n => {
    const next = { ...n }
    for (const field of ['prompt', 'invalid', 'accessDenied'] as const) {
      const a = next[field]
      if (a?.file && !files.has(a.file)) {
        cleaned.push(`${n.name} · ${a.file}`)
        next[field] = { text: a.text ?? '', file: null }
      }
    }
    return next
  })

  if (cleaned.length) {
    const saved = await saveIvrConfig({ ...cfg, nodes })
    if (!saved.ok) {
      return NextResponse.json({ error: saved.error ?? 'הניקוי נכשל בשמירה' }, { status: 500 })
    }
    console.log(`[yemot-ivr] נוקו ${cleaned.length} הפניות לקבצים שאינם קיימים: ${cleaned.join(', ')}`)
  }

  return NextResponse.json({ ok: true, cleaned: cleaned.length, nodes: cleaned })
}
