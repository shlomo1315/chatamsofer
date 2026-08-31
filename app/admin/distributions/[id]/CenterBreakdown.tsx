'use client'
import { useState, useCallback } from 'react'
import { Loader2, MapPin, Check, X, Users, CalendarClock } from 'lucide-react'
import { REGIONS, type RegionKey } from '@/lib/holidayCenterPick'
import DeadlineCountdown from '@/components/ui/DeadlineCountdown'
import { toLocalInput } from '@/lib/centerDeadline'

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
  // ⚠️ נשלפים ממילא ב-COLS — הם מה שהמשפחה רואה בשובר ובטלפון.
  address?: string | null; phone?: string | null; hours?: string | null
}

export default function CenterBreakdown({ distributionId }: { distributionId: string }) {
  const [centers, setCenters] = useState<Center[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [centersOpen, setCentersOpen] = useState(false)

  // 🔴 המועד האחרון לבחירה.
  //
  // ⚠️ שני ערכים: מה שנשמר, ומה שבשדה. בלי ההפרדה אי אפשר לדעת אם
  // המנהל שינה משהו — וכפתור השמירה היה מהבהב מרגע הטעינה.
  const [deadline, setDeadline] = useState<string | null>(null)
  const [deadlineDraft, setDeadlineDraft] = useState('')

  // 🔴 עריכה במקום ולא בהגדרות.
  //
  // ⚠️ הכתובת והשעות הן מה שמופיע בשובר ובשלוחה הטלפונית. כשמוקד
  // משנה שעות באמצע חלוקה, הניווט להגדרות ובחזרה הוא בדיוק החיכוך
  // שגורם לא לעדכן — והמשפחות מגיעות בשעה הלא נכונה.
  const [editing, setEditing] = useState<Center | null>(null)
  const [saving, setSaving] = useState(false)

  const saveCenter = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const r = await fetch('/api/admin/holiday-centers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // ⚠️ נשלחים כל השדות ולא רק מה שהשתנה: ה-POST עושה update מלא,
        // ושדה חסר היה מתאפס.
        body: JSON.stringify({
          id: editing.id, city: editing.city, name: editing.name,
          address: editing.address ?? '', phone: editing.phone ?? '',
          hours: editing.hours ?? '', region: editing.region,
          capacity: editing.capacity, is_active: editing.is_active,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { alert(d.error ?? 'השמירה נכשלה'); return }
      setCenters(cs => cs?.map(c => (c.id === editing.id ? editing : c)) ?? cs)
      setEditing(null)
    } catch {
      alert('שגיאת רשת — השינוי לא נשמר')
    } finally {
      setSaving(false)
    }
  }
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
      if (dRes.ok) {
        const d = await dRes.json()
        setCentersOpen(!!d.centers_open)
        setDeadline(d.centers_deadline ?? null)
        // ⚠️ הקלט של datetime-local אינו מקבל ISO עם Z — הוא מצפה
        // ל"YYYY-MM-DDTHH:mm" בשעון המקומי. המרה שגויה כאן מציגה
        // למנהל שעה אחרת משמורה, והוא "מתקן" אותה בטעות.
        setDeadlineDraft(d.centers_deadline ? toLocalInput(d.centers_deadline) : '')
      }
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

  // 🔴 שמירת המועד — נפרדת מהמתג.
  //
  // ⚠️ נשלח בנפרד ולא יחד עם centers_open: המנהל שמגדיר תאריך אינו
  // מתכוון לשנות את המתג, ושליחה משותפת הייתה פותחת או סוגרת בטעות.
  async function saveDeadline() {
    setBusy('deadline'); setErr('')
    try {
      const res = await fetch(`/api/admin/distributions/${encodeURIComponent(distributionId)}/centers-open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ ריק נשלח כ-null במפורש = הסרת המועד. undefined היה
        // משאיר את הקיים, ו"מחקתי את התאריך" לא היה עושה דבר.
        body: JSON.stringify({
          centers_deadline: deadlineDraft ? new Date(deadlineDraft).toISOString() : null,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'העדכון נכשל'); return }
      setDeadline(deadlineDraft ? new Date(deadlineDraft).toISOString() : null)
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  async function toggleGate(next: boolean) {
    setBusy('gate'); setErr('')
    try {
      const res = await fetch(`/api/admin/distributions/${encodeURIComponent(distributionId)}/centers-open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠️ רק המתג — המועד נשמר בנפרד ואינו נמחק כאן.
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

      {/* ── המועד האחרון לבחירה ──
          🔴 המשפחה שומעת את הספירה בטלפון ורואה אותה באתר. בלי מועד
          מוגדר אין ספירה כלל — וזה תקין: המתג לבדו ממשיך לעבוד.
          ⚠️ אינו מחליף את המתג אלא מתווסף לו. מתג סגור גובר תמיד. */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-1.5">
          <CalendarClock size={14} className="text-slate-400" />
          <h3 className="text-[13px] font-extrabold text-slate-800">מועד אחרון לבחירת מוקד</h3>
        </div>
        <p className="-mt-1 text-[11px] leading-relaxed text-slate-500">
          המשפחות ישמעו בטלפון ויראו באתר כמה זמן נותר. ריק = ללא הגבלה,
          והבחירה נסגרת רק בכיבוי המתג למעלה.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={deadlineDraft}
            onChange={e => setDeadlineDraft(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-200"
          />
          {/* 🔴 כלל ברזל: כפתור שמירה שמהבהב ברגע שיש שינוי. */}
          <button
            type="button"
            disabled={busy === 'deadline' || toLocalInput(deadline) === deadlineDraft}
            onClick={() => void saveDeadline()}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition disabled:opacity-40 ${
              toLocalInput(deadline) !== deadlineDraft
                ? 'animate-pulse bg-emerald-600 text-white hover:bg-emerald-700'
                : 'border border-slate-200 bg-white text-slate-500'
            }`}>
            {busy === 'deadline' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            {toLocalInput(deadline) !== deadlineDraft ? 'שמור מועד' : 'נשמר'}
          </button>
          {deadlineDraft && (
            <button type="button" onClick={() => setDeadlineDraft('')}
              className="text-xs font-bold text-slate-500 hover:text-rose-700">
              הסר מועד
            </button>
          )}
        </div>

        {/* ⚠️ מוצג מהערך *השמור* ולא מהטיוטה: ספירה שרצה לפי שדה שטרם
            נשמר מתארת מצב שאינו קיים לאף משפחה. */}
        <DeadlineCountdown deadline={deadline} />
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
                      {/* 🔴 השעות והכתובת — מה שהמשפחה רואה בשובר ושומעת
                          בטלפון. הצגתן כאן היא מה שמאפשר לזהות שהן חסרות
                          או שגויות לפני שהשוברים יוצאים. */}
                      {(c.hours || c.address) && (
                        <p className="mt-0.5 truncate text-[11px] text-slate-400">
                          {[c.address, c.hours].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {!c.hours && (
                        <p className="mt-0.5 text-[11px] font-semibold text-amber-600">
                          ⚠ לא הוגדרו שעות פתיחה
                        </p>
                      )}
                    </div>

                    {/* ⚠️ עריכה במקום: מוקד שמשנה שעות באמצע חלוקה — הניווט
                        להגדרות ובחזרה הוא החיכוך שגורם לא לעדכן. */}
                    <button type="button" onClick={() => setEditing({ ...c })}
                      title="עריכת פרטי המוקד"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-700">
                      עריכה
                    </button>

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

      {/* ═══ עריכת מוקד ═══ */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !saving && setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <h4 className="mb-1 text-sm font-black text-slate-800">עריכת מוקד</h4>
            <p className="mb-4 text-[11px] text-slate-500">
              הפרטים מופיעים בשובר של המשפחה ובשלוחה הטלפונית.
            </p>

            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-600">עיר</span>
                  <input value={editing.city}
                    onChange={e => setEditing({ ...editing, city: e.target.value })}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-600">שם המוקד</span>
                  <input value={editing.name}
                    onChange={e => setEditing({ ...editing, name: e.target.value })}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                </label>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-600">כתובת</span>
                <input value={editing.address ?? ''}
                  onChange={e => setEditing({ ...editing, address: e.target.value })}
                  placeholder="רחוב ומספר"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
              </label>

              {/* 🔴 השעות — הפרט שמשתנה הכי הרבה, ושבלעדיו המשפחה
                  מגיעה בזמן הלא נכון. */}
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-slate-600">שעות פתיחה</span>
                <input value={editing.hours ?? ''}
                  onChange={e => setEditing({ ...editing, hours: e.target.value })}
                  placeholder="יום ג׳ י״ב אלול · 10:00–14:00"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                <span className="text-[10px] text-slate-400">
                  הנוסח מוקרא כמו שהוא בטלפון — כתבו אותו כפי שתרצו שיישמע
                </span>
              </label>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-600">טלפון</span>
                  <input dir="ltr" value={editing.phone ?? ''}
                    onChange={e => setEditing({ ...editing, phone: e.target.value })}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold text-slate-600">תפוסה מרבית</span>
                  {/* ⚠️ ריק = ללא הגבלה. 0 הוא "סגור לחלוטין" — ערכים שונים. */}
                  <input type="number" min={0} value={editing.capacity ?? ''}
                    onChange={e => setEditing({
                      ...editing,
                      capacity: e.target.value === '' ? null : Number(e.target.value),
                    })}
                    placeholder="ללא הגבלה"
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
                </label>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setEditing(null)} disabled={saving}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                ביטול
              </button>
              <button type="button" onClick={() => void saveCenter()}
                disabled={saving || !editing.city.trim() || !editing.name.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                {saving && <Loader2 size={13} className="animate-spin" />}
                {saving ? 'שומר…' : 'שמירה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
