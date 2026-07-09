'use client'

// סנכרון מייל קודם: חיבור תיבת Gmail ישנה + כפתור רענון שמושך מיילים חדשים.
import { useEffect, useState, useCallback } from 'react'
import { Loader2, RefreshCw, Link2, CheckCircle2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Status = { connected: boolean; lastSync: string | null; unmatched: number }

export default function LegacyMailSettings() {
  const toast = useToast()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/legacy-mail/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/admin/legacy-mail/sync', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      toast.success(`נמשכו ${d.imported} מיילים חדשים (${d.matched} שויכו, ${d.unmatched} לא משויכים)`)
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setSyncing(false) }
  }

  if (loading) return <div className="py-6 text-center text-slate-400"><Loader2 className="animate-spin inline" size={18} /></div>

  return (
    <div className="flex flex-col gap-4">
      {!status?.connected ? (
        <div className="rounded-xl p-4 text-sm bg-amber-50 text-amber-800 border border-amber-200">
          <p className="font-semibold mb-2">התיבה הישנה אינה מחוברת</p>
          <p className="mb-3 text-xs leading-relaxed">חבר את תיבת ה-Gmail הישנה (קריאה בלבד) כדי למשוך ממנה מיילים היסטוריים ומיילים חדשים שמצטברים בתקופת המעבר.</p>
          <a href="/api/auth/gmail-legacy"><Button variant="primary"><Link2 size={16} /> חיבור תיבת Gmail ישנה</Button></a>
        </div>
      ) : (
        <>
          <div className="rounded-xl p-4 text-sm bg-green-50 text-green-800 border border-green-200 flex items-center gap-2">
            <CheckCircle2 size={18} /> <span className="font-semibold">מחובר</span>
            {status.lastSync && <span className="text-xs text-green-600 mr-auto">רענון אחרון: {new Date(status.lastSync).toLocaleString('he-IL')}</span>}
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600">
              {status.unmatched > 0 ? <span>{status.unmatched} מיילים לא משויכים ממתינים לטיפול</span> : <span>כל המיילים משויכים</span>}
            </div>
            <Button variant="primary" onClick={sync} disabled={syncing}>
              {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {syncing ? 'מושך...' : 'רענון נתונים מהמייל הקודם'}
            </Button>
          </div>
          <p className="text-xs text-slate-400">הרענון מושך רק מיילים חדשים שטרם יובאו. הרענון הראשון עשוי לקחת זמן רב (כל ההיסטוריה).</p>
        </>
      )}
    </div>
  )
}
