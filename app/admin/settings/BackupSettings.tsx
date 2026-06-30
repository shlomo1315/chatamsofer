'use client'

// ניהול גיבויים: הורדת גיבוי מלא למחשב, גיבוי מיידי ל-Google Drive, ורשימת הגיבויים ב-Drive.
import { useEffect, useState, useCallback, useRef } from 'react'
import { Loader2, Download, UploadCloud, RefreshCw, ShieldCheck, AlertTriangle, RotateCcw } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type Backup = { id: string; name: string; createdTime: string; size: number }
type RestoreResult = { ok: boolean; tables: { table: string; restored: number; error?: string }[]; filesRestored: number; fileErrors: number }

export default function BackupSettings() {
  const toast = useToast()
  const [downloading, setDownloading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingList, setLoadingList] = useState(true)
  const [driveConfigured, setDriveConfigured] = useState(false)
  const [backups, setBackups] = useState<Backup[]>([])
  const [restoring, setRestoring] = useState(false)
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  async function restoreFromFile(file: File) {
    const sizeMB = Math.round(file.size / 1048576 * 10) / 10
    if (!window.confirm(
      `⚠️ שחזור מקובץ "${file.name}" (${sizeMB}MB)\n\n` +
      `הפעולה תטען את כל הנתונים והקבצים מהגיבוי בחזרה למערכת, ` +
      `ותעדכן (תדרוס) רשומות קיימות בעלות אותו מזהה.\n\n` +
      `מומלץ לבצע גיבוי עדכני לפני השחזור. להמשיך?`
    )) { if (fileRef.current) fileRef.current.value = ''; return }

    setRestoring(true); setRestoreResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/backup', { method: 'PUT', body: fd })
      const d = await res.json()
      if (res.status === 403 || res.status === 400 || res.status === 500) throw new Error(d.error || 'שגיאת שחזור')
      setRestoreResult(d)
      const totalRows = (d.tables ?? []).reduce((s: number, t: { restored: number }) => s + t.restored, 0)
      if (d.ok) toast.success(`השחזור הושלם — ${totalRows} רשומות, ${d.filesRestored} קבצים`)
      else toast.error('השחזור הסתיים עם שגיאות חלקיות — ראה פירוט')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'שגיאת שחזור') }
    finally { setRestoring(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const fmt = (iso: string) => { try { return new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) } catch { return iso } }
  const mb = (n: number) => `${Math.round(n / 1048576 * 10) / 10}MB`

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        גיבוי מלא = כל בסיס הנתונים (כל הטבלאות) + כל הקבצים המצורפים, בקובץ ZIP אחד.
        גיבוי אוטומטי רץ כל לילה ב-00:00 ל-Google Drive. הניקוי של הגיבויים הישנים מתבצע
        אוטומטית פעם בחודש — נשמר רק החודש האחרון (תמיד לפחות 7 האחרונים).
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
          <AlertTriangle size={13} /> Google Drive אינו מחובר — חברו מחדש חשבון Google (עם הרשאת Drive) והגדירו GOOGLE_DRIVE_BACKUP_FOLDER_ID
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

      {/* ─── שחזור מקובץ ZIP ─── */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 mt-2 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <RotateCcw size={15} /> שחזור מגיבוי
        </div>
        <p className="text-xs text-amber-800 leading-relaxed">
          העלאת קובץ ZIP של גיבוי מלא תטען בחזרה את כל הנתונים והקבצים למערכת.
          רשומות קיימות עם אותו מזהה יתעדכנו (יידרסו). מומלץ לגבות לפני שחזור.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) restoreFromFile(f) }}
        />
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={restoring}
          variant="outline"
          size="sm"
          className="self-start border-amber-300 text-amber-800 hover:bg-amber-100"
        >
          {restoring ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />} העלאת קובץ ZIP לשחזור
        </Button>

        {restoreResult && (
          <div className="rounded-lg border border-amber-200 bg-white overflow-hidden text-xs mt-1">
            <div className="px-3 py-2 bg-amber-100/60 font-semibold text-amber-900">
              {restoreResult.ok ? 'השחזור הושלם בהצלחה' : 'השחזור הסתיים עם שגיאות חלקיות'} ·
              {' '}{restoreResult.filesRestored} קבצים שוחזרו{restoreResult.fileErrors > 0 ? ` (${restoreResult.fileErrors} שגיאות)` : ''}
            </div>
            <div className="divide-y divide-slate-50 max-h-56 overflow-y-auto">
              {restoreResult.tables.map(t => (
                <div key={t.table} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="text-slate-600">{t.table}</span>
                  {t.error
                    ? <span className="text-red-600 truncate">שגיאה: {t.error}</span>
                    : <span className="text-emerald-600">{t.restored} רשומות</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
