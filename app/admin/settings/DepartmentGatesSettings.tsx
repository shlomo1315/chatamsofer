'use client'
import { useEffect, useState } from 'react'
import { Loader2, Heart, Landmark, Stethoscope, HandHeart, Gift } from 'lucide-react'

// המחלקות + תווית + אייקון + צבע. הסדר תואם ל-GATED_DEPARTMENTS בשרת.
const DEPTS: { key: string; label: string; hint: string; icon: typeof Heart; color: string }[] = [
  { key: 'maternity',     label: 'עזר יולדות',       hint: 'בקשות הבראה וכרטיס מזון ליולדות', icon: Heart,       color: 'text-pink-600 bg-pink-50' },
  { key: 'gemach',        label: 'גמ"ח הלוואות',     hint: 'בקשות הלוואה',                     icon: Landmark,    color: 'text-emerald-600 bg-emerald-50' },
  { key: 'financial_aid', label: 'סיוע רפואי',        hint: 'בקשות סיוע כספי/רפואי',            icon: Stethoscope, color: 'text-sky-600 bg-sky-50' },
  { key: 'widows',        label: 'אלמנות ויתומים',    hint: 'בקשות תמיכה לאלמנות ויתומים',      icon: HandHeart,   color: 'text-violet-600 bg-violet-50' },
  // ⚠️ מתג-אב: סגירה כאן מכבה את חלוקות החגים בכל הערוצים — פורטל, מייל,
  // שלוחה טלפונית וטופס נדרים — גם אם קיימת חלוקה שהרישום אליה פתוח.
  { key: 'holidays',      label: 'חלוקות חגים',      hint: 'סגירה כאן מכבה את הרישום בכל הערוצים, גם אם חלוקה פתוחה', icon: Gift, color: 'text-teal-600 bg-teal-50' },
]

export default function DepartmentGatesSettings() {
  const [gates, setGates] = useState<Record<string, boolean> | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  // קוד התצוגה המוקדמת — מנהל בלבד (השרת לא מחזיר אותו לאיש צוות רגיל)
  const [previewCode, setPreviewCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [regen, setRegen] = useState(false)

  useEffect(() => {
    fetch('/api/admin/department-gates').then(r => r.json())
      .then(d => {
        if (d.gates) setGates(d.gates)
        if (typeof d.previewCode === 'string') setPreviewCode(d.previewCode)
      }).catch(() => {})
  }, [])

  const previewLink = typeof window !== 'undefined' && previewCode
    ? `${window.location.origin}/?preview=${previewCode}` : ''

  const regenerate = async () => {
    setRegen(true)
    try {
      const r = await fetch('/api/admin/department-gates', { method: 'PUT' })
      const d = await r.json()
      if (d.previewCode) setPreviewCode(d.previewCode)
    } catch { /* שקט */ }
    setRegen(false)
  }

  const toggle = async (dept: string) => {
    if (!gates) return
    const next = { ...gates, [dept]: !gates[dept] }
    setGates(next) // אופטימי
    setSaving(dept)
    try {
      const r = await fetch('/api/admin/department-gates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gates: { [dept]: next[dept] } }),
      })
      const d = await r.json()
      if (d.gates) setGates(d.gates)
      else if (!r.ok) setGates(gates) // גלגול אחור
    } catch { setGates(gates) }
    setSaving(null)
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-1">
        <h2 className="text-sm font-semibold text-slate-700">הגדרות בקשות — פתיחה וסגירה לפי מחלקה</h2>
      </div>
      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        שליטה על אילו מחלקות מקבלות בקשות חדשות. מחלקה סגורה — הטופס הציבורי, קישורי
        הטיוטות במייל והמיילים האוטומטיים מתנהגים בהתאם. כך ניתן להפעיל את המערכת בהדרגה.
      </p>

      {gates === null ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-3"><Loader2 size={14} className="animate-spin" /> טוען…</div>
      ) : (
        <div className="space-y-2">
          {DEPTS.map(({ key, label, hint, icon: Icon, color }) => {
            const open = !!gates[key]
            return (
              <div key={key} className="flex items-center justify-between py-2.5 px-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                    <Icon size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {open ? 'פתוח — מקבל בקשות חדשות' : 'סגור — לא מקבל בקשות'} · <span className="text-slate-400">{hint}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {saving === key && <Loader2 size={13} className="animate-spin text-slate-400" />}
                  <button
                    onClick={() => toggle(key)}
                    disabled={saving === key}
                    className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${open ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    aria-label={`פתח/סגור ${label}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${open ? 'right-0.5' : 'right-5'}`} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── קישור בדיקה נסתר ──
          ⚠️ מחלקה סגורה חסומה *בשרת*, ולכן אי אפשר לבדוק את הזרימה מקצה
          לקצה לפני הפתיחה לציבור — בדיוק ברגע שבו הבדיקה הכי חשובה.
          פתיחה זמנית "רק כדי לבדוק" חושפת את הטופס לכל מי שנכנס לאתר
          באותן דקות. הקישור הזה עוקף את השער לגולש שמחזיק בו בלבד.
          מוצג למנהל בלבד — השרת אינו מחזיר את הקוד לאיש צוות רגיל. */}
      {previewCode && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-xs font-bold text-amber-900">🔒 קישור בדיקה נסתר — למחלקות סגורות</p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
            פותח את הטפסים של <strong>כל</strong> המחלקות, כולל הסגורות, למי שנכנס דרכו בלבד.
            כך אפשר לעבור על כל הזרימה (טופס → שליחה → מייל → כרטסת) לפני שפותחים לציבור.
            הקישור אינו מדלג על אימות או ולידציה — רק על שער המחלקה.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <input readOnly value={previewLink} dir="ltr" onFocus={e => e.currentTarget.select()}
              className="flex-1 min-w-[220px] rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-700" />
            <button onClick={() => { void navigator.clipboard?.writeText(previewLink); setCopied(true); setTimeout(() => setCopied(false), 1800) }}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700">
              {copied ? '✓ הועתק' : 'העתקה'}
            </button>
            <button onClick={regenerate} disabled={regen}
              title="יצירת קוד חדש — מבטלת מיידית כל קישור שהופץ"
              className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              {regen ? <Loader2 size={12} className="animate-spin" /> : '↻'} קוד חדש
            </button>
          </div>
          <p className="mt-2 text-[10px] text-amber-600">
            ⚠️ כל מי שהקישור מגיע לידיו יוכל להגיש בקשה למחלקה סגורה. אם הופץ בטעות — לחצו ״קוד חדש״.
          </p>
        </div>
      )}
    </div>
  )
}
