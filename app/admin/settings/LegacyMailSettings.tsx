'use client'

// סנכרון תיבות מייל: דיווח מפולח לכל תיבה — מחלקה, סנכרון אחרון, וכמות מיילים.
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Loader2, RefreshCw, Link2, CheckCircle2, AlertTriangle, Inbox, Building2, Clock, ArrowLeftRight } from 'lucide-react'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface Mailbox {
  id: string | null
  email: string | null
  label: string
  department: string
  departmentLabel: string
  connected: boolean
  lastSyncAt: string | null
  totalSynced: number
  lastSyncCount: number
  unmatched: number
  lastError: string | null
  isLegacyToken?: boolean
  importTargetEmail?: string | null
}

interface GmailLabel { id: string; name: string }

/** מצב הבורר של "שייך תווית". null = סגור. */
interface LabelPicker {
  box: Mailbox
  target: string
  labels: GmailLabel[]
  /** '' = יצירת תווית חדשה (השם נלקח מ-newName) */
  selectedId: string
  newName: string
}

interface SyncRun {
  id: string
  started_at: string
  finished_at: string | null
  scanned: number
  imported: number
  matched: number
  failed: number
  error: string | null
}

interface Status {
  mailboxes: Mailbox[]
  runs: SyncRun[]
  totals: { synced: number; unmatched: number }
  connected: boolean
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return 'טרם סונכרן'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? 'טרם סונכרן' : d.toLocaleString('he-IL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function LegacyMailSettings() {
  const toast = useToast()
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  /** בורר התוויות של "שייך תווית". null = סגור. */
  const [picker, setPicker] = useState<LabelPicker | null>(null)
  const [labelBusy, setLabelBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/legacy-mail/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function sync(box: Mailbox, full = false) {
    const key = box.id ?? 'legacy'
    setSyncingId(key)
    try {
      const res = await fetch('/api/admin/legacy-mail/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: box.id, department: box.department, full }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שגיאה בסנכרון')

      if (d.failed > 0) {
        toast.error(`נקלטו ${d.imported}, אך ${d.failed} מיילים נכשלו. ${d.error ?? ''}`)
      } else if (d.imported === 0) {
        toast.success(full ? 'לא נמצאו מיילים חדשים בתיבה (כל ההיסטוריה כבר קיימת או ריקה)' : 'אין מיילים חדשים — הכל מסונכרן')
      } else {
        toast.success(`נקלטו ${d.imported} מיילים חדשים (${d.matched} שויכו ללקוח)`)
      }
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSyncingId(null)
    }
  }

  // ── "שייך תווית" — פותח בורר של תוויות Gmail ─────────────────────────
  //
  // 🔴 קודם הכפתור כתב תווית *פנימית* ל-app_settings ולא נגע ב-Gmail כלל.
  // מהמסך זה נראה כאילו לא קרה כלום: המנהל לחץ, פתח את התיבה ב-Gmail,
  // ולא מצא שם שום תווית.
  //
  // עכשיו הוא שולף את התוויות הקיימות בתיבת היעד ונותן לבחור אחת מהן
  // או להקליד שם חדש.
  async function applyLabel(box: Mailbox) {
    if (!box.id) return
    setSyncingId(box.id)
    try {
      const res = await fetch('/api/admin/legacy-mail/gmail-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: box.id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שליפת התוויות נכשלה')
      setPicker({
        box,
        target: d.target,
        labels: d.labels ?? [],
        selectedId: '',
        // ⚠️ ברירת המחדל היא שם התיבה — זה מה שהמנהל מצפה לראות,
        // ובלעדיה הוא היה מקליד אותו ידנית בכל פעם.
        newName: box.label,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSyncingId(null)
    }
  }

  /** מאשר את הבחירה בבורר: יוצר/מאתר את התווית ומדביק אותה על ההודעות. */
  async function confirmLabel() {
    if (!picker) return
    const { box, selectedId, newName } = picker
    if (!selectedId && !newName.trim()) {
      toast.error('בחרו תווית קיימת או הקלידו שם לתווית חדשה')
      return
    }
    setLabelBusy(true)
    try {
      const res = await fetch('/api/admin/legacy-mail/assign-gmail-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: box.id,
          labelId: selectedId || undefined,
          labelName: selectedId ? undefined : newName.trim(),
        }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'שיוך התווית נכשל')
      // ⚠️ 0 הודעות אינו כישלון — התווית נוצרה ותחול על הייבוא הבא.
      toast.success(
        d.tagged > 0
          ? `${d.tagged} הודעות תויגו ב-"${d.labelName}" בתיבה ${d.target}`
          : `התווית "${d.labelName}" מוכנה בתיבה ${d.target} — אין עדיין הודעות מיובאות לתייג`,
      )
      setPicker(null)
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLabelBusy(false)
    }
  }

  // ייבוא ל-Gmail — שואל לאיזו כתובת Gmail להזריק (ברירת מחדל: כתובת המחלקה),
  // שומר את הבחירה, ואז מייבא בבאצ'ים עד שכל המיילים הושלמו.
  async function importToGmail(box: Mailbox) {
    if (!box.id) return
    const target = window.prompt(
      `לאיזו כתובת Gmail להזריק את המיילים של "${box.label}"?\nהשאר ריק כדי להשתמש בכתובת המחלקה (${box.departmentLabel}).`,
      box.importTargetEmail ?? '',
    )
    if (target === null) return  // ביטול
    setSyncingId(box.id)
    try {
      // שמירת כתובת היעד לפני הייבוא
      const setRes = await fetch('/api/admin/legacy-mail/set-import-target', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: box.id, email: target.trim() || null }),
      })
      if (!setRes.ok) {
        const e = await setRes.json()
        toast.error(e.error || 'שגיאה בשמירת כתובת היעד')
        setSyncingId(null)
        return
      }
    } catch {
      toast.error('שגיאת רשת')
      setSyncingId(null)
      return
    }
    let total = 0
    let lastNote: string | null = null
    try {
      for (let guard = 0; guard < 1000; guard++) {
        const res = await fetch('/api/admin/legacy-mail/import-to-gmail', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: box.id }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.detail ? `${d.error}\n${d.detail}` : (d.error || 'שגיאה בייבוא'))
        total += d.imported ?? 0
        lastNote = d.note ?? null
        if (d.done || (d.imported === 0)) break
        toast.success(`יובאו ${total} מיילים... (נותרו ${d.remaining})`)
      }
      // הודעת סיום מדויקת: אם השרת החזיר note (למשל "לא הורץ סנכרון") — מציגים אותו,
      // במקום "אין מיילים חדשים" גנרי שהסתיר את הסיבה האמיתית לכך שכלום לא יובא.
      if (total > 0) toast.success(`הושלם — ${total} מיילים יובאו לתיבת ה-Gmail (${box.importTargetEmail || box.departmentLabel})`)
      else if (lastNote) toast.error(lastNote)
      else toast.success('אין מיילים חדשים לייבוא')
      load()  // רענון כדי לשקף יעד/מונים מעודכנים
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSyncingId(null)
    }
  }

  /**
   * 🔴 העברה מלאה בלחיצה אחת — סנכרון → תיוג → ייבוא.
   *
   * ⚠️ עד כה זו הייתה עבודה בת שלושה שלבים ידניים, בסדר שחייב להישמר,
   * וכל שלב בכפתור נפרד. מי שדילג על "סנכרון" קיבל "אין מיילים לייבוא"
   * בלי להבין למה, ומי שדילג על "תיוג" ייבא מיילים בלי שיוך למחלקה.
   * הסדר קבוע וידוע — ולכן אין סיבה שהמשתמש ינהל אותו.
   *
   * ⚠️ הכתובת נשאלת *פעם אחת* בהתחלה. השאלה באמצע רצף ארוך הייתה
   * עוצרת אותו בהמתנה לתשובה.
   */
  async function migrateAll(box: Mailbox) {
    if (!box.id) return
    const target = window.prompt(
      `העברה מלאה של "${box.label}" ל-Gmail.\n\n` +
      `יבוצעו ברצף: סנכרון מהתיבה הישנה ← תיוג ← ייבוא ל-Gmail.\n\n` +
      `לאיזו כתובת Gmail לייבא? (ריק = כתובת המחלקה: ${box.departmentLabel})`,
      box.importTargetEmail ?? '',
    )
    if (target === null) return

    setSyncingId(box.id)
    try {
      // 1 · סנכרון מהתיבה הישנה
      toast.success('שלב 1/3 — מסנכרן מהתיבה הישנה…')
      const sres = await fetch('/api/admin/legacy-mail/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: box.id, department: box.department, full: true }),
      })
      const sd = await sres.json()
      if (!sres.ok) throw new Error(sd.error || 'הסנכרון נכשל')

      // 2 · תיוג — ⚠️ כשל כאן אינו עוצר: הייבוא עדיין שווה משהו,
      // והתיוג ניתן להרצה חוזרת בנפרד.
      toast.success(`שלב 2/3 — מתייג… (נקלטו ${sd.imported ?? 0})`)
      await fetch('/api/admin/legacy-mail/apply-label', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: box.id }),
      }).catch(() => {})

      // 3 · ייבוא ל-Gmail, במנות עד שנגמר
      await fetch('/api/admin/legacy-mail/set-import-target', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: box.id, email: target.trim() || null }),
      })
      toast.success('שלב 3/3 — מייבא ל-Gmail…')
      let total = 0
      let lastNote: string | null = null
      for (let guard = 0; guard < 1000; guard++) {
        const res = await fetch('/api/admin/legacy-mail/import-to-gmail', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId: box.id }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.detail ? `${d.error}\n${d.detail}` : (d.error || 'הייבוא נכשל'))
        total += d.imported ?? 0
        lastNote = d.note ?? null
        if (d.done || (d.imported === 0)) break
        toast.success(`מייבא… ${total} עד כה (נותרו ${d.remaining})`)
      }

      if (total > 0) toast.success(`✅ הושלם — ${total} מיילים הועברו ל-${box.importTargetEmail || box.departmentLabel}`)
      else if (lastNote) toast.error(lastNote)
      else toast.success('הכל כבר מסונכרן — אין מיילים חדשים להעברה')
      load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setSyncingId(null)
    }
  }

  if (loading) {
    return (
      <div className="py-6 text-center text-slate-400">
        <Loader2 className="animate-spin inline" size={18} />
      </div>
    )
  }

  const boxes = status?.mailboxes ?? []

  if (!boxes.length) {
    return (
      <div className="rounded-xl p-4 text-sm bg-amber-50 text-amber-800 border border-amber-200">
        <p className="font-semibold mb-2">אין תיבות מייל מחוברות</p>
        <p className="mb-3 text-xs leading-relaxed">
          חבר תיבת Gmail (קריאה בלבד) כדי למשוך ממנה מיילים היסטוריים.
          בעת החיבור תתבקש לבחור לאיזו מחלקה התיבה שייכת.
        </p>
        <Button variant="primary" onClick={() => { window.location.href = '/api/auth/gmail-legacy' }}>
          <Link2 size={16} /> חיבור תיבת Gmail
        </Button>
      </div>
    )
  }

  const lastRun = status?.runs?.[0]

  return (
    <div className="flex flex-col gap-4">
      {/* סיכום כללי */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-xs text-slate-500 mb-1">סה״כ מיילים בארכיון</div>
          <div className="text-2xl font-bold text-slate-800">{status?.totals.synced ?? 0}</div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
          <div className="text-xs text-slate-500 mb-1">לא משויכים ללקוח</div>
          <div className={`text-2xl font-bold ${(status?.totals.unmatched ?? 0) > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {status?.totals.unmatched ?? 0}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-500 mb-1">תיבות מחוברות</div>
          <div className="text-2xl font-bold text-slate-800">{boxes.filter(b => b.connected).length}</div>
        </div>
      </div>

      {/* אזהרה אם הסנכרון האחרון נכשל */}
      {lastRun?.failed ? (
        <div className="rounded-xl p-3 text-sm bg-rose-50 text-rose-800 border border-rose-200 flex items-start gap-2">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">בסנכרון האחרון נכשלו {lastRun.failed} מיילים</p>
            {lastRun.error && <p className="text-xs mt-1 font-mono opacity-80">{lastRun.error}</p>}
          </div>
        </div>
      ) : null}

      {/* כרטיס לכל תיבה */}
      <div className="flex flex-col gap-3">
        {boxes.map(box => {
          const key = box.id ?? 'legacy'
          const isSyncing = syncingId === key
          return (
            <div key={key} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 size={16} className={box.connected ? 'text-emerald-600' : 'text-slate-300'} />
                    <span className="font-bold text-slate-800 truncate">{box.label}</span>
                  </div>
                  {box.email && (
                    <p className="text-xs text-slate-400 font-mono mr-6 truncate">{box.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* 🔴 הפעולה הראשית — מריצה את שלושת השלבים ברצף.
                      שאר הכפתורים נשארים להרצה נקודתית של שלב בודד. */}
                  {box.connected && box.id && (
                    <Button
                      variant="primary"
                      onClick={() => migrateAll(box)}
                      disabled={isSyncing || syncingId !== null}
                      title="סנכרון מהתיבה הישנה ← תיוג ← ייבוא ל-Gmail, ברצף אחד"
                    >
                      {isSyncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                      {isSyncing ? 'מעביר…' : 'העברה מלאה ל-Gmail'}
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={() => sync(box)}
                    disabled={isSyncing || syncingId !== null}
                  >
                    {isSyncing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                    {isSyncing ? 'מסנכרן…' : 'סנכרון'}
                  </Button>
                  {/* סנכרון מלא — מתעלם מהסמן ומושך את כל ההיסטוריה. פותר מצב שבו
                      הסמן הגלובלי "דילג" קדימה וסנכרון רגיל מחזיר 0 מיילים. */}
                  <Button
                    variant="ghost"
                    onClick={() => sync(box, true)}
                    disabled={isSyncing || syncingId !== null}
                    title="מושך את כל ההיסטוריה מחדש (בטוח — כפילויות נמנעות)"
                  >
                    סנכרון מלא
                  </Button>
                  {/* שיוך התווית של התיבה למיילים ישנים שכבר נקלטו (לפני שהוגדרה תווית) */}
                  {box.id && (
                    <Button
                      variant="ghost"
                      onClick={() => applyLabel(box)}
                      disabled={isSyncing || syncingId !== null}
                      title="מסמן את כל המיילים הקיימים של תיבה זו בתווית שלה"
                    >
                      שייך תווית
                    </Button>
                  )}
                  {/* ייבוא המיילים לתוך תיבת ה-Gmail האמיתית של המחלקה (Workspace) */}
                  {box.id && (
                    <Button
                      variant="ghost"
                      onClick={() => importToGmail(box)}
                      disabled={isSyncing || syncingId !== null}
                      title="מזריק את כל המיילים הישנים לתוך תיבת ה-Gmail של המחלקה, עם תווית 'ארכיון מייל ישן'"
                    >
                      ייבא ל-Gmail
                    </Button>
                  )}
                </div>
              </div>

              {/* יעד הייבוא — לאיזו כתובת Gmail המיילים מוזרקים. עד כה השדה נשמר
                  אך לא הוצג, והמשתמש לא ידע לאן הוגדר הייבוא. */}
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-indigo-50/60 border border-indigo-100 px-3 py-2">
                <ArrowLeftRight size={14} className="text-indigo-500 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs text-slate-500">יעד ייבוא ל-Gmail: </span>
                  {box.importTargetEmail ? (
                    <span className="text-xs font-mono font-semibold text-indigo-700 ltr-num" dir="ltr">{box.importTargetEmail}</span>
                  ) : (
                    <span className="text-xs text-slate-400">כתובת המחלקה (ברירת מחדל)</span>
                  )}
                </div>
              </div>

              {/* הדיווח המפולח */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">
                    <Building2 size={12} /> מחלקה
                  </div>
                  <div className="font-semibold text-indigo-700">{box.departmentLabel}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">
                    <Clock size={12} /> סנכרון אחרון
                  </div>
                  <div className="font-medium text-slate-700 text-xs">{fmtDateTime(box.lastSyncAt)}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mb-0.5">
                    <Inbox size={12} /> מיילים שנקלטו
                  </div>
                  <div className="font-bold text-slate-800">{box.totalSynced.toLocaleString('he-IL')}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">לא משויכים</div>
                  <div className={`font-bold ${box.unmatched > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {box.unmatched > 0 ? box.unmatched.toLocaleString('he-IL') : '✓ הכל משויך'}
                  </div>
                </div>
              </div>

              {box.lastError && (
                <p className="mt-3 text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2 font-mono">
                  {box.lastError}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* חיבור תיבה נוספת */}
      <Button variant="secondary" onClick={() => { window.location.href = '/api/auth/gmail-legacy' }}>
        <Link2 size={15} /> חיבור תיבת Gmail נוספת
      </Button>

      {/* היסטוריית סנכרונים */}
      {status?.runs && status.runs.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <summary className="text-sm font-semibold text-slate-600 cursor-pointer">
            היסטוריית סנכרונים ({status.runs.length})
          </summary>
          <table className="w-full mt-3 text-xs">
            <thead>
              <tr className="text-right text-slate-400 border-b border-slate-200">
                <th className="pb-2 font-medium">מתי</th>
                <th className="pb-2 font-medium">נסרקו</th>
                <th className="pb-2 font-medium">נקלטו</th>
                <th className="pb-2 font-medium">שויכו</th>
                <th className="pb-2 font-medium">נכשלו</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {status.runs.map(r => (
                <tr key={r.id}>
                  <td className="py-2 text-slate-500">{fmtDateTime(r.started_at)}</td>
                  <td className="py-2 text-slate-700">{r.scanned}</td>
                  <td className="py-2 font-semibold text-emerald-700">{r.imported}</td>
                  <td className="py-2 text-slate-700">{r.matched}</td>
                  <td className={`py-2 font-semibold ${r.failed > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                    {r.failed}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {/* 🔴 המיילים מתיבה מחוברת נשמרים עם source='legacy', והדואר הנכנס מציג
          source='resend' בלבד — הם מופיעים אך ורק ב"ארכיון מייל קודם". בלי
          ההסבר הזה, מי שחיבר תיבה חיפש אותם בדואר הנכנס והסיק שהחיבור נכשל. */}
      <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 border border-slate-200 rounded-xl p-3">
        <strong className="text-slate-700">היכן רואים את המיילים?</strong> מיילים מתיבה מחוברת
        מופיעים בתיקיית <Link href="/admin/mail?folder=LEGACY" className="text-indigo-600 hover:underline font-semibold">ארכיון מייל קודם</Link> —
        ולא בדואר הנכנס, שמציג רק מיילים שנקלטו ישירות לכתובות המערכת.
      </p>

      <p className="text-xs text-slate-400 leading-relaxed">
        הסנכרון מושך רק מיילים חדשים שטרם יובאו. הסנכרון הראשון עשוי לקחת זמן רב (כל ההיסטוריה).
        המיילים משויכים אוטומטית ללקוח לפי ת״ז בנושא או לפי כתובת השולח.
      </p>

      {/* ── בורר התוויות של "שייך תווית" ────────────────────────────────────
          המנהל בוחר תווית קיימת מתיבת היעד, או מקליד שם לתווית חדשה.
          התווית נוצרת ומודבקת ב-Gmail עצמו — לא רק בממשק שלנו. */}
      {picker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !labelBusy && setPicker(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-5 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-black text-slate-900">שיוך תווית ב-Gmail</h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                התיבה <strong className="text-slate-700">{picker.box.label}</strong> — התווית תיווצר
                בתיבת היעד <strong className="text-slate-700 font-mono">{picker.target}</strong>.
              </p>
            </div>

            {/* תווית קיימת */}
            {picker.labels.length > 0 && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-600">בחרו תווית קיימת</span>
                <select
                  value={picker.selectedId}
                  onChange={e => setPicker({ ...picker, selectedId: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                >
                  <option value="">— תווית חדשה —</option>
                  {picker.labels.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
            )}

            {/* שם לתווית חדשה — מוצג רק כשלא נבחרה קיימת */}
            {!picker.selectedId && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-600">שם התווית החדשה</span>
                <input
                  type="text"
                  value={picker.newName}
                  onChange={e => setPicker({ ...picker, newName: e.target.value })}
                  placeholder="לדוגמה: גמ״ח ישן ישן"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <span className="text-[11px] text-slate-400">
                  אם כבר קיימת תווית בשם הזה — היא תשמש כמות שהיא ולא תיווצר כפילות.
                </span>
              </label>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setPicker(null)} disabled={labelBusy}>
                ביטול
              </Button>
              <Button onClick={confirmLabel} disabled={labelBusy}>
                {labelBusy && <Loader2 size={15} className="animate-spin" />}
                {labelBusy ? 'משייך…' : 'שייך תווית'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
