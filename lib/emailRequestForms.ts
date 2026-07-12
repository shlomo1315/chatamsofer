// הגשת בקשות במייל (לחסומים): בניית טיוטת מייל, פרסור ואימות — לכל סוגי הבקשות.
// המשתמש מקבל קישור mailto עם נושא "בקשת <סוג> · ת.ז <מספר>" וגוף עם שדות למילוי
// שורה-אחר-שורה. בשליחה, ה-webhook מזהה לפי הנושא, מפרסר, מאמת, ומכניס למערכת.
import { validateIsraeliId } from './validation'

export type ReqType = 'birth' | 'silent_birth' | 'loan' | 'financial_aid' | 'widow'

// ── קבועי הלוואה — מקור אמת יחיד לפורטל, לטופס המייל ולמסכי הניהול ──
export const LOAN_MAX_AMOUNT = 30_000
export const LOAN_MAX_INSTALLMENTS = 60

export const LOAN_PURPOSES = [
  'נישואי הבן/הבת',
  'שמחה משפחתית',
  'הוצאה רפואית',
  'חובות מנישואי הילדים',
  'רכישת דירה',
  'אחר',
] as const

// מטרה שמחייבת צירוף הזמנה לחתונה
export const WEDDING_PURPOSE = 'נישואי הבן/הבת'

// הצהרה על פנייה קודמת לגמ״ח
export const LOAN_DECLARATIONS = [
  'לא הגשתי',
  'הגשתי וקיבלתי',
  'הגשתי וסורבתי',
  'הגשתי, אושרתי ולא מימשתי',
] as const

// תווית הנושא לכל סוג (זיהוי הסוג לפי תחילת שורת הנושא)
export const SUBJECT_PREFIX: Record<ReqType, string> = {
  birth: 'בקשת לידה',
  silent_birth: 'בקשת לידה שקטה',
  loan: 'בקשת הלוואה',
  financial_aid: 'בקשת סיוע רפואי',
  widow: 'בקשת סיוע אלמנה',
}

// זיהוי סוג הבקשה מתוך שורת הנושא (לידה שקטה לפני לידה — כי "לידה" מוכל ב"לידה שקטה").
// עמיד: מסיר סימוני כיווניות (RTL/LTR marks) ורווחים כפולים, ותופס וריאציות ניסוח נפוצות.
export function detectReqType(subject: string): ReqType | null {
  const s = String(subject ?? '')
    .replace(/[‎‏‪-‮⁦-⁩ ]/g, ' ') // סימוני כיווניות + NBSP → רווח
    .replace(/\s+/g, ' ')
    .trim()
  if (/ליד[הת]\s*שקט/.test(s)) return 'silent_birth'
  // "בקשת לידה" / "בקשה ללידה" / "בקשה ליולדת" ווריאציות
  if (/בקש.{0,6}ליד/.test(s) || /בקש.{0,6}יולד/.test(s) || s.includes('בקשת לידה') || s.includes('בקשה ליולדת')) return 'birth'
  if (s.includes('הלוואה') || s.includes('גמ"ח') || s.includes('גמח')) return 'loan'
  if (s.includes('סיוע רפואי') || (s.includes('סיוע') && s.includes('רפוא'))) return 'financial_aid'
  if (s.includes('אלמנה') || s.includes('אלמן')) return 'widow'
  return null
}

// ── שדה בטופס ────────────────────────────────────────────────────────────────
export type Field = {
  key: string
  label: string                 // התווית שמופיעה בטיוטה (לפני ה-":")
  hint?: string                 // הסבר פורמט (בסוגריים)
  required: boolean
  options?: string[]            // לשדה "מחק את המיותר"
}

export type AttachmentSpec = { name: string; label: string; required: boolean }

// ── הגדרות לכל סוג בקשה (השדות נבנים דינמית עם בתי החלמה/מוקדים) ──
type Ctx = { recoveryHomes: string[]; centers: { id: string; name: string; city: string | null }[]; pending: boolean }

function idAttachments(pending: boolean): AttachmentSpec[] {
  return pending
    ? [
        { name: 'תעודת-זהות-בעל', label: 'תעודת זהות של הבעל (כולל ספח)', required: true },
        { name: 'תעודת-זהות-אשה', label: 'תעודת זהות של האשה (כולל ספח)', required: true },
      ]
    : []
}

