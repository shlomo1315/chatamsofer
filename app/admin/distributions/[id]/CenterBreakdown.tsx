'use client'
import { useState, useCallback } from 'react'
import { Loader2, MapPin, Check, X, Users, CalendarClock, Volume2 } from 'lucide-react'
import DeadlineCountdown from '@/components/ui/DeadlineCountdown'
import { toLocalInput } from '@/lib/centerDeadline'
import { spokenCenterDetails } from '@/lib/holidayCenterSpeech'

// ─────────────────────────────────────────────────────────────────────────────
// פילוח לפי מוקדי חלוקה + מתג פתיחת הבחירה.
//
// 🔴 הספירה מגיעה מצוברת מהשרת (RPC) ולא מחישוב על 6,046 שורות בדפדפן.
//
// ⚠️ מתג "בחירת המוקדים פתוחה" עצמאי משער הרישום: הבחירה נפתחת דווקא
// אחרי שהרישום נסגר.
// ─────────────────────────────────────────────────────────────────────────────

/** תא עריכה בטבלה — נראה כטקסט עד שנוגעים בו. */
const CELL = 'rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[13px] text-slate-800 ' +
  'hover:border-slate-200 hover:bg-slate-50 focus:border-indigo-300 focus:bg-white focus:outline-none ' +
  'focus:ring-2 focus:ring-indigo-100 placeholder:text-slate-300'

interface Center {
  id: string; city: string; name: string; region: string
  capacity: number | null; is_active: boolean
  // ⚠️ נשלפים ממילא ב-COLS — הם מה שהמשפחה רואה בשובר ובטלפון.
  address?: string | null; phone?: string | null; hours?: string | null
  /** שם קובץ ההקלטה בימות. ריק = פרטי המוקד ייקראו ב-TTS מהשדות. */
  audio_file?: string | null
}

