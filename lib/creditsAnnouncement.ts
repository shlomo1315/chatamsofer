// הודעת פתיחה מוקלטת (ElevenLabs) בתחילת התפריט הראשי של הקו.
// נוצרת פעם אחת ונשמרת בימות; בשיחה רק משמיעים את הקובץ (f-<שם>).
// שינוי הנוסח או הקול: ההפקה מחדש אוטומטית בשיחה הבאה (השוואת חותמת), בלי הפעלה ידנית.
import { createHash } from 'node:crypto'
import { getServiceClient } from '@/lib/apiAuth'
import { generateSpeech, getElevenConfig } from '@/lib/elevenTts'
import { uploadFileToYemot, deleteFileFromYemot, bookFairPath } from '@/lib/yemot'

// הנוסח מילה במילה, כפי שנכתב על ידי שלמה ויסברג. אין לשנות בלי בקשתו.
export const CREDITS_ANNOUNCEMENT_TEXT = [
  'שלום וברכה, הודעה ממערכת הזמנות הספרים שעל ידי היכל החתם סופר.',
  'הזמנתכם נשלחה לכתובת שהזנתם בעת ביצוע ההזמנה.',
  'לתשומת לבכם, עשינו כל מאמץ לספק לכל לקוח את מלוא הספרים שהוזמנו. עקב הביקוש הגדול וההזמנות הרבות שהתקבלו במערכת, ייתכן חוסר בספרים מסוימים, ואנו מתנצלים על כך.',
  'לדיווח על תקלה או חסר בחבילה שקיבלתם, ניתן להשאיר לנו הודעה בטלפון 09-3130924 או בדואר אלקטרוני yerid@chasamsofer.info ונחזור אליכם בהקדם.',
  'שימו לב, המערכת פתוחה לפניות עד ליום שני ט"ו בחשוון בשעה 12 בלילה, לאחר מכן לא נוכל לתת יותר מענה.',
  'בברכה, היכל החתם סופר',
].join('\n\n')

const DIGITS = ['אפס', 'אחד', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש', 'שבע', 'שמונה', 'תשע']
const LETTERS: Record<string, string> = {
  a: 'איי', b: 'בי', c: 'סי', d: 'די', e: 'אי', f: 'אף', g: "ג'י", h: "אייץ'", i: 'איי', j: "ג'יי", k: 'קיי', l: 'אל', m: 'אם',
  n: 'אן', o: 'או', p: 'פי', q: 'קיו', r: 'אר', s: 'אס', t: 'טי', u: 'יו', v: 'וי', w: 'דבליו', x: 'אקס', y: 'וואי', z: 'זד',
  '@': 'שטרודל', '.': 'נקודה', '_': 'קו תחתון', '-': 'מקף',
}
const spellOut = (v: string) => [...v].map(c => /\d/.test(c) ? DIGITS[+c] : (LETTERS[c.toLowerCase()] ?? c)).join(', ')

/** הנוסח להקראה: טלפון ספרה אחרי ספרה וכתובת מייל אות אחרי אות. הנוסח המוצג (מייל) נשאר כמו שהוא. */
export function spokenAnnouncementText(text: string = CREDITS_ANNOUNCEMENT_TEXT): string {
  return text
    .replace(/[\w.-]+@[\w.-]+\.[a-z]+/gi, m => spellOut(m))
    .replace(/\d[\d-]{5,}\d/g, m => spellOut(m.replace(/-/g, '')))
}

export const ANNOUNCEMENT_KEY = 'credits_line_announcement'

export const announcementHash = (text: string, voiceId: string) =>
  createHash('sha1').update(`${voiceId}\n${text}`).digest('hex').slice(0, 12)

let building: Promise<void> | null = null

/** מפיק ומעלה את ההודעה ושומר ב-app_settings. מוגן מפני הרצה כפולה במקביל. */
export function buildAnnouncement(): Promise<void> {
  if (!building) building = doBuild().catch(e => console.error('[credits-announcement] נכשל', e)).finally(() => { building = null })
  return building
}

async function doBuild(): Promise<void> {
  const db = getServiceClient()
  const cfg = await getElevenConfig()
  if (!db || !cfg) return
  const hash = announcementHash(spokenAnnouncementText(), cfg.voiceId)
  const sp = await generateSpeech(spokenAnnouncementText())
  if (!sp.ok || !sp.audio) { console.error('[credits-announcement] הפקת קול נכשלה:', sp.error); return }
  // חותמת זמן בשם: ימות מחזיקה מטמון לפי שם
  const name = `rec_credits_line_${hash}_${Date.now().toString(36)}`
  const up = await uploadFileToYemot(bookFairPath(`${name}.mp3`), new Blob([sp.audio], { type: 'audio/mpeg' }), `${name}.mp3`, 'bookFair')
  if (!up.ok) { console.error('[credits-announcement] העלאה לימות נכשלה:', up.error); return }
  const { data: prev } = await db.from('app_settings').select('value').eq('key', ANNOUNCEMENT_KEY).maybeSingle()
  await db.from('app_settings').upsert(
    { key: ANNOUNCEMENT_KEY, value: JSON.stringify({ hash, audio: name }), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  try {
    const old = prev?.value ? (JSON.parse(prev.value).audio as string | undefined) : undefined
    if (old) await deleteFileFromYemot(bookFairPath(`${old}.mp3`), 'bookFair')
  } catch { /* ניקוי best-effort */ }
}

/**
 * טוקן ההשמעה (f-<שם>) אם ההודעה מוכנה ועדכנית. אחרת null ומתחילה הפקה ברקע,
 * כך שהשיחה לא ממתינה ל-ElevenLabs (השיחות הראשונות ישמעו תפריט בלי ההודעה).
 */
export async function announcementToken(): Promise<string | null> {
  const db = getServiceClient()
  if (!db) return null
  const cfg = await getElevenConfig()
  if (!cfg) return null
  const { data } = await db.from('app_settings').select('value').eq('key', ANNOUNCEMENT_KEY).maybeSingle()
  let cur: { hash?: string; audio?: string } = {}
  try { cur = data?.value ? JSON.parse(data.value) : {} } catch { /* ריק */ }
  const want = announcementHash(CREDITS_ANNOUNCEMENT_TEXT, cfg.voiceId)
  if (cur.audio && cur.hash === want) return `f-${cur.audio}`
  void buildAnnouncement()
  // הודעה ישנה עדיפה על שקט בזמן שהחדשה בהפקה
  return cur.audio ? `f-${cur.audio}` : null
}

/** כמו announcementToken, אבל ממתין לסיום הפקה שהתחילה (לשליחת בדיקה, כדי שהשיחה הראשונה כבר תשמע את ההודעה). */
export async function ensureAnnouncement(): Promise<void> {
  await announcementToken()
  if (building) await building
}
