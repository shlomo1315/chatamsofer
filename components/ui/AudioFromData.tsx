'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { scrambleBytes, DOC_CIPHER_ID } from '@/lib/docCipher'

// ─────────────────────────────────────────────────────────────────────────────
// נגן אודיו שטוען את הקובץ כ*נתונים* ולא ב-src ישיר.
//
// 🔴 למה: נטפרי מזהה תגובה לפי סוג התוכן. תגובת audio/* היא "קובץ"
// ונחסמת ב-418, והנגן נשאר ריק בלי שום הודעת שגיאה — נראה בדיוק
// כמו הקלטה שלא נקלטה.
//
// ⚠️ אותו דפוס כמו /api/files/data ו-batch-pdf: JSON עם base64
// מעורבל, והדפדפן מרכיב Blob מקומי (ראו lib/docCipher).
// ─────────────────────────────────────────────────────────────────────────────

export default function AudioFromData({ url, className = 'w-full' }: {
  url: string
  className?: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // ⚠️ הכתובת נשמרת לשחרור: בלי revoke כל טעינה מדליפה זיכרון.
  const objectUrl = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    }
  }, [])

  async function load() {
    if (src || loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d?.error ?? `הטעינה נכשלה (${res.status})`)
      }
      const payload = await res.json()
      if (!payload?.data) throw new Error(payload?.error ?? 'לא התקבל אודיו')

      const bin = atob(payload.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      // ⚠️ enc נבדק ולא מונח: תגובה שנשמרה במטמון לפני השינוי מגיעה
      // בלי הסימון, ופענוח שלה היה הופך קובץ תקין לרעש.
      if (payload.enc === DOC_CIPHER_ID) scrambleBytes(bytes)

      const u = URL.createObjectURL(
        new Blob([bytes], { type: payload.contentType || 'audio/wav' }),
      )
      objectUrl.current = u
      setSrc(u)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הטעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  if (error) {
    return (
      <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
        {error}
        <button onClick={() => { setError(null); void load() }} className="mr-2 underline">
          נסו שוב
        </button>
      </div>
    )
  }

  // ⚠️ לא נטען מאליו: ההקלטות כבדות, ורובן אינן נשמעות בפועל.
  if (!src) {
    return (
      <button
        onClick={() => void load()}
        disabled={loading}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" /> טוען…</>
          : <>▶ השמעת ההקלטה</>}
      </button>
    )
  }

  // eslint-disable-next-line jsx-a11y/media-has-caption
  return <audio controls autoPlay src={src} className={className} />
}
