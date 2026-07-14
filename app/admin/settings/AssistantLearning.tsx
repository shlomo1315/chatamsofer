'use client'
import { useState, useEffect, useCallback } from 'react'
import { Loader2, Plus, Trash2, AlertCircle, Check, BrainCircuit, TrendingUp } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// למידת העוזר.
//
// המודל עצמו אינו ניתן לאימון — אבל הזיכרון שלו כן. כאן רואים אילו שאלות
// הוא לא הצליח לענות עליהן, ומוסיפים ידע שייכנס להנחיה שלו בשיחה הבאה.
// המונחים והניסוחים שהצוות חוזר עליהם נלמדים אוטומטית.
// ─────────────────────────────────────────────────────────────────────────────

interface Failed {
  id: string
  question: string
  answer: string
  outcome: string
  user_name: string
  created_at: string
}

interface Knowledge {
  id: string
  content: string
  source?: string | null
  created_at: string
}

interface Data {
  stats: { total: number; answered: number; failed: number; successRate: number }
  failed: Failed[]
  common: { question: string; times: number }[]
  knowledge: Knowledge[]
}

const fmt = (d: string) => new Date(d).toLocaleDateString('he-IL')

export default function AssistantLearning() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState('')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    fetch('/api/admin/assistant/learn')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const addKnowledge = async (content: string, src?: string) => {
    const text = content.trim()
    if (!text || busy) return

    setBusy(true); setMsg('')
    try {
      const res = await fetch('/api/admin/assistant/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, source: src }),
      })
      const d = await res.json()
      if (!res.ok) { setMsg(d.error ?? 'השמירה נכשלה'); return }

      setAdding(''); setSource('')
      setMsg('הידע נוסף — העוזר ישתמש בו מהשיחה הבאה')
      setTimeout(() => setMsg(''), 4000)
      load()
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/admin/assistant/learn?id=${id}`, { method: 'DELETE' })
    load()
  }

  if (loading) {
    return <div className="flex items-center gap-2 text-slate-500 text-sm py-6"><Loader2 size={16} className="animate-spin" /> טוען…</div>
  }
  if (!data) return null

  const { stats, failed, common, knowledge } = data

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-slate-500 leading-relaxed">
        העוזר לומד מהשימוש: המונחים והניסוחים שהצוות חוזר עליהם נכנסים אוטומטית לזיכרון שלו.
        כאן רואים אילו שאלות הוא <strong>לא</strong> הצליח לענות עליהן — ואפשר ללמד אותו, כדי שבפעם הבאה יידע.
      </p>

      {/* סטטיסטיקה */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'שאלות (30 יום)', value: stats.total, color: 'bg-slate-50 border-slate-200 text-slate-800' },
          { label: 'נענו בהצלחה', value: `${stats.successRate}%`, color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
          { label: 'לא נענו', value: stats.failed, color: 'bg-amber-50 border-amber-200 text-amber-800' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border px-3 py-3 text-center ${s.color}`}>
            <p className="text-2xl font-extrabold leading-none">{s.value}</p>
            <p className="text-[11px] mt-1.5 opacity-80">{s.label}</p>
          </div>
        ))}
      </div>

      {/* שאלות שנכשלו — הלב של הלמידה */}
      {failed.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <AlertCircle size={15} className="text-amber-600" />
            שאלות שהעוזר לא הצליח לענות עליהן
          </h3>
          <p className="text-xs text-slate-500 mb-1">
            לחצו על &quot;למד את זה&quot; כדי להוסיף לו את הידע החסר.
          </p>

          <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
            {failed.map(f => (
              <div key={f.id} className="rounded-xl border border-amber-200 bg-amber-50/50 px-3.5 py-3">
                <p className="text-sm font-semibold text-slate-800">{f.question}</p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{f.answer}</p>
                <div className="flex items-center justify-between gap-2 mt-2">
                  <span className="text-[11px] text-slate-400">{f.user_name} · {fmt(f.created_at)}</span>
                  <button
                    type="button"
                    onClick={() => { setAdding(''); setSource(f.question) }}
                    className="text-[11px] font-semibold text-amber-800 bg-amber-100 border border-amber-300 rounded-lg px-2.5 py-1 hover:bg-amber-200 transition-colors"
                  >
                    למד את זה
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* הוספת ידע */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 flex flex-col gap-2.5">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
          <BrainCircuit size={15} className="text-indigo-600" />
          למד את העוזר משהו חדש
        </h3>

        {source && (
          <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-400">בעקבות:</span>
            <span className="font-medium truncate flex-1">{source}</span>
            <button onClick={() => setSource('')} className="text-slate-400 hover:text-slate-600">×</button>
          </div>
        )}

        <textarea
          value={adding}
          onChange={e => setAdding(e.target.value)}
          placeholder='לדוגמה: "כשמישהו שואל על תיק — הכוונה לבקשה." או: "בקשות הלוואה מעל 20,000 ₪ דורשות אישור מיוחד."'
          rows={2}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400"
        />

        <button
          type="button"
          onClick={() => addKnowledge(adding, source || undefined)}
          disabled={busy || !adding.trim()}
          className="self-start inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-3.5 py-2 rounded-lg transition-colors disabled:opacity-40"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          הוסף לזיכרון
        </button>

        {msg && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <Check size={13} /> {msg}
          </p>
        )}
      </div>

      {/* הידע שנצבר */}
      {knowledge.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-slate-800">הידע שהעוזר יודע ({knowledge.length})</h3>
          <div className="flex flex-col gap-1.5">
            {knowledge.map(k => (
              <div key={k.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                <p className="flex-1 text-sm text-slate-700 leading-relaxed">{k.content}</p>
                <button
                  onClick={() => remove(k.id)}
                  title="מחיקה"
                  className="text-slate-300 hover:text-red-600 transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* מה הצוות שואל — נלמד אוטומטית */}
      {common.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
            <TrendingUp size={15} className="text-emerald-600" />
            השאלות הנפוצות
          </h3>
          <p className="text-xs text-slate-500 mb-1">
            העוזר לומד מהן את המונחים שלכם — אוטומטית, בלי שתעשו כלום.
          </p>
          <div className="flex flex-col gap-1">
            {common.map((c, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm text-slate-600 px-3 py-1.5 rounded-lg bg-slate-50">
                <span className="truncate">{c.question}</span>
                <span className="text-xs text-slate-400 shrink-0">×{c.times}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
