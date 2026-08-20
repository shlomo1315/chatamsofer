'use client'
import { useState, useCallback } from 'react'
import { Loader2, MapPin, Check, X, Users } from 'lucide-react'
import { REGIONS, type RegionKey } from '@/lib/holidayCenterPick'

// ─────────────────────────────────────────────────────────────────────────────
// פילוח לפי מוקדי חלוקה + מתג פתיחת הבחירה.
//
// 🔴 הספירה מגיעה מצוברת מהשרת (RPC) ולא מחישוב על 6,046 שורות בדפדפן.
//
// ⚠️ מתג "בחירת המוקדים פתוחה" עצמאי משער הרישום: הבחירה נפתחת דווקא
// אחרי שהרישום נסגר.
// ─────────────────────────────────────────────────────────────────────────────

interface Center {
  id: string; city: string; name: string; region: string
  capacity: number | null; is_active: boolean
}

export default function CenterBreakdown({ distributionId }: { distributionId: string }) {
  const [centers, setCenters] = useState<Center[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [centersOpen, setCentersOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const [cRes, dRes] = await Promise.all([
        fetch(`/api/admin/holiday-centers?distribution_id=${encodeURIComponent(distributionId)}`, { cache: 'no-store' }),
        fetch(`/api/admin/distributions/${encodeURIComponent(distributionId)}/centers-open`, { cache: 'no-store' }),
      ])
      const c = await cRes.json()
      if (!cRes.ok) throw new Error(c.error || 'הטעינה נכשלה')
      setCenters((c.centers ?? []).filter((x: Center) => x.is_active))
      setCounts(c.counts ?? {})
      setOpenIds(new Set<string>(c.openIds ?? []))
      if (dRes.ok) setCentersOpen(!!(await dRes.json()).centers_open)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'שגיאה')
      setCenters([])
    }
  }, [distributionId])

  // 🔴 אינו נטען אוטומטית.
  //
  // ⚠️ שתי הקריאות כאן (מוקדים + ספירת נרשמים) רצו בכל פתיחת מסך,
  // והספירה סורקת את כל שורות החלוקה — ~6,000. זה מה שהאט את המסך
  // כולו, גם למי שרק רצה לראות את טבלת הנרשמים.
  //
  // שאר הפאנלים (טעינה, שוברים, עסקאות) כבר ממתינים ללחיצה.
  // ⚠️ state ולא ref: הדגל נקרא ברינדור (כדי להחליט מה להציג), וקריאת
  // ref בזמן רינדור אסורה — react-hooks/refs מפיל עליה את הבנייה.
  const [opened, setOpened] = useState(false)
  function open() {
    if (opened) return
    setOpened(true)
    void load()
  }

  async function toggleCenter(id: string, open: boolean) {
    setBusy(id); setErr('')
    try {
      const res = await fetch('/api/admin/holiday-centers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId, center_id: id, open }),
      })
      if (!res.ok) { setErr((await res.json()).error ?? 'העדכון נכשל'); return }
      setOpenIds(prev => {
        const next = new Set(prev)
        if (open) next.add(id); else next.delete(id)
        return next
      })
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  async function toggleGate(next: boolean) {
    setBusy('gate'); setErr('')
    try {
      const res = await fetch(`/api/admin/distributions/${encodeURIComponent(distributionId)}/centers-open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ centers_open: next }),
      })
      if (!res.ok) { setErr((await res.json()).error ?? 'העדכון נכשל'); return }
      setCentersOpen(next)
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  // טרם נלחץ — כפתור בלבד, בלי שום קריאה לשרת.
  if (centers === null && !opened) {
    return (
      <button type="button" onClick={open}
        className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-300 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50">
        <MapPin size={13} /> הצג מוקדים ופילוח
      </button>
    )
  }

  if (centers === null) {
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
      <Loader2 size={16} className="animate-spin" /> טוען מוקדים…
    </div>
  }

  const chosen = Object.values(counts).reduce((a, b) => a + b, 0)
  const openCenters = centers.filter(c => openIds.has(c.id))

  return (
    <div className="flex flex-col gap-4">
      {/* מתג הבחירה */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 p-4 ${
        centersOpen ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'
      }`}>
        <div>
          <p className={`text-sm font-extrabold ${centersOpen ? 'text-emerald-900' : 'text-slate-700'}`}>
            בחירת מוקדים {centersOpen ? 'פתוחה' : 'סגורה'}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {centersOpen
              ? 'המשפחות יכולות לבחור מוקד בטלפון ובאתר'
              : 'הבחירה חסומה בשני הערוצים. ⚠️ עצמאי משער הרישום'}
          </p>
        </div>
        <button type="button" disabled={busy === 'gate'} onClick={() => toggleGate(!centersOpen)}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold transition ${
            centersOpen
              ? 'border border-slate-300 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}>
          {busy === 'gate' ? <Loader2 size={13} className="animate-spin" /> : centersOpen ? <X size={13} /> : <Check size={13} />}
          {centersOpen ? 'סגור בחירה' : 'פתח בחירה'}
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Users size={13} />
        <span><strong className="text-slate-800">{chosen.toLocaleString('he-IL')}</strong> בחרו מוקד</span>
        <span className="text-slate-300">·</span>
        <span>{openCenters.length} מוקדים פתוחים מתוך {centers.length}</span>
      </div>

      {(Object.keys(REGIONS) as RegionKey[]).map(rk => {
        const list = centers.filter(c => c.region === rk)
        if (!list.length) return null
        return (
          <div key={rk}>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-extrabold text-slate-700">
              <MapPin size={13} className="text-indigo-600" /> {REGIONS[rk]}
            </h4>
            <div className="flex flex-col gap-1.5">
              {list.map(c => {
                const n = counts[c.id] ?? 0
                const isOpen = openIds.has(c.id)
                const full = c.capacity != null && n >= c.capacity
                return (
                  <div key={c.id}
                    className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                      isOpen ? 'border-indigo-200 bg-white' : 'border-slate-200 bg-slate-50'
                    }`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">
                        {c.city === c.name ? c.city : `${c.city} · ${c.name}`}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {n.toLocaleString('he-IL')} נרשמו
                        {c.capacity != null && ` מתוך ${c.capacity.toLocaleString('he-IL')}`}
                        {full && <span className="mr-1 font-bold text-amber-700">· מלא</span>}
                      </p>
                    </div>
                    {/* ⚠️ סגירה אינה מבטלת בחירות קיימות — רק מונעת חדשות. */}
                    <button type="button" disabled={busy === c.id}
                      onClick={() => toggleCenter(c.id, !isOpen)}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                        isOpen
                          ? 'border border-indigo-300 bg-indigo-50 text-indigo-700'
                          : 'border border-slate-300 bg-white text-slate-500 hover:border-indigo-300'
                      }`}>
                      {busy === c.id ? <Loader2 size={12} className="animate-spin" /> : isOpen ? 'פתוח' : 'סגור'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {err && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p>}
    </div>
  )
}
