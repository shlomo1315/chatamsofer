// זריעת נוסחי שלוחת היריד ל-app_settings.
//
// 🔴 למה צריך: הנוסחים קיימים בקוד כברירות מחדל, אבל *יצירת הקול*
// עובדת רק על מה ששמור במסד — ולכן בלי השורה הזו אין לאיזו הודעה
// לייצר קול, והשלוחה מדברת ב-TTS של ימות במקום בקול המוקלט.
//
// ⚠️ אינו דורס נוסח קיים: אם ההודעה כבר שמורה (עם או בלי הקלטה),
// היא נשארת כפי שהיא. עריכה ידנית שנעשתה במסך לא תימחק.
//
// שימוש: node scripts/seed-book-fair-messages.mjs

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('🔴 חסרים NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

// ── חילוץ המטא-דאטה מהקוד ──
// ⚠️ חיתוך לבלוק עצמו: בהמשך הקובץ יש defaultText בהערות ובפונקציות.
const src = readFileSync('lib/yemotBookFairMessages.ts', 'utf8')
const start = src.indexOf('export const BOOK_FAIR_MESSAGE_META')
const end = src.indexOf('\n]', start)
if (start < 0 || end < 0) {
  console.error('🔴 לא נמצא בלוק BOOK_FAIR_MESSAGE_META')
  process.exit(1)
}
const block = src.slice(start, end)

const entryRe = /\{\s*key:\s*'([^']+)'[\s\S]*?defaultText:\s*'((?:[^'\\]|\\.)*)'/g
const defaults = {}
let m
let count = 0
while ((m = entryRe.exec(block)) !== null) {
  defaults[m[1]] = m[2].replace(/\\'/g, "'")
  count++
}
if (!count) {
  console.error('🔴 לא חולץ אף נוסח — הפורמט השתנה?')
  process.exit(1)
}

// ── מיזוג על הקיים ──
const { data: row } = await db.from('app_settings')
  .select('value').eq('key', 'yemot_book_fair_messages').maybeSingle()

let existing = {}
try { existing = row?.value ? JSON.parse(String(row.value)) : {} } catch { /* ערך פגום — נתחיל נקי */ }

const merged = {}
let added = 0, kept = 0
for (const [k, text] of Object.entries(defaults)) {
  const prev = existing[k]
  if (prev && typeof prev.text === 'string' && prev.text.trim()) {
    merged[k] = { text: prev.text, audio: prev.audio ?? null }
    kept++
  } else {
    merged[k] = { text, audio: null }
    added++
  }
}

// ⚠️ JSON.stringify — app_settings היא עמודת text, ואובייקט גולמי
// נשמר כ-"[object Object]" בשקט.
const { error } = await db.from('app_settings').upsert(
  { key: 'yemot_book_fair_messages', value: JSON.stringify(merged), updated_at: new Date().toISOString() },
  { onConflict: 'key' },
)

if (error) {
  console.error('🔴 השמירה נכשלה:', error.message)
  process.exit(1)
}
console.log(`✅ ${count} נוסחים · ${added} נוספו · ${kept} נשמרו כפי שהיו`)
