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
  | 'hangup'     // ניתוק

export const NODE_TYPE_LABEL: Record<IvrNodeType, string> = {
  menu: 'תפריט בחירה',
  message: 'השמעת הודעה',
  transfer: 'מעבר לשלוחה',
  dial: 'חיוג למספר',
  record: 'הקלטה מהמתקשר',
  hangup: 'ניתוק השיחה',
}

export const NODE_TYPE_HINT: Record<IvrNodeType, string> = {
  menu: 'משמיע הודעה וממתין שהמתקשר יקיש. כל מקש מוביל לשלוחה אחרת.',
  message: 'משמיע הודעה ואז חוזר לתפריט הקודם (או מנתק).',
  transfer: 'מעביר את השיחה לשלוחה קיימת בימות — למשל חלוקת חגים או יולדות.',
  dial: 'מחייג למספר טלפון. השיחה יוצאת מהמערכת.',
  record: 'המתקשר משאיר הודעה מוקלטת. ההקלטה נשמרת בימות.',
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
   * הודעה כשההקשה שגויה (type='menu').
   * ריק = משתמשים בברירת המחדל הכללית.
   */
  invalid?: IvrAudio
  /** כבוי = השלוחה קיימת אך אינה פעילה; המקש אליה מדלג. */
  enabled?: boolean
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

/** מקשים חוקיים בטלפון. */
export const VALID_DIGITS = ['0','1','2','3','4','5','6','7','8','9','*','#'] as const

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
      invalid: n.invalid
        ? { text: String(n.invalid.text ?? ''), file: n.invalid.file ?? null }
        : undefined,
      enabled: n.enabled !== false,
    }))

  const rootId = clean.some(n => n.id === o.rootId) ? String(o.rootId) : clean[0].id
  return { version: Number(o.version) || 1, rootId, nodes: clean }
}
