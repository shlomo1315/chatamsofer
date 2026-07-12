'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Users, FileText, Eye, Send, Loader2, Save, Check, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import SegmentBuilder from '@/components/newsletter/SegmentBuilder'
import BlockEditor from '@/components/newsletter/BlockEditor'
import type { SegmentDef } from '@/lib/newsletter/segments'
import type { Block } from '@/lib/newsletter/blocks'
import { DEPARTMENTS } from '@/lib/departments'

export interface Campaign {
  id: string
  name: string
  subject: string
  preheader: string | null
  from_department: string
  content: Block[]
  content_mode: 'blocks' | 'html'
  raw_html: string | null
  segment: SegmentDef
  status: string
}

const STEPS = [
  { key: 'audience', label: 'נמענים', icon: Users },
  { key: 'content',  label: 'תוכן',   icon: FileText },
  { key: 'preview',  label: 'תצוגה מקדימה', icon: Eye },
  { key: 'send',     label: 'שליחה',  icon: Send },
] as const

// מעל כמות זו, נדרש לאשר את מספר הנמענים בהקלדה — הגנה משליחה בשוגג
const CONFIRM_THRESHOLD = 500

export default function CampaignWizard({ campaign: initial }: { campaign: Campaign }) {
  const router = useRouter()
  const toast = useToast()

  const [step, setStep] = useState(0)
  const [c, setC] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const patch = useCallback(<K extends keyof Campaign>(key: K, val: Campaign[K]) => {
    setC(prev => ({ ...prev, [key]: val }))
    setDirty(true)
  }, [])

  const save = useCallback(async (silent = false) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name, subject: c.subject, preheader: c.preheader,
          from_department: c.from_department,
          content: c.content, content_mode: c.content_mode, raw_html: c.raw_html,
          segment: c.segment,
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שמירה נכשלה')
      setDirty(false)
      if (!silent) toast.success('נשמר')
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
      return false
    } finally { setSaving(false) }
  }, [c, toast])

  // שמירה אוטומטית כל 20 שניות אם יש שינויים
  useEffect(() => {
    if (!dirty) return
    const t = setTimeout(() => { void save(true) }, 20000)
    return () => clearTimeout(t)
  }, [dirty, save])

  async function next() {
    await save(true)
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link href="/admin/newsletter"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
        <ArrowRight size={15} /> חזרה לקמפיינים
      </Link>

      <div className="mb-5 flex items-start justify-between gap-4">
        <input
          value={c.name}
          onChange={e => patch('name', e.target.value)}
          className="w-full max-w-md rounded-lg border border-transparent bg-transparent px-2 py-1
                     text-2xl font-bold text-slate-800 hover:border-slate-200
                     focus:border-indigo-300 focus:bg-white focus:outline-none"
        />
        <button
          onClick={() => save()}
          disabled={saving || !dirty}
          className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-xl border border-slate-200
                     bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 transition
                     hover:bg-slate-50 disabled:opacity-40"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : dirty ? <Save size={14} /> : <Check size={14} />}
          {saving ? 'שומר…' : dirty ? 'שמירה' : 'נשמר'}
        </button>
      </div>

      {/* שלבים */}
      <div className="mb-6 flex gap-1.5">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const active = i === step
          const done = i < step
          return (
            <button
              key={s.key}
              onClick={() => setStep(i)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5
                          text-sm font-semibold transition ${
                active ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                : done ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
              }`}
            >
              {done ? <Check size={15} /> : <Icon size={15} />}
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* שלב 1 — נמענים */}
      {step === 0 && (
        <SegmentBuilder value={c.segment ?? {}} onChange={v => patch('segment', v)} />
      )}

      {/* שלב 2 — תוכן */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              שורת נושא <span className="font-normal text-slate-400">(תומכת במשתני מיזוג)</span>
            </label>
            <input
              value={c.subject}
              onChange={e => patch('subject', e.target.value)}
              placeholder="למשל: {{שם_משפחה}}, עדכון חשוב לקראת החג"
              className="mb-4 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              טקסט מקדים <span className="font-normal text-slate-400">(מוצג לצד הנושא בתיבת הדואר)</span>
            </label>
            <input
              value={c.preheader ?? ''}
              onChange={e => patch('preheader', e.target.value)}
              className="mb-4 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />

            <label className="mb-1.5 block text-sm font-semibold text-slate-700">נשלח מטעם</label>
            <select
              value={c.from_department}
              onChange={e => patch('from_department', e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                         focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              {Object.values(DEPARTMENTS).map(d => (
                <option key={d.key} value={d.key}>{d.label} · {d.email}</option>
              ))}
            </select>
          </div>

          <BlockEditor
            blocks={c.content ?? []}
            onChange={b => patch('content', b)}
            mode={c.content_mode}
            onModeChange={m => patch('content_mode', m)}
            rawHtml={c.raw_html ?? ''}
            onRawHtmlChange={h => patch('raw_html', h)}
          />
        </div>
      )}

      {/* שלב 3 — תצוגה מקדימה */}
      {step === 2 && <PreviewStep campaignId={c.id} onSave={() => save(true)} dirty={dirty} />}

      {/* שלב 4 — שליחה */}
      {step === 3 && (
        <SendStep
          campaignId={c.id}
          onSave={() => save(true)}
          onSent={() => router.refresh()}
        />
      )}

      {/* ניווט */}
      <div className="mt-6 flex justify-between">
        <button
          onClick={() => setStep(s => Math.max(s - 1, 0))}
          disabled={step === 0}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold
                     text-slate-600 transition hover:bg-slate-50 disabled:opacity-30"
        >
          הקודם
        </button>
        {step < STEPS.length - 1 && (
          <button
            onClick={next}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white
                       transition hover:bg-indigo-700"
          >
            הבא
          </button>
        )}
      </div>
    </div>
  )
}

// ── תצוגה מקדימה עם נתונים אמיתיים ──
function PreviewStep({ campaignId, onSave, dirty }: {
  campaignId: string; onSave: () => Promise<boolean>; dirty: boolean
}) {
  const toast = useToast()
  const [data, setData] = useState<{ html: string; subject: string; sampleEmail: string | null; index: number; total: number } | null>(null)
  const [i, setI] = useState(0)
  const [loading, setLoading] = useState(true)
  const [testTo, setTestTo] = useState('')
  const [sendingTest, setSendingTest] = useState(false)

  const load = useCallback(async (idx: number) => {
    setLoading(true)
    try {
      if (dirty) await onSave()
      const res = await fetch(`/api/admin/campaigns/${campaignId}/preview?i=${idx}`)
      if (res.ok) setData(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [campaignId, dirty, onSave])

  useEffect(() => { load(i) }, [i]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendTest() {
    if (!testTo.includes('@')) { toast.error('כתובת לא תקינה'); return }
    setSendingTest(true)
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testTo }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error)
      toast.success(`מייל בדיקה נשלח אל ${testTo}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally { setSendingTest(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-slate-500">תצוגה עבור: </span>
            <strong className="text-slate-800">{data?.sampleEmail ?? 'נמען לדוגמה'}</strong>
            {data && data.total > 1 && (
              <span className="text-xs text-slate-400"> ({i + 1} מתוך {data.total})</span>
            )}
          </div>
          {data && data.total > 1 && (
            <div className="flex gap-1">
              <button onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs disabled:opacity-30">
                הקודם
              </button>
              <button onClick={() => setI(x => Math.min(data.total - 1, x + 1))} disabled={i >= data.total - 1}
                      className="rounded-lg border border-slate-200 px-3 py-1 text-xs disabled:opacity-30">
                הבא
              </button>
            </div>
          )}
        </div>

        {data && (
          <div className="mb-3 rounded-xl bg-slate-50 px-4 py-2.5">
            <div className="text-xs text-slate-400">נושא</div>
            <div className="text-sm font-semibold text-slate-800">{data.subject}</div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-slate-400"><Loader2 className="inline animate-spin" /></div>
        ) : (
          <iframe
            srcDoc={data?.html ?? ''}
            className="w-full rounded-xl border border-slate-200 bg-white"
            style={{ height: '65vh' }}
            title="תצוגה מקדימה"
          />
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="mb-1 font-bold text-slate-800">מייל בדיקה</h3>
        <p className="mb-3 text-xs text-slate-500">שלח לעצמך כדי לראות איך זה נראה בפועל בתיבת הדואר</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm
                       focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            onClick={sendTest}
            disabled={sendingTest}
            className="rounded-xl border border-indigo-200 bg-white px-5 py-2.5 text-sm font-bold
                       text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40"
          >
            {sendingTest ? <Loader2 size={15} className="animate-spin" /> : 'שליחת בדיקה'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── שליחה, עם הגנה משליחה בשוגג ──
function SendStep({ campaignId, onSave, onSent }: {
  campaignId: string; onSave: () => Promise<boolean>; onSent: () => void
}) {
  const toast = useToast()
  const [count, setCount] = useState<number | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/campaigns/${campaignId}/preview`)
      .then(r => r.json())
      .then(d => setCount(d.total ?? 0))
      .catch(() => setCount(0))
  }, [campaignId])

  const needsConfirm = (count ?? 0) >= CONFIRM_THRESHOLD
  const canSend = count !== null && count > 0 &&
    (!needsConfirm || confirmText.trim() === String(count))

  async function send() {
    setSending(true)
    try {
      await onSave()
      const res = await fetch(`/api/admin/campaigns/${campaignId}/send`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שליחה נכשלה')

      toast.success(`השליחה החלה — ${d.total.toLocaleString('he-IL')} נמענים`)
      onSent()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
      setSending(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="mb-1 text-lg font-bold text-slate-800">שליחת הקמפיין</h2>
      <p className="mb-5 text-sm text-slate-500">
        השליחה מתבצעת ברקע. אפשר לעצור אותה באמצע בכל רגע.
      </p>

      <div className="mb-5 rounded-2xl border-2 border-indigo-100 bg-indigo-50 p-5 text-center">
        <div className="mb-1 text-xs font-semibold text-indigo-600">עומד להישלח אל</div>
        <div className="text-4xl font-black text-indigo-900">
          {count === null ? '…' : count.toLocaleString('he-IL')}
        </div>
        <div className="mt-1 text-xs text-indigo-600">נמענים</div>
      </div>

      {count === 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
          <AlertTriangle size={17} className="mt-0.5 flex-shrink-0" />
          <span>אין נמענים בקהל שנבחר. חזור לשלב "נמענים" ושנה את המסננים.</span>
        </div>
      )}

      {needsConfirm && (
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-semibold text-rose-700">
            הקלד <strong>{count?.toLocaleString('he-IL')}</strong> כדי לאשר שליחה לכמות גדולה
          </label>
          <input
            value={confirmText}
            onChange={e => setConfirmText(e.target.value)}
            placeholder={String(count)}
            className="w-full rounded-xl border border-rose-200 px-3.5 py-2.5 text-sm
                       focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
          />
        </div>
      )}

      <button
        onClick={send}
        disabled={!canSend || sending}
        className="w-full rounded-xl bg-indigo-600 py-3.5 text-sm font-bold text-white transition
                   hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sending
          ? <><Loader2 size={16} className="ml-2 inline animate-spin" /> מתחיל שליחה…</>
          : <><Send size={16} className="ml-2 inline" /> שלח עכשיו</>}
      </button>

      <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
        כל מייל יכלול קישור הסרה מרשימת התפוצה, כנדרש בחוק.<br/>
        מי שהוסר בעבר לא ייכלל בשליחה.
      </p>
    </div>
  )
}
