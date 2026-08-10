'use client'

// תיקון חד-פעמי: החזרת משפחות שנדחו אוטומטית מעץ הדורות ל"ממתין לאישור".
// מציג תחילה את הרשימה המלאה, ורק אז מאפשר להחזיר — כדי שההחלטה תתקבל
// מול השמות עצמם ולא מול מספר.
import { useState } from 'react'
import { Loader2, AlertTriangle, RotateCcw, CheckCircle2, Search } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Family = { id: string; name: string; idNumber: string | null; rejectedAt: string | null }

export default function LineageRejectionRepair() {
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const [families, setFamilies] = useState<Family[]>([])
  const [restoring, setRestoring] = useState(false)
  const [done, setDone] = useState<number | null>(null)

  // נטען בלחיצה ולא באפקט: זהו כלי תיקון חד-פעמי, ואין סיבה שכל פתיחה של
  // מסך ההגדרות תריץ סריקה על טבלת הצאצאים.
  async function check() {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/lineage-rejection-repair')
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      setFamilies(d.families ?? [])
      setChecked(true)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setLoading(false) }
  }

  async function restore() {
    if (!confirm(`להחזיר ${families.length} משפחות ל"ממתין לאישור"?\n\nהן יחזרו לתור ההחלטה שלך. פעולה זו אינה שולחת מייל לאיש.`)) return
    setRestoring(true)
    try {
      const res = await fetch('/api/admin/lineage-rejection-repair', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      setDone(d.restored)
      setFamilies([])
      toast.success(d.summary)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setRestoring(false) }
  }

  if (!checked && done === null) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-slate-600 leading-relaxed">
          בין 04/08 ל-10/08 דחיית צומת בעץ הדורות סימנה אוטומטית כ&quot;נדחה&quot; את כל המשפחות שתחתיו.
          התקלה תוקנה. כאן אפשר לראות אילו משפחות נפגעו ולהחזיר אותן ל&quot;ממתין לאישור&quot;.
        </p>
        <Button onClick={check} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          בדוק אילו משפחות נדחו אוטומטית
        </Button>
      </div>
    )
  }

  if (done !== null || !families.length) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-green-100 bg-green-50 p-3 text-sm text-green-800">
        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
        <div>
          {done !== null
            ? `${done} משפחות הוחזרו ל"ממתין לאישור".`
            : 'אין משפחות שנדחו אוטומטית מהעץ — אין מה לתקן.'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold">{families.length} משפחות נדחו אוטומטית מעץ הדורות</p>
          <p className="mt-1 leading-relaxed">
            בין 04/08 ל-10/08 דחיית צומת בעץ סימנה אוטומטית כ&quot;נדחה&quot; את כל המשפחות שתחתיו.
            התקלה תוקנה ולא תחזור. ההחזרה מחזירה אותן ל&quot;ממתין לאישור&quot; כדי שההחלטה תהיה שלך.
            <br />
            <span className="font-semibold">הסטטוס הקודם שלהן נדרס ואינו ניתן לשחזור</span> — משפחה שהייתה
            מאושרת לפני כן תזדקק לאישור מחדש.
          </p>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">משפחה</th>
              <th className="px-3 py-2 font-medium">ת&quot;ז</th>
              <th className="px-3 py-2 font-medium">נדחתה בתאריך</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {families.map(f => (
              <tr key={f.id} className="hover:bg-slate-50">
                <td className="px-3 py-2">{f.name}</td>
                <td className="px-3 py-2 text-slate-500">{f.idNumber || '—'}</td>
                <td className="px-3 py-2 text-slate-500">
                  {f.rejectedAt ? new Date(f.rejectedAt).toLocaleDateString('he-IL') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button onClick={restore} disabled={restoring}>
        {restoring ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
        החזר {families.length} משפחות ל&quot;ממתין לאישור&quot;
      </Button>
    </div>
  )
}
