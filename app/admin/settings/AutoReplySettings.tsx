'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import {
  Loader2, Save, Eye, ChevronDown, Check, AlertCircle, Plus, Trash2, Mail,
} from 'lucide-react'
import { REQUEST_MAILTO_PRESETS, requestMailtoUrl } from '@/lib/autoReplyConfig'
import type { AutoReplyMap, AutoReplySettings as Settings, AutoReplyButton, AutoReplySection } from '@/lib/autoReplyConfig'

// ─────────────────────────────────────────────────────────────────────────────
// דף התשתית של המענה האוטומטי — נוסח, כפתורים וסעיפים לכל תיבה, עם תצוגה
// מקדימה חיה. השמירה ל-DB, לצמיתות.
//
// ⚠️ התצוגה המקדימה ב-iframe מבודד ולא ב-dangerouslySetInnerHTML: הזרקת HTML
// של מייל ישירות ל-DOM של הניהול כבר גרמה כאן לקריסת removeChild.
// ─────────────────────────────────────────────────────────────────────────────

interface Dept { key: string; label: string; email: string; color: string }

export default function AutoReplySettings() {
  const [saved, setSaved] = useState<AutoReplyMap>({})
  const [draft, setDraft] = useState<AutoReplyMap>({})
  const [depts, setDepts] = useState<Dept[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

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

  // תצוגה חיה — מתעדכנת תוך כדי הקלדה, עם השהיה קצרה.
  // ⚠️ התצוגה נשמרת יחד עם התיבה שאליה היא שייכת, ומשמשת רק כשהמפתח תואם.
  // כך סגירת תיבה אינה דורשת setState בתוך ה-effect, ותצוגה של תיבה קודמת
  // אינה מוצגת לרגע מתחת לתיבה חדשה שנפתחה.
  const [previewFor, setPreviewFor] = useState<{ key: string; subject: string; html: string } | null>(null)
  const preview = previewFor && previewFor.key === openKey ? previewFor : null

  useEffect(() => {
    if (!openKey) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/auto-reply-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preview: { department: openKey }, config: draft }),
        })
        const d = await res.json()
        if (cancelled || !res.ok) return
        setPreviewFor({ key: openKey, subject: d.subject, html: d.html })
      } catch { /* תצוגה בלבד */ }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [openKey, draft])

  // כתיבת ה-HTML ל-iframe מבודד
  useEffect(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc || !preview) return
    doc.open(); doc.write(preview.html); doc.close()
  }, [preview])

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Mail size={18} className="text-indigo-600" /> מענה אוטומטי לתיבות המייל
          </h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed">
            לכל תיבה נוסח משלה. המענה נשלח לכל פונה — בלי קשר לתוכן המייל ובלי בדיקה אם הוא רשום.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {okMsg && <span className="text-sm text-emerald-600 font-bold flex items-center gap-1"><Check size={15} /> {okMsg}</span>}
          {dirty && (
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-60">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} שמירה
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={16} /> {err}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {depts.map(dept => {
          const s = draft[dept.key as keyof AutoReplyMap] as Settings | undefined
          if (!s) return null
          const isOpen = openKey === dept.key

          return (
            <div key={dept.key} className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              {/* כותרת התיבה */}
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: dept.color }} />
                <button onClick={() => setOpenKey(isOpen ? null : dept.key)}
                  className="flex items-center gap-2 flex-1 min-w-0 text-right">
                  <span className="font-bold text-slate-900 truncate">{dept.label}</span>
                  <span className="text-xs text-slate-400 truncate hidden sm:inline">{dept.email}</span>
                  <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
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

              {isOpen && (
                <div className="border-t border-slate-100 p-4 flex flex-col lg:flex-row gap-5">
                  {/* ── עריכה ── */}
                  <div className="flex-1 min-w-0 flex flex-col gap-4">
                    <Field label="שורת הנושא">
                      <input value={s.subject} onChange={e => patch(dept.key, { subject: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-indigo-400 outline-none" />
                    </Field>

                    <Field label="פסקת פתיחה">
                      <textarea value={s.message} rows={5}
                        onChange={e => patch(dept.key, { message: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-indigo-400 outline-none resize-y" />
                    </Field>

                    <ButtonsEditor
                      label="כפתורים כלליים"
                      hint="מוצגים מתחת לפסקת הפתיחה"
                      buttons={s.buttons}
                      onChange={b => patch(dept.key, { buttons: b })} />

                    {/* סעיפים */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-slate-600">סעיפים</span>
                        <button onClick={() => patch(dept.key, { sections: [...s.sections, { title: '', text: '', buttons: [] }] })}
                          className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
                          <Plus size={13} /> הוספת סעיף
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
                        לפירוט אגפים או נושאים — כל סעיף עם כותרת, תיאור וקישורים משלו.
                      </p>
                      <div className="flex flex-col gap-2">
                        {s.sections.map((sec, i) => (
                          <SectionEditor key={i} section={sec}
                            onChange={next => {
                              const arr = [...s.sections]; arr[i] = next
                              patch(dept.key, { sections: arr })
                            }}
                            onRemove={() => patch(dept.key, { sections: s.sections.filter((_, j) => j !== i) })} />
                        ))}
                        {!s.sections.length && (
                          <p className="text-xs text-slate-400 py-2 text-center border border-dashed border-slate-200 rounded-lg">
                            אין סעיפים
                          </p>
                        )}
                      </div>
                    </div>

                    <Field label="הערת סיום" hint="מוצגת בתיבה מודגשת בתחתית המייל">
                      <textarea value={s.footnote} rows={2}
                        onChange={e => patch(dept.key, { footnote: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:border-indigo-400 outline-none resize-y" />
                    </Field>

                    <Field label="מכסה שבועית לפונה" hint="בולם מפני לולאת מיילים — מומלץ להשאיר על 10">
                      <input type="number" min={1} max={100} value={s.weeklyCap}
                        onChange={e => patch(dept.key, { weeklyCap: Number(e.target.value) || 10 })}
                        className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-indigo-400 outline-none" />
                    </Field>
                  </div>

                  {/* ── תצוגה מקדימה ── */}
                  <div className="lg:w-[420px] shrink-0">
                    <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600">
                      <Eye size={13} /> תצוגה מקדימה
                    </div>
                    {preview ? (
                      <div className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 truncate">
                          <span className="text-slate-400">נושא: </span>{preview.subject}
                        </div>
                        {/* iframe מבודד — ראה ההערה בראש הקובץ */}
                        <iframe ref={frameRef} title="תצוגה מקדימה" sandbox=""
                          className="w-full h-[560px] bg-white" />
                      </div>
                    ) : (
                      <div className="h-[560px] flex items-center justify-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                        <Loader2 size={16} className="animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
      {hint && <p className="text-[11px] text-slate-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  )
}

function ButtonsEditor({ label, hint, buttons, onChange }: {
  label: string; hint?: string; buttons: AutoReplyButton[]; onChange: (b: AutoReplyButton[]) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)

  /** מוסיף כפתור הגשה מוכן — נושא שה-webhook מזהה + גוף מונחה. */
  const addPreset = (p: typeof REQUEST_MAILTO_PRESETS[number]) => {
    onChange([...buttons, { label: p.label, url: requestMailtoUrl(p.subject, p.mailbox) }])
    setPickerOpen(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-slate-600">{label}</span>
        <div className="flex items-center gap-3">
          {/* ⚠️ בורר קישורי הגשה: הרכבת mailto עם נושא מזוהה וגוף מונחה
              ביד היא מקור לטעויות, ונושא שגוי אחד מנתק את קליטת הבקשה. */}
          <div className="relative">
            <button onClick={() => setPickerOpen(o => !o)}
              className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700">
              <Mail size={13} /> קישור הגשה
            </button>
            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-0 top-6 z-20 w-60 rounded-xl border border-slate-200 bg-white shadow-lg p-1">
                  {REQUEST_MAILTO_PRESETS.map(p => (
                    <button key={p.subject} onClick={() => addPreset(p)}
                      className="w-full text-right px-3 py-2 rounded-lg hover:bg-emerald-50 transition-colors">
                      <span className="block text-xs font-bold text-slate-800">{p.label}</span>
                      <span className="block text-[11px] text-slate-400">{p.hint}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button onClick={() => onChange([...buttons, { label: '', url: '' }])}
            className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700">
            <Plus size={13} /> הוספה
          </button>
        </div>
      </div>
      {hint && <p className="text-[11px] text-slate-400 mb-1.5">{hint}</p>}
      <div className="flex flex-col gap-1.5">
        {buttons.map((b, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input value={b.label} placeholder="טקסט הכפתור"
              onChange={e => { const a = [...buttons]; a[i] = { ...b, label: e.target.value }; onChange(a) }}
              className="w-1/3 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-indigo-400 outline-none" />
            <input value={b.url} placeholder="https://… או mailto:…" dir="ltr"
              onChange={e => { const a = [...buttons]; a[i] = { ...b, url: e.target.value }; onChange(a) }}
              className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs focus:border-indigo-400 outline-none" />
            <button onClick={() => onChange(buttons.filter((_, j) => j !== i))}
              className="p-1.5 text-slate-400 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionEditor({ section, onChange, onRemove }: {
  section: AutoReplySection; onChange: (s: AutoReplySection) => void; onRemove: () => void
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/60 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <input value={section.title} placeholder="כותרת הסעיף"
          onChange={e => onChange({ ...section, title: e.target.value })}
          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm font-bold focus:border-indigo-400 outline-none" />
        <button onClick={onRemove} className="p-1.5 text-slate-400 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
      </div>
      <textarea value={section.text} rows={2} placeholder="תיאור"
        onChange={e => onChange({ ...section, text: e.target.value })}
        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs leading-relaxed focus:border-indigo-400 outline-none resize-y" />
      <ButtonsEditor label="קישורים" buttons={section.buttons}
        onChange={b => onChange({ ...section, buttons: b })} />
    </div>
  )
}
