'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Mail, Archive, Tag, Check, AlertTriangle } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// אילו תיבות מוצגות בלשונית מייל, ואילו רק מסונכרנות לארכיון.
//
// 🔴 ההבחנה שהמסך הזה מנהל: תיבות הדומיין הן תיבות עבודה — שם קוראים
// ועונים. תיבות ה-Gmail הישנות נמשכות רק לשימור היסטוריה, והציפו את
// הדואר הנכנס באלפי הודעות ישנות שהסתירו את מה שממתין לטיפול.
//
// ⚠️ "סנכרון בלבד" אינו מפסיק את המשיכה — המיילים ממשיכים להיאסף,
// והם נגישים דרך התווית שנבחרה כאן.
// ─────────────────────────────────────────────────────────────────────────────

interface Mailbox {
  id: string
  email: string
  label?: string | null
  department?: string | null
  label_id?: string | null
  sync_only: boolean
  total_synced?: number
}
interface MailLabel { id: string; name: string; color?: string }

export default function MailboxDisplaySettings() {
  const [boxes, setBoxes] = useState<Mailbox[] | null>(null)
  const [labels, setLabels] = useState<MailLabel[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [saved, setSaved] = useState('')
  /** התיבה שעבורה פתוח שדה "תווית חדשה". */
  const [creatingFor, setCreatingFor] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/mailboxes', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הטעינה נכשלה')
      setBoxes(d.mailboxes ?? [])
      setLabels(d.labels ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
      setBoxes([])
    }
  }, [])

  // ⚠️ פעם אחת בלבד — ראו MailCleanup: תלות ב-load שנוצר מחדש הייתה
  // יורה שליפה בכל רינדור.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void load()
  }, [load])

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id); setErr(''); setSaved('')
    try {
      const res = await fetch('/api/admin/mailboxes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'העדכון נכשל'); return }
      setSaved('נשמר')
      setCreatingFor(null); setNewName('')
      await load()
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  if (boxes === null) {
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> טוען תיבות…</div>
  }

  const shown = boxes.filter(b => !b.sync_only)
  const archived = boxes.filter(b => b.sync_only)

  const labelName = (id?: string | null) =>
    id ? (labels.find(l => l.id === id)?.name ?? id) : null

  const row = (b: Mailbox) => {
    const isBusy = busy === b.id
    return (
      <div key={b.id} className={`rounded-xl border p-3.5 ${b.sync_only ? 'border-slate-200 bg-slate-50' : 'border-indigo-200 bg-white'} ${isBusy ? 'opacity-60' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p dir="ltr" className="truncate text-right text-sm font-bold text-slate-800">{b.email}</p>
            <p className="text-[11px] text-slate-500">
              {b.label || '—'}
              {typeof b.total_synced === 'number' && ` · ${b.total_synced.toLocaleString('he-IL')} הודעות`}
            </p>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => patch(b.id, { sync_only: !b.sync_only })}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              b.sync_only
                ? 'border border-slate-300 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'
                : 'border border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}>
            {b.sync_only ? <><Archive size={13} /> סנכרון בלבד</> : <><Mail size={13} /> מוצגת במייל</>}
          </button>
        </div>

        {/* התווית — רק לתיבות ארכיון: זו הדרך היחידה להגיע למיילים שלהן. */}
        {b.sync_only && (
          <div className="mt-3 border-t border-slate-200 pt-3">
            {!b.label_id && (
              <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
                <AlertTriangle size={12} className="flex-shrink-0" />
                בלי תווית לא תהיה שום דרך להגיע למיילים של התיבה
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Tag size={13} className="flex-shrink-0 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-600">מסונכרן לתווית:</span>
              <select
                value={b.label_id ?? ''}
                disabled={isBusy}
                onChange={e => {
                  if (e.target.value === '__new__') { setCreatingFor(b.id); setNewName(''); return }
                  patch(b.id, { label_id: e.target.value || null })
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-200">
                <option value="">— ללא תווית —</option>
                {labels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                <option value="__new__">+ תווית חדשה…</option>
              </select>
              {b.label_id && !labels.some(l => l.id === b.label_id) && (
                <span className="text-[11px] text-slate-400">({labelName(b.label_id)})</span>
              )}
            </div>

            {creatingFor === b.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="שם התווית החדשה"
                  className="flex-1 min-w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                <button
                  type="button"
                  disabled={!newName.trim() || isBusy}
                  onClick={() => patch(b.id, { newLabelName: newName.trim() })}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40">
                  צור ושייך
                </button>
                <button type="button" onClick={() => { setCreatingFor(null); setNewName('') }}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700">ביטול</button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-slate-500">
        תיבות <strong>מוצגות</strong> הן תיבות העבודה — הן מופיעות בלשונית מייל ובבורר התיבות.
        תיבות <strong>סנכרון בלבד</strong> ממשיכות להיאסף לארכיון אך אינן מופיעות ברשימה;
        המיילים שלהן נגישים דרך התווית שנבחרה להן.
      </p>

      {shown.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
            <Mail size={13} className="text-indigo-600" /> מוצגות בלשונית מייל ({shown.length})
          </h4>
          <div className="flex flex-col gap-2">{shown.map(row)}</div>
        </div>
      )}

      {archived.length > 0 && (
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
            <Archive size={13} className="text-slate-400" /> סנכרון בלבד — ארכיון ({archived.length})
          </h4>
          <div className="flex flex-col gap-2">{archived.map(row)}</div>
        </div>
      )}

      {saved && (
        <p className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          <Check size={15} /> {saved}
        </p>
      )}
      {err && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
    </div>
  )
}