export default function CenterBreakdown({ distributionId }: { distributionId: string }) {
  const [centers, setCenters] = useState<Center[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  /** המוקדים שכבר מחלקים כרטיסים — נפרד מ-openIds (בחירה ≠ חלוקה). */
  const [pickupIds, setPickupIds] = useState<Set<string>>(new Set())
  const [centersOpen, setCentersOpen] = useState(false)

  // 🔴 המועד האחרון לבחירה.
  //
  // ⚠️ שני ערכים: מה שנשמר, ומה שבשדה. בלי ההפרדה אי אפשר לדעת אם
  // המנהל שינה משהו — וכפתור השמירה היה מהבהב מרגע הטעינה.
  const [deadline, setDeadline] = useState<string | null>(null)
  const [deadlineDraft, setDeadlineDraft] = useState('')

  // 🔴 עריכה במקום, בתוך השורה עצמה.
  //
  // ⚠️ הכתובת והשעות הן מה שמופיע בשובר ובשלוחה הטלפונית. כשמוקד
  // משנה שעות באמצע חלוקה, הניווט להגדרות ובחזרה — או פתיחת חלונית
  // וסגירתה לכל שדה — הוא בדיוק החיכוך שגורם לא לעדכן, והמשפחות
  // מגיעות בשעה הלא נכונה.
  //
  // ⚠️ טיוטה לכל שורה בנפרד: המנהל עשוי לתקן שלושה מוקדים ברצף, ושמירה
  // אוטומטית על כל הקשה הייתה שולחת בקשה לכל אות.
  const [drafts, setDrafts] = useState<Record<string, Partial<Center>>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState('')

  /** הערכים המוצגים בשורה — הטיוטה מעל השמור. */
  const draftOf = (c: Center): Center => ({ ...c, ...(drafts[c.id] ?? {}) })
  const setDraft = (id: string, patch: Partial<Center>) =>
    setDrafts(p => ({ ...p, [id]: { ...(p[id] ?? {}), ...patch } }))

  /** האם השורה שונה מהשמור — קובע אם כפתור השמירה מוצג. */
  const isDirty = (c: Center): boolean => {
    const d = drafts[c.id]
    if (!d) return false
    return (Object.keys(d) as (keyof Center)[]).some(k => (d[k] ?? '') !== (c[k] ?? ''))
  }

  async function saveRow(id: string) {
    const cur = centers?.find(c => c.id === id)
    if (!cur) return
    const next = { ...cur, ...(drafts[id] ?? {}) }
    setBusy(id); setErr('')
    try {
      const r = await fetch('/api/admin/holiday-centers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        // ⚠️ נשלחים כל השדות ולא רק מה שהשתנה: ה-POST עושה update מלא,
        // ושדה חסר היה מתאפס.
        body: JSON.stringify({
          id: next.id, city: next.city, name: next.name,
          address: next.address ?? '', phone: next.phone ?? '',
          hours: next.hours ?? '', region: next.region,
          capacity: next.capacity, is_active: next.is_active,
        }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      setCenters(cs => cs?.map(c => (c.id === id ? next : c)) ?? cs)
      // ⚠️ הטיוטה נמחקת רק אחרי שמירה מוצלחת — אחרת שמירה שנכשלה
      // הייתה מוחקת את מה שהמנהל הקליד.
      setDrafts(p => { const q = { ...p }; delete q[id]; return q })
    } catch {
      setErr('שגיאת רשת — השינוי לא נשמר')
    } finally { setBusy(null) }
  }

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
      setPickupIds(new Set<string>(c.pickupIds ?? []))
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

  /**
   * פתיחת/סגירת חלוקת הכרטיסים במוקד בודד.
   *
   * 🔴 נפרד לחלוטין מ-toggleCenter: "פתוח לבחירה" ו"מחלק כרטיסים" הם שני
   * שלבים שונים בזמן. מוקד סגור לבחירה (הרישום נגמר) יכול וצריך להיות
   * פתוח לחלוקה.
   *
   * ⚠️ זה מה שהשלוחה הטלפונית בודקת לפני שהיא מבקשת מספר כרטיס.
   */
  async function togglePickup(id: string, pickup: boolean) {
    setBusy(id); setErr('')
    try {
      const res = await fetch('/api/admin/holiday-centers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_id: distributionId, center_id: id, pickup }),
      })
      if (!res.ok) { setErr((await res.json()).error ?? 'העדכון נכשל'); return }
      setPickupIds(prev => {
        const next = new Set(prev)
        if (pickup) next.add(id); else next.delete(id)
        return next
      })
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  /**
   * העלאת הקלטה אנושית לפרטי המוקד.
   *
   * ⚠️ ההקלטה מחליפה את *הקול* ולא את התוכן: מוקד בלי הקלטה עדיין
   * נשמע נכון, בהקראה מאותם שדות. לכן זו תוספת ולא דרישה.
   */
  async function uploadRecording(id: string, file: File) {
    setBusy(`rec-${id}`); setErr('')
    try {
      const fd = new FormData()
      fd.append('center_id', id)
      fd.append('file', file)
      const res = await fetch('/api/admin/holiday-centers/recording', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error ?? 'ההעלאה נכשלה'); return }
      setCenters(cs => cs?.map(c => (c.id === id ? { ...c, audio_file: d.audio_file } : c)) ?? cs)
    } catch { setErr('שגיאת רשת — ההקלטה לא הועלתה') } finally { setBusy(null) }
  }

  /** הסרת ההקלטה — הפרטים חוזרים להיקרא מהשדות. */
  async function removeRecording(id: string) {
    setBusy(`rec-${id}`); setErr('')
    try {
      const res = await fetch(`/api/admin/holiday-centers/recording?center_id=${encodeURIComponent(id)}`,
        { method: 'DELETE' })
      if (!res.ok) { setErr((await res.json()).error ?? 'ההסרה נכשלה'); return }
      setCenters(cs => cs?.map(c => (c.id === id ? { ...c, audio_file: null } : c)) ?? cs)
    } catch { setErr('שגיאת רשת') } finally { setBusy(null) }
  }

  /**
   * פתיחת/סגירת החלוקה בכל המוקדים בבת אחת.
   *
   * ⚠️ מאשר לפני: השינוי נשמע מיד בשלוחה הטלפונית אצל אלפי משפחות,
   * ופתיחה בטעות שולחת אותן למוקד שאין בו כרטיסים.
   *
   * ⚠️ ברצף ולא במקביל: 26 בקשות בו-זמנית מציפות את המסד, ותקלה באמצע
   * הייתה משאירה מצב חלקי בלי לדעת היכן זה נעצר.
   */
  async function bulkPickup(pickup: boolean) {
    if (!centers?.length) return
    const verb = pickup ? 'לפתוח את החלוקה בכל' : 'לסגור את החלוקה בכל'
    if (!confirm(`${verb} ${centers.length} המוקדים?\n\nהשינוי נשמע מיד בשלוחה הטלפונית.`)) return
    setBusy('bulk'); setErr('')
    try {
      for (const c of centers) {
        const res = await fetch('/api/admin/holiday-centers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ distribution_id: distributionId, center_id: c.id, pickup }),
        })
        if (!res.ok) {
          setErr(`העדכון נעצר במוקד ${c.city} ${c.name}. הקודמים נשמרו.`)
          break
        }
        setPickupIds(prev => {
          const next = new Set(prev)
          if (pickup) next.add(c.id); else next.delete(c.id)
          return next
        })
      }
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

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Users size={13} />
        <span><strong className="text-slate-800">{chosen.toLocaleString('he-IL')}</strong> בחרו מוקד</span>
        <span className="text-slate-300">·</span>
        <span>{openCenters.length} פתוחים לבחירה מתוך {centers.length}</span>
        <span className="text-slate-300">·</span>
        <span className="font-bold text-emerald-700">{pickupIds.size} מחלקים כרטיסים</span>

        {/* ⚠️ פעולה על הכל — 26 מוקדים בלחיצה אחת כל אחד הם עבודה מיותרת
            ביום שכולם מתחילים לחלק. מאשר לפני, כי זו פעולה שנשמעת מיד
            בשלוחה הטלפונית אצל אלפי משפחות. */}
        <span className="flex-1" />
        <button type="button" disabled={busy === 'bulk'}
          onClick={() => void bulkPickup(true)}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-40">
          {busy === 'bulk' ? '…' : 'פתח חלוקה בכולם'}
        </button>
        <button type="button" disabled={busy === 'bulk'}
          onClick={() => void bulkPickup(false)}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-40">
          סגור בכולם
        </button>
      </div>

      {/* ═══ טבלת המוקדים ═══
          🔴 טבלה אחת ולא כרטיסים מקובצים לפי אזור: 26 מוקדים בכרטיסים
          נפרדים תחת ארבע כותרות אזור מאלצים גלילה וחיפוש ויזואלי כדי
          להשוות שני מוקדים או למצוא אחד מסוים.

          ⚠️ ללא גלילה לרוחב (נאכף בלינט — eslint-rules/no-horizontal-scroll):
          העמודות הצרות מקבלות רוחב קבוע, ושדות הטקסט מתרחבים לשארית.
          ⚠️ העריכה במקום ולא בחלונית: מוקד שמעדכן שעות באמצע חלוקה —
          פתיחת חלונית וסגירתה בכל שדה היא החיכוך שגורם לא לעדכן. */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {/* כותרות — מוסתרות בנייד, שם כל שורה נפרסת ככרטיס */}
        <div className="hidden items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-extrabold text-slate-600 lg:flex">
          <span className="w-32 shrink-0">עיר</span>
          <span className="w-40 shrink-0">שם המוקד</span>
          <span className="flex-1 min-w-0">כתובת</span>
          <span className="w-56 shrink-0">ימים ושעות</span>
          <span className="w-28 shrink-0">טלפון</span>
          <span className="w-16 shrink-0 text-center">נרשמו</span>
          <span className="w-20 shrink-0 text-center">בחירה</span>
          <span className="w-20 shrink-0 text-center">חלוקה</span>
        </div>

        {/* ⚠️ ממוין לפי עיר ואז שם: הטבלה כבר אינה מקובצת לפי אזור, ובלי
            מיון יציב שני מוקדים של אותה עיר יכולים ליפול רחוק זה מזה. */}
        <div className="divide-y divide-slate-100">
          {[...centers].sort((a, b) =>
            a.city.localeCompare(b.city, 'he') || a.name.localeCompare(b.name, 'he'),
          ).map(c => {
            const n = counts[c.id] ?? 0
            const isOpen = openIds.has(c.id)
            const isPickup = pickupIds.has(c.id)
            const full = c.capacity != null && n >= c.capacity
            const d = draftOf(c)
            const dirty = isDirty(c)
            return (
              <div key={c.id}
                className={`flex flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center ${
                  isPickup ? 'bg-emerald-50/40' : 'bg-white'
                }`}>
                {/* עיר */}
                <input value={d.city}
                  onChange={e => setDraft(c.id, { city: e.target.value })}
                  placeholder="עיר"
                  className={`${CELL} w-full lg:w-32 lg:shrink-0 font-bold`} />

                {/* שם המוקד */}
                <input value={d.name}
                  onChange={e => setDraft(c.id, { name: e.target.value })}
                  placeholder="שם המוקד"
                  className={`${CELL} w-full lg:w-40 lg:shrink-0`} />

                {/* כתובת */}
                {/* ⚠️ textarea ולא input: כתובת מלאה ארוכה משדה שורה אחת,
                    והטקסט נגלל אופקית בתוכו — כלומר רואים ממנו מילה או
                    שתיים ואי אפשר לערוך אותו בבטחה. */}
                <textarea value={d.address ?? ''}
                  onChange={e => setDraft(c.id, { address: e.target.value })}
                  placeholder="כתובת מלאה"
                  rows={2}
                  className={`${CELL} w-full resize-y leading-snug lg:flex-1 lg:min-w-0`} />

                {/* ימים ושעות */}
                {/* 🔴 זה השדה שנשמע בטלפון, ולעתים הוא ארוך ("א׳–ג׳ 10:00–14:00,
                    ד׳ 16:00–20:00"). בשדה שורה אחת ברוחב 10rem נראתה ממנו
                    מילה אחת, ואי אפשר היה לוודא מה בדיוק ייאמר למתקשר. */}
                <textarea value={d.hours ?? ''}
                  onChange={e => setDraft(c.id, { hours: e.target.value })}
                  placeholder="א׳–ה׳ 10:00–14:00"
                  rows={2}
                  className={`${CELL} w-full resize-y leading-snug lg:w-56 lg:shrink-0 ${
                    !d.hours ? 'border-amber-300 bg-amber-50 placeholder:text-amber-600' : ''
                  }`} />

                {/* טלפון */}
                <input dir="ltr" value={d.phone ?? ''}
                  onChange={e => setDraft(c.id, { phone: e.target.value })}
                  placeholder="טלפון"
                  className={`${CELL} w-full text-right lg:w-28 lg:shrink-0`} />

                {/* נרשמו */}
                <span className="w-full text-[11px] tabular-nums text-slate-500 lg:w-16 lg:shrink-0 lg:text-center">
                  {n.toLocaleString('he-IL')}
                  {c.capacity != null && <span className="text-slate-400">/{c.capacity}</span>}
                  {full && <span className="mr-1 font-bold text-amber-700">מלא</span>}
                </span>

                <div className="flex items-center gap-2">
                  {/* ⚠️ סגירה אינה מבטלת בחירות קיימות — רק מונעת חדשות. */}
                  <button type="button" disabled={busy === c.id}
                    onClick={() => toggleCenter(c.id, !isOpen)}
                    title="האם המוקד מוצע לבחירה בשלב הרישום"
                    className={`w-20 shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                      isOpen
                        ? 'border border-indigo-300 bg-indigo-50 text-indigo-700'
                        : 'border border-slate-300 bg-white text-slate-500 hover:border-indigo-300'
                    }`}>
                    {busy === c.id ? '…' : isOpen ? 'פתוח' : 'סגור'}
                  </button>

                  {/* 🔴 השער שהשלוחה הטלפונית בודקת: רק מי שרשום במוקד
                      שמסומן "מחלק" יוכל לשייך כרטיס בטלפון. */}
                  <button type="button" disabled={busy === c.id}
                    onClick={() => togglePickup(c.id, !isPickup)}
                    title={isPickup
                      ? 'המוקד מחלק כרטיסים — הרשומים בו יכולים לשייך בטלפון'
                      : 'המוקד טרם החל לחלק — הרשומים בו יישמעו שהמוקד שלהם עדיין סגור'}
                    className={`w-20 shrink-0 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${
                      isPickup
                        ? 'border border-emerald-400 bg-emerald-100 text-emerald-800'
                        : 'border border-slate-300 bg-white text-slate-500 hover:border-emerald-300'
                    }`}>
                    {busy === c.id ? '…' : isPickup ? '✓ מחלק' : 'טרם'}
                  </button>

                  {/* 🔴 כלל ברזל: כפתור שמירה שמהבהב ברגע שיש שינוי.
                      מוצג רק כשיש מה לשמור — אחרת 26 כפתורים מתים. */}
                  {dirty && (
                    <button type="button" disabled={busy === c.id}
                      onClick={() => void saveRow(c.id)}
                      className="shrink-0 animate-pulse rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-extrabold text-white hover:bg-emerald-700">
                      {busy === c.id ? <Loader2 size={12} className="animate-spin" /> : 'שמור'}
                    </button>
                  )}
                </div>

                {/* ── כך זה יישמע בטלפון ──
                    🔴 מוצג מהשדות עצמם: מי שמעדכן כתובת או שעות רואה מיד
                    מה המתקשר ישמע, ולא צריך להתקשר כדי לבדוק.
                    ⚠️ מהטיוטה ולא מהשמור — כדי שהתצוגה תעקוב אחרי ההקלדה. */}
                <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-1.5 lg:w-auto lg:basis-full">
                  <Volume2 size={12} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
                    {c.audio_file
                      ? <span className="font-bold text-teal-700">מושמעת הקלטה אנושית</span>
                      : (spokenCenterDetails(d) || <span className="text-slate-300">אין מה להשמיע — חסרים פרטים</span>)}
                  </span>

                  {/* ⚠️ ההקלטה גוברת על ההקראה. מוקד בלי הקלטה עדיין
                      נשמע נכון, ולכן זו תוספת ולא תנאי. */}
                  <label className="shrink-0 cursor-pointer rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-[10.5px] font-bold text-teal-700 transition hover:bg-teal-100">
                    {busy === `rec-${c.id}` ? 'מעלה…' : c.audio_file ? 'החלף הקלטה' : 'העלה הקלטה'}
                    <input type="file" accept="audio/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) void uploadRecording(c.id, f)
                      }} />
                  </label>
                  {c.audio_file && (
                    <button type="button" disabled={busy === `rec-${c.id}`}
                      onClick={() => void removeRecording(c.id)}
                      title="הסרת ההקלטה — הפרטים ייקראו מהשדות"
                      className="shrink-0 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[10.5px] font-bold text-slate-500 transition hover:border-rose-300 hover:text-rose-700">
                      הסר
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {err && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{err}</p>}
    </div>
  )
}
