'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, AlertTriangle, RotateCcw, Pencil, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { PublicTexts } from '@/lib/publicTexts'
import PublicPortalPage from '../PublicPortalPage'

// ─────────────────────────────────────────────────────────────────────────────
// עריכה חיה: האתר הציבורי האמיתי, עם סרגל שמירה צף.
//
// זה אותו PublicPortalPage שהגולשים רואים — לא עותק ולא תצוגה מקדימה.
// ההבדל היחיד הוא editMode, שהופך כל טקסט עטוף לניתן ללחיצה ולעריכה.
// ─────────────────────────────────────────────────────────────────────────────

// המסכים שניתן לדלג אליהם ישירות מהבורר, בלי לעבור זיהוי ת"ז אמיתי.
// ⚠️ מסכים שתלויים בנתוני מוטב (dashboard, docs-needed וכו') אינם כאן —
// בלי מוטב טעון הם היו נופלים או מוצגים ריקים.
const PREVIEW_STEPS = [
  { step: 'id-lookup' as const, label: 'מסך פתיחה' },
  { step: 'new-loan' as const, label: 'בקשת הלוואה' },
]

export default function PublicTextsEditor({ initialTexts }: { initialTexts: PublicTexts }) {
  const router = useRouter()
  const [texts, setTexts] = useState<PublicTexts>(initialTexts ?? {})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [previewStep, setPreviewStep] = useState<(typeof PREVIEW_STEPS)[number]['step']>('id-lookup')

  const dirty = useMemo(
    () => JSON.stringify(texts) !== JSON.stringify(initialTexts ?? {}),
    [texts, initialTexts],
  )

  const onTextChange = (key: string, value: string) => {
    setTexts(prev => (prev[key] === value ? prev : { ...prev, [key]: value }))
    setMsg(null)
  }

  const save = async () => {
    setSaving(true); setMsg(null)
    try {
      const res = await fetch('/api/admin/public-texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) {
        setMsg({ type: 'err', text: data.error || 'השמירה נכשלה' })
      } else {
        setTexts(data.texts ?? {})
        setMsg({ type: 'ok', text: 'נשמר — הנוסח מעודכן באתר' })
      }
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'שגיאת רשת' })
    } finally {
      setSaving(false)
    }
  }

  const logout = async () => {
    try { await createClient().auth.signOut() } catch { /* בכל מקרה יוצאים */ }
    router.push('/login')
  }

  const resetAll = () => { setTexts(initialTexts ?? {}); setMsg(null) }

  return (
    <>
      {/* סרגל העריכה — צף מעל האתר, לא חלק ממנו */}
      <div dir="rtl" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-slate-900/95 backdrop-blur text-white rounded-2xl shadow-2xl px-3 py-2.5 border border-slate-700">
        <div className="flex items-center gap-1.5 px-1 text-indigo-300">
          <Pencil size={15} />
          <span className="text-xs font-semibold whitespace-nowrap">מצב עריכה</span>
        </div>

        <span className="w-px h-5 bg-slate-700" />

        {/* בורר מסכים — מעבר ישיר בין תצוגות בלי להזין ת"ז */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-0.5">
          {PREVIEW_STEPS.map(s => (
            <button key={s.step} onClick={() => setPreviewStep(s.step)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                previewStep === s.step ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        <span className="w-px h-5 bg-slate-700" />

        {msg ? (
          <span className={`text-xs flex items-center gap-1.5 whitespace-nowrap ${msg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
            {msg.type === 'ok' ? <Check size={13} /> : <AlertTriangle size={13} />}
            {msg.text}
          </span>
        ) : (
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {dirty ? 'יש שינויים שלא נשמרו' : 'לחץ על טקסט כדי לערוך'}
          </span>
        )}

        {dirty && (
          <button onClick={resetAll} title="ביטול כל השינויים"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors">
            <RotateCcw size={14} />
          </button>
        )}

        <button onClick={save} disabled={saving || !dirty}
          className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {saving ? 'שומר...' : 'שמירה'}
        </button>

        <span className="w-px h-5 bg-slate-700" />

        <button onClick={logout} title="התנתקות"
          className="flex items-center gap-1.5 text-slate-300 hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors text-xs whitespace-nowrap">
          <LogOut size={14} />
          התנתקות
        </button>
      </div>

      {/* האתר האמיתי */}
      <PublicPortalPage texts={texts} editMode onTextChange={onTextChange} forceStep={previewStep} />
    </>
  )
}
