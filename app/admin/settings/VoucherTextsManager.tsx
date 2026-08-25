'use client'
import PdfCanvasView from '@/components/ui/PdfCanvasView'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, Save, RotateCcw, FileText } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { VOUCHER_TEXT_GROUPS } from '@/lib/voucherTextsCatalog'

// עריכת טקסטי שוברי היולדות + תצוגת PDF חיה. טאב לכל שובר; בצד ימין עריכה,
// בצד שמאל ה-PDF האמיתי שמתעדכן לפי הטיוטה (בלי לשמור).
export default function VoucherTextsManager() {
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'card' | 'recovery' | 'instructions'>('card')
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [defaults, setDefaults] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  const lastUrl = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/voucher-texts')
      const d = await res.json()
      if (res.ok) { setSaved(d.texts ?? {}); setDraft(d.texts ?? {}); setDefaults(d.defaults ?? {}) }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  // רינדור ה-PDF החי לפי הטיוטה — נדחה 400ms אחרי שינוי/החלפת טאב.
  const renderPreview = useCallback(async (tab: string, texts: Record<string, string>) => {
    setPdfLoading(true)
    try {
      const res = await fetch('/api/admin/maternity/voucher-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: tab, texts }),
      })
      if (!res.ok) throw new Error('preview failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current)
      lastUrl.current = url
      setPdfUrl(url)
    } catch { /* שומרים את התצוגה הקודמת */ } finally { setPdfLoading(false) }
  }, [])

  useEffect(() => {
    if (loading) return
    const t = setTimeout(() => { void renderPreview(activeTab, draft) }, 400)
    return () => clearTimeout(t)
  }, [activeTab, draft, loading, renderPreview])

  // ניקוי blob URL בעת פירוק
  useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current) }, [])

  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/voucher-texts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: draft }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'השמירה נכשלה')
      setSaved(d.texts ?? {}); setDraft(d.texts ?? {})
      toast.success('הטקסטים נשמרו והשוברים עודכנו')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally { setSaving(false) }
  }

  const resetField = (key: string) =>
    setDraft(d => { const n = { ...d }; delete n[key]; return n })

  if (loading) return <div className="py-6 text-center text-slate-400"><Loader2 className="inline animate-spin" size={18} /></div>

  const group = VOUCHER_TEXT_GROUPS.find(g => g.id === activeTab)!

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-xs leading-relaxed text-slate-500">
        עריכת הטקסטים של שוברי היולדות. משמאל — תצוגת ה-PDF האמיתית (עם נתוני דמו),
        מתעדכנת תוך כדי הקלדה. השינויים נכנסים לתוקף רק אחרי <strong>שמירה</strong>.
      </p>

      {/* טאבים */}
      <div className="flex gap-1.5 border-b border-slate-200">
        {VOUCHER_TEXT_GROUPS.map(g => (
          <button key={g.id} type="button" onClick={() => setActiveTab(g.id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg transition-colors ${activeTab === g.id ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-500' : 'text-slate-500 hover:text-slate-700'}`}>
            <FileText size={13} className="inline ml-1.5" />{g.title}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* עריכה */}
        <div className="flex flex-col gap-3">
          {group.fields.map(f => {
            const val = draft[f.key] ?? ''
            const edited = val.trim() && val !== f.default
            return (
              <div key={f.key} className={`rounded-xl border p-3 ${edited ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200'}`}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">{f.label}{edited && <span className="mr-1.5 text-[10px] text-indigo-500">(נערך)</span>}</label>
                  {edited && (
                    <button type="button" onClick={() => resetField(f.key)} title="החזרה לברירת המחדל"
                      className="text-slate-400 hover:text-slate-600"><RotateCcw size={12} /></button>
                  )}
                </div>
                {f.multiline ? (
                  <textarea value={val} rows={3} placeholder={f.default}
                    onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                ) : (
                  <input value={val} placeholder={f.default}
                    onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200" />
                )}
              </div>
            )
          })}
        </div>

        {/* תצוגת PDF חיה */}
        <div className="lg:sticky lg:top-4 self-start w-full">
          <div className="relative rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: '78vh' }}>
            {pdfLoading && (
              <div className="absolute top-2 left-2 z-10 bg-white/90 rounded-lg px-2 py-1 text-xs text-slate-500 flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> מעדכן…
              </div>
            )}
            {/* 🔴 canvas ולא iframe — נטפרי חוסם PDF ב-iframe. */}
            {pdfUrl ? (
              <PdfCanvasView url={pdfUrl} name="שובר" className="w-full" />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm"><Loader2 size={18} className="animate-spin" /></div>
            )}
          </div>
        </div>
      </div>

      {/* סרגל שמירה */}
      {dirty && (
        <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white shadow-lg px-4 py-3">
          <span className="text-sm text-slate-600">יש שינויים שלא נשמרו</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDraft(saved)} disabled={saving}
              className="text-sm text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50">ביטול</button>
            <button type="button" onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} שמירה
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
