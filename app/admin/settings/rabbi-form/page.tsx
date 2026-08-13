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
  lineageStart: FieldPos; lineageGap: number; rabbiTitle: FieldPos
  rabbiText: FieldPos; rabbiName: FieldPos; rabbiPhone: FieldPos
  rabbiStamp: FieldPos; instructions: FieldPos; email: FieldPos
}

type FieldKey = Exclude<keyof Layout, 'lineageGap'>

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

  /** ⚠️ ציר ה-Y ב-PDF עולה כלפי מעלה — הפוך מהאינטואיציה במסך. */
  const nudge = (axis: 'x' | 'y' | 'size', delta: number) => {
    setLayout(l => {
      if (!l) return l
      const cur = l[active] as FieldPos
      return { ...l, [active]: { ...cur, [axis]: Math.round((cur[axis] + delta) * 10) / 10 } }
    })
  }

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
                  {FIELDS.find(f => f.key === active)?.label}
                </p>

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
              <span className="text-[11px] text-slate-400">נתוני דוגמה · הטופס האמיתי</span>
            </div>
            {/* ⚠️ iframe ולא תמונה: הדפדפן מציג PDF במלוא האיכות, וכל
                ניסיון להמיר לתמונה היה מוסיף שכבת עיבוד שמסתירה סטיות. */}
            <iframe
              key={previewKey}
              src={`/api/admin/loans/rabbi-form?preview=1&v=${previewKey}`}
              title="תצוגה מקדימה של הטופס"
              className="w-full h-[80vh] bg-slate-50"
            />
          </div>
        </div>
      )}
    </div>
  )
}
