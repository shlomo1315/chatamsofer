'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Gift, Loader2, Check, Search, UserPlus, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// צירוף אישורים חריגים לחלוקת חגים.
//
// המקרה: המנהל אישר אדם שאינו צאצא, ורוצה שיקבל גם בחלוקה הקרובה. עד כה
// הייתה רק דרך אחת — לחפש אותו בכל מאגר הצאצאים ולצרף אחד-אחד.
//
// 🔴 עובר דרך /api/admin/distributions/recipients/add הקיים, שכבר עוקף את
// בדיקת "הרישום פתוח" ומתעד ב-activity log. מסלול שני היה מפצל את הכללים.
//
// ⚠️ הצירוף אינו מוגבל לחלוקה הפתוחה: המנהל בוחר לאיזו חלוקה, כולל סגורה —
// זו כל מטרת הצירוף הידני.
// ─────────────────────────────────────────────────────────────────────────────

interface Person {
  id: string
  name: string
  id_number?: string | null
  city?: string | null
  phone?: string | null
}

interface Distribution {
  id: string
  name: string
  year?: string | null
  registration_open?: boolean | null
}

export default function AddToDistributionPanel({ people }: { people: Person[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [dists, setDists] = useState<Distribution[]>([])
  const [distsLoading, setDistsLoading] = useState(false)
  const [distsError, setDistsError] = useState<string | null>(null)
  const [distId, setDistId] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ added: number; already: number; failed: number } | null>(null)

  // ⚠️ כשל בטעינה חייב להיראות. בגרסה קודמת `if (!r.ok) return` בלע את
  // התשובה, והבורר נתקע לצמיתות על "טוען חלוקות…" — נראה כתלייה ולא כתקלה.
  const loadDists = useCallback(async () => {
    setDistsLoading(true); setDistsError(null)
    try {
      const r = await fetch('/api/admin/distributions', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setDistsError(d?.error || 'טעינת החלוקות נכשלה'); return }
      const list: Distribution[] = Array.isArray(d) ? d : (d.distributions ?? [])
      setDists(list)
      if (!list.length) { setDistsError('לא נמצאו חלוקות במערכת'); return }
      // ⚠️ ברירת מחדל לחלוקה הפתוחה אם יש — זה המקרה הנפוץ.
      const openOne = list.find(x => x.registration_open)
      setDistId(openOne?.id ?? list[0]?.id ?? '')
    } catch {
      setDistsError('טעינת החלוקות נכשלה')
    } finally { setDistsLoading(false) }
  }, [])

  useEffect(() => { if (open && !dists.length) void loadDists() }, [open, dists.length, loadDists])

  const filtered = people.filter(p => {
    const needle = q.trim().toLowerCase()
    if (!needle) return true
    return [p.name, p.id_number, p.city, p.phone].filter(Boolean).join(' ').toLowerCase().includes(needle)
  })

  const toggle = (id: string) => setPicked(prev => {
    const n = new Set(prev)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const submit = async () => {
    if (!distId || !picked.size) return
    setBusy(true); setResult(null)
    let added = 0, already = 0, failed = 0
    try {
      // ⚠️ בזה אחר זה ולא במקביל: 50 בקשות בו-זמנית מציפות את המסד, וגם
      // הופכות את התיעוד ביומן לבלתי קריא.
      for (const beneficiaryId of picked) {
        try {
          const r = await fetch('/api/admin/distributions/recipients/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ distribution_id: distId, beneficiary_id: beneficiaryId }),
          })
          const d = await r.json().catch(() => ({}))
          if (!r.ok) failed++
          else if (d.already) already++
          else added++
        } catch { failed++ }
      }
      setResult({ added, already, failed })
      if (added > 0) {
        toast.success(`${added} צורפו לחלוקה`)
        setPicked(new Set())
        router.refresh()
      } else if (already > 0 && !failed) {
        toast.info('כל הנבחרים כבר רשומים לחלוקה')
      } else if (failed) {
        toast.error(`${failed} צירופים נכשלו`)
      }
    } finally { setBusy(false) }
  }

  const dist = dists.find(d => d.id === distId)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-right transition hover:bg-slate-50">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Gift size={17} />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-800">צירוף לחלוקת חגים</p>
            <p className="text-xs text-slate-500 mt-0.5">
              סימון אישורים חריגים והוספתם לחלוקה — גם כשהרישום סגור
            </p>
          </div>
        </div>
        <span className="text-slate-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-5 flex flex-col gap-4">
          {/* בחירת החלוקה */}
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-slate-500">לאיזו חלוקה</span>
            <select value={distId} onChange={e => setDistId(e.target.value)}
              disabled={distsLoading || !dists.length}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:text-slate-400">
              {!dists.length && (
                <option value="">
                  {distsLoading ? 'טוען חלוקות…' : distsError ?? 'אין חלוקות זמינות'}
                </option>
              )}
              {dists.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}{d.year ? ` ${d.year}` : ''}{d.registration_open ? ' · פתוחה' : ' · סגורה'}
                </option>
              ))}
            </select>
            {distsError && !distsLoading && (
              <span className="flex items-center gap-2 text-[11px] text-rose-600">
                {distsError}
                <button type="button" onClick={() => void loadDists()}
                  className="font-bold text-indigo-600 underline underline-offset-2 hover:text-indigo-700">
                  נסה שוב
                </button>
              </span>
            )}
            {dist && !dist.registration_open && (
              // ⚠️ נאמר במפורש: הצירוף לחלוקה סגורה תקין ומכוון, אבל אסור
              // שייראה כתקלה או כמשהו שקרה בשוגג.
              <span className="text-[11px] text-amber-700">
                הרישום לחלוקה זו סגור — הצירוף הידני יעבוד בכל זאת.
              </span>
            )}
          </label>

          {/* חיפוש */}
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="חיפוש בשם, ת״ז, עיר או טלפון…"
              className="w-full rounded-xl border border-slate-200 py-2 pr-9 pl-3 text-sm outline-none focus:border-indigo-400" />
          </div>

          {/* סימון הכל / ניקוי */}
          <div className="flex items-center gap-2 text-[11px]">
            <button type="button" onClick={() => setPicked(new Set(filtered.map(p => p.id)))}
              className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition">
              סימון כל המוצגים ({filtered.length})
            </button>
            {picked.size > 0 && (
              <button type="button" onClick={() => setPicked(new Set())}
                className="rounded-lg border border-slate-200 px-2.5 py-1 font-bold text-slate-500 hover:border-rose-300 hover:text-rose-600 transition">
                ניקוי הסימון
              </button>
            )}
            <span className="mr-auto font-bold text-slate-500">סומנו {picked.size}</span>
          </div>

          {/* הרשימה */}
          <div className="max-h-72 overflow-y-auto flex flex-col gap-1.5 rounded-xl border border-slate-100 p-2">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">לא נמצאו רשומות</p>
            )}
            {filtered.map(p => {
              const on = picked.has(p.id)
              return (
                <button key={p.id} type="button" onClick={() => toggle(p.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-right transition ${
                    on ? 'border-indigo-300 bg-indigo-50' : 'border-transparent hover:bg-slate-50'
                  }`}>
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'
                  }`}>
                    {on && <Check size={11} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-800">{p.name}</span>
                    <span className="block truncate text-[11px] text-slate-500 ltr-num">
                      {[p.id_number, p.city, p.phone].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* תוצאה */}
          {result && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
              {/* ⚠️ שלוש התוצאות בנפרד: "כבר רשום" אינו כישלון, ואיחודן היה
                  מסתיר מהמנהל מה בדיוק קרה. */}
              נוספו <b className="text-emerald-700">{result.added}</b>
              {result.already > 0 && <> · כבר היו רשומים <b>{result.already}</b></>}
              {result.failed > 0 && <> · נכשלו <b className="text-rose-600">{result.failed}</b></>}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void submit()} disabled={busy || !picked.size || !distId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
              צירוף {picked.size > 0 ? `${picked.size} נבחרים` : ''} לחלוקה
            </button>
            <button type="button" onClick={() => { setOpen(false); setResult(null) }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 transition">
              <X size={13} /> סגירה
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
