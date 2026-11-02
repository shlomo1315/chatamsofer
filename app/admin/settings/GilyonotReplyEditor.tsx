'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Save, Eye, Check, AlertCircle, Plus, Trash2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// עריכת מייל ההרשמה לגיליונות (d@), בתוך תיבת "דיוור" במסך המענה האוטומטי.
// שלוש לשוניות (נרשם עכשיו / כבר רשום / הוסר בעבר) ובלוק משותף.
// התצוגה המקדימה נבנית בשרת מאותה פונקציה ששולחת בפועל, וניתנת ב-iframe מבודד.
// ─────────────────────────────────────────────────────────────────────────────

interface Field { key: string; label: string; default: string; multiline?: boolean; vars?: string[] }
interface Spec { id: string; title: string; fields: Field[] }
type Texts = Record<string, Record<string, string>>
type Previews = Record<string, { subject: string; html: string }>
interface Contact { label: string; email: string }

const TABS = [
  { key: 'added', id: 'gilyonot_reply_added', label: 'נרשם עכשיו' },
  { key: 'exists', id: 'gilyonot_reply_exists', label: 'כבר רשום' },
  { key: 'blocked', id: 'gilyonot_reply_blocked', label: 'הוסר בעבר' },
] as const
const SHARED = 'gilyonot_reply_shared'

const inputCls = 'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-gold outline-none'

