'use client'
import { useState, useEffect, useMemo } from 'react'
import GilyonotReplyEditor from './GilyonotReplyEditor'
import AutoReplyLiveEditor from './AutoReplyLiveEditor'
import { Loader2, Save, Check, AlertCircle, Plus, Trash2, Mail, Clock, Ban } from 'lucide-react'
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
  const [showAdd, setShowAdd] = useState(false)
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

  const settingsOf = (key: string): Settings => {
    // 🔴 תיבה חדשה עדיין לא קיימת ב-draft. ברירת המחדל חייבת לכלול את כל
    // המערכים, אחרת s.sections.map קורס על תיבה שלא נשמרה.
    const raw = draft[key as keyof AutoReplyMap] as Settings | undefined
    return {
      ...({ enabled: false } as Settings),
      ...raw,
      sections: Array.isArray(raw?.sections) ? raw.sections : [],
      buttons: Array.isArray(raw?.buttons) ? raw.buttons : [],
    }
  }

  const activeKey = depts.some(d => d.key === editing) ? editing! : depts.find(d => d.key !== 'mailing')?.key ?? depts[0]?.key
  const dept = depts.find(d => d.key === activeKey)
  const s = dept ? settingsOf(dept.key) : null

  // ── בורר התיבות: כל התיבות, עם מתג פעיל/כבוי, הסרה והוספה ──
  const boxBar = (
    <div className="flex flex-col gap-2 border-b border-[#E3DED3] bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {depts.map(d => {
          const ds = settingsOf(d.key)
          const on = d.key === activeKey
          return (
            <div key={d.key}
              className={`flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 ${on ? 'border-[#C0912F] bg-[#F6EBCB]' : 'border-[#E3DED3] bg-white'}`}>
              <button type="button" onClick={() => setEditing(d.key)} className="flex items-center gap-1.5 text-right" title={d.email}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-sm font-bold text-[#142036]">{d.label}</span>
                {ds.enabled && ds.mode === 'temp' && <Clock size={12} className="text-amber-700" />}
                {ds.enabled && ds.mode === 'off' && <Ban size={12} className="text-slate-500" />}
              </button>
              <input type="checkbox" checked={ds.enabled} aria-label={`${d.label} פעיל`}
                title={ds.enabled ? 'פעיל' : 'כבוי'}
                onChange={e => patch(d.key, { enabled: e.target.checked })}
                className="relative h-4 w-7 cursor-pointer appearance-none rounded-full bg-slate-300 transition-colors checked:bg-emerald-500
                           before:absolute before:right-0.5 before:top-0.5 before:h-3 before:w-3 before:rounded-full before:bg-white before:content-['']
                           before:transition-transform checked:before:-translate-x-3" />
              {/* ⚠️ הסרה רק לתיבות שנוספו מהממשק — הקבועות מקודדות בקוד. */}
              {d.custom && (
                <button type="button" onClick={() => removeMailbox(d.email, d.label)} title="הסרת התיבה"
                  className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={12} /></button>
              )}
            </div>
          )
        })}
        <button type="button" onClick={() => setShowAdd(v => !v)}
          className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-dashed border-[#C0912F] px-2.5 py-1.5 text-xs font-bold text-[#142036]">
          <Plus size={13} /> הוספת תיבה
        </button>
      </div>
      {showAdd && (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-[#E3DED3] bg-[#FBFAF6] p-2">
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="שם התיבה, לדוגמה: תרומות"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="name@chasamsofer.info" dir="ltr"
            className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-left text-sm" />
          <button type="button" onClick={addMailbox} disabled={addingBox}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60">
            {addingBox ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} הוסף
          </button>
        </div>
      )}
      {(err || okMsg) && (
        <div className={`flex items-center gap-1.5 text-xs font-bold ${err ? 'text-red-600' : 'text-emerald-700'}`}>
          {err ? <AlertCircle size={13} /> : <Check size={13} />} {err || okMsg}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
          <Mail size={18} className="text-navy" /> מענה אוטומטי לתיבות המייל
        </h2>
        <p className="mt-1 text-sm text-slate-500">לכל תיבה נוסח משלה. לוחצים על כל חלק במייל ועורכים אותו במקום.</p>
      </div>

      {dept && s && dept.key !== 'mailing' && (
        <AutoReplyLiveEditor dept={dept} config={draft} s={s} dirty={dirty} saving={saving}
          onPatch={changes => patch(dept.key, changes)} onSave={save} boxBar={boxBar} />
      )}
      {dept?.key === 'mailing' && (
        <div className="overflow-hidden rounded-2xl border border-[#E3DED3] bg-white">
          {boxBar}
          <div className="p-4"><GilyonotReplyEditor /></div>
          {dirty && (
            <div className="flex justify-end border-t border-[#E3DED3] p-3">
              <button onClick={save} disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} שמירה
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
