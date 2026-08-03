'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Plus, Minus, Loader2, X, History, AlertTriangle, CheckCircle2, Clock, RefreshCw, ClipboardCheck } from 'lucide-react'
import { useStaffPermissions } from '@/components/StaffPermissions'

type LedgerRow = {
  id: string
  delta: number
  reason: 'restock' | 'birth_approval' | 'manual_out' | 'auto_assign' | 'adjust' | 'baseline'
  note: string | null
  created_at: string
  aid?: { id?: string; beneficiary?: { family_name?: string; spouse_name?: string; full_name?: string; id_number?: string; spouse_id_number?: string } } | null
}

// יולדת שממתינה לכרטיס — עם שם וסיבה, כדי שהמונה יהיה בר-בירור ולא מספר סתום
type AwaitingRow = { id: string; name: string; failed: boolean; reason: string }

// ── התאמת המלאי ────────────────────────────────────────────────────────────
// ⚠️ "הכנסתי 300, אישרתי 48, למה נשארו 247?" — שאלה שאין עליה תשובה במסך שמציג
// מספר אחד. הפילוח נגזר מכל היומן ומצביע בשם ובסיבה על כל כרטיס שנוכה ואינו
// מגובה בלידה מאושרת, כך שהפער תמיד מוסבר וגם ניתן לתיקון מכאן.
type StrayRow = { aidId: string; name: string; cards: number; statusLabel: string; reason: string }
type Recon = {
  balance: number; totalIn: number; totalOut: number
  heldOk: number; strayCards: number; expectedBalance: number
  byReason: { reason: string; count: number; total: number }[]
  strays: StrayRow[]
  opening: number; baselineAt: string | null; deletedAidCards: number
}

const REASON_LABEL: Record<LedgerRow['reason'], string> = {
  restock: 'הוספת מלאי',
  birth_approval: 'אישור לידה',
  manual_out: 'הורדה ידנית',
  auto_assign: 'שיוך אוטומטי',
  adjust: 'התאמה',
  baseline: 'ספירת מלאי',
}

// תאריך ושעה מופרדים — כדי שלא ייווצר פסיק RTL שבור בין התאריך לשעה
const fmtDate = (s: string) => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
const fmtTime = (s: string) => {
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}
const benName = (r: LedgerRow) => {
  const b = r.aid?.beneficiary
  if (!b) return null
  return [b.family_name, b.spouse_name || b.full_name].filter(Boolean).join(' ') || null
}
// ת"ז היולדת (האשה קודם, נפילה-לאחור לראשי)
const benId = (r: LedgerRow) => {
  const b = r.aid?.beneficiary
  return b ? (b.spouse_id_number || b.id_number || null) : null
}

