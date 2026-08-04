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

  useEffect(() => {
    fetch('/api/admin/department-gates').then(r => r.json())
      .then(d => { if (d.gates) setGates(d.gates) }).catch(() => {})
  }, [])

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
    </div>
  )
}