export function fieldsFor(type: ReqType, ctx: Ctx): Field[] {
  switch (type) {
    case 'birth':
      return [
        { key: 'birth_date', label: 'תאריך לידה', hint: 'בפורמט DD/MM/YYYY, למשל 22/06/2026', required: true },
        { key: 'baby_gender', label: 'מין הנולד/ת', hint: 'השאירו רק אחד, מחקו את השני', required: true, options: ['בן', 'בת'] },
        { key: 'baby_name', label: 'שם הנולד/ת', hint: 'אם אין עדיין שם — השאירו ריק', required: false },
        { key: 'baby_id_number', label: 'תעודת זהות של הנולד/ת', hint: '9 ספרות כולל ספרת ביקורת', required: true },
        { key: 'recovery_home', label: 'בית החלמה', hint: 'השאירו רק אחד, מחקו את השאר', required: true, options: ctx.recoveryHomes },
        { key: 'card_center', label: 'מספר מוקד לקבלת הכרטיס', hint: 'כתבו את המספר של המוקד מהרשימה למטה', required: true, options: ctx.centers.map((c, i) => `${i + 1}. ${c.name}${c.city ? ` (${c.city})` : ''}`) },
        { key: 'notes', label: 'הערות', required: false },
      ]
    case 'silent_birth':
      return [
        { key: 'birth_date', label: 'תאריך לידה', hint: 'בפורמט DD/MM/YYYY', required: true },
        { key: 'recovery_home', label: 'בית החלמה', hint: 'השאירו רק אחד, מחקו את השאר', required: true, options: ctx.recoveryHomes },
        { key: 'notes', label: 'הערות', required: false },
      ]
    case 'loan':
      return [
        { key: 'amount', label: 'סכום ההלוואה המבוקש', hint: `מספר בלבד, ב-₪ · עד ${LOAN_MAX_AMOUNT.toLocaleString('en-US')} ₪`, required: true },
        { key: 'installments', label: 'מספר תשלומים', hint: `מספר בלבד · עד ${LOAN_MAX_INSTALLMENTS} תשלומים`, required: true },
        { key: 'purpose', label: 'מטרת ההלוואה', hint: 'השאירו רק אחת, מחקו את השאר', required: true, options: [...LOAN_PURPOSES] },
        { key: 'declaration', label: 'האם פנית בעבר לגמ״ח חתם סופר?', hint: 'השאירו רק אחת, מחקו את השאר', required: true, options: [...LOAN_DECLARATIONS] },
        { key: 'notes', label: 'הערות', required: false },
      ]
    case 'financial_aid':
      return [
        { key: 'reason', label: 'סיבת הבקשה', hint: 'פרטו את הרקע, הצורך והעלויות', required: true },
      ]
    case 'widow':
      return [
        { key: 'request_type', label: 'סוג הבקשה', hint: 'השאירו רק אחד', required: true, options: ['סיוע כספי', 'סיוע במזון', 'בקשה כללית'] },
        { key: 'description', label: 'פירוט הבקשה', required: false },
        { key: 'amount', label: 'סכום מבוקש', hint: 'מספר בלבד, ב-₪ (אם רלוונטי)', required: false },
      ]
  }
}

export function attachmentsFor(type: ReqType, ctx: Ctx): AttachmentSpec[] {
  const id = idAttachments(ctx.pending)
  switch (type) {
    case 'birth':
    case 'silent_birth':
      return [{ name: 'אישור-לידה', label: 'אישור לידה מבית החולים', required: true }, ...id]
    case 'loan':
      // הזמנה לחתונה — חובה כשמטרת ההלוואה היא נישואי הבן/הבת.
      // בטופס המייל אי אפשר לדעת מראש מה תיבחר, ולכן מוצג כתנאי מפורש.
      return [
        { name: 'הזמנה-לחתונה', label: `הזמנה לחתונה — חובה אם מטרת ההלוואה היא "${WEDDING_PURPOSE}"`, required: false },
        { name: 'מסמך-תומך', label: 'מסמך תומך (אם נדרש)', required: false },
        ...id,
      ]
    case 'financial_aid':
      return [{ name: 'מסמך-רפואי', label: 'מסמך רפואי / אסמכתא', required: true }, ...id]
    case 'widow':
      return [{ name: 'מסמך-תומך', label: 'מסמך תומך', required: false }]
  }
}

