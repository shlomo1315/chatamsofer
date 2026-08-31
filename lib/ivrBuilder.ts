// ─────────────────────────────────────────────────────────────────────────────
// בונה השלוחות — מבנה המערכת הטלפונית, בשליטת המשתמש.
//
// 🔴 עד כה השלוחות היו קבועות בקוד: כל שינוי — הודעה חדשה, מקש אחר,
// שלוחה נוספת — דרש פריסה. המנהל יכול היה לערוך רק את *נוסח* ההודעות
// הקיימות, לא את המבנה.
//
// ⚠️ המבנה נשמר ב-app_settings כ-JSON, והווהבוק קורא אותו בזמן אמת.
// זו הסיבה שהוא חייב להיות ניתן לאימות: מבנה שבור פירושו מתקשרים
// ששומעים שגיאה, ואיש אינו יודע.
//
// ⚠️ הבנייה כאן *אינה* נוגעת בשלוחות הקיימות (חגים, יולדות, OTP). הן
// שלוחות ימות עצמאיות, והתפריט מפנה אליהן ב-go_to_folder. שינוי כאן
// לא יכול לשבור אותן.
// ─────────────────────────────────────────────────────────────────────────────

/** סוג השלוחה — מה קורה כשמגיעים אליה. */
export type IvrNodeType =
  | 'menu'       // תפריט: משמיע טקסט וממתין להקשה
  | 'message'    // הודעה: משמיע ומסיים (או חוזר)
  | 'transfer'   // הפניה לשלוחה אחרת בימות (למשל השלוחות הקיימות)
  | 'dial'       // חיוג למספר טלפון חיצוני
  | 'record'     // הקלטת הודעה מהמתקשר
  | 'input'      // קליטת נתון מהמתקשר (ת"ז/מספר) והקראתו חזרה
  | 'raw'        // פקודת ימות חופשית — הדלת לכל שאר סוגי השלוחות
  | 'hangup'     // ניתוק

export const NODE_TYPE_LABEL: Record<IvrNodeType, string> = {
  menu: 'תפריט בחירה',
  message: 'השמעת הודעה',
  transfer: 'מעבר לשלוחה',
  dial: 'חיוג למספר',
  record: 'הקלטה מהמתקשר',
  input: 'קליטת מספר מהמתקשר',
  raw: 'סוג אחר מימות (מתקדם)',
  hangup: 'ניתוק השיחה',
}

export const NODE_TYPE_HINT: Record<IvrNodeType, string> = {
  menu: 'משמיע הודעה וממתין שהמתקשר יקיש. כל מקש מוביל לשלוחה אחרת.',
  message: 'משמיע הודעה ואז חוזר לתפריט הקודם (או מנתק).',
  transfer: 'מעביר את השיחה לשלוחה קיימת בימות — למשל חלוקת חגים או יולדות.',
  dial: 'מחייג למספר טלפון. השיחה יוצאת מהמערכת.',
  record: 'המתקשר משאיר הודעה מוקלטת. ההקלטה נשמרת בימות.',
  input: 'המתקשר מקיש מספר (למשל ת"ז), והמערכת מקריאה אותו חזרה לאישור.',
  raw: 'לכל סוג שלוחה אחר של ימות — תא קולי, פקס, פילטר זמנים, זמני היום. מדביקים את הפקודה מהתיעוד.',
  hangup: 'מסיים את השיחה.',
}

/** תוכן שמע: טקסט ל-TTS, או קובץ שהועלה/הופק. */
export interface IvrAudio {
  /** הטקסט שיוקרא. ריק = לא משמיעים כלום. */
  text: string
  /**
   * נתיב קובץ בימות. גובר על text.
   * ⚠️ מופק מ-ElevenLabs או מוקלט; ראו generate-voice.
   */
  file?: string | null
}

/** מקש בתפריט. */
export interface IvrKey {
  /** הספרה שמקישים. '0'-'9', '*', '#'. */
  digit: string
  /** מזהה השלוחה שאליה עוברים. */
  target: string
  /** תיאור למנהל — אינו נשמע למתקשר. */
  label?: string
}

