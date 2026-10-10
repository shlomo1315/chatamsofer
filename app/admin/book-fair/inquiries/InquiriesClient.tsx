'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  Phone, Play, Pause, Check, Loader2, MessageSquare, Clock, RotateCcw,
} from 'lucide-react'
import { useCan } from '@/components/StaffPermissions'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// פניות שהושארו בשלוחה הטלפונית של היריד.
//
// 🔴 ההקלטה היא העיקר ולא התמלול: ElevenLabs STT מחזיר ג'יבריש בעברית
// (נבדק ב-3 קודי שפה), ולכן אין כאן תמלול לעת עתה. העמודה קיימת במסד
// ותתמלא בדיעבד כשייבחר מנוע — גם לפניות שכבר הצטברו.
// ─────────────────────────────────────────────────────────────────────────────

type Inquiry = {
  id: string
  phone: string
  recording: string | null
  transcript: string | null
  handled_at: string | null
  note: string | null
  created_at: string
}

export default function InquiriesClient() {
  const canEdit = useCan('book_fair', 'edit')
  const [rows, setRows] = useState<Inquiry[] | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [playing, setPlaying] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const res = await fetch(`/api/admin/book-fair/inquiries${showAll ? '?all=1' : ''}`, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'הטעינה נכשלה'); return }
      setRows(d.inquiries ?? [])
    } catch {
      setError('הטעינה נכשלה — בדקו את החיבור')
    }
  }, [showAll])

  useEffect(() => { void load() }, [load])

  // ⚠️ נגן יחיד: השמעת פנייה שנייה עוצרת את הראשונה. בלי זה שתי
  // הקלטות מתנגנות יחד ואי אפשר לשמוע אף אחת.
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  async function play(id: string) {
    audio?.pause()
    if (playing === id) { setPlaying(null); setAudio(null); return }
    setPlaying(id)
    setError('')
    try {
      // ⚠️ JSON מעורבל ולא <audio src>: נטפרי חוסם תגובת קובץ אודיו, והשרת
      // רואה 200 בזמן שהדפדפן מקבל חסימה. ראו lib/docCipher.
      const res = await fetch(`/api/admin/book-fair/inquiries/audio?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      const payload = await res.json().catch(() => null)
      if (!res.ok || !payload?.data) throw new Error(payload?.error ?? `ההשמעה נכשלה (${res.status})`)
      const bin = atob(payload.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      if (payload.enc === DOC_CIPHER_ID) scrambleBytes(bytes)
      const url = URL.createObjectURL(new Blob([bytes], { type: payload.contentType || 'audio/wav' }))
      const a = new Audio(url)
      const done = () => { URL.revokeObjectURL(url); setPlaying(p => (p === id ? null : p)) }
      a.onended = done
      a.onerror = () => { done(); setError('הדפדפן לא הצליח לנגן את ההקלטה') }
      setAudio(a)
      await a.play()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ההשמעה נכשלה')
      setPlaying(null)
    }
  }

  async function setHandled(id: string, handled: boolean) {
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/book-fair/inquiries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, handled }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'העדכון נכשל'); return }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${d.toLocaleDateString('he-IL')} · ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">פניות מאזינים</h1>
          <p className="text-sm text-slate-500">
            הודעות שהושארו בשלוחה הטלפונית של היריד
          </p>
        </div>
        <button
          onClick={() => setShowAll(v => !v)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
        >
          {showAll ? 'הצג פתוחות בלבד' : 'הצג גם שטופלו'}
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* ⚠️ אמירה מפורשת ולא עמודה ריקה: "אין תמלול" נראה כתקלה, בעוד
          שזו החלטה מודעת שתתהפך כשיוגדר מנוע. */}
      <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
        התמלול האוטומטי אינו פעיל כרגע — מנוע התמלול שנבדק לא החזיר עברית תקינה.
        ההקלטות נשמרות במלואן וניתן להאזין להן כאן.
      </p>

      {rows === null ? (
        <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-16 text-center">
          <MessageSquare size={36} className="text-slate-300" />
          <p className="text-slate-500">{showAll ? 'אין פניות' : 'אין פניות פתוחות'}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map(r => (
            <li
              key={r.id}
              className={`rounded-2xl border bg-white p-4 ${
                r.handled_at ? 'border-slate-200 opacity-60' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <a
                    href={`tel:${r.phone}`}
                    className="flex items-center gap-1.5 font-mono text-base font-bold text-slate-900 hover:text-indigo-600"
                  >
                    <Phone size={15} className="text-slate-400" /> {r.phone}
                  </a>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock size={12} /> {fmt(r.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {r.recording && (
                    <button
                      onClick={() => void play(r.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                    >
                      {playing === r.id ? <Pause size={15} /> : <Play size={15} />}
                      {playing === r.id ? 'עצור' : 'האזן'}
                    </button>
                  )}
                  {canEdit && (
                    <button
                      onClick={() => setHandled(r.id, !r.handled_at)}
                      disabled={busyId === r.id}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition disabled:opacity-40 ${
                        r.handled_at
                          ? 'border-slate-200 text-slate-500 hover:bg-slate-50'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {busyId === r.id
                        ? <Loader2 size={15} className="animate-spin" />
                        : r.handled_at ? <RotateCcw size={15} /> : <Check size={15} />}
                      {r.handled_at ? 'החזר לפתוחות' : 'סמן כטופל'}
                    </button>
                  )}
                </div>
              </div>

              {r.transcript && (
                <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700">
                  {r.transcript}
                </p>
              )}

              {r.handled_at && (
                <p className="mt-2 text-xs text-slate-400">טופל ב-{fmt(r.handled_at)}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
