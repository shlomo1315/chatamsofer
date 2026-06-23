#!/usr/bin/env node
// הגדרת שלוחת API בימות המשיח עבור שיוך כרטיס יולדת.
// יוצר/מעדכן את קובץ ה-ext.ini של השלוחה ומכוון אותה ל-webhook של המערכת.
//
// הרצה (מהמחשב שלך — מקום שיש בו גישת רשת ל-call2all.co.il, Node 18+):
//
//   # מצב הרצה-יבשה (לא משנה כלום, רק מדפיס מה ייכתב):
//   YEMOT_TOKEN='0771234567:הסיסמה' node scripts/yemot-setup.mjs --ext 5
//
//   # ביצוע בפועל:
//   YEMOT_TOKEN='0771234567:הסיסמה' node scripts/yemot-setup.mjs --ext 5 --apply
//
// פרמטרים:
//   --ext <מספר>     מספר/נתיב השלוחה שתהפוך לשלוחת API (חובה). דוגמה: 5  או  1/2
//   --url <כתובת>    כתובת ה-webhook. ברירת מחדל: https://chasamsofer.co.il/api/webhooks/yemot-maternity
//   --method GET|POST  שיטת הקריאה. ברירת מחדל: POST
//   --apply          לבצע בפועל. בלעדיו — הרצה-יבשה בלבד.
//
// אבטחה: אל תשים את הטוקן בתוך פקודה שנשמרת בהיסטוריה. עדיף משתנה סביבה (YEMOT_TOKEN).

const API = 'https://www.call2all.co.il/ym/api'

// ── קריאת פרמטרים ────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function arg(name, def) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}
const token = process.env.YEMOT_TOKEN || arg('token')
const ext = arg('ext')
const webhookUrl = arg('url', 'https://chasamsofer.co.il/api/webhooks/yemot-maternity')
const method = (arg('method', 'POST') || 'POST').toUpperCase()
const apply = args.includes('--apply')

function die(msg) { console.error(`\n✖ ${msg}\n`); process.exit(1) }
if (!token) die('חסר טוקן. הגדר YEMOT_TOKEN="מספר:סיסמה" או --token "מספר:סיסמה".')
if (!ext) die('חסר מספר שלוחה. הוסף --ext <מספר>. דוגמה: --ext 5')
if (!/^(GET|POST)$/.test(method)) die('--method חייב להיות GET או POST.')

const what = `ivr2:/${ext}/ext.ini`

// ── תוכן ext.ini של שלוחת API ────────────────────────────────────────────────
// זהו ההגדרה שהופכת את השלוחה לשלוחה שמנותבת ע"י שרת חיצוני (ה-webhook).
// הערה: אם כלי "בדיקת שלוחת API" של ימות לא מצליח אחרי ההרצה — ייתכן שצריך לכוון
// את שמות המפתחות כאן בהתאם לחשבון שלך; שנֵה רק את השורות האלה והרץ שוב.
const extIni = [
  'type=api_dialing',
  `api_dialing_url=${webhookUrl}`,
  `api_dialing_method=${method}`,
].join('\r\n') + '\r\n'

// ── עזרי API ─────────────────────────────────────────────────────────────────
async function call(fn, params, post = false) {
  const qs = new URLSearchParams({ token, ...params })
  const url = post ? `${API}/${fn}` : `${API}/${fn}?${qs}`
  const res = await fetch(url, post
    ? { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs.toString() }
    : {})
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = { responseStatus: 'RAW', raw: text } }
  return { ok: res.ok, status: res.status, json }
}

// ── זרימה ────────────────────────────────────────────────────────────────────
console.log(`\n• שלוחה:      ${ext}  (קובץ: ${what})`)
console.log(`• webhook:    ${webhookUrl}`)
console.log(`• שיטה:       ${method}`)
console.log(`• מצב:        ${apply ? 'ביצוע בפועל (--apply)' : 'הרצה-יבשה (ללא --apply)'}\n`)
console.log('תוכן ext.ini שייכתב:')
console.log('────────────────────────────')
process.stdout.write(extIni)
console.log('────────────────────────────\n')

if (!apply) {
  console.log('ℹ הרצה-יבשה בלבד — לא בוצע שינוי ולא נדרשה רשת. להרצה בפועל הוסף --apply.\n')
  process.exit(0)
}

// 1) אימות הטוקן (קריאה לקריאה בלבד)
const session = await call('GetSession', {})
if (session.json.responseStatus && session.json.responseStatus !== 'OK') {
  die(`אימות הטוקן נכשל: ${session.json.message || JSON.stringify(session.json)}`)
}
console.log('✓ הטוקן תקין.')

// 2) כתיבת ext.ini
const up = await call('UploadTextFile', { what, contents: extIni }, true)
if (up.json.responseStatus !== 'OK') {
  die(`כתיבת ext.ini נכשלה: ${up.json.message || JSON.stringify(up.json)}`)
}
console.log('✓ ext.ini נכתב לשלוחה.')

// 3) קריאה חוזרת לאימות
const back = await call('GetTextFile', { what })
if (back.json.contents != null) {
  console.log('\nתוכן השלוחה כפי שנשמר בימות:')
  console.log('────────────────────────────')
  process.stdout.write(String(back.json.contents))
  console.log('\n────────────────────────────')
}

console.log('\n✓ הסתיים. עכשיו הרץ "בדיקת שלוחת API" בממשק ימות, או חייג לשלוחה ' + ext + ' ובדוק שמושמעת ההנחיה.\n')
