// ─────────────────────────────────────────────────────────────────────────────
// החזרת טופס חתימת רב במייל — זיהוי הבקשה שאליה הטופס שייך.
//
// 🔴 הבעיה שזה פותר: הטופס חוזר ימים אחרי שנשלח, כקובץ סרוק בלי שום הקשר.
// בלי מזהה אי אפשר לדעת לאיזו בקשה הוא שייך, והוא נשאר בתיבה כקובץ יתום.
//
// ⚠️ שלוש שכבות זיהוי, לפי סדר אמינות — ובכוונה לא אחת:
//   1. כותרות השרשור (In-Reply-To / References) — הדרך הנקייה.
//   2. קוד בנושא ("הלוואה #A3F2K9") — שורד גם כשהכותרות נאכלות.
//   3. כתובת השולח — כשגם הקוד נמחק, ויש בדיוק בקשה אחת שממתינה.
//
// 🔴 השכבה השנייה אינה מיותרת: Google Workspace עושה dual-delivery ו"אוכל"
// כותרות. בדיוק כך אבדו משובי בתי ההחלמה — הקוד חיפש מזהה שלא הגיע וחזר
// בשקט. כאן המזהה גלוי בנושא, ולכן הוא שורד גם כשהכותרות לא.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { AWAITING_RABBI_FORM } from './openLoanGuard'

/** תווים ללא דמיון ויזואלי — בלי O/0, I/1, S/5. הקוד מוקלד ידנית לפעמים. */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789'
const CODE_LEN = 6

/**
 * קוד קצר לבקשה, נגזר ממזהה ההלוואה.
 *
 * ⚠️ דטרמיניסטי ולא אקראי: אין טבלה לתחזק, והקוד תמיד ניתן לחישוב מחדש
 * מתוך הבקשה עצמה. זה לא סוד — הוא רק מקשר תשובה לבקשה, והגישה מאומתת
 * ממילא לפי כתובת השולח.
 */
export function loanFormCode(loanId: string): string {
  const s = String(loanId ?? '')
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    h1 = ((h1 ^ s.charCodeAt(i)) * 0x01000193) >>> 0
    h2 = ((h2 + s.charCodeAt(i) * (i + 7)) * 0x85ebca6b) >>> 0
  }
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) {
    const mix = (i % 2 === 0 ? h1 : h2) >>> (Math.floor(i / 2) * 5)
    out += ALPHABET[mix % ALPHABET.length]
    if (i % 2 === 0) h1 = (h1 * 31 + 17) >>> 0
    else h2 = (h2 * 37 + 11) >>> 0
  }
  return out
}

/** נושא המייל שאליו המבקש משיב. הקוד חייב להופיע בו — הוא עוגן הזיהוי. */
export function rabbiFormSubject(loanId: string): string {
  return `טופס חתימת רב · בקשת הלוואה #${loanFormCode(loanId)}`
}

/** האם המייל הנכנס נראה כהחזרת טופס חתימת רב. */
export function looksLikeRabbiFormReturn(subject: string): boolean {
  return /טופס\s*חתימת\s*רב/.test(String(subject ?? ''))
}

/** מחלץ את הקוד מהנושא (גם כשלקוח המייל הוסיף "Re:" או תווי כיווניות). */
export function extractLoanFormCode(subject: string): string | null {
  const s = String(subject ?? '').replace(/[​-‏‪-‮⁦-⁩]/g, '')
  const m = s.match(new RegExp(`#\\s*([${ALPHABET}]{${CODE_LEN}})`, 'i'))
  return m ? m[1].toUpperCase() : null
}

/**
 * מאתר את הבקשה שאליה הטופס שייך.
 *
 * ⚠️ מוגבל לבקשות של אותו שולח: הקוד לבדו אינו הרשאה. בלי המגבלה הזו
 * מישהו שראה קוד בצילום מסך היה יכול לצרף מסמך לבקשה של אחר.
 */
export async function findLoanForReturnedForm(
  db: SupabaseClient,
  senderEmail: string,
  subject: string,
): Promise<{ loanId: string; matchedBy: 'code' | 'sender' } | null> {
  const clean = String(senderEmail ?? '').trim().toLowerCase()
  if (!clean) return null

  const { data: bens } = await db
    .from('beneficiaries')
    .select('id')
    .ilike('email', clean)
    .limit(5)
  if (!bens?.length) return null

  const { data: loans } = await db
    .from('loans')
    .select('id, created_at')
    .in('beneficiary_id', bens.map(b => b.id))
    .eq('status', AWAITING_RABBI_FORM)
    .order('created_at', { ascending: false })
  if (!loans?.length) return null

  // מסלול 1 — הקוד שבנושא מצביע על בקשה מסוימת.
  const code = extractLoanFormCode(subject)
  if (code) {
    const hit = loans.find(l => loanFormCode(String(l.id)) === code)
    if (hit) return { loanId: String(hit.id), matchedBy: 'code' }
  }

  // מסלול 2 — אין קוד, אבל יש בדיוק בקשה אחת שממתינה לטופס.
  //
  // ⚠️ רק כשיש *אחת*: אם למבקש שתי טיוטות פתוחות אין דרך לדעת לאיזו
  // הטופס שייך, ושיוך שגוי גרוע מאי-קליטה — הוא נראה תקין ואיש לא בודק.
  if (loans.length === 1) return { loanId: String(loans[0].id), matchedBy: 'sender' }

  return null
}
