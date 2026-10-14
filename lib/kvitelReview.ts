import type { SupabaseClient } from '@supabase/supabase-js'
import { askClaudeJson } from '@/lib/kvitelAi'
import { cleanName, personKey, type KvitelLineInput } from '@/lib/kvitel'

// ─────────────────────────────────────────────────────────────────────────────
// סוכן האחידות של הקוויטל — רץ על כל הגשה, מכל ערוץ, בתוך ingestKvitel.
//
// 🔴 הוא רק מסמן ולעולם לא מוחק או משנה: שם שנמחק בטעות לא יגיע לציון, ואיש
// לא יידע. שורה מסומנת מעבירה את כל הבקשה ל"לבדיקה", וכך היא לא נכנסת
// לקובץ ה-Word עד שאיש צוות מאשר.
//
// מה מסומן:
//   • כפילות — אותו אדם פעמיים באותה הגשה, או שכבר הוגש בימים האחרונים.
//   • כתיב — מילה שאינה במילון אבל רחוקה באות אחת משם מאושר ("פעשה" ← "פעשא").
//   • בקשה חריגה — בקשה חופשית עם ביטוי לא מכובד, קישור או מספרים.
//   • שם לא בעברית.
//   • בקשה חופשית ("אחר") שה-AI מעריך שאינה מתאימה לציון — רק כשה-AI זמין.
// ─────────────────────────────────────────────────────────────────────────────

export const RECENT_DAYS = 6

// ביטויים שאין להם מקום בקוויטל לציון. רשימה שמרנית — מספיק שיסמן לבדיקה.
const UNFIT = ['ימות', 'שימות', 'מוות ל', 'נקמה', 'נקום', 'קללה', 'ארור', 'ימח שמו', 'שייפגע', 'שיפגע', 'שיסבול', 'שיתגרש', 'שתתגרש', 'רע ל', 'יחלה']

const word = (s: string) => s.replace(/['"׳״\s-]/g, '')

// מרחק עריכה ≤ 1 (החלפה, הוספה או מחיקה של אות אחת), בלי לחשב את כל המטריצה.
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++
    else if (b.length > a.length) j++
    else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

export interface ReviewContext {
  dictionary: string[]       // שמות מאושרים (מילה אחת או שם מלא)
  recentKeys: Set<string>    // personKey של שמות שהוגשו בימים האחרונים
}

function spellingHint(text: string, approved: Set<string>, approvedList: string[]): string | null {
  for (const w of cleanName(text).split(' ')) {
    const k = word(w)
    if (k.length < 3 || approved.has(k)) continue
    const near = approvedList.find(a => a.length >= 3 && withinOneEdit(k, a))
    if (near) return `כתיב: אולי "${near}" במקום "${w}"`
  }
  return null
}

function unfitReason(l: KvitelLineInput): string | null {
  const note = l.requestNote ?? ''
  if (/https?:|www\.|@/i.test(note)) return 'בקשה חריגה: קישור או כתובת'
  if (/\d{3,}/.test(note)) return 'בקשה חריגה: מספרים'
  const hay = ` ${note} ${l.name} ${l.parentName} `
  const hit = UNFIT.find(p => hay.includes(` ${p}`))
  return hit ? 'בקשה חריגה: נוסח לא מכובד' : null
}

// מחזיר סיבת סימון לכל שורה (null = תקינה). פונקציה טהורה — נבדקת ב-kvitelReview.test.
export function reviewLines(lines: KvitelLineInput[], ctx: ReviewContext): (string | null)[] {
  const approvedList = [...new Set(ctx.dictionary.flatMap(n => cleanName(n).split(' ').map(word)).filter(Boolean))]
  const approved = new Set(approvedList)
  const seen = new Set<string>()
  return lines.map(l => {
    const reasons: string[] = []
    const key = personKey(l)
    if (seen.has(key)) reasons.push('כפילות באותה הגשה')
    else if (ctx.recentKeys.has(key)) reasons.push(`כבר הוגש ב-${RECENT_DAYS} הימים האחרונים`)
    seen.add(key)
    if (!/[א-ת]/.test(l.name + l.parentName) || /[a-z]/i.test(l.name + l.parentName)) reasons.push('שם לא בעברית')
    const unfit = unfitReason(l)
    if (unfit) reasons.push(unfit)
    const spell = approved.size ? (spellingHint(l.name, approved, approvedList) ?? spellingHint(l.parentName, approved, approvedList)) : null
    if (spell) reasons.push(spell)
    return reasons.length ? reasons.join(' · ') : null
  })
}

// טוען את ההקשר מהמסד. ⚠️ נכשל-שקט: תקלה בשליפה לא חוסמת קליטה — רק בלי סימון.
export async function loadReviewContext(db: SupabaseClient): Promise<ReviewContext> {
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString()
  const [dict, recent] = await Promise.all([
    db.from('kvitel_name_dictionary').select('name').limit(5000),
    db.from('kvitel_request_lines')
      .select('name, relation, parent_name, kvitel_requests!inner(status)')
      .gte('created_at', since)
      .neq('kvitel_requests.status', 'cancelled')
      .limit(5000),
  ])
  if (dict.error) console.error('[kvitel-review] dictionary load failed:', dict.error.message)
  if (recent.error) console.error('[kvitel-review] recent load failed:', recent.error.message)
  return {
    dictionary: (dict.data ?? []).map(r => String(r.name)),
    recentKeys: new Set((recent.data ?? []).map(r => personKey({ name: r.name, relation: r.relation, parentName: r.parent_name }))),
  }
}

// בדיקת AI לבקשות החופשיות בלבד (סוג "אחר"): הרשימה הקבועה לא תופסת ניסוח עקיף.
// ⚠️ נכשל-שקט ובזמן קצוב: הטופס הציבורי ממתין לזה, ותקלה ב-AI לא תמנע קליטה.
export async function aiNoteFlags(lines: KvitelLineInput[]): Promise<(string | null)[]> {
  const idx = lines.flatMap((l, i) => (l.requestType === 'other' && l.requestNote ? [i] : []))
  const out: (string | null)[] = lines.map(() => null)
  if (!idx.length) return out
  const res = await askClaudeJson<{ unfit: number[] }>({
    system: 'אתה בודק בקשות שנכתבות בקוויטל שמתפללים בו על ציון צדיק. בקשה מתאימה היא בקשה לטובה (בריאות, פרנסה, שלום בית, הצלחה, ישועה). בקשה לא מתאימה: נגד אדם אחר, קללה, ליצנות, תוכן מיני או פוליטי, פרסום. ענה JSON בלבד.',
    prompt: `החזר {"unfit":[מספרי הבקשות שאינן מתאימות]}.\n${idx.map((i, n) => `${n}: ${lines[i].requestNote}`).join('\n')}`,
    maxTokens: 200, timeoutMs: 6000, fast: true,
  })
  for (const n of res?.unfit ?? []) if (Number.isInteger(n) && idx[n] !== undefined) out[idx[n]] = 'בקשה חריגה (בדיקת AI)'
  return out
}
