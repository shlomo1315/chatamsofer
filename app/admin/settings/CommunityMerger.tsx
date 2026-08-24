'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, Merge, Undo2, Users, AlertTriangle, Search } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import type { CommunityCount, SuggestedGroup } from '@/lib/communitySimilarity'

// ─────────────────────────────────────────────────────────────────────────────
// איחוד שמות קהילה כפולים.
//
// 🔴 במאגר 1,928 ערכי קהילה ל-7,108 משפחות, כי השדה הוא טקסט חופשי.
// "ליטאי" · "ליטאים" · "ליטאית" · "לטאי" הם קהילה אחת של 918 משפחות
// המפוצלת לארבע — ודוח לפי קהילה על הנתונים כמות שהם משקר.
//
// ⚠️ המערכת *מציעה*, המשתמש מחליט. הצ'קבוקסים אינם מסומנים מראש: סימון
// אוטומטי היה הופך את ההצעה להחלטה, והמשתמש היה מאשר בלי לקרוא.
// ─────────────────────────────────────────────────────────────────────────────

type Data = { items: CommunityCount[]; groups: SuggestedGroup[]; withoutCommunity: number }

export default function CommunityMerger() {
  const toast = useToast()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // בחירה פר-קבוצה: אילו שמות סומנו ומה השם המאוחד
  const [picked, setPicked] = useState<Record<string, Set<string>>>({})
  const [target, setTarget] = useState<Record<string, string>>({})

  // ⚠️ הטעינה אינה תלויה ב-toast: הוא נצרך רק בכישלון, ותלות בו הייתה
  // מריצה את ה-effect מחדש בכל רינדור שבו זהות ה-toast משתנה.
  const load = useCallback(async (): Promise<string | null> => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/communities')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      setData(json)
      setPicked({})
      setTarget({})
      return null
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    } finally {
      setLoading(false)
    }
  }, [])

  // טעינה ראשונית — פעם אחת בהרכבה.
  //
  // ⚠️ set-state-in-effect מושתק: הכלל מסמן כל טעינה אסינכרונית ב-effect,
  // גם תקינה. כאן ה-setState קורה ב-callback אחרי ה-fetch ולא בגוף
  // ה-effect, ו-alive מונע עדכון אחרי פירוק. אותו דפוס מושתק ב-
  // SuggestionsInbox ו-StaffActivityReport.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().then(err => { if (alive && err) toast.error(err) })
    return () => { alive = false }
  }, [])

  const reload = async () => {
    const err = await load()
    if (err) toast.error(err)
  }

  const toggle = (groupKey: string, name: string) =>
    setPicked(prev => {
      const set = new Set(prev[groupKey] ?? [])
      if (set.has(name)) set.delete(name); else set.add(name)
      return { ...prev, [groupKey]: set }
    })

  const selectAll = (g: SuggestedGroup) =>
    setPicked(prev => ({ ...prev, [g.suggestedName]: new Set(g.members.map(m => m.name)) }))

  const merge = async (g: SuggestedGroup, preview: boolean) => {
    const names = [...(picked[g.suggestedName] ?? [])]
    const to = (target[g.suggestedName] ?? g.suggestedName).trim()
    if (names.length < 2) { toast.error('יש לסמן לפחות שני שמות למיזוג'); return }
    if (!to) { toast.error('יש להזין שם מאוחד'); return }

    setBusy(g.suggestedName)
    try {
      const res = await fetch('/api/admin/communities/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: names, to, preview }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'הפעולה נכשלה')

      if (preview) toast.success(`יעודכנו ${json.affected} רשומות`)
      else { toast.success(`מוזגו ${json.affected} רשומות ל"${to}"`); await reload() }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const undo = async () => {
    if (!confirm('לבטל את המיזוג האחרון ולהחזיר את השמות הקודמים?')) return
    setBusy('undo')
    try {
      const res = await fetch('/api/admin/communities/merge', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'הביטול נכשל')
      toast.success(`שוחזרו ${json.restored} רשומות`)
      await reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> טוען קהילות…
      </div>
    )
  }
  if (!data) return null

  const filtered = search.trim()
    ? data.items.filter(i => i.name.includes(search.trim()))
    : data.items

  return (
    <div className="flex flex-col gap-4">
      {/* ── סיכום ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-700">
            {data.items.length} שמות שונים
          </span>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
            {data.groups.length} קבוצות מוצעות למיזוג
          </span>
          {data.withoutCommunity > 0 && (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 font-medium text-slate-600">
              {data.withoutCommunity} בלי שיוך
            </span>
          )}
        </div>
        <button
          onClick={undo} disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {busy === 'undo' ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
          בטל מיזוג אחרון
        </button>
      </div>

      {/* ── הצעות המיזוג ── */}
      {data.groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
          לא נמצאו שמות דומים למיזוג
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {data.groups.map(g => {
            const sel = picked[g.suggestedName] ?? new Set<string>()
            return (
              <div key={g.suggestedName} className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                    <Users size={14} className="text-amber-600" />
                    {g.totalFamilies.toLocaleString('he-IL')} משפחות ב-{g.members.length} גרסאות
                  </span>
                  <button
                    type="button" onClick={() => selectAll(g)}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                  >
                    סמן הכל
                  </button>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  {g.members.map(m => (
                    <label
                      key={m.name}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        sel.has(m.name)
                          ? 'border-indigo-400 bg-indigo-100 text-indigo-800'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-300'
                      }`}
                    >
                      <input
                        type="checkbox" checked={sel.has(m.name)}
                        onChange={() => toggle(g.suggestedName, m.name)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600"
                      />
                      {m.name} <span className="text-slate-400">({m.count})</span>
                    </label>
                  ))}
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex flex-1 flex-col gap-1" style={{ minWidth: 180 }}>
                    <label className="text-xs font-medium text-slate-600">השם המאוחד</label>
                    <input
                      value={target[g.suggestedName] ?? g.suggestedName}
                      onChange={e => setTarget(p => ({ ...p, [g.suggestedName]: e.target.value }))}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    onClick={() => merge(g, true)} disabled={busy !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    בדוק כמה יושפעו
                  </button>
                  <button
                    onClick={() => merge(g, false)} disabled={busy !== null || sel.size < 2}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {busy === g.suggestedName ? <Loader2 size={13} className="animate-spin" /> : <Merge size={13} />}
                    מזג
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ⚠️ אזהרה: המיזוג משנה נתוני פרודקשן. הגיבוי הוא מה שהופך אותו
          להפיך, וחשוב שהמשתמש יידע שהוא קיים לפני שהוא לוחץ. */}
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
        <p className="text-xs text-slate-600">
          המיזוג משנה את שם הקהילה ברשומות עצמן. לפני כל מיזוג נשמר גיבוי, וניתן לבטל
          בכפתור «בטל מיזוג אחרון». ההצעות הן הצעה בלבד — בדקו לפני שאתם מאשרים.
        </p>
      </div>

      {/* ── כל השמות ── */}
      <details className="rounded-lg border border-slate-200">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600">
          כל השמות במאגר ({data.items.length})
        </summary>
        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5">
            <Search size={13} className="text-slate-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש שם קהילה…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
            {filtered.map(i => (
              <span key={i.name} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                {i.name} <span className="text-slate-400">({i.count})</span>
              </span>
            ))}
          </div>
        </div>
      </details>
    </div>
  )
}