export default function StockManager() {
  const router = useRouter()
  // ניהול המלאי שמור למנהל בלבד — לא למזכירות, גם אם יש לה הרשאת עריכה
  // לכרטיסים. ⚠️ זו שכבת UI; האכיפה האמיתית היא ב-API (requirePermission).
  const { isAdmin } = useStaffPermissions()
  const canEdit = isAdmin
  const [balance, setBalance] = useState<number | null>(null)
  const [awaiting, setAwaiting] = useState(0)
  const [awaitingDetails, setAwaitingDetails] = useState<AwaitingRow[]>([])
  const [showAwaiting, setShowAwaiting] = useState(false)
  const [running, setRunning] = useState(false)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [recon, setRecon] = useState<Recon | null>(null)
  const [showRecon, setShowRecon] = useState(false)
  const [returning, setReturning] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'add' | 'remove' | 'baseline' | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [flash, setFlash] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/card-stock', { cache: 'no-store' })
      const d = await r.json()
      setBalance(typeof d.balance === 'number' ? d.balance : 0)
      setAwaiting(typeof d.awaiting === 'number' ? d.awaiting : 0)
      setAwaitingDetails(Array.isArray(d.awaitingDetails) ? d.awaitingDetails : [])
      setLedger(Array.isArray(d.ledger) ? d.ledger : [])
      setRecon(d.recon && typeof d.recon.totalIn === 'number' ? d.recon as Recon : null)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  // החזרת כרטיס תלוי למלאי — ניכוי שאינו מגובה בלידה מאושרת.
  const returnCard = useCallback(async (row: StrayRow) => {
    setReturning(row.aidId)
    try {
      const r = await fetch('/api/admin/card-stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnAid: row.aidId, cards: row.cards, note: `החזרה למלאי — ${row.reason}` }),
      })
      const d = await r.json()
      if (r.ok) {
        setFlash(`${row.cards === 1 ? 'כרטיס' : `${row.cards} כרטיסים`} הוחזרו למלאי · ${row.name}`)
        setTimeout(() => setFlash(''), 4000)
      } else if (d?.error) {
        setFlash(d.error)
        setTimeout(() => setFlash(''), 5000)
      }
    } catch { /* ignore */ }
    setReturning(null)
    await load()
  }, [load])

  // הרצת התור ידנית — משחררת יולדת שנתקעה בלי להוסיף מלאי.
  const runQueue = useCallback(async () => {
    setRunning(true)
    try {
      const r = await fetch('/api/admin/card-stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runQueue: true }),
      })
      const d = await r.json()
      // ⚠️ גם כשל מדווח למסך: "0 טופלו" בלי סיבה נראה כמו באג ולא ככשל אמיתי.
      if (d.notConfigured) setFlash('נדרים אינו מוגדר — לא ניתן להטעין כרטיסים')
      else if (d.failed > 0) setFlash(`${d.processed} טופלו · ${d.failed} נכשלו — ${(d.errors ?? []).join(' · ') || 'ראה פירוט בכרטסת'}`)
      else if (d.processed > 0) setFlash(`${d.processed} יולדות טופלו וקיבלו שובר`)
      else setFlash('אין יולדות לטיפול כרגע')
      await load()
    } catch { setFlash('שגיאה בהרצת התור') }
    setRunning(false)
  }, [load])
  useEffect(() => { const t = setTimeout(() => { void load() }, 0); return () => clearTimeout(t) }, [load])

  const low = balance != null && balance <= 5

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Package size={18} className="text-emerald-600" />
        <div>
          <h2 className="font-semibold text-slate-900">מלאי כרטיסים כללי</h2>
          <p className="text-xs text-slate-400">מלאי אחד לכל המערכת — יורד בכל אישור לידה, מתחדש בהוספת מלאי</p>
        </div>
      </div>

      {flash && (
        <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <CheckCircle2 size={15} /> {flash}
        </div>
      )}

      {/* כרטיס מלאי אונליין */}
      <div className={`rounded-2xl border px-6 py-5 flex items-center justify-between gap-4 ${low ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-100'}`}>
        <div>
          <p className={`text-sm font-medium ${low ? 'text-rose-600' : 'text-emerald-700'}`}>כרטיסים פנויים במלאי כרגע</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-4xl font-extrabold ${low ? 'text-rose-700' : 'text-emerald-800'}`}>
              {loading ? <Loader2 size={28} className="animate-spin inline" /> : (balance ?? 0)}
            </span>
            <span className={`text-sm ${low ? 'text-rose-500' : 'text-emerald-600'}`}>כרטיסים</span>
          </div>
          {low && !loading && (
            <p className="flex items-center gap-1.5 text-xs text-rose-600 font-medium mt-1.5">
              <AlertTriangle size={13} /> מלאי נמוך — מומלץ להוסיף כרטיסים
            </p>
          )}
          {/* ⚠️ המונה לחיץ: "1 יולדת ממתינה" מול מלאי מלא הוא לא מידע — הוא
              שאלה. הפירוט אומר מי ולמה, ומאפשר לפתוח את הכרטסת או להריץ שוב. */}
          {!loading && awaiting > 0 && (
            <div className="mt-1.5">
              <button type="button" onClick={() => setShowAwaiting(s => !s)}
                className="flex items-center gap-1.5 text-xs text-amber-700 font-semibold hover:text-amber-900 underline decoration-dotted underline-offset-2">
                <Clock size={13} /> {awaiting} יולדות ממתינות למלאי — {showAwaiting ? 'הסתר' : 'למה?'}
              </button>
              {showAwaiting && (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 p-2 flex flex-col gap-1.5 max-w-md">
                  {awaitingDetails.length === 0 ? (
                    <p className="text-xs text-slate-500 px-1 py-1">אין פירוט זמין</p>
                  ) : awaitingDetails.map(a => (
                    <button key={a.id} type="button" onClick={() => router.push(`/admin/maternity/${a.id}`)}
                      className="text-right rounded-lg bg-white border border-amber-200 px-3 py-2 hover:border-amber-400 hover:bg-amber-50 transition-colors">
                      <span className="block text-xs font-bold text-slate-800">{a.name}</span>
                      <span className={`block text-[11px] mt-0.5 ${a.failed ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>
                        {a.failed ? '⚠️ ' : ''}{a.reason}
                      </span>
                    </button>
                  ))}
                  {canEdit && (
                    <button type="button" onClick={() => void runQueue()} disabled={running}
                      className="mt-0.5 inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-60 rounded-lg px-3 py-2 transition-colors">
                      {running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                      {running ? 'מריץ…' : 'נסה להטעין עכשיו'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        {canEdit && (
          <div className="flex flex-col gap-2">
            <button onClick={() => setModal('add')}
              className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg px-4 py-2 whitespace-nowrap">
              <Plus size={15} /> הוסף מלאי
            </button>
            <button onClick={() => setModal('remove')}
              className="inline-flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-sm font-semibold rounded-lg px-4 py-2 whitespace-nowrap">
              <Minus size={15} /> הורדת כרטיס
            </button>
          </div>
        )}
      </div>

      {/* ── התאמת מלאי: מאיפה הגיע המספר ── */}
      {/* ⚠️ מוצג תמיד ולא רק בפער: זו הדרך היחידה לאמת את המלאי מול מה שהמנהל
          יודע בוודאות — כמה כרטיסים קנה וכמה לידות אישר. */}
      {!loading && recon && (
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              {recon.baselineAt ? (
                <span className="text-slate-500">
                  מלאי פתיחה <strong className="ltr-num text-slate-800">{recon.opening}</strong>
                  <span className="text-slate-400"> (ספירה מ־<span className="ltr-num">{fmtDate(recon.baselineAt)}</span>)</span>
                </span>
              ) : (
                <span className="text-slate-500">
                  הוכנסו למלאי <strong className="ltr-num text-slate-800">{recon.totalIn}</strong>
                </span>
              )}
              {recon.baselineAt && recon.totalIn > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">
                    נוספו <strong className="ltr-num text-slate-800">{recon.totalIn}</strong>
                  </span>
                </>
              )}
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">
                נוכו <strong className="ltr-num text-slate-800">{recon.totalOut}</strong>
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">
                במלאי <strong className="ltr-num text-slate-800">{recon.balance}</strong>
              </span>
            </div>
            <div className="flex items-center gap-3">
              {canEdit && (
                <button type="button" onClick={() => setModal('baseline')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
                  <ClipboardCheck size={13} /> ספירת מלאי
                </button>
              )}
              <button type="button" onClick={() => setShowRecon(s => !s)}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 underline decoration-dotted underline-offset-2">
                {showRecon ? 'הסתר פילוח' : 'פילוח מלא'}
              </button>
            </div>
          </div>

          {recon.strayCards > 0 && (
            <div className="border-t border-amber-200 bg-amber-50/60 px-4 py-3">
              <p className="flex items-start gap-1.5 text-sm font-bold text-amber-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>
                  {recon.strayCards} כרטיסים נוכו ואינם מגובים בלידה מאושרת — לכן במלאי{' '}
                  <span className="ltr-num">{recon.balance}</span> ולא{' '}
                  <span className="ltr-num">{recon.expectedBalance}</span>
                </span>
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-amber-700">
                כל אישור לידה מנכה כרטיס. כשהבקשה חוזרת להמתנה, נדחית או שההטענה נכשלת — הניכוי אינו מתבטל
                מעצמו. אלה הכרטיסים שנתקעו, וניתן להחזירם למלאי מכאן.
              </p>
              {/* ⚠️ ניכויים שאיבדו את הקישור לתיק — אין שם להציג ואי אפשר לבדוק
                  את מצב הלידה, ולכן הם מדווחים כשורה מסכמת. בלעדיה המספרים לא
                  היו מסתדרים והפער היה נראה כשגיאת חישוב. */}
              {recon.deletedAidCards > 0 && (
                <p className="mt-2 rounded-xl border border-amber-200 bg-white px-3 py-2 text-[12px] leading-relaxed text-slate-600">
                  מתוכם <strong className="ltr-num">{recon.deletedAidCards}</strong> כרטיסים נוכו בגין לידות
                  ש<strong>נמחקו מהמערכת</strong> — הקישור לתיק אבד עם המחיקה, ולכן אין מה להציג לגביהם.
                  {canEdit && ' הדרך ליישר את המלאי היא "ספירת מלאי" — הזנת המספר הפיזי שנמצא בפועל.'}
                </p>
              )}
              <div className="mt-2.5 flex flex-col gap-1.5">
                {recon.strays.map(s => (
                  <div key={s.aidId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-white px-3 py-2">
                    <button type="button" onClick={() => router.push(`/admin/maternity/${s.aidId}`)}
                      className="text-right min-w-0 flex-1 group">
                      <span className="flex items-center gap-1.5">
                        <span className="text-[13px] font-bold text-slate-800 group-hover:text-indigo-700">{s.name}</span>
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{s.statusLabel}</span>
                        {s.cards > 1 && (
                          <span className="ltr-num rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">{s.cards} כרטיסים</span>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500">{s.reason}</span>
                    </button>
                    {canEdit && (
                      <button type="button" onClick={() => void returnCard(s)} disabled={returning === s.aidId}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                        {returning === s.aidId ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        החזרה למלאי
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {showRecon && (
            <div className="border-t border-slate-200 px-4 py-3">
              {/* ⚠️ הטבלה חייבת להסתכם *בדיוק* למלאי, אחרת היא מזיקה: מנהל
                  שמחשבר ומגלה הפרש מפסיק להאמין למסך. לכן מלאי הפתיחה מופיע
                  כשורה ראשונה, וכל תנועה שאחריה מופיעה בשורה משלה. */}
              <table className="w-full text-sm">
                <tbody>
                  {recon.baselineAt && (
                    <tr className="border-b border-slate-100">
                      <td className="py-1.5 text-slate-600">מלאי פתיחה (ספירה)</td>
                      <td className="py-1.5 text-[12px] text-slate-400 ltr-num">{fmtDate(recon.baselineAt)}</td>
                      <td className="py-1.5 text-left font-bold text-slate-700 ltr-num">{recon.opening}</td>
                    </tr>
                  )}
                  {recon.byReason.map(l => (
                    <tr key={l.reason} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 text-slate-600">{REASON_LABEL[l.reason as LedgerRow['reason']] ?? l.reason}</td>
                      <td className="py-1.5 text-slate-400 text-[12px] ltr-num">{l.count} תנועות</td>
                      <td className={`py-1.5 text-left font-bold ltr-num ${l.total > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {l.total > 0 ? `+${l.total}` : l.total}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-200">
                    <td className="py-1.5 font-bold text-slate-700">מלאי כרגע</td>
                    <td />
                    <td className="py-1.5 text-left font-extrabold text-slate-900 ltr-num">{recon.balance}</td>
                  </tr>
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                כרטיסים שנוכו בגין לידות ולא הוחזרו: {recon.heldOk + recon.strayCards} — מהם {recon.heldOk} מגובים
                בלידה מאושרת{recon.strayCards > 0 ? ` ו-${recon.strayCards} תלויים` : ''}.
                יתר הניכויים הם הורדות ידניות. פריקה בתום שישה שבועות אינה פער — הכרטיס נוצל בפועל.
                {recon.baselineAt && ' תנועות שקדמו לספירה מקופלות במלאי הפתיחה ואינן נספרות שוב.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* יומן תנועות */}
      <div>
        <button onClick={() => setShowHistory(h => !h)}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium">
          <History size={15} /> {showHistory ? 'הסתר' : 'הצג'} יומן תנועות ({ledger.length})
        </button>
        {showHistory && (
          <div className="mt-3 rounded-xl border border-slate-200 overflow-hidden">
            {ledger.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">אין תנועות עדיין</p>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-right text-[13px] font-bold text-slate-500 border-b border-slate-200">
                      <th className="px-4 py-2.5 font-bold">תאריך</th>
                      <th className="px-4 py-2.5 font-bold">פעולה</th>
                      <th className="px-4 py-2.5 font-bold">שינוי</th>
                      <th className="px-4 py-2.5 font-bold">פרטים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map(r => {
                      const name = benName(r)
                      const zeout = benId(r)
                      const aidId = r.aid?.id
                      // שורה הקשורה ליולדת → לחיצה פותחת את כרטסת הלידה
                      const clickable = !!aidId
                      return (
                        <tr key={r.id}
                          onClick={clickable ? () => router.push(`/admin/maternity/${aidId}`) : undefined}
                          className={`border-b border-slate-100 ${clickable ? 'cursor-pointer hover:bg-emerald-50/40' : ''}`}>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                            <span className="ltr-num">{fmtDate(r.created_at)}</span>
                            <span className="text-slate-300 mx-1.5">·</span>
                            <span className="ltr-num">{fmtTime(r.created_at)}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-700">{REASON_LABEL[r.reason]}</td>
                          <td className={`px-4 py-2.5 font-bold ${r.delta > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            <span className="ltr-num">{r.delta > 0 ? `+${r.delta}` : r.delta}</span>
                          </td>
                          <td className="px-4 py-2.5 text-slate-500">
                            {name ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-slate-700 font-medium">{name}</span>
                                {zeout && <span className="ltr-num text-xs text-slate-400">{zeout}</span>}
                              </span>
                            ) : (r.note || '—')}
                            {name && r.note ? <span className="text-slate-400"> · {r.note}</span> : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {modal === 'baseline' && (
        <BaselineModal
          currentBalance={balance ?? 0}
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setFlash(msg); setTimeout(() => setFlash(''), 5000); load() }}
        />
      )}

      {(modal === 'add' || modal === 'remove') && (
        <StockMovementModal
          mode={modal}
          currentBalance={balance ?? 0}
          awaiting={awaiting}
          onClose={() => setModal(null)}
          onDone={(msg) => { setModal(null); setFlash(msg); setTimeout(() => setFlash(''), 4000); load() }}
          onRefresh={load}
        />
      )}
    </div>
  )
}

// ─── מודאל ספירת מלאי ───────────────────────────────────────────────────────
// ⚠️ אין כאן "כתיבת מלאי": המלאי נשאר סכום היומן, והספירה נרשמת כתנועת התאמה
// מפורשת (baseline). מכאן והלאה ההתאמה נמדדת מנקודת הספירה — כך שיומן שצבר
// תנועות בדיקה אינו מזהם את ההסבר, ומצד שני שום תנועה אמיתית לא נמחקת.
function BaselineModal({ currentBalance, onClose, onDone }: {
  currentBalance: number
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const target = qty.trim() === '' ? null : Math.trunc(Number(qty.replace(/[^\d]/g, '')))
  const diff = target == null ? 0 : target - currentBalance

  const submit = async () => {
    if (target == null || !Number.isFinite(target) || target < 0) { setErr('יש להזין את מספר הכרטיסים שנמצאו בספירה'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/card-stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setBaseline: target, note: note.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה'); setBusy(false); return }
      const extra = d.processed > 0 ? ` · ${d.processed} יולדות ממתינות נטענו` : ''
      onDone(`המלאי נקבע ל-${target} כרטיסים${extra}`)
    } catch { setErr('שגיאת רשת'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-slate-900">
            <ClipboardCheck size={17} className="text-slate-500" /> ספירת מלאי
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
          הזינו את מספר הכרטיסים שנמצאו בספירה הפיזית. המערכת תרשום תנועת התאמה, וההתאמה
          במסך תימדד מנקודה זו והלאה — כך שתנועות מתקופת הבדיקות לא ימשיכו להשפיע על החישוב.
          יומן התנועות נשמר במלואו.
        </p>

        <label className="mb-1.5 block text-xs font-bold text-slate-600">מספר הכרטיסים בפועל</label>
        <input value={qty} onChange={e => setQty(e.target.value)} inputMode="numeric" dir="ltr" placeholder="300"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-left text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />

        <label className="mb-1.5 mt-3 block text-xs font-bold text-slate-600">הערה (לא חובה)</label>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="למשל: ספירה לאחר סיום הבדיקות"
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100" />

        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12px] leading-relaxed text-slate-600">
          <div className="flex justify-between"><span>מלאי מחושב כרגע</span><span className="ltr-num font-bold">{currentBalance}</span></div>
          <div className="flex justify-between"><span>לפי הספירה</span><span className="ltr-num font-bold">{target ?? '—'}</span></div>
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
            <span>תנועת ההתאמה שתירשם</span>
            <span className={`ltr-num font-bold ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
              {target == null ? '—' : diff > 0 ? `+${diff}` : diff}
            </span>
          </div>
        </div>

        {err && <p className="mt-2.5 text-sm font-bold text-red-600">{err}</p>}

        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => void submit()} disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-900 disabled:opacity-60">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <ClipboardCheck size={15} />} קביעת המלאי
          </button>
          <button type="button" onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

// מודאל הוספת / הורדת מלאי
function StockMovementModal({ mode, currentBalance, awaiting, onClose, onDone, onRefresh }: {
  mode: 'add' | 'remove'; currentBalance: number; awaiting: number
  onClose: () => void; onDone: (msg: string) => void; onRefresh: () => void
}) {
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isAdd = mode === 'add'

  // ── חישוב הסיכום ──
  // ⚠️ המלאי אחרי הוספה אינו balance+qty: הכרטיסים מחולקים תחילה ליולדות
  // הממתינות (processAwaitingStock, FIFO), ורק מה שנשאר יושב במלאי.
  const qtyNum = Math.max(0, Math.trunc(Number(qty) || 0))
  const poolAfterAdd = currentBalance + qtyNum          // המלאי הזמין לחלוקה
  const toWaiting = isAdd ? Math.min(awaiting, poolAfterAdd) : 0
  const stillWaiting = isAdd ? Math.max(0, awaiting - toWaiting) : 0
  const finalBalance = isAdd
    ? poolAfterAdd - toWaiting
    : Math.max(0, currentBalance - qtyNum)

  const submit = async () => {
    const n = Math.trunc(Number(qty))
    if (!n || n <= 0) { setErr('יש להזין כמות חיובית'); return }
    if (!isAdd && n > currentBalance) { setErr(`במלאי יש רק ${currentBalance} כרטיסים`); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/admin/card-stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: isAdd ? n : -n, note: note.trim() || undefined }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error || 'שגיאה'); setBusy(false); return }

      // ⚠️ כשל בשיוך לממתינות אינו כשל של הוספת המלאי — המלאי כן נוסף.
      // מציגים אותו במודאל במקום לסגור עם הודעת הצלחה מטעה.
      if (isAdd && (d.notConfigured || d.failed > 0)) {
        const detail = Array.isArray(d.errors) && d.errors.length ? ` (${d.errors[0]})` : ''
        setErr(d.notConfigured
          ? `נוספו ${n} כרטיסים, אך השיוך לממתינות נכשל — נדרים אינו מוגדר${detail}`
          : `נוספו ${n} כרטיסים. ${d.processed} יולדות קיבלו שובר, ${d.failed} נכשלו${detail}`)
        setBusy(false)
        onRefresh()
        return
      }

      const processedMsg = isAdd && d.processed > 0 ? ` — ${d.processed} יולדות מרשימת ההמתנה קיבלו שובר` : ''
      onDone(isAdd ? `נוספו ${n} כרטיסים למלאי${processedMsg}` : `הורדו ${n} כרטיסים מהמלאי`)
    } catch { setErr('שגיאת רשת'); setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="font-bold text-slate-900 flex items-center gap-2">
            {isAdd ? <Plus size={17} className="text-emerald-600" /> : <Minus size={17} className="text-rose-600" />}
            {isAdd ? 'הוספת מלאי כרטיסים' : 'הורדת כרטיסים מהמלאי'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">כמות כרטיסים <span className="text-red-500">*</span></label>
            <input value={qty} onChange={e => setQty(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric" dir="ltr" autoFocus
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="0" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700">הערה (לא חובה)</label>
            <input value={note} onChange={e => setNote(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder={isAdd ? 'לדוגמה: קבלת 50 כרטיסים חדשים' : 'לדוגמה: נשלח ידנית ליולדת פלונית'} />
          </div>
          {/* סיכום חי — מה קורה למלאי אחרי העדכון.
              בהוספה: הכרטיסים מחולקים קודם לממתינות (FIFO), והיתרה נשארת במלאי. */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">כמות המלאי הקיימת במערכת</span>
              <span className="font-semibold text-slate-800 ltr-num">{currentBalance}</span>
            </div>

            {/* מוצג תמיד — גם 0. שורה חסרה נראתה כתקלה ולא כמידע. */}
            {isAdd && (
              <div className="flex items-center justify-between">
                <span className={awaiting > 0 ? 'text-amber-700' : 'text-slate-500'}>יולדות הממתינות למלאי</span>
                <span className={`font-semibold ltr-num ${awaiting > 0 ? 'text-amber-700' : 'text-slate-500'}`}>{awaiting}</span>
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-slate-500">{isAdd ? 'כמות הכרטיסים שהינך מוסיף כעת' : 'כמות הכרטיסים שהינך מוריד כעת'}</span>
              <span className={`font-semibold ltr-num ${isAdd ? 'text-emerald-600' : 'text-rose-600'}`}>
                {qtyNum > 0 ? (isAdd ? `+${qtyNum}` : `-${qtyNum}`) : '—'}
              </span>
            </div>

            {isAdd && qtyNum > 0 && toWaiting > 0 && (
              <div className="flex items-center justify-between text-amber-700">
                <span>מתוכם יחולקו מיד לממתינות</span>
                <span className="font-semibold ltr-num">{toWaiting}</span>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 mt-0.5">
              <span className="font-medium text-slate-700">סך הכל יהיה במלאי אחרי העדכון</span>
              {/* dir=rtl על העטיפה — אחרת ltr-num מציב את המילה לפני המספר
                  ("כרטיסים 10"). המספר עצמו נשאר LTR. */}
              <span className="font-bold text-slate-900" dir="rtl">
                <span className="ltr-num">{finalBalance}</span> כרטיסים
              </span>
            </div>

            {isAdd && qtyNum > 0 && stillWaiting > 0 && (
              <p className="text-xs text-amber-700 pt-0.5">
                {stillWaiting} יולדות עדיין יישארו בהמתנה — אין מספיק כרטיסים לכולן.
              </p>
            )}
          </div>

          {isAdd && (
            <p className="text-xs text-slate-500 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
              יולדות שממתינות למלאי ישויכו אוטומטית לפי סדר הוותק ויקבלו שובר במייל.
            </p>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">ביטול</button>
            <button onClick={submit} disabled={busy || !qty}
              className={`inline-flex items-center gap-1.5 text-white text-sm font-semibold rounded-lg px-5 py-2 disabled:opacity-50 ${isAdd ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : isAdd ? <Plus size={15} /> : <Minus size={15} />}
              {isAdd ? 'הוסף למלאי' : 'הורד מהמלאי'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
