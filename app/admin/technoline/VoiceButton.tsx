'use client'
import { useState } from 'react'
import { describeVoiceSync, type VoiceReply } from '@/lib/telephony/voiceSummary'

// יוצר בקול של שלמה את ההודעות הקבועות שעדיין אין להן הקלטה (יכול לקחת כדקה).
export default function VoiceButton() {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function run() {
    setBusy(true); setNote(null)
    try {
      const r = await fetch('/api/admin/phone/voice', { method: 'POST' })
      const j: VoiceReply = await r.json().catch(() => ({}))
      setNote(describeVoiceSync(r.ok, j))
    } catch {
      setNote({ ok: false, text: 'היצירה נכשלה. בדקו חיבור ונסו שוב.' })
    }
    setBusy(false)
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
      <button className="btn" disabled={busy} onClick={run}>{busy ? 'יוצר הקלטות… (עד דקה)' : 'צור הקלטות בקולי'}</button>
      {note && <span className={`chip ${note.ok ? 'ok' : 'bad'}`} role="status">{note.text}</span>}
      <p className="hint" style={{ flexBasis: '100%', margin: 0 }}>ההודעות הקבועות של התפריט, החגים והיולדות מושמעות בקול שלך. אחרי שינוי נוסח אפשר ללחוץ שוב.</p>
    </div>
  )
}