// ── בניית גוף הטיוטה (mailto body) ───────────────────────────────────────────
export function buildDraftBody(type: ReqType, idNumber: string, ctx: Ctx): string {
  const L: string[] = []
  L.push('שימו לב — מלאו כל פרט בדיוק. אם פרט אחד חסר או אינו תקין, הבקשה לא תיקלט.')
  L.push('ההגשה המומלצת היא דרך המערכת הדיגיטלית שלנו; אפשרות זו מיועדת לחסומים בלבד.')
  L.push('אנא השאירו את שמות השדות (לפני הנקודתיים) ללא שינוי, ומלאו רק אחרי הנקודתיים.')
  L.push('')
  L.push('━━━ פרטי הבקשה ━━━')
  for (const f of fieldsFor(type, ctx)) {
    const hint = f.hint ? ` (${f.hint})` : ''
    if (f.options && f.key !== 'card_center') {
      L.push(`${f.label}${hint}: ${f.options.join(' / ')}`)
    } else {
      L.push(`${f.label}${hint}: `)
    }
  }
  // רשימת מוקדים ממוספרת (אם רלוונטי)
  if (type === 'birth' && ctx.centers.length) {
    L.push('')
    L.push('רשימת המוקדים (כתבו את המספר בשורת "מספר מוקד"):')
    ctx.centers.forEach((c, i) => L.push(`  ${i + 1}. ${c.name}${c.city ? ` (${c.city})` : ''}`))
  }
  // קבצים מצורפים — שמות חובה
  const atts = attachmentsFor(type, ctx)
  if (atts.length) {
    L.push('')
    L.push('━━━ קבצים לצירוף ━━━')
    L.push('חובה לשנות את שם כל קובץ מצורף בדיוק לשם המבוקש (לפני הצירוף). קובץ ללא השם המדויק לא ייקלט!')
    for (const a of atts) {
      L.push(`• ${a.label} — שנו את שם הקובץ ל: "${a.name}"${a.required ? ' (חובה)' : ' (אם רלוונטי)'}`)
    }
  }
  L.push('')
  L.push(`(מזהה: ${idNumber})`)
  return L.join('\n')
}