export default function GilyonotReplyEditor() {
  const [specs, setSpecs] = useState<Spec[]>([])
  const [savedTexts, setSavedTexts] = useState<Texts>({})
  const [draft, setDraft] = useState<Texts>({})
  const [previews, setPreviews] = useState<Previews>({})
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('added')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    fetch('/api/admin/gilyonot-reply')
      .then(r => r.json())
      .then(d => {
        setSpecs(d.specs ?? []); setSavedTexts(d.texts ?? {}); setDraft(d.texts ?? {}); setPreviews(d.previews ?? {})
      })
      .catch(() => setErr('הטעינה נכשלה'))
      .finally(() => setLoading(false))
  }, [])

  const spec = (id: string) => specs.find(s => s.id === id)
  const value = (id: string, f: Field) => draft[id]?.[f.key] ?? f.default
  const set = (id: string, key: string, v: string) => {
    setOkMsg('')
    setDraft(d => ({ ...d, [id]: { ...d[id], [key]: v } }))
  }

  const contactsField = spec(SHARED)?.fields.find(f => f.key === 'contacts')
  const contacts: Contact[] = useMemo(() => {
    if (!contactsField) return []
    try { return JSON.parse(draft[SHARED]?.contacts ?? contactsField.default) } catch { return [] }
  }, [draft, contactsField])
  const setContacts = (c: Contact[]) => set(SHARED, 'contacts', JSON.stringify(c))

  /** רק מה שנבדל מברירת המחדל נשמר, כדי ששינוי עתידי בנוסח הבסיס יגיע גם למי שלא ערך. */
  const toSave = (): Texts => {
    const out: Texts = {}
    for (const s of specs) {
      for (const f of s.fields) {
        const v = draft[s.id]?.[f.key]
        if (v !== undefined && v.trim() !== '' && v !== f.default) (out[s.id] ??= {})[f.key] = v
      }
    }
    return out
  }
  const dirty = JSON.stringify(toSave()) !== JSON.stringify(savedTexts)

  // תצוגה מקדימה חיה (מושהית), מהשרת
  useEffect(() => {
    if (!specs.length) return
    const t = setTimeout(() => {
      fetch('/api/admin/gilyonot-reply', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: toSave() }),
      }).then(r => r.json()).then(d => { if (d.previews) setPreviews(d.previews) }).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, specs])

  const preview = previews[tab]
  useEffect(() => {
    const doc = frameRef.current?.contentDocument
    if (!doc || !preview) return
    doc.open(); doc.write(preview.html); doc.close()
  }, [preview])

  const save = async () => {
    setSaving(true); setErr(''); setOkMsg('')
    try {
      const body = toSave()
      const r = await fetch('/api/admin/gilyonot-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts: body }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'השמירה נכשלה')
      setSavedTexts(body); setOkMsg('נשמר. המייל הבא שיישלח ל-d@ ייצא בנוסח החדש')
    } catch (e) { setErr(e instanceof Error ? e.message : 'השמירה נכשלה') }
    finally { setSaving(false) }
  }

  const resetTab = (id: string) => {
    setOkMsg('')
    setDraft(d => { const n = { ...d }; delete n[id]; return n })
  }

  if (loading) return <div className="py-10 flex justify-center text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
  const cur = TABS.find(t => t.key === tab)!
  const curSpec = spec(cur.id)
  const shared = spec(SHARED)
  const noreply = shared?.fields.find(f => f.key === 'noreply')

  return (
    <div className="flex flex-col lg:flex-row gap-5">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <p className="text-[12px] text-slate-500 leading-relaxed">
          המייל שנשלח אוטומטית למי שכותב ל-<span dir="ltr" className="font-bold">d@chasamsofer.info</span>.
          העיצוב קבוע, ואפשר לערוך את הטקסטים. תיבת המייל עצמה אינה נקראת, ולכן הפניות מופנות לכתובות למטה.
        </p>

        <div role="tablist" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100">
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`rounded-lg px-2 py-2 text-xs font-bold transition-colors ${
                tab === t.key ? 'bg-white text-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {curSpec && (
          <div className="flex flex-col gap-3">
            {curSpec.fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-bold text-slate-600 mb-1">{f.label}</label>
                {f.key === 'hello' && (
                  <p className="text-[11px] text-slate-400 mb-1.5">
                    <span dir="ltr" className="font-bold">{'{{שם}}'}</span> מוחלף בשם הפונה אוטומטית, ובלי שם יוצג &quot;רב&quot;.
                  </p>
                )}
                {f.multiline ? (
                  <textarea rows={3} value={value(cur.id, f)} onChange={e => set(cur.id, f.key, e.target.value)}
                    className={`${inputCls} leading-relaxed resize-y`} />
                ) : (
                  <input value={value(cur.id, f)} onChange={e => set(cur.id, f.key, e.target.value)} className={inputCls} />
                )}
              </div>
            ))}
            <button type="button" onClick={() => resetTab(cur.id)}
              className="self-start text-[11px] font-bold text-slate-500 hover:text-slate-700 underline">
              החזר את הלשונית לנוסח המקורי
            </button>
          </div>
        )}

        {/* ── בלוק משותף לשלושת המיילים ── */}
        <div className="rounded-xl border border-red-200 bg-red-50/40 p-3 flex flex-col gap-3">
          <span className="text-xs font-black text-red-900">בלוק משותף (בתחתית שלושת המיילים)</span>
          {noreply && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">{noreply.label}</label>
              <textarea rows={2} value={value(SHARED, noreply)} onChange={e => set(SHARED, 'noreply', e.target.value)}
                className={`${inputCls} leading-relaxed resize-y`} />
            </div>
          )}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">כתובות לפניות</label>
            <div className="flex flex-col gap-2">
              {contacts.map((c, i) => (
                <div key={i} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <input value={c.label} placeholder="במה הכתובת עוסקת"
                    onChange={e => setContacts(contacts.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    className={inputCls} />
                  <input value={c.email} placeholder="name@example.com" dir="ltr"
                    onChange={e => setContacts(contacts.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                    className={inputCls} />
                  <button type="button" aria-label="הסר כתובת" onClick={() => setContacts(contacts.filter((_, j) => j !== i))}
                    className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setContacts([...contacts, { label: '', email: '' }])}
                className="self-start inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900">
                <Plus size={13} /> הוסף כתובת
              </button>
              {contacts.length === 0 && (
                <p className="text-[11px] text-slate-500">בלי כתובות, בלוק &quot;לפניות&quot; לא יוצג במייל.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" onClick={save} disabled={saving || !dirty}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-navy text-white text-sm font-bold disabled:opacity-40">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמור
          </button>
          {okMsg && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><Check size={13} /> {okMsg}</span>}
          {err && <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><AlertCircle size={13} /> {err}</span>}
        </div>
      </div>

      <div className="lg:w-[420px] shrink-0">
        <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600">
          <Eye size={13} /> תצוגה מקדימה
        </div>
        {preview ? (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 truncate">
              <span className="text-slate-400">נושא: </span>{preview.subject}
            </div>
            <iframe ref={frameRef} title="תצוגה מקדימה" sandbox="" className="w-full h-[560px] bg-white" />
          </div>
        ) : (
          <div className="h-[560px] flex items-center justify-center border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
            <Loader2 size={16} className="animate-spin" />
          </div>
        )}
      </div>
    </div>
  )
}
