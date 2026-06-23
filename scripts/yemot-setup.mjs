#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// yemot-setup.mjs — הגדרת שלוחות במערכת ימות המשיח (call2all) דרך ה-HTTP API.
//
// שימוש:
//   YEMOT_TOKEN=... node scripts/yemot-setup.mjs create-menu --ext 7 --title "שיוך כרטיס יולדת"
//   YEMOT_TOKEN=... node scripts/yemot-setup.mjs ls            [--path ivr2:/]
//   YEMOT_TOKEN=... node scripts/yemot-setup.mjs cat  --ext 7
//
// פקודות:
//   create-menu   יוצר/מגדיר שלוחה מסוג "תפריט" (type=menu). ברירת מחדל: שלוחה 7.
//   ls            מציג את רשימת השלוחות בנתיב (קריאה בלבד).
//   cat           מציג את תוכן ה-ext.ini של שלוחה (קריאה בלבד).
//
// הערות:
//   • הטוקן נקרא ממשתנה הסביבה YEMOT_TOKEN בלבד — לא מודפס לעולם.
//   • create-menu לא ידרוס שלוחה קיימת אלא אם הועבר --force.
//   • כל פעולת כתיבה מאומתת מיד אחריה בקריאה חוזרת מהשרת.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = 'https://www.call2all.co.il/ym/api'

const TOKEN = process.env.YEMOT_TOKEN
if (!TOKEN) {
  console.error('שגיאה: משתנה הסביבה YEMOT_TOKEN לא מוגדר.')
  process.exit(1)
}

// ── קריאה ל-API של ימות ──────────────────────────────────────────────────────
// ימות מחזירה JSON עם responseStatus. בקשות GET עם פרמטרים מקודדים.
async function ymApi(method, params = {}) {
  const url = new URL(`${API_BASE}/${method}`)
  url.searchParams.set('token', TOKEN)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url, { method: 'GET' })
  const text = await res.text()

  let json
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(`תגובה לא תקינה מ-${method} (HTTP ${res.status}): ${text.slice(0, 300)}`)
  }

  if (json.responseStatus && json.responseStatus !== 'OK') {
    throw new Error(`${method} נכשל: ${JSON.stringify(json)}`)
  }
  return json
}

// ── עזרי נתיבים ──────────────────────────────────────────────────────────────
// ext "7" → "ivr2:7/ext.ini". שורש → "ivr2:/".
const extIniPath = (ext) => `ivr2:${ext}/ext.ini`

// ── פעולות ───────────────────────────────────────────────────────────────────

// מחזיר את רשימת הפריטים בנתיב (dirs בלבד מספיק לבדיקת קיום שלוחה).
async function listDir(path = 'ivr2:/') {
  const r = await ymApi('GetIVR2Dir', { path })
  return r.dirs ?? []
}

// בודק אם שלוחה כבר קיימת בשורש.
async function extExists(ext) {
  const dirs = await listDir('ivr2:/')
  return dirs.some((d) => d.name === String(ext))
}

// קורא את תוכן ext.ini של שלוחה. מחזיר null אם לא קיים.
async function readExtIni(ext) {
  const r = await ymApi('GetTextFile', { what: extIniPath(ext) })
  if (r.file && r.file.exists === false) return null
  return r.contents ?? null
}

// כותב תוכן ext.ini לשלוחה.
// חשוב: UploadTextFile עובד *רק* כשהתיקייה כבר קיימת ולכן אינו מתאים ליצירת
// שלוחה חדשה. UploadFile (multipart POST) יוצר את תיקיית השלוחה במידת הצורך,
// ולכן הוא משמש כאן לכל כתיבה של ext.ini.
async function writeExtIni(ext, contents) {
  const form = new FormData()
  form.set('token', TOKEN)
  form.set('path', `ivr2:/${ext}/ext.ini`)
  form.set('file', new Blob([contents], { type: 'text/plain' }), 'ext.ini')

  const res = await fetch(`${API_BASE}/UploadFile`, { method: 'POST', body: form })
  const json = await res.json().catch(() => null)
  if (!json || json.responseStatus !== 'OK') {
    throw new Error(`UploadFile נכשל: ${JSON.stringify(json)}`)
  }
  return json
}

