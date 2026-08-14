'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Loader2, Save, RotateCcw, FileText, RefreshCw,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Type,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ─────────────────────────────────────────────────────────────────────────────
// כיול טופס חתימת הרב.
//
// 🔴 המסך מציג את הטופס האמיתי (עם נתוני דוגמה) ומאפשר להזיז כל שדה
// ולראות מיד איך זה נראה. בלעדיו, כל התאמה של מיקום הייתה מחייבת שינוי
// קוד ופריסה — ולכן בפועל אף אחד לא היה מתקן.
//
// ⚠️ התצוגה המקדימה מגיעה מאותו נתיב שמפיק את הטופס למבקש. מסך שמצייר
// תצוגה משלו היה יכול להיראות תקין בזמן שהטופס האמיתי שבור.
// ─────────────────────────────────────────────────────────────────────────────

interface FieldPos { x: number; y: number; size: number }
interface Layout {
  title: FieldPos; name: FieldPos; idNumber: FieldPos; amount: FieldPos
  installments: FieldPos; currencyNote: FieldPos; lineageTitle: FieldPos
  lineageStart: FieldPos; lineageGap: number
  lineageNumX: number; lineageRelX: number
  rabbiTitle: FieldPos
  rabbiText: FieldPos; rabbiName: FieldPos; rabbiPhone: FieldPos
  rabbiStamp: FieldPos; instructions: FieldPos; email: FieldPos
}

// ⚠️ השדות המספריים (מרווח, עמודות) אינם FieldPos ולכן אינם ניתנים
// לבחירה כ"שדה פעיל" — אין להם x/y/size להזזה.
type FieldKey = Exclude<keyof Layout, 'lineageGap' | 'lineageNumX' | 'lineageRelX'>

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'title', label: 'כותרת הטופס' },
  { key: 'name', label: 'שם המבקש' },
  { key: 'idNumber', label: 'מספר זהות' },
  { key: 'amount', label: 'סכום מבוקש' },
  { key: 'installments', label: 'מספר תשלומים' },
  { key: 'currencyNote', label: 'הערת המטבע' },
  { key: 'lineageTitle', label: 'כותרת סדר הדורות' },
  { key: 'lineageStart', label: 'שורת הדור הראשונה' },
  { key: 'rabbiTitle', label: 'כותרת אישור הרב' },
  { key: 'rabbiText', label: 'נוסח אישור הרב' },
  { key: 'rabbiName', label: 'שם הרב' },
  { key: 'rabbiPhone', label: 'טלפון לבירורים' },
  { key: 'rabbiStamp', label: 'חותמת וחתימה' },
  { key: 'instructions', label: 'הנחיות בתחתית' },
  { key: 'email', label: 'כתובת המייל' },
]

