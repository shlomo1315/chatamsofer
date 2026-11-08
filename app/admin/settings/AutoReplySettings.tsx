'use client'
import { useState, useEffect, useMemo } from 'react'
import GilyonotReplyEditor from './GilyonotReplyEditor'
import AutoReplyLiveEditor from './AutoReplyLiveEditor'
import { Loader2, Save, ChevronDown, Check, AlertCircle, Plus, Trash2, Mail, Clock, Ban, Pencil } from 'lucide-react'
import type { AutoReplyMap, AutoReplySettings as Settings } from '@/lib/autoReplyConfig'

// ─────────────────────────────────────────────────────────────────────────────
// דף התשתית של המענה האוטומטי — נוסח, כפתורים וסעיפים לכל תיבה, עם תצוגה
// מקדימה חיה. השמירה ל-DB, לצמיתות.
//
// ⚠️ התצוגה המקדימה ב-iframe מבודד ולא ב-dangerouslySetInnerHTML: הזרקת HTML
// של מייל ישירות ל-DOM של הניהול כבר גרמה כאן לקריסת removeChild.
// ─────────────────────────────────────────────────────────────────────────────

interface Dept { key: string; label: string; email: string; color: string; custom?: boolean }

export default function AutoReplySettings() {
  const [saved, setSaved] = useState<AutoReplyMap>({})
  const [draft, setDraft] = useState<AutoReplyMap>({})
  const [depts, setDepts] = useState<Dept[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  // 🔴 הוספת תיבה חדשה: DEPARTMENTS קבוע בקוד, ובלי זה כתובת חדשה
  // חייבה שינוי קוד ופריסה כדי לקבל מענה אוטומטי.
  const [newLabel, setNewLabel] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [addingBox, setAddingBox] = useState(false)

  useEffect(() => {
    fetch('/api/admin/auto-reply-config')
      .then(r => r.json())
      .then(d => {
        setSaved(d.config ?? {}); setDraft(d.config ?? {}); setDepts(d.departments ?? [])
      })
      .catch(() => setErr('טעינת ההגדרות נכשלה'))
      .finally(() => setLoading(false))
  }, [])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const patch = (key: string, changes: Partial<Settings>) => {
    setOkMsg('')
    setDraft(d => ({ ...d, [key]: { ...(d[key as keyof AutoReplyMap] as Settings), ...changes } }))
  }

  const save = async () => {
    setSaving(true); setErr(''); setOkMsg('')
    try {
      const res = await fetch('/api/admin/auto-reply-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: draft }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'השמירה נכשלה'); return }
      setSaved(d.config ?? {}); setDraft(d.config ?? {})
      setOkMsg('ההגדרות נשמרו')
      setTimeout(() => setOkMsg(''), 3000)
    } catch {
      setErr('שגיאת תקשורת — ההגדרות לא נשמרו')
    } finally { setSaving(false) }
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm py-6"><Loader2 size={16} className="animate-spin" /> טוען…</div>
  }

  const reloadDepts = async () => {
    const d = await fetch('/api/admin/auto-reply-config').then(r => r.json()).catch(() => null)
    if (d?.departments) setDepts(d.departments)
  }

  const addMailbox = async () => {
    const email = newEmail.trim().toLowerCase()
    const label = newLabel.trim()
    if (!email || !label) { setErr('יש למלא שם וכתובת'); return }
    setAddingBox(true); setErr('')
    try {
      const res = await fetch('/api/admin/mailboxes/custom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, email }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'ההוספה נכשלה')
      setNewLabel(''); setNewEmail('')
      setOkMsg('התיבה נוספה')
      await reloadDepts()
      setTimeout(() => setOkMsg(''), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ההוספה נכשלה')
    } finally { setAddingBox(false) }
  }

  const removeMailbox = async (email: string, label: string) => {
    if (!confirm(`להסיר את התיבה "${label}"? הנוסח שנשמר לה יישמר למקרה שתוסיפו אותה שוב.`)) return
    try {
      const res = await fetch('/api/admin/mailboxes/custom', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'ההסרה נכשלה')
      await reloadDepts()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'ההסרה נכשלה')
    }
  }

  return (
    <div className={`flex flex-col gap-4 ${dirty ? "pb-28" : ""}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Mail size={18} className="text-navy" /> מענה אוטומטי לתיבות המייל
          </h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            לכל תיבה נוסח משלה. המענה נשלח לכל פונה — בלי קשר לתוכן המייל ובלי בדיקה אם הוא רשום.
          </p>

          {/* 🔴 הוספת תיבה חדשה. עד כה רשימת התיבות הייתה קבועה בקוד,
              וכתובת חדשה חייבה שינוי קוד ופריסה כדי לקבל מענה אוטומטי. */}
          <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">שם התיבה</label>
              <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
                placeholder="לדוגמה: תרומות"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-navy-soft" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">כתובת המייל</label>
              <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                placeholder="name@chasamsofer.info" dir="ltr"
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-navy-soft" />
            </div>
            <button onClick={addMailbox} disabled={addingBox}
              className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-sm font-bold text-white hover:bg-navy-dark disabled:opacity-60 transition-colors">
              {addingBox ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} הוסף תיבה
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {okMsg && <span className="text-sm text-emerald-600 font-bold flex items-center gap-1"><Check size={15} /> {okMsg}</span>}
          {dirty && (
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy-dark disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} שמירה
            </button>
          )}
        </div>
      </div>

      {/* ── סרגל שמירה צף ──────────────────────────────────────────────
          🔴 כפתור השמירה ישב בראש הדף בלבד. הנוסחים ארוכים, והמנהל
          שערך שדה בתחתית לא ראה אותו כלל — ערך, יצא, והשינוי אבד.

          ⚠️ מופיע רק כשיש שינוי שלא נשמר, ונעלם מיד אחרי השמירה: סרגל
          קבוע היה מכסה תוכן גם כשאין מה לשמור.

          ⚠️ ההבהוב פועם ברקע ולא מסתיר טקסט — animate-pulse על העטיפה
          היה מרצד את הכיתוב עצמו וקשה לקריאה. */}
      {dirty && (
        <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4 pt-3 pointer-events-none">
          <div className="mx-auto max-w-3xl pointer-events-auto flex items-center justify-between gap-3
                          rounded-2xl border-2 border-amber-300 bg-white shadow-2xl px-4 py-3
                          animate-[pulse_2s_ease-in-out_infinite]">
            <span className="flex items-center gap-2 text-sm font-bold text-amber-700">
              <AlertCircle size={16} /> יש שינויים שלא נשמרו
            </span>
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-bold
                         hover:bg-navy-dark disabled:opacity-60 shadow-lg shrink-0">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} שמירה
            </button>
          </div>
        </div>
      )}

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} /> {err}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {depts.map(dept => {
          // 🔴 תיבה חדשה אינה קיימת עדיין ב-draft, ו-`if (!s) return null`
          // היה מסתיר אותה לגמרי — המשתמש היה מוסיף תיבה ולא רואה אותה.
          // ברירת מחדל כבויה: היא מופיעה ברשימה, ומקבלת הגדרות ברגע
          // שנוגעים בה.
          // 🔴 ברירת המחדל חייבת לכלול את *כל* המערכים.
          //
          // ⚠️ קודם היא הייתה { enabled: false } בלבד, ו-s.sections.map
          // בהמשך קרס על תיבה חדשה שטרם נשמרה:
          // "Cannot read properties of undefined (reading 'map')".
          // התיבה נוספה, המסך קרס, והמשתמש לא ידע למה.
          const raw = draft[dept.key as keyof AutoReplyMap] as Settings | undefined
          const s: Settings = {
            ...({ enabled: false } as Settings),
            ...raw,
            sections: Array.isArray(raw?.sections) ? raw.sections : [],
            buttons: Array.isArray(raw?.buttons) ? raw.buttons : [],
          }
          const isOpen = openKey === dept.key

          return (
            <div key={dept.key} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {/* כותרת התיבה */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: dept.color }} />
                {/* ⚠️ הסרה מוצעת רק לתיבות שנוספו מהממשק — המחלקות
                    הקבועות מקודדות בקוד ומחיקתן כאן לא הייתה עושה דבר. */}
                {dept.custom && (
                  <button onClick={() => removeMailbox(dept.email, dept.label)}
                    title="הסרת התיבה"
                    className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
                <button onClick={() => setOpenKey(isOpen ? null : dept.key)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-right">
                  <span className="font-bold text-slate-900 truncate">{dept.label}</span>
                  <span className="text-xs text-slate-400 truncate hidden sm:inline">{dept.email}</span>
                  <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {/* ⚠️ תווית המצב מוצגת בשורה הסגורה: רשימת התיבות היא המקום
                    שבו בודקים "מה שולחים כרגע", ובלי התווית היה צריך לפתוח
                    כל תיבה בנפרד כדי לגלות שהיא על נוסח זמני. */}
                {s.enabled && s.mode === 'temp' && (
                  <span className="hidden sm:flex items-center gap-1 shrink-0 text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 rounded-full px-2 py-0.5">
                    <Clock size={10} /> זמני
                  </span>
                )}
                {s.enabled && s.mode === 'off' && (
                  <span className="hidden sm:flex items-center gap-1 shrink-0 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-300 rounded-full px-2 py-0.5">
                    <Ban size={10} /> ללא מענה
                  </span>
                )}
                <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                  <span className={`text-xs font-bold ${s.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {s.enabled ? 'פעיל' : 'כבוי'}
                  </span>
                  <input type="checkbox" checked={s.enabled}
                    onChange={e => patch(dept.key, { enabled: e.target.checked })}
                    className="w-9 h-5 appearance-none rounded-full bg-slate-300 checked:bg-emerald-500 relative cursor-pointer transition-colors
                               before:content-[''] before:absolute before:top-0.5 before:right-0.5 before:w-4 before:h-4 before:bg-white before:rounded-full
                               before:transition-transform checked:before:-translate-x-4" />
                </label>
              </div>

              {isOpen && dept.key === 'mailing' && (
                <div className="border-t border-slate-100 p-4">
                  <GilyonotReplyEditor />
                </div>
              )}
              {isOpen && dept.key !== "mailing" && (
                <div className="border-t border-slate-100 p-4">
                  <button onClick={() => setEditing(dept.key)}
                    className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-bold text-white hover:bg-navy-dark transition-colors">
                    <Pencil size={15} /> פתיחת העורך החי
                  </button>
                  <p className="mt-2 text-xs text-slate-400">עורכים את המייל עצמו במקום, עם פאנל כלים, תצוגת מחשב וטלפון ומייל בדיקה.</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {editing && (() => {
        const dept = depts.find(d => d.key === editing)
        if (!dept) return null
        const raw = draft[dept.key as keyof AutoReplyMap] as Settings | undefined
        const s: Settings = {
          ...({ enabled: false } as Settings),
          ...raw,
          sections: Array.isArray(raw?.sections) ? raw.sections : [],
          buttons: Array.isArray(raw?.buttons) ? raw.buttons : [],
        }
        return (
          <AutoReplyLiveEditor dept={dept} depts={depts} config={draft} s={s} dirty={dirty} saving={saving}
            onPatch={changes => patch(dept.key, changes)}
            onSwitchDept={setEditing}
            onSave={save}
            onClose={() => setEditing(null)} />
        )
      })()}
    </div>
  )
}
