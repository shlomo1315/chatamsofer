'use client'

import { useState } from 'react'

// כפתור "+" צף בתחתית הדף: הגולש כותב מה לתקן, והבקשה נשלחת לאישור.
export default function FixRequest() {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [err, setErr] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setState('sending'); setErr('')
    try {
      const res = await fetch('/api/archive-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: f.get('body'), area: f.get('area'), name: f.get('name'), contact: f.get('contact'), website: f.get('website') }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error ?? 'השליחה נכשלה'); setState('idle'); return }
      setState('done')
    } catch { setErr('השליחה נכשלה, נסו שוב'); setState('idle') }
  }

  const close = () => { setOpen(false); setState('idle'); setErr('') }

  return (
    <>
      <button className="fix-fab" aria-label="הצעת תיקון בארכיון" title="הצעת תיקון" onClick={() => setOpen(true)}>+</button>
      {open && (
        <div className="fix-back" onClick={close}>
          <div className="fix-box" role="dialog" aria-modal="true" aria-labelledby="fix-t" onClick={e => e.stopPropagation()}>
            {state === 'done' ? (
              <>
                <h2 id="fix-t">תודה, קיבלנו</h2>
                <p>הבקשה הועברה לבדיקה. אם תאושר, התיקון יתבצע.</p>
                <button className="btn primary" onClick={close}>סגירה</button>
              </>
            ) : (
              <form onSubmit={submit}>
                <h2 id="fix-t">מה לתקן בארכיון?</h2>
                <label>מה צריך לתקן
                  <textarea name="body" required minLength={5} maxLength={2000} rows={4} placeholder="למשל: הגיליון של פרשת וארא מופיע בשנה לא נכונה" />
                </label>
                <label>איפה (גיליון, פרשה או שנה)
                  <input name="area" maxLength={200} />
                </label>
                <label>שם (לא חובה)
                  <input name="name" maxLength={100} autoComplete="name" />
                </label>
                <label>טלפון או מייל לחזרה (לא חובה)
                  <input name="contact" maxLength={200} autoComplete="email" />
                </label>
                <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="fix-trap" />
                {err && <p role="alert" className="fix-err">{err}</p>}
                <div className="fix-row">
                  <button type="submit" className="btn primary" disabled={state === 'sending'}>{state === 'sending' ? 'שולח…' : 'שליחה'}</button>
                  <button type="button" className="btn" onClick={close}>ביטול</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
