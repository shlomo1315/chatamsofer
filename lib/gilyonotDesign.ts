// ─────────────────────────────────────────────────────────────────────────────
// עיצוב החלקים הקבועים במייל הגיליון: כותרת, פתיחה, כפתור ההורדה ופוטר.
// נשמר כ-jsonb בגיליון ובתבנית. משותף לעורך בדפדפן ולשרת, ולכן בלי תלויות.
// ─────────────────────────────────────────────────────────────────────────────

export const SYSTEM_BLUE = '#2563eb'

export interface MailDesign {
  bgColor: string
  showHeader: boolean
  headerColor: string
  kicker: string
  /** ריק = שם הגיליון */
  headerTitle: string
  /** ריק = הפרשה */
  headerSub: string
  showGreeting: boolean
  greeting: string
  showButton: boolean
  buttonLabel: string
  buttonColor: string
  footerText: string
}

/** הטוקן שמוחלף בשם הנמען, בגוף המייל ובפתיחה. */
export const NAME_TOKEN = '{{שם}}'

export const DEFAULT_DESIGN: MailDesign = {
  bgColor: '#f1f5f9',
  showHeader: true,
  headerColor: SYSTEM_BLUE,
  kicker: 'גיליונות החתם סופר',
  headerTitle: '',
  headerSub: '',
  showGreeting: true,
  greeting: `לכבוד ${NAME_TOKEN} שליט"א,`,
  showButton: true,
  buttonLabel: 'להורדת הגיליון',
  buttonColor: SYSTEM_BLUE,
  footerText: 'קיבלתם מייל זה כי נרשמתם לקבלת הגיליון השבועי של היכל החתם סופר.',
}

const HEX = /^#[0-9a-f]{6}$/i
const LIMITS: Partial<Record<keyof MailDesign, number>> = {
  kicker: 80, headerTitle: 160, headerSub: 120, greeting: 160, buttonLabel: 60, footerText: 600,
}

/** מנקה עיצוב שהגיע מהדפדפן או מהמסד: רק מפתחות מוכרים, צבעי hex ואורך מוגבל. */
export function normalizeDesign(raw: unknown): MailDesign {
  const src = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {}
  const out = { ...DEFAULT_DESIGN } as Record<string, unknown>
  for (const key of Object.keys(DEFAULT_DESIGN) as (keyof MailDesign)[]) {
    const v = src[key]
    const def = DEFAULT_DESIGN[key]
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v
    } else if (key.endsWith('Color')) {
      if (typeof v === 'string' && HEX.test(v)) out[key] = v.toLowerCase()
    } else if (typeof v === 'string') {
      out[key] = v.slice(0, LIMITS[key] ?? 200)
    }
  }
  return out as unknown as MailDesign
}
