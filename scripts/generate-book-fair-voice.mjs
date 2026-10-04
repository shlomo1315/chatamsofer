// יצירת קול ElevenLabs לכל נוסחי שלוחת היריד, והעלאתם לימות.
//
// 🔴 מקביל לנתיב /api/admin/book-fair/generate-voice (all:true), אבל
// מהשורה — 67 נוסחים × ~4 שניות הם מעבר לזמן של בקשת HTTP אחת.
//
// ⚠️ מדלג על הודעות עם {משתנה}: קובץ יחיד אינו יכול להקריא ערך
// שמשתנה בכל שיחה, והן נשארות ב-TTS של ימות במכוון.
//
// ⚠️ מדלג על הודעות שכבר יש להן הקלטה אנושית (rec_), ודורס רק קול
// שנוצר אוטומטית (tts_).
//
// שימוש: node scripts/generate-book-fair-voice.mjs [--force]

import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const FORCE = process.argv.includes('--force')
const EXT = process.env.YEMOT_BOOK_FAIR_EXT || '9'
const YEMOT_TOKEN = process.env.YEMOT_TOKEN
const KEY = 'yemot_book_fair_messages'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

if (!YEMOT_TOKEN) {
  console.error('🔴 YEMOT_TOKEN אינו מוגדר — אי אפשר להעלות לימות')
  process.exit(1)
}

// ── הגדרות ElevenLabs ──
const { data: cfgRow } = await db.from('app_settings')
  .select('value').eq('key', 'elevenlabs_tts').maybeSingle()
const cfg = cfgRow?.value ? JSON.parse(String(cfgRow.value)) : null
if (!cfg?.apiKey || !cfg?.voiceId) {
  console.error('🔴 ElevenLabs אינו מוגדר (מפתח/קול חסרים)')
  process.exit(1)
}
console.log(`קול: ${cfg.voiceId} · מודל: ${cfg.modelId ?? 'eleven_multilingual_v2'} · שלוחה: ${EXT}`)

// ── הנוסחים ──
const { data: row } = await db.from('app_settings').select('value').eq('key', KEY).maybeSingle()
if (!row?.value) {
  console.error('🔴 אין נוסחים שמורים — הריצו קודם seed-book-fair-messages.mjs')
  process.exit(1)
}
const msgs = JSON.parse(String(row.value))

const hasPlaceholder = t => /\{[^}]+\}/.test(t)
const keys = Object.keys(msgs)

let done = 0, skipped = 0, failed = 0

for (const key of keys) {
  const entry = msgs[key]
  const text = String(entry?.text ?? '').trim()

  if (!text) { skipped++; continue }
  if (hasPlaceholder(text)) { skipped++; continue }
  // ⚠️ הקלטה אנושית אינה נדרסת.
  if (entry.audio && !String(entry.audio).startsWith('tts_')) { skipped++; continue }
  if (entry.audio && !FORCE) { skipped++; continue }

  try {
    const tts = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(cfg.voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': cfg.apiKey, 'Content-Type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: cfg.modelId || 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
        }),
      },
    )
    if (!tts.ok) {
      console.error(`  ✗ ${key}: ElevenLabs ${tts.status} ${(await tts.text()).slice(0, 120)}`)
      failed++; continue
    }
    const audio = Buffer.from(await tts.arrayBuffer())

    // 🔴 חותמת זמן בשם: שם קבוע גורם לימות לנגן את ההקלטה הישנה
    // לנצח, בלי שום סימן שמשהו לא עודכן.
    const baseName = `tts_${key}_${Date.now().toString(36)}`
    const form = new FormData()
    form.set('token', YEMOT_TOKEN)
    form.set('path', `ivr2:/${EXT}/${baseName}.mp3`)
    form.set('convertAudio', '1')
    form.set('file', new Blob([audio], { type: 'audio/mpeg' }), `${baseName}.mp3`)

    const up = await fetch('https://www.call2all.co.il/ym/api/UploadFile', { method: 'POST', body: form })
    const upJson = await up.json().catch(() => null)
    if (!upJson || upJson.responseStatus !== 'OK') {
      console.error(`  ✗ ${key}: העלאה לימות — ${upJson ? JSON.stringify(upJson).slice(0, 120) : up.status}`)
      failed++; continue
    }

    msgs[key] = { text, audio: baseName }
    done++
    process.stdout.write(`  ✓ ${key} (${done})\n`)
  } catch (e) {
    console.error(`  ✗ ${key}: ${e instanceof Error ? e.message : String(e)}`)
    failed++
  }
}

// ⚠️ שמירה אחת בסוף ולא אחרי כל קובץ: 67 כתיבות למסד על פעולה אחת
// הן בזבוז, והכשל היחיד שמשנה הוא כשל ההעלאה (שכבר דווח).
const { error } = await db.from('app_settings').upsert(
  { key: KEY, value: JSON.stringify(msgs), updated_at: new Date().toISOString() },
  { onConflict: 'key' },
)
if (error) {
  console.error('🔴 שמירת ההגדרות נכשלה:', error.message)
  process.exit(1)
}

console.log(`\n✅ ${done} קבצי קול נוצרו · ${skipped} דולגו (משתנה/קיים) · ${failed} נכשלו`)