/** שלוחה אחת. */
export interface IvrNodeDef {
  /** מזהה פנימי יציב. אינו מספר השלוחה בימות. */
  id: string
  /** שם למנהל. */
  name: string
  type: IvrNodeType
  /** ההודעה שמושמעת בכניסה. */
  prompt: IvrAudio
  /** למקשים בתפריט (type='menu'). */
  keys?: IvrKey[]
  /** ליעד ההפניה (type='transfer') — שם שלוחה בימות, למשל '/2'. */
  folder?: string
  /** למספר החיוג (type='dial'). */
  phone?: string
  /**
   * מספר הספרות המרבי בקליטה (type='input').
   *
   * ⚠️ ריק = ללא הגבלה, וימות ממתינה עד תום הזמן. לת"ז יש לציין 9,
   * אחרת המתקשר מסיים להקיש והשיחה נתקעת עד ה-timeout.
   */
  maxDigits?: number
  /**
   * הודעה כשההקשה שגויה (type='menu').
   * ריק = משתמשים בברירת המחדל הכללית.
   */
  invalid?: IvrAudio
  /** כבוי = השלוחה קיימת אך אינה פעילה; המקש אליה מדלג. */
  enabled?: boolean

  // ── פונקציות שקיימות בכל שלוחה בימות ──

  /**
   * חסימת הקשת * לחזרה אחורה.
   *
   * ⚠️ ברירת המחדל בימות מאפשרת לחזור. בשלוחה שבאמצע פעולה כספית
   * או רישום, חזרה אחורה משאירה את הפעולה חצי-גמורה.
   */
  blockBack?: boolean
  /**
   * ניתוק אוטומטי אחרי X שניות ללא פעילות.
   *
   * ⚠️ בלעדיו שיחה שנשכחה פתוחה תופסת קו עד שהמתקשר מנתק.
   */
  hangupAfter?: number
  /**
   * הרשאת גישה — מי רשאי להיכנס לשלוחה.
   *
   * 🔴 'password' דורש סיסמה. בלי זה כל מתקשר מגיע לכל שלוחה, כולל
   * שלוחות ניהול.
   */
  access?: 'all' | 'password' | 'whitelist'
  /** הסיסמה, כש-access='password'. */
  accessPassword?: string
  /**
   * שם רשימת המורשים, כש-access='whitelist'.
   * ⚠️ כפי שהיא מוגדרת בימות.
   */
  accessList?: string
  /**
   * הודעה שתושמע למי שאינו מורשה.
   * ⚠️ ריק = ימות משמיעה נוסח כללי.
   */
  accessDenied?: IvrAudio
  /**
   * שלוחה שאליה חוזרים בסיום.
   * ⚠️ ריק = חזרה לשלוחת הפתיחה.
   */
  returnTo?: string
  /**
   * הקלטת השיחה בשלוחה זו.
   * ⚠️ ההקלטות נשמרות בימות.
   */
  recordCall?: boolean
  /**
   * סוג השלוחה בימות (type='raw') — מפתח מתוך lib/ivrYemotTypes.
   *
   * ⚠️ המנהל בוחר שם עברי מרשימה; זה המפתח שנשמר. ריק = הוא בחר
   * "פקודה חופשית" והזין את הפקודה ידנית ב-rawCommand.
   */
  yemotType?: string
  /**
   * הערכים שהמנהל מילא לשדות הסוג (ראו YemotTypeField).
   *
   * ⚠️ נכתבים ל-ext.ini בימות. מפתח = שם הפרמטר שם.
   */
  yemotFields?: Record<string, string>
  /**
   * פקודת ימות גולמית (type='raw').
   *
   * 🔴 מסוננת ב-sanitizeRawCommand לפני שהיא נכתבת לתשובה: "&"
   * מפריד פקודות, ולכן ערך שמכיל אותו מזריק פקודה נוספת.
   */
  rawCommand?: string
  /**
   * שניות המתנה להקשה. ריק = ברירת המחדל (10 בתפריט, 15 בקליטה).
   *
   * ⚠️ היה קבוע בקוד. מבוגר שמקיש לאט לא הספיק, והשיחה עברה הלאה
   * בלי שהקיש — נראה לו כאילו המערכת התעלמה ממנו.
   */
  waitSeconds?: number
  /**
   * מספר הפעמים שההודעה חוזרת כשאין הקשה.
   *
   * ⚠️ ברירת המחדל של ימות היא פעם אחת. מי שלא שמע בפעם הראשונה
   * מנתק, ואיש אינו יודע שהוא ניסה.
   */
  repeats?: number
}