export default function RabbiFormSettingsPage() {
  const toast = useToast()
  const [layout, setLayout] = useState<Layout | null>(null)
  const [active, setActive] = useState<FieldKey>('name')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // ⚠️ מפתח לרענון ה-iframe: שינוי src זהה אינו טוען מחדש, ולכן מוסיפים
  // פרמטר שמשתנה בכל שמירה.
  const [previewKey, setPreviewKey] = useState(0)
  // הזזת *כל* השדות יחד — לשמירת המרווחים ביניהם.
  const [moveAll, setMoveAll] = useState(false)
  // כתובת ה-blob של התצוגה החיה. null = טרם נוצרה (מציגים את השמורה).
  const [liveUrl, setLiveUrl] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/loans/rabbi-form/layout', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'הטעינה נכשלה'); return }
      setLayout(json.layout)
    } catch { toast.error('שגיאת רשת') } finally { setLoading(false) }
  }, [toast])

  useEffect(() => {
    let alive = true
    const t = setTimeout(() => { if (alive) void load() }, 0)
    return () => { alive = false; clearTimeout(t) }
  }, [load])

  /**
   * הזזת השדה הפעיל.
   *
   * ⚠️ ציר ה-Y ב-PDF עולה כלפי מעלה — הפוך מהאינטואיציה במסך.
   *
   * moveAll — כשמסומן, *כל* השדות זזים יחד באותו היסט. בלעדיו הורדת
   * בלוק שלם (למשל כשהבלאנק מתחלף) הייתה מחייבת להזיז 15 שדות אחד-אחד
   * ולשמור על המרווחים ביניהם ידנית — עבודה שנשברת על טעות אחת.
   * ⚠️ גודל הגופן לעולם אינו משתנה קבוצתית: הוא מאפיין של כל שדה
   * בנפרד, ושינוי גורף היה הורס את ההיררכיה של הטופס.
   */
  const nudge = (axis: 'x' | 'y' | 'size', delta: number) => {
    setLayout(l => {
      if (!l) return l
      if (moveAll && axis !== 'size') {
        const next = { ...l }
        for (const f of FIELDS) {
          const p = l[f.key] as FieldPos
          next[f.key] = { ...p, [axis]: Math.round((p[axis] + delta) * 10) / 10 }
        }
        return next
      }
      const cur = l[active] as FieldPos
      return { ...l, [active]: { ...cur, [axis]: Math.round((cur[axis] + delta) * 10) / 10 } }
    })
  }

  // ── תצוגה מקדימה חיה ──
  //
  // 🔴 ה-PDF מופק מחדש בכל שינוי, מהפריסה שבמסך ולא מזו השמורה. בלי זה
  // המכייל היה חייב לשמור כדי לראות — כלומר כל ניסוי היה משנה מיד את
  // הטופס שהמבקשים מקבלים בפועל.
  //
  // ⚠️ מושהה ב-350ms: לחיצה על חץ משנה את הפריסה מיד, והפקת PDF לכל
  // לחיצה הייתה מציפה את השרת ומקפיאה את המסך בזמן לחיצות רצופות.
  //
  // ⚠️ ה-blob הקודם משוחרר (revokeObjectURL) — כל הפקה יוצרת אובייקט
  // חדש בזיכרון הדפדפן, ובלי השחרור סשן כיול ארוך היה מדליף אותם.
  useEffect(() => {
    if (!layout) return
    let alive = true
    let created: string | null = null

    const t = setTimeout(async () => {
      setRendering(true)
      try {
        const res = await fetch('/api/admin/loans/rabbi-form', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ previewLayout: layout }),
        })
        if (!res.ok || !alive) return
        const blob = await res.blob()
        if (!alive) return
        created = URL.createObjectURL(blob)
        setLiveUrl(prev => { if (prev) URL.revokeObjectURL(prev); return created })
      } catch { /* התצוגה החיה אינה קריטית — נשארת האחרונה שהוצגה */ }
      finally { if (alive) setRendering(false) }
    }, 350)

    return () => { alive = false; clearTimeout(t) }
  }, [layout])

  // שחרור ה-blob האחרון ביציאה מהמסך.
  useEffect(() => () => { setLiveUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null }) }, [])

  async function save() {
    if (!layout) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/loans/rabbi-form/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ layout }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'השמירה נכשלה'); return }
      toast.success('הפריסה נשמרה')
      setPreviewKey(k => k + 1)
    } catch { toast.error('שגיאת רשת') } finally { setSaving(false) }
  }

  async function reset() {
    if (!confirm('לאפס את כל המיקומים לברירת המחדל?')) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/loans/rabbi-form/layout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error ?? 'האיפוס נכשל'); return }
      setLayout(json.layout)
      toast.success('אופס לברירת המחדל')
      setPreviewKey(k => k + 1)
    } catch { toast.error('שגיאת רשת') } finally { setSaving(false) }
  }

  const cur = layout ? (layout[active] as FieldPos) : null
  const btn = 'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700 transition-colors'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/admin/settings" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">טופס חתימת רב</h1>
            <p className="text-xs text-slate-500 mt-0.5">כיול מיקום השדות על הבלאנק — התצוגה מימין היא הטופס האמיתי</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPreviewKey(k => k + 1)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-indigo-300">
            <RefreshCw size={14} /> רענן תצוגה
          </button>
          <button onClick={reset} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50">
            <RotateCcw size={14} /> איפוס
          </button>
          <button onClick={save} disabled={saving || !layout}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמור
          </button>
        </div>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-slate-400 flex items-center justify-center gap-2">
          <Loader2 size={15} className="animate-spin" /> טוען…
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr] items-start">

          {/* ── פאנל הכיול ── */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-4">
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3 font-extrabold text-slate-900 text-sm">
                בחרו שדה לכיול
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                {FIELDS.map(f => (
                  <button key={f.key} onClick={() => setActive(f.key)}
                    className={`w-full text-right px-4 py-2.5 text-xs font-bold transition-colors ${
                      active === f.key ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                    }`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {cur && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                <p className="text-xs font-extrabold text-slate-700">
                  {moveAll ? 'כל השדות יחד' : FIELDS.find(f => f.key === active)?.label}
                </p>

                {/* ⚠️ הזזה קבוצתית — כשהבלאנק מתחלף כל התוכן צריך לזוז
                    באותו היסט. בלי זה צריך להזיז 15 שדות אחד-אחד ולשמור
                    על המרווחים ביניהם ידנית, מה שנשבר על טעות אחת. */}
                <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 cursor-pointer hover:border-indigo-300 transition-colors">
                  <input
                    type="checkbox"
                    checked={moveAll}
                    onChange={e => setMoveAll(e.target.checked)}
                    className="accent-indigo-600"
                  />
                  <span className="text-[11px] font-bold text-slate-700 leading-tight">
                    הזז את כל השדות יחד
                    <span className="block font-normal text-slate-400">שומר על המרווחים ביניהם</span>
                  </span>
                </label>

                {/* ⚠️ החצים מסומנים לפי מה שרואים במסך, לא לפי ציר ה-PDF:
                    "למעלה" מזיז למעלה בעין, וההיפוך מטופל בקוד. */}
                <div className="grid grid-cols-3 gap-1.5 place-items-center">
                  <span />
                  <button onClick={() => nudge('y', 5)} className={btn} title="למעלה"><ChevronUp size={16} /></button>
                  <span />
                  <button onClick={() => nudge('x', 5)} className={btn} title="ימינה"><ChevronRight size={16} /></button>
                  <span className="text-[10px] text-slate-400 text-center leading-tight">קפיצות<br />5 נק׳</span>
                  <button onClick={() => nudge('x', -5)} className={btn} title="שמאלה"><ChevronLeft size={16} /></button>
                  <span />
                  <button onClick={() => nudge('y', -5)} className={btn} title="למטה"><ChevronDown size={16} /></button>
                  <span />
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                  <span className="text-xs font-bold text-slate-600 flex items-center gap-1"><Type size={13} /> גודל</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => nudge('size', -1)} className={btn}>−</button>
                    <span className="w-8 text-center text-sm font-extrabold text-slate-800 ltr-num">{cur.size}</span>
                    <button onClick={() => nudge('size', 1)} className={btn}>+</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 border-t border-slate-100 pt-3">
                  <span>X: <strong className="text-slate-700 ltr-num">{cur.x}</strong></span>
                  <span>Y: <strong className="text-slate-700 ltr-num">{cur.y}</strong></span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-100 pt-3">
                  לחצו <strong>שמור</strong> כדי לראות את השינוי בתצוגה שמימין.
                </p>
              </div>
            )}

            {layout && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-600">מרווח בין שורות הדורות</span>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setLayout(l => l && ({ ...l, lineageGap: Math.max(8, l.lineageGap - 1) }))} className={btn}>−</button>
                    <span className="w-8 text-center text-sm font-extrabold text-slate-800 ltr-num">{layout.lineageGap}</span>
                    <button onClick={() => setLayout(l => l && ({ ...l, lineageGap: l.lineageGap + 1 }))} className={btn}>+</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── התצוגה המקדימה ── */}
          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between gap-2">
              <span className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <FileText size={15} className="text-indigo-600" /> תצוגה מקדימה
              </span>
              <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                {rendering && <Loader2 size={11} className="animate-spin text-indigo-500" />}
                נתוני דוגמה · מתעדכן חי
              </span>
            </div>
            {/* ⚠️ iframe ולא תמונה: הדפדפן מציג PDF במלוא האיכות, וכל
                ניסיון להמיר לתמונה היה מוסיף שכבת עיבוד שמסתירה סטיות.
                ⚠️ ה-src הוא blob של הפריסה *הנוכחית* (לא השמורה), ולכן
                כל הזזה נראית מיד. עד ליצירת ה-blob הראשון מוצגת השמורה. */}
            <iframe
              src={liveUrl ?? `/api/admin/loans/rabbi-form?preview=1&v=${previewKey}`}
              title="תצוגה מקדימה של הטופס"
              className="w-full h-[80vh] bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  )
}
