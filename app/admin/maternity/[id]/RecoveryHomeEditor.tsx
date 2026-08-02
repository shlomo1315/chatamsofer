'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Home, Loader2, Check, Pencil, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useCan } from '@/components/StaffPermissions'

// בתי החלמה מובנים — נפילה-לאחור אם טבלת recovery_homes ריקה. זהה לרשימה בטופס.
const BUILTIN_HOMES = ['אם וילד', 'טלזסטון', 'ביכורים']

// עורך בית ההחלמה של היולדת — ישירות מהכרטסת, בלחיצה אחת ובלי טופס העריכה המלא.
// מיועד גם למזכירות (maternity:edit). שינוי → שמירה מיידית ל-API, ואם הלידה מאושרת
// נשלח שובר הבראה מעודכן ליולדת. ⚠️ משתמש ב-API (ולא בעדכון ישיר) כי צריך את שליחת
// השובר בצד השרת.
export default function RecoveryHomeEditor({
  aidId,
  current,
}: {
  aidId: string
  current: string | null
}) {
  const router = useRouter()
  const canEdit = useCan('maternity', 'edit')
  const supabase = createClient()
  const [editing, setEditing] = useState(false)
  const [homes, setHomes] = useState<string[]>(BUILTIN_HOMES)
  const [saving, setSaving] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')

  // טעינת רשימת בתי ההחלמה הפעילים (לא "לידה שקטה בלבד") — כמו בטופס העריכה
  useEffect(() => {
    if (!editing) return
    supabase.from('recovery_homes').select('name, availability').order('name').then(({ data }) => {
      if (data && data.length) {
        const allowed = (data as { name?: string; availability?: string }[])
          .filter(r => r.name && (r.availability ?? 'regular') !== 'silent')
          .map(r => r.name as string)
        setHomes([...new Set([...BUILTIN_HOMES, ...allowed])])
      }
    })
  }, [editing, supabase])

  const save = async (home: string) => {
    if (home === (current ?? '')) { setEditing(false); return }
    setErr(''); setNote(''); setSaving(home)
    try {
      const res = await fetch('/api/admin/maternity/recovery-home', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId, home }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setErr(data.error || 'הפעולה נכשלה'); setSaving(null); return }
      if (data.voucherResent) setNote('נשמר · שובר הבראה מעודכן נשלח למייל היולדת')
      setEditing(false)
      router.refresh()
    } catch {
      setErr('שגיאת רשת — נסה שוב')
    } finally {
      setSaving(null)
    }
  }

  // תצוגה בלבד — שם בית ההחלמה + כפתור "שינוי" (רק למי שרשאי לערוך)
  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 flex-wrap text-sm">
          <span className="text-slate-500">שם: </span>
          <span className="font-semibold text-slate-800">{current || '— לא נבחר'}</span>
          {canEdit && (
            <button type="button" onClick={() => { setEditing(true); setErr(''); setNote('') }}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-800 border border-sky-200 hover:bg-sky-50 rounded-lg px-2 py-1 transition-colors">
              <Pencil size={12} /> שינוי בית החלמה
            </button>
          )}
        </div>
        {note && <p className="flex items-center gap-1 text-xs text-emerald-600"><Check size={12} /> {note}</p>}
      </div>
    )
  }

  // עריכה — בורר בסגנון כפתורים, שמירה מיידית בלחיצה
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">בחרו בית החלמה:</span>
        <button type="button" onClick={() => setEditing(false)}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
          <X size={13} /> ביטול
        </button>
      </div>
      <div className="flex gap-2 flex-wrap">
        {homes.map(h => {
          const isCurrent = h === (current ?? '')
          return (
            <button key={h} type="button" onClick={() => save(h)} disabled={saving !== null}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${
                isCurrent ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}>
              {saving === h ? <Loader2 size={14} className="animate-spin" /> : <Home size={14} />}
              {h}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-slate-400">
        שינוי בית ההחלמה נשמר מיד. אם הלידה מאושרת — שובר הבראה מעודכן יישלח אוטומטית למייל היולדת.
      </p>
      {err && <p className="text-xs text-red-600">{err}</p>}
    </div>
  )
}