/** המערכת כולה. */
export interface IvrConfig {
  /** מזהה השלוחה שמתחילים בה. */
  rootId: string
  nodes: IvrNodeDef[]
  /** ⚠️ גרסה — מאפשרת מיגרציה עתידית בלי לשבור מבנה קיים. */
  version: number
}

export const IVR_CONFIG_KEY = 'yemot_ivr_config'

/**
 * המקשים החוקיים — ספרה בודדת בלבד.
 *
 * ⚠️ 12 מקשים הם המקסימום, ובכוונה: הפרוטוקול של ימות מקבל את
 * הספרות המותרות כרשימה מופרדת בנקודות ("1.2.9"), וזה עובד לספרה
 * בודדת. שלוחה דו-ספרתית (10 ומעלה) דורשת הגדרה אחרת בימות שטרם
 * אומתה — ובניית מערכת עליה הייתה מסתכנת בשלוחות שלא עונות.
 *
 * ⚠️ תפריט צריך יותר מ-12 יעדים? הפתרון הוא תפריט משנה (מקש 9 →
 * "לשירותים נוספים"), לא מקש דו-ספרתי.
 */
export const VALID_DIGITS = ['0','1','2','3','4','5','6','7','8','9','*','#'] as const

/** מספר המקשים המרבי בתפריט אחד. */
export const MAX_KEYS_PER_MENU = VALID_DIGITS.length

// ─────────────────────────────────────────────────────────────────────────────
// אימות
//
// 🔴 מבנה שבור פירושו מתקשרים ששומעים שגיאה או נתקעים בלולאה, ואיש
// אינו יודע — הם פשוט מנתקים. לכן האימות רץ לפני כל שמירה.
// ─────────────────────────────────────────────────────────────────────────────

export interface IvrProblem {
  /** מזהה השלוחה שבה הבעיה. ריק = בעיה כללית. */
  nodeId?: string
  /** 'error' חוסם שמירה · 'warn' מוצג ואינו חוסם. */
  level: 'error' | 'warn'
  message: string
}

/**
 * בודק את המבנה ומחזיר את כל הבעיות.
 *
 * ⚠️ מחזיר רשימה ולא זורק: המנהל צריך לראות את *כל* מה ששבור בבת אחת,
 * לא לתקן אחד ולגלות את הבא.
 */
