// ─────────────────────────────────────────────────────────────────────────────
// מנוע ההרצה — הופך מבנה שלוחות לתשובת ימות.
//
// 🔴 טהור בכוונה: בלי רשת, בלי מסד, בלי תאריכים. כל הכניסה היא המבנה
// והפרמטרים מימות, וכל היציאה היא מחרוזת. זה מה שמאפשר לבדוק כאן את
// *מה שהמתקשר שומע* — הדבר היחיד שבאמת חשוב, ושאי אפשר לראות בשום
// לוג אחרי שהוא ניתק.
//
// פרוטוקול ימות (זהה לשאר השלוחות):
//   • הודעה:      id_list_message=<token>      (t-<טקסט TTS> או f-<קובץ>)
//   • קליטת הקשה: read=<token>=<valName>,...
//   • מעבר:       go_to_folder=<שלוחה>  ·  ניתוק: go_to_folder=hangup
//   • פקודות מופרדות ב-"&". טקסט TTS אסור שיכיל: . - " ' & |
// ─────────────────────────────────────────────────────────────────────────────
import type { IvrConfig, IvrNodeDef, IvrAudio } from './ivrBuilder'
import { sanitizeRawCommand } from './ivrRawCommand'

/** TTS של ימות אינו סובל את התווים האלה — כולל גרש וגרשיים עבריים. */
export const ttsClean = (t: string) =>
  String(t ?? '').replace(/[.\-"'&|׳״]/g, ' ').replace(/\s+/g, ' ').trim()

export const tToken = (t: string) => `t-${ttsClean(t)}`

/** אסימון שמע: קובץ גובר על טקסט; ריק = לא משמיעים כלום. */
export function audioToken(a?: IvrAudio | null): string {
  if (a?.file) return `f-${a.file}`
  const t = ttsClean(a?.text ?? '')
  return t ? `t-${t}` : ''
}

export const joinTokens = (...tokens: string[]) => tokens.filter(Boolean).join('.')

/**
 * מזהה השלוחה נשמר במשתנה של ימות כדי לדעת היכן המתקשר נמצא.
 *
 * ⚠️ ימות אינה שומרת מצב בין קריאות: כל בקשה עומדת בפני עצמה, והמיקום
 * מוחזר אלינו כפרמטר. בלי זה כל הקשה הייתה חוזרת לתפריט הראשי.
 */
export const NODE_PARAM = 'ivrNode'
export const DIGIT_PARAM = 'ivrKey'

export interface IvrStepResult {
  /** הפקודות לימות, לפני חיבור ב-"&". */
  commands: string[]
}

/** בונה בקשת הקשה עבור תפריט. */
/**
 * שניות ההמתנה להקשה.
 *
 * ⚠️ היה קבוע ב-10. מבוגר שמקיש לאט לא הספיק, והשיחה המשיכה בלי
 * שהקיש — מבחינתו המערכת התעלמה ממנו. עכשיו ניתן להגדרה לכל שלוחה.
 *
 * ⚠️ תחום 3..60: אפס היה מדלג על ההקשה לגמרי, וערך ענק משאיר את
 * המתקשר תלוי על הקו.
 */
function waitOf(node: IvrNodeDef, fallback: number): number {
  const n = Number(node.waitSeconds ?? 0)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(Math.max(Math.round(n), 3), 60)
}

/** מספר החזרות על ההודעה כשאין הקשה. ⚠️ 1..5. */
function repeatsOf(node: IvrNodeDef): string {
  const n = Number(node.repeats ?? 0)
  if (!Number.isFinite(n) || n <= 1) return ''
  return String(Math.min(Math.round(n), 5))
}

/**
 * הפקודות שנוספות לכל שלוחה, לפי הפונקציות המשותפות.
 *
 * 🔴 בלי אכיפה כאן ההגדרות במסך הן קישוט: המנהל מסמן "חסום חזרה"
 * והמתקשר עדיין חוזר.
 *
 * ⚠️ מוחזר מערך ולא מחרוזת — הקורא משרשר אותן לפקודות שלו, וכך
 * הסדר נשלט במקום אחד.
 */
function commonCommands(node: IvrNodeDef): string[] {
  const out: string[] = []
  // ⚠️ חסימת * — בימות זו הגדרה נפרדת מהקריאה עצמה.
  if (node.blockBack) out.push('no_back=yes')
  // ⚠️ ניתוק אוטומטי: שיחה שנשכחה פתוחה תופסת קו.
  const hangup = Number(node.hangupAfter ?? 0)
  if (Number.isFinite(hangup) && hangup > 0) {
    out.push(`hangup_after=${Math.min(Math.round(hangup), 3600)}`)
  }
  if (node.recordCall) out.push('record_call=yes')
  return out
}

/**
 * בדיקת ההרשאה לשלוחה.
 *
 * 🔴 מוחזרות פקודות דחייה כשאין הרשאה, ו-null כשמותר להיכנס.
 * שלוחת ניהול בלי הגנה פתוחה לכל מתקשר.
 */
function accessGuard(node: IvrNodeDef): string[] | null {
  if (node.access === 'password') {
    const pw = String(node.accessPassword ?? '').trim()
    // ⚠️ הגדרה חסרה = חסימה, לא מעבר. שלוחה שסומנה כמוגנת ואין בה
    // סיסמה חייבת להיחסם, אחרת ההגדרה מטעה בדיוק בכיוון המסוכן.
    if (!pw) {
      return [`id_list_message=${tToken('השלוחה אינה זמינה')}`, 'go_to_folder=hangup']
    }
    return null
  }
  if (node.access === 'whitelist' && !String(node.accessList ?? '').trim()) {
    return [`id_list_message=${tToken('השלוחה אינה זמינה')}`, 'go_to_folder=hangup']
  }
  return null
}

function readMenu(node: IvrNodeDef, prompt: string): string {
  const digits = (node.keys ?? []).map(k => k.digit).join('.')
  // ⚠️ re_enter='yes' הוא מה שמונע לולאה: ימות מבקשת הקשה חדשה במקום
  // לשלוח שוב את הערך הקודם.
  const ops = [
    DIGIT_PARAM, 'yes', '1', '1', String(waitOf(node, 10)),
    'No', 'no', 'no', '', digits, repeatsOf(node), '', '', '',
  ]
  return `read=${prompt}=${ops.join(',')}`
}

/**
 * מחשב את הצעד הבא.
 *
 * @param cfg    מבנה השלוחות
 * @param nodeId היכן המתקשר נמצא. ריק = תחילת שיחה.
 * @param digit  מה הקיש. ריק = טרם הקיש.
 */
export function ivrStep(cfg: IvrConfig, nodeId: string, digit: string): IvrStepResult {
  const byId = new Map(cfg.nodes.map(n => [n.id, n]))

  // ── תחילת שיחה ──
  if (!nodeId) return enterNode(cfg, byId, cfg.rootId)

  const node = byId.get(nodeId)
  if (!node) {
    // ⚠️ מזהה לא מוכר (מבנה שהשתנה באמצע שיחה) — חוזרים לשורש ולא
    // מנתקים: המתקשר לא עשה דבר רע.
    return enterNode(cfg, byId, cfg.rootId)
  }

  // ── הקשה בתפריט ──
  if (node.type === 'menu') {
    if (!digit) return enterNode(cfg, byId, nodeId)

    const key = (node.keys ?? []).find(k => k.digit === digit)
    const target = key ? byId.get(key.target) : undefined

    // ⚠️ יעד כבוי נחשב הקשה שגויה: הוא לא אמור להישמע בתפריט, ומעבר
    // אליו היה משמיע שקט.
    if (!key || !target || target.enabled === false) {
      const invalid = audioToken(node.invalid) || tToken('הקשה שגויה')
      const prompt = joinTokens(invalid, audioToken(node.prompt))
      // ⚠️ commonCommands ישירות: כאן איננו בתוך enterNode, ואין
      // משתנה common. הקשה שגויה עדיין חייבת לכבד את ההגדרות.
      return { commands: [...commonCommands(node), readMenu(node, prompt)] }
    }
    return enterNode(cfg, byId, target.id)
  }

  // ── כל סוג אחר: אין מה לעשות עם הקשה ──
  return enterNode(cfg, byId, nodeId)
}

/** מה קורה בכניסה לשלוחה. */
function enterNode(
  cfg: IvrConfig,
  byId: Map<string, IvrNodeDef>,
  nodeId: string,
): IvrStepResult {
  const node = byId.get(nodeId)
  if (!node) return { commands: [`id_list_message=${tToken('שגיאה במערכת')}`, 'go_to_folder=hangup'] }

  // 🔴 שער ההרשאה — לפני כל דבר אחר.
  //
  // ⚠️ כאן ולא בכל ענף בנפרד: enterNode היא נקודת הכניסה היחידה
  // לשלוחה, וכל בדיקה שמפוזרת בין הענפים נשכחת באחד מהם.
  const denied = accessGuard(node)
  if (denied) {
    const msg = audioToken(node.accessDenied)
    // ⚠️ נוסח מותאם אם הוגדר; אחרת הנוסח הכללי מ-accessGuard.
    return { commands: msg ? [`id_list_message=${msg}`, 'go_to_folder=hangup'] : denied }
  }

  const prompt = audioToken(node.prompt)
  // ⚠️ נוספות לכל תשובה — ראו commonCommands.
  const common = commonCommands(node)

  switch (node.type) {
    case 'menu':
      return { commands: [readMenu(node, prompt)] }

    case 'transfer':
      return { commands: [...common, `go_to_folder=${node.folder ?? 'hangup'}`] }

    case 'dial':
      // ⚠️ routing_yemot ולא go_to_folder: חיוג יוצא הוא פעולה אחרת
      // לגמרי, ו-go_to_folder עם מספר טלפון פשוט נכשל בשקט.
      return {
        commands: [
          ...common,
          ...(prompt ? [`id_list_message=${prompt}`] : []),
          `routing_yemot=${String(node.phone ?? '').replace(/\D/g, '')}`,
        ],
      }

    case 'record':
      // הקלטה מהמתקשר. ⚠️ נשמרת בימות עצמה; אין כאן מסד.
      return {
        commands: [...common, `record=${prompt || tToken('נא להשאיר הודעה אחרי הצפצוף')}=ivrRec,yes,,,,,,,,`],
      }

    case 'input': {
      // 🔴 קליטת מספר מהמתקשר (ת"ז, מספר כרטיס).
      //
      // ⚠️ משתנה ייעודי (ivrInput) ולא שם כללי: קריאה חוזרת של משתנה
      // שכבר מלא יוצרת לולאה אינסופית בימות — אותה מלכודת שתועדה
      // בשלוחת החגים עם ID_VARS.
      //
      // ⚠️ אורך מרבי נגזר מההגדרה. בלעדיו ימות ממתינה עד תום הזמן
      // גם אחרי שהמתקשר סיים להקיש, והשיחה נראית תקועה.
      const max = Number(node.maxDigits ?? 0)
      const ops = [
        'ivrInput', 'yes', max > 0 ? String(max) : '', '1', String(waitOf(node, 15)),
        'No', 'no', 'no', '', '', repeatsOf(node), '', '', '',
      ]
      return { commands: [...common, `read=${prompt || tToken('נא להקיש את המספר')}=${ops.join(',')}`] }
    }

    case 'raw': {
      // 🔴 הדלת לכל שאר סוגי השלוחות של ימות.
      //
      // ⚠️ פקודה שנפסלה בסינון אינה נשלחת: היא הייתה שוברת את *כל*
      // התשובה, וכל המתקשרים — לא רק בשלוחה הזו — היו שומעים שגיאה.
      // במקרה כזה משמיעים הודעה ומנתקים, שזו התנהגות מובנת.
      // 🔴 שתי דרכים להגיע לכאן, ובכוונה:
      //
      //   · בחירה מרשימה (yemotType) — הדרך הרגילה. המנהל בוחר שם
      //     בעברית, ומזין את מספר השלוחה שהגדיר בימות.
      //   · פקודה חופשית (rawCommand) — למי שיודע בדיוק מה הוא רוצה,
      //     ולכל סוג שאינו ברשימה.
      //
      // ⚠️ בשני המקרים ימות היא שמריצה את הסוג; אנחנו רק שולחים אליה
      // את המתקשר ב-go_to_folder. שלוחה שלא הוגדרה שם תשמיע שקט —
      // ולכן המסך אומר במפורש מה צריך להגדיר.
      const cmd = node.yemotType
        ? (node.folder?.trim() ? `go_to_folder=${node.folder.trim()}` : null)
        : sanitizeRawCommand(node.rawCommand)
      if (!cmd) {
        return {
          commands: [
            `id_list_message=${prompt || tToken('השלוחה אינה מוגדרת כראוי')}`,
            'go_to_folder=hangup',
          ],
        }
      }
      return {
        commands: [
          ...common,
          ...(prompt ? [`id_list_message=${prompt}`] : []),
          cmd,
        ],
      }
    }

    case 'hangup':
      return {
        commands: [
          ...common,
          ...(prompt ? [`id_list_message=${prompt}`] : []),
          'go_to_folder=hangup',
        ],
      }

    case 'message':
    default: {
      // 🔴 הודעה חוזרת לשורש ולא מנתקת.
      //
      // ⚠️ מי שבירר הודעה עדיין רוצה להירשם, וניתוק היה מאלץ אותו
      // לחייג שוב — בדיוק ההתנהגות של מקש 9 בתפריט הקיים.
      const root = byId.get(cfg.rootId)
      const back = root && root.id !== node.id && root.type === 'menu'
        ? [readMenu(root, audioToken(root.prompt))]
        : ['go_to_folder=hangup']
      return {
        commands: [...common, ...(prompt ? [`id_list_message=${prompt}`] : []), ...back],
      }
    }
  }
}

/**
 * מזהה השלוחה שיש להחזיר לימות כדי לזכור היכן המתקשר נמצא.
 *
 * ⚠️ מחושב בנפרד מהפקודות: רק תפריט "ממתין" למתקשר; שאר הסוגים
 * מעבירים אותו הלאה, ושמירת מיקום עליהם הייתה מחזירה אותו לשם.
 */
export function nextNodeId(cfg: IvrConfig, nodeId: string, digit: string): string {
  const byId = new Map(cfg.nodes.map(n => [n.id, n]))
  const node = byId.get(nodeId)

  if (!node) return cfg.rootId
  if (node.type !== 'menu') return cfg.rootId
  if (!digit) return node.id

  const key = (node.keys ?? []).find(k => k.digit === digit)
  const target = key ? byId.get(key.target) : undefined
  if (!key || !target || target.enabled === false) return node.id
  // אחרי הודעה חוזרים לשורש, ולכן שם המתקשר יימצא.
  return target.type === 'menu' ? target.id : cfg.rootId
}
