'use client'

import { useState } from 'react'

// 🔴 A7.3: דף "הקישור אינו תקין" היה מבוי סתום — המשפחה נדרשה לפנות למשרד.
// עכשיו היא מבקשת קישור חדש בלחיצה, והוא נשלח למייל הרשום בתיק בלבד.
export default function RenewLinkButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function requestNew() {
    setState('sending')
    try {
      const r = await fetch('/api/public/fix-name/renew', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setState(r.ok ? 'sent' : 'failed')
    } catch { setState('failed') }
  }

  return (
    <>
      <button
        type="button"
        onClick={requestNew}
        disabled={state !== 'idle'}
        className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {state === 'sending' ? 'שולח…' : state === 'sent' ? '✓ הבקשה נשלחה' : 'שלחו לי קישור חדש'}
      </button>
      {state === 'sent' && (
        <p className="mt-2 text-xs leading-relaxed text-green-700">
          אם התיק עדיין ממתין לשם התינוק, קישור חדש יישלח למייל הרשום אצלנו בדקות הקרובות.
        </p>
      )}
      {state === 'failed' && (
        <p className="mt-2 text-xs leading-relaxed text-rose-600">
          שליחת הבקשה נכשלה. ניתן לפנות למשרד ולבקש קישור חדש.
        </p>
      )}
    </>
  )
}