// קישור mailto מלא לטיוטה (subjectPrefix לעקיפה — למשל "בקשת סיוע אלמן")
export function draftMailto(type: ReqType, idNumber: string, ctx: Ctx, subjectPrefix?: string): string {
  const subject = `${subjectPrefix ?? SUBJECT_PREFIX[type]} · ת.ז ${idNumber}`
  const body = buildDraftBody(type, idNumber, ctx)
  return `mailto:igud@chasamsofer.info?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

// ── פרסור גוף המייל שהתקבל ────────────────────────────────────────────────────
// לכל שדה: מאתרים שורה שמתחילה בתווית, ולוקחים את הטקסט אחרי הנקודתיים הראשונות.
export function parseDraft(type: ReqType, body: string, ctx: Ctx): Record<string, string> {
  const lines = String(body ?? '').split(/\r?\n/)
  const out: Record<string, string> = {}
  for (const f of fieldsFor(type, ctx)) {
    for (const ln of lines) {
      // מתעלמים מ-hint בסוגריים: מתאימים לפי תחילת התווית
      if (ln.trimStart().startsWith(f.label)) {
        const idx = ln.indexOf(':')
        if (idx >= 0) { out[f.key] = ln.slice(idx + 1).trim(); break }
      }
    }
  }
  return out
}

// ── אימות + נרמול ─────────────────────────────────────────────────────────────
export type ParsedRequest = { ok: true; data: Record<string, unknown> } | { ok: false; errors: string[] }

function parseDateDDMMYYYY(v: string): string | null {
  const m = v.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  if (isNaN(d.getTime()) || d.getMonth() !== Number(mm) - 1) return null
  return d.toISOString()
}

export function validateRequest(type: ReqType, values: Record<string, string>, ctx: Ctx): ParsedRequest {
  const errors: string[] = []
  const data: Record<string, unknown> = {}
  const need = (key: string, label: string) => {
    const v = (values[key] ?? '').trim()
    if (!v) errors.push(`חסר שדה חובה: ${label}`)
    return v
  }

  if (type === 'birth' || type === 'silent_birth') {
    const bd = parseDateDDMMYYYY(values.birth_date ?? '')
    if (!bd) errors.push('תאריך לידה חסר או לא תקין (פורמט DD/MM/YYYY)')
    else data.birth_date = bd
    const rh = (values.recovery_home ?? '').trim()
    if (!rh) errors.push('חסר בית החלמה')
    else if (!ctx.recoveryHomes.includes(rh)) errors.push(`בית החלמה "${rh}" אינו ברשימה`)
    else data.recovery_home = rh
    data.notes = (values.notes ?? '').trim() || null
  }

  if (type === 'birth') {
    const gender = (values.baby_gender ?? '').trim()
    if (gender !== 'בן' && gender !== 'בת') errors.push('מין הנולד/ת — יש להשאיר "בן" או "בת" בלבד')
    else data.baby_gender = gender === 'בן' ? 'male' : 'female'
    const bid = (values.baby_id_number ?? '').replace(/\D/g, '')
    if (!bid) errors.push('חסרה תעודת זהות של הנולד/ת')
    else if (!validateIsraeliId(bid)) errors.push('תעודת הזהות של הנולד/ת אינה תקינה')
    else data.baby_id_number = bid.padStart(9, '0')
    data.baby_name = (values.baby_name ?? '').trim() || null
    // מוקד לפי מספר מהרשימה
    const num = parseInt((values.card_center ?? '').replace(/\D/g, ''), 10)
    if (!num || num < 1 || num > ctx.centers.length) errors.push('מספר מוקד חסר או לא תקין (כתבו מספר מהרשימה)')
    else data.card_center_id = ctx.centers[num - 1].id
  }

  if (type === 'loan') {
    const amount = parseInt((values.amount ?? '').replace(/[^\d]/g, ''), 10)
    if (!amount || amount <= 0) errors.push('סכום ההלוואה חסר או לא תקין')
    else if (amount > LOAN_MAX_AMOUNT) errors.push(`סכום ההלוואה המרבי הוא ${LOAN_MAX_AMOUNT.toLocaleString('en-US')} ₪`)
    else data.amount = amount

    const inst = parseInt((values.installments ?? '').replace(/[^\d]/g, ''), 10)
    if (!inst || inst <= 0) errors.push('מספר התשלומים חסר או לא תקין')
    else if (inst > LOAN_MAX_INSTALLMENTS) errors.push(`מספר התשלומים המרבי הוא ${LOAN_MAX_INSTALLMENTS}`)
    else data.installments = inst

    const purpose = need('purpose', 'מטרת ההלוואה')
    if (purpose && !LOAN_PURPOSES.includes(purpose as typeof LOAN_PURPOSES[number])) {
      errors.push(`מטרת ההלוואה "${purpose}" אינה ברשימה — יש להשאיר אחת מהאפשרויות בלבד`)
    } else {
      data.purpose = purpose
    }

    const decl = (values.declaration ?? '').trim()
    if (!decl) errors.push('חסרה תשובה: האם פנית בעבר לגמ״ח חתם סופר?')
    else if (!LOAN_DECLARATIONS.includes(decl as typeof LOAN_DECLARATIONS[number])) {
      errors.push('התשובה על פנייה קודמת לגמ״ח — יש להשאיר אחת מהאפשרויות בלבד')
    } else {
      data.declaration = decl
    }

    data.notes = (values.notes ?? '').trim() || null
  }

  if (type === 'financial_aid') {
    data.reason = need('reason', 'סיבת הבקשה')
  }

  if (type === 'widow') {
    const rt = (values.request_type ?? '').trim()
    const map: Record<string, string> = { 'סיוע כספי': 'financial', 'סיוע במזון': 'food', 'בקשה כללית': 'general' }
    if (!map[rt]) errors.push('סוג הבקשה — יש להשאיר אחת מהאפשרויות בלבד')
    else data.request_type = map[rt]
    data.description = (values.description ?? '').trim() || null
    const amt = (values.amount ?? '').replace(/[^\d]/g, '')
    data.amount = amt ? parseInt(amt, 10) : null
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, data }
}