// יוצר/מגדיר שלוחה מסוג API (פונה לכתובת webhook חיצונית).
// הטוקן הסודי נשלח כפרמטר קבוע api_add_0=ApiToken=<token> — ימות מצרפת אותו
// לכל קריאה, והשרת דוחה בקשות בלי הסוד הנכון (YEMOT_WEBHOOK_SECRET).
async function createApi({ ext, url, token, force }) {
  if (!url) throw new Error('create-api דורש --url')
  console.log(`▶ הגדרת שלוחה ${ext} מסוג API → ${url}`)

  const exists = await extExists(ext)
  if (exists && !force) {
    const current = await readExtIni(ext)
    console.error(`✋ שלוחה ${ext} כבר קיימת. תוכן נוכחי:\n${current ?? '(ללא ext.ini)'}\n`)
    console.error('   להחלפה הוסף --force. עוצר ללא שינוי.')
    process.exit(2)
  }

  const lines = ['type=api', `api_link=${url}`]
  if (token) lines.push(`api_add_0=ApiToken=${token}`)
  const contents = lines.join('\n') + '\n'

  await writeExtIni(ext, contents)
  console.log('✔ נכתב. מאמת מול השרת...')

  const after = await readExtIni(ext)
  // לא מדפיסים את הסוד במלואו
  console.log(`   ext.ini עכשיו:\n${(after ?? '').replace(/(ApiToken=)(\S+)/, (_, p, v) => p + v.slice(0, 4) + '…')}`)

  const dirs = await listDir('ivr2:/')
  const entry = dirs.find((d) => d.name === String(ext))
  console.log(`   ברשימת השורש: ${entry ? `נמצאה (extType=${entry.extType ?? entry.fileType})` : 'לא נמצאה!'}`)

  const ok = (after ?? '').includes('type=api') && (after ?? '').includes(`api_link=${url}`)
  if (!ok || !entry || entry.extType !== 'api') {
    console.error('✗ האימות נכשל — type=api / api_link לא נמצאו או ש-extType אינו api.')
    process.exit(3)
  }
  console.log(`\n✅ שלוחה ${ext} הוגדרה כשלוחת API בהצלחה.`)
}

// יוצר/מגדיר שלוחה מסוג תפריט.
async function createMenu({ ext, title, force }) {
  console.log(`▶ יצירת שלוחה ${ext} מסוג תפריט (type=menu)...`)

  const exists = await extExists(ext)
  if (exists && !force) {
    const current = await readExtIni(ext)
    console.error(`✋ שלוחה ${ext} כבר קיימת. תוכן נוכחי:\n${current ?? '(ללא ext.ini)'}\n`)
    console.error('   להחלפה הוסף --force. עוצר ללא שינוי.')
    process.exit(2)
  }

  const lines = ['type=menu']
  if (title) lines.push(`title=${title}`)
  const contents = lines.join('\n') + '\n'

  await writeExtIni(ext, contents)
  console.log('✔ נכתב. מאמת מול השרת...')

  // אימות 1: ext.ini חזר עם type=menu
  const after = await readExtIni(ext)
  const normalized = (after ?? '').replace(/^[^\w;]*/m, '') // התעלמות מתווי-קישוט מובילים
  const ok = (after ?? '').includes('type=menu')
  console.log(`   ext.ini עכשיו:\n${after}`)

  // אימות 2: השלוחה מופיעה ברשימת השורש
  const dirs = await listDir('ivr2:/')
  const entry = dirs.find((d) => d.name === String(ext))
  console.log(`   ברשימת השורש: ${entry ? `נמצאה (extType=${entry.extType ?? entry.fileType})` : 'לא נמצאה!'}`)

  if (!ok || !entry) {
    console.error('✗ האימות נכשל — type=menu לא נמצא או שהשלוחה לא ברשימה.')
    process.exit(3)
  }
  console.log(`\n✅ שלוחה ${ext} הוגדרה כתפריט בהצלחה.`)
}

// ── ניתוח ארגומנטים ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        out[key] = true
      } else {
        out[key] = next
        i++
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0] ?? 'create-menu'

  try {
    switch (cmd) {
      case 'create-menu':
        await createMenu({
          ext: args.ext ?? '7',
          title: args.title ?? 'שיוך כרטיס יולדת',
          force: Boolean(args.force),
        })
        break

      case 'create-api':
        await createApi({
          ext: args.ext ?? '7',
          url: args.url,
          token: args.token ?? process.env.YEMOT_WEBHOOK_SECRET,
          force: Boolean(args.force),
        })
        break

      case 'ls': {
        const dirs = await listDir(args.path ?? 'ivr2:/')
        console.log(`שלוחות ב-${args.path ?? 'ivr2:/'}:`)
        for (const d of dirs) {
          console.log(`  ${d.name.padEnd(6)} ${d.extType ?? d.fileType ?? ''}  ${d.extTitle ?? ''}`)
        }
        break
      }

      case 'cat': {
        const ext = args.ext
        if (!ext) throw new Error('cat דורש --ext')
        const c = await readExtIni(ext)
        console.log(c ?? `(לשלוחה ${ext} אין ext.ini)`)
        break
      }

      default:
        console.error(`פקודה לא מוכרת: ${cmd}`)
        console.error('פקודות זמינות: create-menu | create-api | ls | cat')
        process.exit(1)
    }
  } catch (err) {
    console.error(`✗ שגיאה: ${err.message}`)
    process.exit(1)
  }
}

main()
