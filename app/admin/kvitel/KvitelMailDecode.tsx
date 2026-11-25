'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, Loader2, Pencil, RefreshCw } from 'lucide-react'
import { decodeKvitelPayload, type KvitelScrambled } from '@/lib/kvitelPayload'
import type { KvitelMailDecode as Decode } from '@/lib/kvitelMailDecode'
import { modalBtn } from '@/components/admin/system/RecordModal'
import KvitelLinesEditor from './KvitelLinesEditor'

// עמודת "הפיענוח" בלשונית המייל של הקוויטלעך: מה נקלט מהמייל שנבחר (שם, בן/בת, שם האם, בקשה).
// בהרשאת עריכה: אישור הבקשה, עריכת השמות והפילוח (KvitelLinesEditor), וקליטה מחדש של המייל
// (POST /api/admin/kvitel/mail-decode). מייל שעוד לא נקלט מציג את הפענוח לפי תבנית, עם "קליטה".
// הנתונים מגיעים מעורבלים מ-/api/admin/kvitel/mail-decode, בגלל נטפרי.

type State = { mailId: string; data: Decode | null; error: string | null }
type Msg = { ok: boolean; text: string } | null

export default function KvitelMailDecode({ mailId }: { mailId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [reload, setReload] = useState(0)
  const [editing, setEditing] = useState(false)
  const [confirmReingest, setConfirmReingest] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/kvitel/mail-decode?id=${encodeURIComponent(mailId)}`, { cache: 'no-store' })
      .then(async res => {
        const body = await res.json().catch(() => null)
        if (!res.ok) throw new Error(body?.error || 'טעינת הפיענוח נכשלה')
        return decodeKvitelPayload<Decode>(body as KvitelScrambled)
      })
      .then(data => { if (alive) setState({ mailId, data, error: null }) })
      .catch((e: Error) => { if (alive) setState({ mailId, data: null, error: e.message }) })
    return () => { alive = false }
  }, [mailId, reload])

  // מייל אחר: מצב העריכה וההודעות מתאפסים.
  const [shownId, setShownId] = useState(mailId)
  if (shownId !== mailId) { setShownId(mailId); setEditing(false); setConfirmReingest(false); setMsg(null) }

  const refresh = useCallback(() => setReload(n => n + 1), [])

  async function call(url: string, init: RequestInit, done: (body: Record<string, unknown>) => string) {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ ok: false, text: body.error || 'הפעולה נכשלה' }); return }
      setMsg({ ok: true, text: done(body) })
      setEditing(false); setConfirmReingest(false)
      refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!state || state.mailId !== mailId) {
    return <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> טוען פיענוח...</div>
  }
  if (state.error || !state.data) {
    return <p className="m-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">{state.error}</p>
  }

  const d = state.data
  const saved = d.source === 'saved'
  const open = d.statusKey === 'review' || d.statusKey === 'pending'
  const canAct = !!d.canEdit && (!saved || open)

  const approve = () => call('/api/admin/kvitel/requests', { method: 'PATCH', body: JSON.stringify({ ids: [d.requestId], status: 'pending' }) },
    () => 'הבקשה אושרה ותיכנס לקובץ הבא')
  const reingest = () => call('/api/admin/kvitel/mail-decode', { method: 'POST', body: JSON.stringify({ id: mailId }) },
    b => `${b.created ? 'המייל נקלט' : 'המייל נקלט מחדש'}: ${b.lines} שמות`)

  return (
    <div className="space-y-4 p-4 text-sm">
      <p className="flex items-center gap-2 text-slate-600">
        {saved
          ? <><CheckCircle2 size={16} className="text-emerald-600" /> נקלט כבקשה · {d.status}</>
          : <><AlertTriangle size={16} className="text-amber-600" /> המייל עוד לא נקלט כבקשה: פענוח לפי תבנית</>}
      </p>
      {d.note && <p className="text-xs text-slate-500">{d.note}</p>}

      {canAct && !editing && (
        <div className="flex flex-wrap items-center gap-2">
          {saved && d.statusKey === 'review' && (
            <button type="button" disabled={busy} onClick={() => void approve()} className={modalBtn.primary}><Check size={14} /> אישור</button>
          )}
          {saved && (
            <button type="button" disabled={busy} onClick={() => { setEditing(true); setMsg(null) }} className={modalBtn.ghost}><Pencil size={14} /> עריכה</button>
          )}
          {!confirmReingest ? (
            <button type="button" disabled={busy} onClick={() => (saved ? setConfirmReingest(true) : void reingest())} className={saved ? modalBtn.ghost : modalBtn.primary}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {saved ? 'קליטה מחדש' : 'קליטה'}
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-amber-900">
              השמות של הבקשה יוחלפו בפענוח חדש של המייל, כולל תיקונים שנעשו ידנית.
              <button type="button" disabled={busy} onClick={() => void reingest()} className={modalBtn.primary}>
                {busy && <Loader2 size={14} className="animate-spin" />} כן, לקלוט מחדש
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirmReingest(false)} className={modalBtn.ghost}>ביטול</button>
            </span>
          )}
        </div>
      )}
      {saved && d.canEdit && !open && <p className="text-xs text-slate-500">הבקשה כבר {d.status}, ולכן אי אפשר לערוך אותה או לקלוט אותה מחדש מכאן.</p>}

      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}

      {d.failed && !editing && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 font-medium text-red-800">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" /> {d.failed}
        </div>
      )}

      {editing && d.requestId && d.rows ? (
        <KvitelLinesEditor
          key={`${d.requestId}-${reload}`}
          requestId={d.requestId} lines={d.rows} editable
          contact={d.contact ?? { name: null, phone: null, email: null }}
          onSaved={text => { setMsg({ ok: true, text }); setEditing(false); refresh() }}
          onCancel={() => setEditing(false)}
        />
      ) : d.lines.length > 0 && (
        <table className="w-full border-collapse overflow-hidden rounded-lg bg-white text-right">
          <thead className="bg-slate-100 text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2 font-semibold">שם</th>
              <th className="px-3 py-2 font-semibold">בן/בת</th>
              <th className="px-3 py-2 font-semibold">שם האם</th>
              <th className="px-3 py-2 font-semibold">בקשה</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} className={`border-t border-slate-100 align-top ${l.flag ? 'bg-amber-50' : ''}`}>
                <td className="px-3 py-2 font-medium text-slate-900">{l.name}</td>
                <td className="px-3 py-2 text-slate-600">{l.relation}</td>
                <td className="px-3 py-2 text-slate-900">{l.parentName || <span className="text-red-600">חסר</span>}</td>
                <td className="px-3 py-2 text-slate-700">
                  {l.request || <span className="text-slate-400">לא צוינה</span>}
                  {l.flag && <span className="mt-1 block text-xs text-amber-700">{l.flag}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {d.leftover.length > 0 && !editing && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-slate-600">שורות שלא פוענחו</h4>
          <ul className="space-y-1 rounded-lg bg-white p-3 text-slate-700">
            {d.leftover.map((t, i) => <li key={i} className="whitespace-pre-wrap break-words">{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