export function validateIvr(cfg: IvrConfig): IvrProblem[] {
  const problems: IvrProblem[] = []
  const nodes = Array.isArray(cfg?.nodes) ? cfg.nodes : []
  const byId = new Map(nodes.map(n => [n.id, n]))

  if (!nodes.length) {
    problems.push({ level: 'error', message: 'אין אף שלוחה במערכת' })
    return problems
  }

  if (!byId.has(cfg.rootId)) {
    problems.push({ level: 'error', message: 'שלוחת הפתיחה אינה קיימת' })
  }

  // ── מזהים כפולים ──
  // ⚠️ שני צמתים באותו מזהה = ניתוב בלתי צפוי; ימות תגיע לראשון תמיד.
  const seen = new Set<string>()
  for (const n of nodes) {
    if (seen.has(n.id)) {
      problems.push({ nodeId: n.id, level: 'error', message: `מזהה כפול: ${n.id}` })
    }
    seen.add(n.id)
    if (!n.name?.trim()) {
      problems.push({ nodeId: n.id, level: 'warn', message: 'לשלוחה אין שם' })
    }
  }

  for (const n of nodes) {
    if (n.enabled === false) continue

    // ── תפריט ──
    if (n.type === 'menu') {
      const keys = n.keys ?? []
      if (!keys.length) {
        problems.push({ nodeId: n.id, level: 'error',
          message: 'תפריט בלי מקשים — המתקשר יישאר תקוע' })
      }
      // ⚠️ מעל 12 אין מקשים פנויים בטלפון. הפתרון הוא תפריט משנה.
      if (keys.length > MAX_KEYS_PER_MENU) {
        problems.push({ nodeId: n.id, level: 'error',
          message: `יותר מ-${MAX_KEYS_PER_MENU} מקשים בתפריט אחד — יש לפצל לתפריט משנה` })
      }
      const usedDigits = new Set<string>()
      for (const k of keys) {
        if (!VALID_DIGITS.includes(k.digit as typeof VALID_DIGITS[number])) {
          problems.push({ nodeId: n.id, level: 'error', message: `מקש לא חוקי: ${k.digit}` })
        }
        if (usedDigits.has(k.digit)) {
          problems.push({ nodeId: n.id, level: 'error',
            message: `המקש ${k.digit} מוגדר פעמיים — רק הראשון יעבוד` })
        }
        usedDigits.add(k.digit)
        if (!byId.has(k.target)) {
          problems.push({ nodeId: n.id, level: 'error',
            message: `המקש ${k.digit} מפנה לשלוחה שאינה קיימת` })
        } else if (byId.get(k.target)?.enabled === false) {
          problems.push({ nodeId: n.id, level: 'warn',
            message: `המקש ${k.digit} מפנה לשלוחה כבויה` })
        }
      }
      if (!n.prompt?.text?.trim() && !n.prompt?.file) {
        problems.push({ nodeId: n.id, level: 'error',
          message: 'תפריט בלי הודעה — המתקשר לא ידע מה להקיש' })
      }
    }

    // ── הפניה ──
    if (n.type === 'transfer' && !n.folder?.trim()) {
      problems.push({ nodeId: n.id, level: 'error', message: 'לא הוגדרה שלוחת יעד' })
    }

    // ── חיוג ──
    if (n.type === 'dial') {
      const ph = (n.phone ?? '').replace(/\D/g, '')
      if (!ph) {
        problems.push({ nodeId: n.id, level: 'error', message: 'לא הוגדר מספר לחיוג' })
      } else if (ph.length < 7) {
        problems.push({ nodeId: n.id, level: 'warn', message: 'מספר הטלפון נראה קצר מדי' })
      }
    }

    // ── הודעה / הקלטה ──
    if ((n.type === 'message' || n.type === 'record')
        && !n.prompt?.text?.trim() && !n.prompt?.file) {
      problems.push({ nodeId: n.id, level: 'warn', message: 'אין הודעה — המתקשר ישמע שקט' })
    }
  }

  // ── לולאות ──
  // 🔴 תפריט שמפנה לעצמו (ישירות או במעגל) לוכד את המתקשר: הוא ישמע
  // את אותה הודעה שוב ושוב עד שינתק.
  for (const n of nodes) {
    if (n.type !== 'menu' || n.enabled === false) continue
    for (const k of n.keys ?? []) {
      if (k.target === n.id) {
        problems.push({ nodeId: n.id, level: 'warn',
          message: `המקש ${k.digit} מחזיר לאותה שלוחה — המתקשר ישמע אותה שוב` })
      }
    }
  }

  // ── שלוחות מנותקות ──
  // ⚠️ אזהרה ולא שגיאה: שלוחה מנותקת אינה שוברת דבר, אבל היא כמעט תמיד
  // סימן לטעות — מקש שנמחק ושכחו את היעד שלו.
  const reachable = new Set<string>()
  const stack = [cfg.rootId]
  let guard = 0
  while (stack.length && guard++ < 10_000) {
    const id = stack.pop() as string
    if (reachable.has(id)) continue
    reachable.add(id)
    const node = byId.get(id)
    for (const k of node?.keys ?? []) stack.push(k.target)
  }
  for (const n of nodes) {
    if (!reachable.has(n.id)) {
      problems.push({ nodeId: n.id, level: 'warn',
        message: 'אי אפשר להגיע לשלוחה הזו מתפריט הפתיחה' })
    }
  }

  return problems
}

