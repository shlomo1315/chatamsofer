'use client'

// ניהול גיבויים: הורדת גיבוי מלא למחשב, גיבוי מיידי ל-Google Drive, ורשימת הגיבויים ב-Drive.
import { useEffect, useState, useCallback } from 'react'
import { Loader2, Download, UploadCloud, RefreshCw, ShieldCheck, AlertTriangle } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Backup = { id: string; name: string; createdTime: string; size: number }

export default function BackupSettings() {
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [driveConfigured, setDriveConfigured] = useState(false)
  const [backups, setBackups] = useState<Backup[]>([])

  const loadList = useCallback(async () => {
    setLoadingList(true)
    try {
      const res = await fetch('/api/admin/backup?list=1')
      const d = await res.json()
      if (res.ok) { setDriveConfigured(!!d.driveConfigured); setBackups(d.backups ?? []) }
    } catch { /* ignore */ }
    finally { setLoadingList(false) }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  async function downloadNow() {
    setDownloading(true)
    try {
      const res = await fetch('/api/admin/backup')
      if (!res.ok) throw new Error('שגיאה ביצירת הגיבוי')
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || 'backup.zip'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('הגיבוי הורד למחשב')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setDownloading(false) }
  }

  async function backupToDrive() {
    setUploading(true)
    try {
      const res = await fetch('/api/admin/backup', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה')
      toast.success(`גובה ל-Drive: ${d.filename} (${d.sizeMB}MB)`)
      loadList()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאה') }
    finally { setUploading(false) }
  }

  const fmt = (iso: string) => { try { return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) } catch { return iso } }
  const mb = (n: number) => `${Math.round(n / 1048576 * 10) / 10}MB`

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        גיבוי מלא = כל בסיס הנתונים (כל הטבלאות) + כל הקבצים המצורפים, בקובץ ZIP אחד.
        גיבוי אוטומטי יומי נשמר ב-Google Drive (שמירה: 30 יומיים + 12 שבועיים + 12 חודשיים).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={downloadNow} disabled={downloading} size="sm">
          {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} הורדת גיבוי מלא למחשב
        </Button>
        <Button onClick={backupToDrive} disabled={uploading || !driveConfigured} variant="outline" size="sm">
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} גבה עכשיו ל-Drive
        </Button>
        <Button onClick={loadList} disabled={loadingList} variant="ghost" size="sm">
          {loadingList ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} רענן
        </Button>
      </div>

      {driveConfigured ? (
        <span className="inline-flex items-center gap-1.5 text-[12px] bg-emerald-50 text-emerald-700 rounded-full px-2.5 py-1 self-start">
          <ShieldCheck size={13} /> Google Drive מחובר — גיבוי אוטומטי פעיל
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-[12px] bg-amber-50 text-amber-700 rounded-full px-2.5 py-1 self-start">
          <AlertTriangle size={13} /> Google Drive אינו מוגדר — הגדירו GOOGLE_DRIVE_SA_KEY ו-GOOGLE_DRIVE_BACKUP_FOLDER_ID
        </span>
      )}

      {driveConfigured && (
        <div className="rounded-xl border border-slate-200 overflow-hidden mt-1">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-600">גיבויים ב-Drive ({backups.length})</div>
          {loadingList ? (
            <div className="py-6 text-center text-slate-400 text-sm flex items-center justify-center gap-2"><Loader2 size={15} className="animate-spin" /> טוען…</div>
          ) : backups.length === 0 ? (
            <p className="py-6 text-center text-slate-400 text-sm">עדיין אין גיבויים</p>
          ) : (
            <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
              {backups.map(b => (
                <div key={b.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="text-slate-700 ltr-num truncate">{b.name}</span>
                  <span className="text-slate-400 flex-shrink-0">{mb(b.size)} · {fmt(b.createdTime)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
