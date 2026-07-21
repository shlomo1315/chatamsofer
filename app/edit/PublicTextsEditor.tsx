'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check, AlertTriangle, RotateCcw, Pencil, LogOut, List, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PUBLIC_TEXT_GROUPS, textOf, type PublicTexts } from '@/lib/publicTexts'
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
// needsData: מסכים שהרינדור שלהם חסום מאחורי נתוני מוטב אמיתיים
// (beneficiary / pendingAuth / childMatch). בלי כניסה אמיתית הם יוצגו
// ריקים — מסומנים כאן כדי שלא ייראה כמו תקלה.
const PREVIEW_STEPS = [
  { step: 'id-lookup' as const, label: 'מסך פתיחה' },
  { step: 'not-found' as const, label: 'לא נמצא' },
  { step: 'register' as const, label: 'הרשמה' },
  { step: 'register-success' as const, label: 'הרשמה הושלמה' },
  { step: 'new-loan' as const, label: 'בקשת הלוואה' },
  { step: 'request-sent' as const, label: 'בקשה נשלחה' },
  { step: 'portal-auth' as const, label: 'אימות כניסה', needsData: true },
  { step: 'found-as-child' as const, label: 'רשום כבן', needsData: true },
  { step: 'dashboard' as const, label: 'אזור אישי', needsData: true },
  { step: 'docs-needed' as const, label: 'השלמת מסמכים', needsData: true },
  { step: 'new-birth' as const, label: 'דיווח לידה', needsData: true },
  { step: 'new-silent-birth' as const, label: 'לידה שקטה', needsData: true },
  { step: 'widow-dashboard' as const, label: 'אלמנות', needsData: true },
]

export default function PublicTextsEditor({ initialTexts }: { initialTexts: PublicTexts }) {
  const router = useRouter()
  const [texts, setTexts] = useState<PublicTexts>(initialTexts ?? {})
  // הבסיס להשוואת "יש שינויים" — מתעדכן אחרי שמירה מוצלחת, כך שהכפתור
  // נכבה ו"ביטול" חוזר לנוסח שנשמר ולא לזה שנטען עם העמוד.
  const [savedTexts, setSavedTexts] = useState<PublicTexts>(initialTexts ?? {})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [previewStep, setPreviewStep] = useState<(typeof PREVIEW_STEPS)[number]['step']>('id-lookup')
  const [listOpen, setListOpen] = useState(false)

  const dirty = useMemo(
    () => JSON.stringify(texts) !== JSON.stringify(savedTexts),
    [texts, savedTexts],
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
        setSavedTexts(data.texts ?? {})
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

  const resetAll = () => { setTexts(savedTexts); setMsg(null) }

  const listGroups = PUBLIC_TEXT_GROUPS.filter(g => g.listOnly)

  return (
    <>
      {/* חלונית הודעות השגיאה — אי אפשר ללחוץ עליהן במסך, ולכן נערכות כרשימה */}
      {listOpen && (
        <div dir="rtl" className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
          onClick={() => setListOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3.5 flex items-center justify-between rounded-t-2xl">
              <div>
                <h2 className="font-bold text-slate-900">הודעות שגיאה</h2>
                <p className="text-xs text-slate-500 mt-0.5">מופיעות רק בתנאים מסוימים — לכן נערכות כאן ולא במסך</p>
              </div>
              <button onClick={() => setListOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-5">
              {listGroups.map(group => (
                <section key={group.title} className="flex flex-col gap-3">
                  <h3 className="text-xs font-semibold text-indigo-700">{group.title}</h3>
                  {group.entries.map(entry => {
                    const edited = texts[entry.key]
                    const isEdited = typeof edited === 'string' && edited.trim() !== ''
                    return (
                      <div key={entry.key} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400">{entry.hint ?? entry.key}</span>
                          {isEdited && (
                            <>
                              <span className="text-[10px] bg-indigo-50 text-indigo-700 rounded px-1.5 py-0.5 font-medium">נערך</span>
                              <button type="button" title="שחזור לנוסח המקורי"
                                onClick={() => setTexts(p => { const n = { ...p }; delete n[entry.key]; return n })}
                                className="text-slate-400 hover:text-slate-600">
                                <RotateCcw size={12} />
                              </button>
                            </>
                          )}
                        </div>
                        {entry.multiline ? (
                          <textarea value={isEdited ? edited : ''} rows={2}
                            onChange={e => onTextChange(entry.key, e.target.value)}
                            placeholder={entry.fallback}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
                        ) : (
                          <input type="text" value={isEdited ? edited : ''}
                            onChange={e => onTextChange(entry.key, e.target.value)}
                            placeholder={entry.fallback}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        )}
                        <p className="text-[10px] text-slate-400">מקורי: {textOf(null, entry.key)}</p>
                      </div>
                    )
                  })}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* סרגל העריכה — צף מעל האתר, לא חלק ממנו */}
      <div dir="rtl" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 bg-slate-900/95 backdrop-blur text-white rounded-2xl shadow-2xl px-3 py-2.5 border border-slate-700">
        <div className="flex items-center gap-1.5 px-1 text-indigo-300">
          <Pencil size={15} />
          <span className="text-xs font-semibold whitespace-nowrap">מצב עריכה</span>
        </div>

        <span className="w-px h-5 bg-slate-700" />

        {/* בורר מסכים — מעבר ישיר בין תצוגות בלי להזין ת"ז.
            גליל אופקי: יש יותר מסכים ממה שנכנס לרוחב המסך. */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-xl p-0.5 max-w-[42vw] overflow-x-auto">
          {PREVIEW_STEPS.map(s => (
            <button key={s.step} onClick={() => setPreviewStep(s.step)}
              title={s.needsData ? 'דורש כניסה אמיתית — עשוי להופיע ריק' : undefined}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                previewStep === s.step ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:text-white hover:bg-slate-700'
              }`}>
              {s.label}{s.needsData && <span className="opacity-50 mr-0.5">*</span>}
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

        <button onClick={() => setListOpen(true)} title="הודעות שגיאה"
          className="flex items-center gap-1.5 text-slate-300 hover:text-white px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors text-xs whitespace-nowrap">
          <List size={14} />
          שגיאות
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