/** האם המבנה תקין לשמירה (אין שגיאות חוסמות). */
export const ivrIsValid = (cfg: IvrConfig): boolean =>
  !validateIvr(cfg).some(p => p.level === 'error')

// ─────────────────────────────────────────────────────────────────────────────
// ברירת מחדל — משקפת את המערכת כפי שהיא היום.
//
// ⚠️ הערכים כאן זהים למה שקבוע היום בקוד הווהבוק, כדי שהמעבר לניהול
// דינמי לא ישנה דבר עבור המתקשר.
// ─────────────────────────────────────────────────────────────────────────────
export function defaultIvrConfig(): IvrConfig {
  return {
    version: 1,
    rootId: 'root',
    nodes: [
      {
        id: 'root',
        name: 'תפריט ראשי',
        type: 'menu',
        prompt: {
          text: 'ברוכים הבאים להיכל החתם סופר. '
            + 'לרישום לחלוקת החגים הקישו 1, לשיוך כרטיס מזון ליולדת הקישו 2, להודעות הקישו 9',
        },
        invalid: { text: 'הקשה שגויה' },
        keys: [
          { digit: '1', target: 'holiday', label: 'חלוקת חגים' },
          { digit: '2', target: 'maternity', label: 'עזר יולדות' },
          { digit: '9', target: 'notice', label: 'הודעות' },
        ],
      },
      {
        id: 'holiday',
        name: 'חלוקת חגים',
        type: 'transfer',
        prompt: { text: '' },
        folder: process.env.YEMOT_FOLDER_HOLIDAY || '/2',
      },
      {
        id: 'maternity',
        name: 'עזר יולדות',
        type: 'transfer',
        prompt: { text: '' },
        folder: process.env.YEMOT_FOLDER_MATERNITY || '/3',
      },
      {
        id: 'notice',
        name: 'הודעה כללית',
        type: 'message',
        prompt: { text: 'אין כרגע הודעות חדשות' },
      },
    ],
  }
}

/**
 * נרמול מבנה שנטען מהמסד.
 *
 * ⚠️ app_settings היא עמודת text ומה שנשמר בה עלול להיות חלקי או ישן.
 * מבנה שבור שמגיע לווהבוק פירושו מתקשרים ששומעים שגיאה, ולכן כל שדה
 * נבדק ומקבל ערך שפוי.
 */
