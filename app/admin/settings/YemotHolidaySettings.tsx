'use client'

import { useEffect, useState } from 'react'
import { Loader2, Check, Type } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Msg = { text: string; audio?: string | null }
type Meta = { key: string; label: string; defaultText: string; allowAudio: boolean; placeholders?: string[]; hint?: string }

// ─────────────────────────────────────────────────────────────────────────────
// הודעות שלוחת חלוקות החגים בימות.
//
// ⚠️ הטקסטים כאן הם *מה שהמשפחה שומעת בטלפון*, וזה הערוץ המרכזי לרישום —
// חלק גדול מהמשפחות אינן גולשות. לכן כל הודעה נפרדת וניתנת לעריכה, כולל
// ההודעה למי שהמספר שלו אינו מזוהה ולמי שכבר נרשם.
//
// הודעות עם {name} / {distribution} הן דינמיות: הן מקריאות את שם המשפחה ואת שם
// החלוקה הפעילה, ולכן חובה לשמור בהן את המשתנה (השרת חוסם שמירה בלעדיו).
// ─────────────────────────────────────────────────────────────────────────────
export default function YemotHolidaySettings() {
  const toast = useToast()
  const [meta, setMeta] = useState<Meta[]>([])
  const [messages, setMessages] = useState<Record<string, Msg>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/admin/yemot-holiday/messages')
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!alive) return
        if (!ok) { toast.error(data.error || 'שגיאה בטעינה'); return }
        setMeta(data.meta ?? [])
        setMessages(data.messages ?? {})
      })
      .catch(() => { if (alive) toast.error('שגיאה בטעינת ההודעות') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true); setSavedOk(false)
    try {
      const res = await fetch('/api/admin/yemot-holiday/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'שגיאה בשמירה'); setSaving(false); return }
      setMessages(d.messages ?? messages)
      setSavedOk(true)
      setTimeout(() => setSavedOk(false), 2500)
    } catch { toast.error('שגיאת רשת') }
    setSaving(false)
  }

  if (loading) {
    return <div className="flex items-center gap-2 py-6 text-sm text-slate-400"><Loader2 size={15} className="animate-spin" /> טוען הודעות…</div>
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-[12.5px] leading-relaxed text-teal-900">
        השלוחה מזהה את המשפחה <strong>לפי מספר הטלפון שממנו התקשרו</strong> (ראשי, נוסף או של האישה),
        מקריאה את שם החלוקה הפתוחה לרישום, ומבקשת הקשה 1 לאישור. מי שכבר רשום שומע זאת ואינו נרשם פעמיים.
        <br />
        כתובת השלוחה בימות (שלוחת API): <code className="rounded bg-white px-1.5 py-0.5 text-[11px]" dir="ltr">/api/webhooks/yemot-holiday</code>
      </p>

      {meta.map(m => {
        const value = messages[m.key]?.text ?? m.defaultText
        const missingVar = (m.placeholders ?? []).filter(p => !value.includes(`{${p}}`))
        return (
          <div key={m.key} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <Type size={14} className="text-slate-400" />
              <span className="text-[13px] font-bold text-slate-800">{m.label}</span>
              {(m.placeholders ?? []).map(p => (
                <code key={p} className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-bold text-indigo-700" dir="ltr">{`{${p}}`}</code>
              ))}
            </div>
            <textarea
              value={value}
              onChange={e => setMessages(prev => ({ ...prev, [m.key]: { ...(prev[m.key] ?? {}), text: e.target.value } }))}
              rows={2}
              className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-100"
            />
            {m.hint && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{m.hint}</p>}
            {missingVar.length > 0 && (
              <p className="mt-1.5 text-[11.5px] font-bold text-red-600">
                חסר בטקסט: {missingVar.map(p => `{${p}}`).join(' ')} — בלעדיו ההודעה לא תקריא את הנתון
              </p>
            )}
            {/* ⚠️ להימנע מנקודות, מקפים וגרשיים — הם משבשים את ההקראה בימות */}
            {/[.\-"'&|]/.test(value) && (
              <p className="mt-1.5 text-[11.5px] font-bold text-amber-700">
                יש בטקסט תווים שמשבשים את ההקראה (נקודה, מקף, גרשיים) — הם יוסרו אוטומטית בשיחה
              </p>
            )}
          </div>
        )
      })}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          שמירת ההודעות
        </Button>
        {savedOk && <span className="text-[13px] font-bold text-green-600">✓ נשמר</span>}
      </div>
    </div>
  )
}