export function normalizeIvr(raw: unknown): IvrConfig {
  const def = defaultIvrConfig()
  if (!raw || typeof raw !== 'object') return def

  const o = raw as Partial<IvrConfig>
  const nodes = Array.isArray(o.nodes) ? o.nodes : []
  if (!nodes.length) return def

  const clean: IvrNodeDef[] = nodes
    .filter((n): n is IvrNodeDef => Boolean(n && typeof n === 'object' && n.id))
    .map(n => ({
      id: String(n.id),
      name: String(n.name ?? '').trim() || String(n.id),
      type: (NODE_TYPE_LABEL[n.type as IvrNodeType] ? n.type : 'message') as IvrNodeType,
      prompt: {
        text: String(n.prompt?.text ?? ''),
        file: n.prompt?.file ?? null,
      },
      keys: Array.isArray(n.keys)
        ? n.keys
            .filter(k => k && typeof k === 'object' && k.digit != null && k.target)
            .map(k => ({ digit: String(k.digit), target: String(k.target), label: k.label }))
        : undefined,
      folder: n.folder ?? undefined,
      phone: n.phone ?? undefined,
      // 🔴 כל שדה חייב להופיע כאן. normalizeIvr הוא שער, ומה שאינו
      // מוזכר בו נמחק בשמירה **בשקט** — המנהל מגדיר, שומר, וההגדרה
      // פשוט איננה. maxDigits נפל בדיוק כך.
      //
      // ⚠️ 0/שלילי → undefined ולא נשמרים: אפס ספרות ואפס שניות הם
      // הגדרות בלתי אפשריות שהיו שוברות את השלוחה.
      // 🔴 הפונקציות המשותפות. כל שדה חייב להופיע כאן, אחרת
      // הוא נמחק בשמירה בשקט — ראו ההערה למעלה.
      blockBack: n.blockBack === true ? true : undefined,
      hangupAfter: Number(n.hangupAfter) > 0 ? Number(n.hangupAfter) : undefined,
      access: n.access === 'password' || n.access === 'whitelist' ? n.access : undefined,
      accessPassword: n.accessPassword ? String(n.accessPassword) : undefined,
      accessList: n.accessList ? String(n.accessList) : undefined,
      accessDenied: n.accessDenied
        ? { text: String(n.accessDenied.text ?? ''), file: n.accessDenied.file ?? null }
        : undefined,
      returnTo: n.returnTo ? String(n.returnTo) : undefined,
      recordCall: n.recordCall === true ? true : undefined,
      yemotType: n.yemotType ? String(n.yemotType) : undefined,
      // ⚠️ רק ערכי מחרוזת: ערך מקונן היה נכתב ל-ext.ini כ-[object Object].
      yemotFields: n.yemotFields && typeof n.yemotFields === 'object'
        ? Object.fromEntries(Object.entries(n.yemotFields)
            .filter(([, v]) => v != null && v !== '')
            .map(([k, v]) => [k, String(v)]))
        : undefined,
      rawCommand: n.rawCommand ? String(n.rawCommand) : undefined,
      maxDigits: Number(n.maxDigits) > 0 ? Number(n.maxDigits) : undefined,
      waitSeconds: Number(n.waitSeconds) > 0 ? Number(n.waitSeconds) : undefined,
      repeats: Number(n.repeats) > 1 ? Number(n.repeats) : undefined,
      invalid: n.invalid
        ? { text: String(n.invalid.text ?? ''), file: n.invalid.file ?? null }
        : undefined,
      enabled: n.enabled !== false,
    }))

  const rootId = clean.some(n => n.id === o.rootId) ? String(o.rootId) : clean[0].id
  return { version: Number(o.version) || 1, rootId, nodes: clean }
}

// ─────────────────────────────────────────────────────────────────────────────
// אחסון
//
// ⚠️ app_settings.value היא עמודת text — חובה JSON.stringify. שמירת
// אובייקט גולמי נכשלת *בשקט* ונשמרת כ-"[object Object]".
// ─────────────────────────────────────────────────────────────────────────────
import { getServiceClient } from './apiAuth'

export async function getIvrConfig(): Promise<IvrConfig> {
  const admin = getServiceClient()
  if (!admin) return defaultIvrConfig()
  try {
    const { data } = await admin.from('app_settings')
      .select('value').eq('key', IVR_CONFIG_KEY).maybeSingle()
    if (!data?.value) return defaultIvrConfig()
    return normalizeIvr(JSON.parse(String(data.value)))
  } catch {
    // ⚠️ נפילה לברירת המחדל ולא זריקה: הווהבוק קורא מכאן, ותקלת קריאה
    // חייבת להשאיר מערכת טלפונית עובדת ולא לנתק מתקשרים.
    return defaultIvrConfig()
  }
}

export async function saveIvrConfig(cfg: IvrConfig): Promise<{ ok: boolean; error?: string }> {
  const admin = getServiceClient()
  if (!admin) return { ok: false, error: 'שגיאת שרת' }

  const clean = normalizeIvr(cfg)
  // 🔴 אימות לפני שמירה: מבנה שבור פירושו מתקשרים ששומעים שגיאה.
  const blocking = validateIvr(clean).filter(p => p.level === 'error')
  if (blocking.length) {
    return { ok: false, error: blocking.map(p => p.message).join(' · ') }
  }

  const { error } = await admin.from('app_settings').upsert({
    key: IVR_CONFIG_KEY,
    value: JSON.stringify(clean),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  return error ? { ok: false, error: error.message } : { ok: true }
}
