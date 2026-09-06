'use client'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז האישורים — "מי מאושר, מי לא, ומאיפה האישור".
//
// 🔴 הבעיה שזה פותר: 357 מתוך 10,505 הצמתים מאושרים (3.4%), אבל בעץ גוף
// הצומת נצבע לפי *הדור* (זהב/נחושת/ארד) והסטטוס היה נקודה של 20px — ולכן
// צומת ממתין בדור 1 נראה זהוב-ירקרק ונקרא כמאושר. בנוסף לא נשמר תיעוד של
// מי אישר ומתי, ולכן גם אחרי בדיקה לא היה אפשר לענות "על סמך מה זה מאושר".
//
// שלוש לשוניות, שעונות על שלוש שאלות שונות:
//   · תמונת מצב — "איפה אני עומד": מונים ופילוח לפי דור.
//   · לאישור   — "מה לעשות עכשיו": תור עבודה ממוין לפי מספר המשפחות התלויות.
//   · מאושרים  — "מי כבר מאושר": הרשימה המדויקת, כולל מקור האישור.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, RefreshCw, Check, X, ShieldCheck, ListChecks, BarChart3,
  AlertTriangle, ChevronLeft, Search, Users, ExternalLink,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import QuickChainModal from './QuickChainModal'

interface Summary {
  total: number; verified: number; pending: number; rejected: number
  legacyApproved: number; familiesOnPending: number; familiesOnVerified: number
}
interface GenRow { generation: number; total: number; verified: number; pending: number; rejected: number }
interface QueueRow {
  parentId: string; parentName: string; parentStatus: string
  generation: number; pendingCount: number; totalCount: number; families: number
}
interface FamilyLink { id: string; name: string }
/** שורה בעץ הדורות העליונים שבתמונת המצב. depth קובע את ההזחה. */
interface TopRow {
  id: string; name: string; generation: number; status: string
  depth: number; childCount: number; families: number
  pendingKids: number; verifiedKids: number
}
interface ChildRow {
  id: string; name: string; generation: number; status: string
  relation: string | null; childCount: number; families: number
  familyLinks: FamilyLink[]
  approvalSource: string | null; approvedAt: string | null; approvalNote: string | null
  /** 0 = ילד ישיר · 1 = נכד. קובע את ההזחה בתצוגה. */
  depth: number
  parentId: string | null
}
interface ApprovedRow {
  id: string; name: string; generation: number
  approvalSource: string; approvedAt: string | null; approvalNote: string | null
  families: number; familyLinks: FamilyLink[]; childCount: number
  parentName: string | null; parentApproved: boolean
}
interface Focus {
  parent: { id: string; name: string; generation: number; status: string; families: number; familyLinks: FamilyLink[] }
  /** שרשרת האבות מהשורש עד הצומת — "איפה אנחנו עומדים בעץ". */
  trail: { id: string; name: string; generation: number; status: string }[]
  children: ChildRow[]
}

const SOURCE_LABEL: Record<string, string> = {
  legacy: 'לפני התיעוד',
  staff: 'ידני',
  bulk: 'קבוצתי',
  family: 'בקשת משפחה',
  import: 'ייבוא',
}

const STATUS_META: Record<string, { label: string; bg: string; fg: string; ring: string }> = {
  verified: { label: 'מאושר', bg: '#DCFCE7', fg: '#15803D', ring: '#22C55E' },
  pending: { label: 'ממתין', bg: '#F1F5F9', fg: '#64748B', ring: '#CBD5E1' },
  rejected: { label: 'נדחה', bg: '#FEE2E2', fg: '#B91C1C', ring: '#F87171' },
}

type Tab = 'overview' | 'queue' | 'approved'

export default function ApprovalCenterPanel() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('overview')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [byGeneration, setByGeneration] = useState<GenRow[]>([])
  const [topTree, setTopTree] = useState<TopRow[]>([])
  const [queue, setQueue] = useState<QueueRow[]>([])
  const [approved, setApproved] = useState<ApprovedRow[]>([])
  const [brokenChain, setBrokenChain] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // מסך המיקוד — אב אחד וכל ילדיו.
  const [focus, setFocus] = useState<Focus | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  /** המשפחה שנפתחה לצפייה מהירה (שרשרת דורות + מחיקה). */
  const [quickId, setQuickId] = useState<string | null>(null)

  const load = useCallback(async (parentId?: string) => {
    setLoading(true)
    try {
      const url = parentId
        ? `/api/admin/lineage/approvals?parent=${encodeURIComponent(parentId)}`
        : '/api/admin/lineage/approvals'
      const res = await fetch(url, { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'טעינת מצב האישורים נכשלה')
      setSummary(d.summary ?? null)
      setByGeneration(d.byGeneration ?? [])
      setTopTree(d.topTree ?? [])
      setQueue(d.queue ?? [])
      setApproved(d.approved ?? [])
      setBrokenChain(d.brokenChain ?? 0)
      if (parentId) {
        setFocus(d.focus ?? null)
        // ⚠️ ברירת מחדל: כל הממתינים מסומנים. זו הפעולה הנפוצה ("כל הילדים
        // האלה נכונים"), והמנהל מסיר את מי שלא במקום לסמן אחד-אחד.
        const pend = ((d.focus?.children ?? []) as ChildRow[]).filter(c => c.status === 'pending')
        setPicked(new Set(pend.map(c => c.id)))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally { setLoading(false) }
  }, [toast])

  // ⚠️ טעינה אסינכרונית בעלייה — הכלל מסמן גם את הדפוס התקין הזה.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const openParent = (parentId: string) => { void load(parentId) }
  const closeFocus = () => { setFocus(null); setPicked(new Set()); setNote('') }

  /** אישור/שינוי סטטוס. תמיד עם תצוגה מקדימה כשמדובר בענף. */
  const apply = async (payload: Record<string, unknown>, confirmMsg?: string) => {
    setBusy(true)
    try {
      if (confirmMsg) {
        const dry = await fetch('/api/admin/lineage/approvals', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, dryRun: true }),
        })
        const dd = await dry.json()
        if (!dry.ok) throw new Error(dd.error || 'הבדיקה נכשלה')
        if (!dd.changed) { toast.info('אין מה לשנות'); return }
        // 🔴 תצוגה מקדימה לפני אישור ענף — הוא נוגע במאות צמתים בבת אחת.
        if (!window.confirm(`${confirmMsg}\n\nיושפעו ${dd.changed} צמתים. להמשיך?`)) return
      }
      const res = await fetch('/api/admin/lineage/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'הפעולה נכשלה')
      toast.success(`עודכנו ${d.changed} צמתים`)
      await load(focus?.parent.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'הפעולה נכשלה')
    } finally { setBusy(false) }
  }

  const filteredApproved = useMemo(() => {
    const t = q.trim()
    if (!t) return approved
    return approved.filter(a => a.name.includes(t) || (a.parentName ?? '').includes(t))
  }, [approved, q])

  /** המאושרים מקובצים לפי דור — לתצוגה בהזחה. */
  const approvedByGen = useMemo(() => {
    const m = new Map<number, ApprovedRow[]>()
    for (const a of filteredApproved.slice(0, 400)) {
      const l = m.get(a.generation) ?? []
      l.push(a)
      m.set(a.generation, l)
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0])
  }, [filteredApproved])

  const pct = summary && summary.total
    ? Math.round((summary.verified / summary.total) * 100) : 0

  if (loading && !summary) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-indigo-500" /></div>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── כותרת ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-100 text-green-700">
            <ShieldCheck size={18} />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">מרכז האישורים</h3>
            <p className="text-[11px] text-slate-500">מי מאושר, מי לא, ומאיפה האישור</p>
          </div>
        </div>
        <button onClick={() => void load(focus?.parent.id)} disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> רענון
        </button>
      </div>

      {/* ── לשוניות ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([
          { v: 'overview', l: 'תמונת מצב', icon: BarChart3 },
          { v: 'queue', l: `לאישור (${queue.length})`, icon: ListChecks },
          { v: 'approved', l: `מאושרים (${summary?.verified ?? 0})`, icon: ShieldCheck },
        ] as const).map(o => {
          const Icon = o.icon
          return (
            <button key={o.v} onClick={() => { setTab(o.v); closeFocus() }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all ${
                tab === o.v ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-300'
              }`}>
              <Icon size={13} /> {o.l}
            </button>
          )
        })}
      </div>

      {/* ═══ תמונת מצב ═══ */}
      {tab === 'overview' && summary && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="מאושרים" value={summary.verified} color="#16A34A" sub={`${pct}% מהעץ`} />
            <Stat label="ממתינים" value={summary.pending} color="#64748B" />
            <Stat label="נדחו" value={summary.rejected} color="#DC2626" />
            <Stat label="סה״כ צמתים" value={summary.total} color="#334155" />
          </div>

          {/* 🔴 המספר שמסביר את כל התחושה של "בלאגן" */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-bold text-amber-900">למה נראה שהעץ מאושר והוא לא</p>
            <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
              עד עכשיו גוף הצומת בעץ נצבע לפי <b>הדור</b> (זהב/נחושת/ארד), והסטטוס היה נקודה
              קטנה בפינה — ולכן צומת <b>ממתין</b> נראה זהוב-ירקרק ונקרא כמאושר.
              בפועל מאושרים רק <b>{summary.verified.toLocaleString('he-IL')}</b> מתוך{' '}
              <b>{summary.total.toLocaleString('he-IL')}</b> ({pct}%).
              מעכשיו הצבע בעץ הוא הסטטוס: ירוק=מאושר, אפור=ממתין, אדום=נדחה.
            </p>
          </div>

          {/* משפחות תלויות — למה זה דחוף */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <Users size={12} /> משפחות התלויות בצומת <b className="text-slate-700">ממתין</b>
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-slate-800">
                {summary.familiesOnPending.toLocaleString('he-IL')}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
                <Users size={12} /> משפחות על צומת <b className="text-green-700">מאושר</b>
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-green-700">
                {summary.familiesOnVerified.toLocaleString('he-IL')}
              </div>
            </div>
          </div>

          {/* ⚠️ מאושרים בלי תיעוד + שרשרת שבורה */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {summary.legacyApproved > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] leading-relaxed text-slate-600">
                <b className="text-slate-800">{summary.legacyApproved.toLocaleString('he-IL')}</b> צמתים אושרו
                לפני שהתיעוד הופעל — לא ידוע מי אישר ומתי. מכאן והלאה כל אישור מתועד
                (מי · מתי · על סמך מה).
              </div>
            )}
            {brokenChain > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-rose-600" />
                <p className="text-[11px] leading-relaxed text-rose-800">
                  <b>{brokenChain}</b> צמתים מאושרים שה<b>אב שלהם אינו מאושר</b> — שרשרת שבורה.
                  מופיעים מסומנים בלשונית &quot;מאושרים&quot;.
                </p>
              </div>
            )}
          </div>

          {/* ── מבנה העץ בהזחה ──
              🔴 "פילוח לפי דור" אומר כמה אושרו, לא *מי* ואיפה. כאן רואים
              את המבנה עצמו: מי תלוי במי, ומה מאושר בכל ענף. */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
              <span className="text-[11px] font-bold text-slate-600">מבנה העץ — הדורות העליונים</span>
              <span className="text-[10px] text-slate-400">לחיצה פותחת את הדור לאישור</span>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {topTree.map(t => {
                const meta = STATUS_META[t.status] ?? STATUS_META.pending
                return (
                  <button key={t.id}
                    onClick={() => { setTab('queue'); openParent(t.id) }}
                    className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-1.5 text-right transition-colors last:border-0 hover:bg-indigo-50/50"
                    style={{ paddingRight: 12 + t.depth * 18 }}>
                    {/* נקודת הסטטוס — הצבע הוא הסימן */}
                    <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: meta.ring }} />
                    <span className="min-w-0 flex-1 truncate text-[12px] text-slate-700">{t.name}</span>
                    <span className="flex flex-shrink-0 items-center gap-1.5 text-[10px]">
                      <span className="rounded bg-slate-100 px-1 font-bold text-slate-500">ד{t.generation}</span>
                      {t.childCount > 0 && (
                        <span className="tabular-nums text-slate-400">
                          <b className="text-green-700">{t.verifiedKids}</b>
                          <span className="text-slate-300">/</span>
                          {t.childCount}
                        </span>
                      )}
                      {t.families > 0 && <span className="font-bold text-amber-700">{t.families}👥</span>}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* פילוח לפי דור */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-bold text-slate-600">
              פילוח לפי דור
            </div>
            <div className="flex flex-col">
              {byGeneration.map(g => {
                const p = g.total ? (g.verified / g.total) * 100 : 0
                return (
                  <div key={g.generation} className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0">
                    <span className="w-12 flex-shrink-0 text-[11px] font-bold text-slate-500">דור {g.generation}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-green-500" style={{ width: `${p}%` }} />
                    </div>
                    <span className="w-28 flex-shrink-0 text-left text-[11px] tabular-nums text-slate-500">
                      <b className="text-green-700">{g.verified}</b> / {g.total}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══ תור האישור ═══ */}
      {tab === 'queue' && !focus && (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
            ממוין לפי <b>מספר המשפחות שממתינות</b> מתחת לכל אב — כך שהעבודה
            הראשונה היא זו שמשחררת הכי הרבה משפחות. בחרו אב כדי לאשר את ילדיו.
          </p>
          {!queue.length && (
            <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
              אין דורות שממתינים לאישור.
            </p>
          )}
          {queue.map(r => (
            <button key={r.parentId} onClick={() => openParent(r.parentId)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-right transition-all hover:border-indigo-300 hover:shadow-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">{r.parentName}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                  <span>דור {r.generation}</span>
                  <span className="text-slate-400">·</span>
                  <span><b className="text-slate-700">{r.pendingCount}</b> מתוך {r.totalCount} ממתינים</span>
                  {r.families > 0 && (
                    <>
                      <span className="text-slate-400">·</span>
                      <span className="font-medium text-amber-700">{r.families} משפחות תלויות</span>
                    </>
                  )}
                </span>
              </span>
              <ChevronLeft size={15} className="flex-shrink-0 text-slate-300" />
            </button>
          ))}
        </div>
      )}

      {/* ═══ מיקוד: אב אחד וכל ילדיו ═══ */}
      {tab === 'queue' && focus && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              {/* ── שרשרת האבות ──
                  ⚠️ בלעדיה אי אפשר לדעת איפה בעץ אנחנו: השם "רבי משה סופר"
                  חוזר עשרות פעמים בדורות שונים. */}
              {focus.trail.length > 1 && (
                <div className="mb-1.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-400">
                  {focus.trail.slice(0, -1).map((t, i) => (
                    <span key={t.id} className="flex items-center gap-1">
                      {i > 0 && <span className="text-slate-300">›</span>}
                      <button onClick={() => openParent(t.id)}
                        className="rounded px-1 py-0.5 hover:bg-slate-100 hover:text-indigo-600">
                        {t.name}
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <h4 className="truncate text-base font-bold text-slate-800">{focus.parent.name}</h4>
              <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">דור {focus.parent.generation}</span>
                <span>{focus.children.filter(c => c.depth === 0).length} ילדים ישירים</span>
                {focus.parent.familyLinks.length > 0 && (
                  <CardLinks links={focus.parent.familyLinks} count={focus.parent.families} onQuick={setQuickId} />
                )}
              </p>
            </div>
            <button onClick={closeFocus}
              className="flex-shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
              חזרה לתור
            </button>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px]">
            <button onClick={() => setPicked(new Set(focus.children.filter(c => c.status === 'pending').map(c => c.id)))}
              className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">סמן את כל הממתינים</button>
            <button onClick={() => setPicked(new Set())}
              className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50">נקה סימון</button>
            <span className="text-slate-400">נבחרו {picked.size}</span>
          </div>

          {/* ── הצאצאים בהזחה ──
              🔴 שני דורות: ילדים ישירים, ומתחת לכל אחד הנכדים שלו מוזחים.
              בלי הנכדים אפשר לאשר בן בלי לדעת שתלוי בו ענף שלם. */}
          <div className="mb-3 flex max-h-96 flex-col gap-0.5 overflow-y-auto">
            {focus.children.map(c => {
              const meta = STATUS_META[c.status] ?? STATUS_META.pending
              const on = picked.has(c.id)
              const child = c.depth === 0
              return (
                <div key={c.id} className="flex items-stretch" style={{ paddingRight: c.depth * 26 }}>
                  {/* קו הזחה — מראה במבט שהשורה תלויה בשורה שמעליה */}
                  {c.depth > 0 && (
                    <span className="mr-1 flex w-4 flex-shrink-0 items-center justify-center">
                      <span className="h-full w-px bg-slate-200" />
                    </span>
                  )}
                  <label
                    className={`flex flex-1 cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 transition-all ${
                      child ? 'py-2' : 'py-1.5'
                    } ${on ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                    <input type="checkbox" checked={on}
                      onChange={() => setPicked(prev => {
                        const n = new Set(prev)
                        if (n.has(c.id)) n.delete(c.id); else n.add(c.id)
                        return n
                      })}
                      className="h-4 w-4 flex-shrink-0 accent-indigo-600" />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-slate-800 ${child ? 'text-sm font-medium' : 'text-[12px]'}`}>
                        {c.name}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-500">
                        <span className="rounded bg-slate-100 px-1 font-bold text-slate-500">דור {c.generation}</span>
                        {c.childCount > 0 && <span>{c.childCount} ילדים</span>}
                        {c.families > 0
                          ? <CardLinks links={c.familyLinks} count={c.families} onQuick={setQuickId} />
                          : <span className="text-slate-400">אין משפחות</span>}
                        {c.relation && <span>· {c.relation === 'son_in_law' ? 'חתן' : 'בן'}</span>}
                      </span>
                    </span>
                    {/* ⚠️ מעבר לדור הזה כאב — כך יורדים לעומק בלי לחזור לתור */}
                    {c.childCount > 0 && (
                      <button onClick={e => { e.preventDefault(); openParent(c.id) }}
                        title="פתח את הדור הזה"
                        className="flex-shrink-0 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 hover:border-indigo-300 hover:text-indigo-600">
                        פתח
                      </button>
                    )}
                    <span className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                      style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                  </label>
                </div>
              )
            })}
          </div>

          <input value={note} onChange={e => setNote(e.target.value)}
            placeholder="על סמך מה אושר? (נשמר בתיעוד — לא חובה)"
            className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300" />

          <div className="flex flex-wrap items-center gap-2">
            <button disabled={busy || !picked.size}
              onClick={() => apply({ nodeIds: [...picked], status: 'verified', note })}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              אשר {picked.size} מסומנים
            </button>
            <button disabled={busy || !picked.size}
              onClick={() => apply({ nodeIds: [...picked], status: 'rejected', note })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">
              <X size={13} /> סמן כלא מאושר
            </button>
            <span className="flex-1" />
            {/* 🔴 אישור ענף — תמיד עם תצוגה מקדימה שמראה כמה צמתים יושפעו. */}
            <button disabled={busy}
              onClick={() => apply(
                { subtreeOf: focus.parent.id, status: 'verified', note },
                `אישור כל הענף מתחת ל"${focus.parent.name}" — כולל דורות שלא עברתם עליהם.`,
              )}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50">
              אשר את כל הענף…
            </button>
          </div>
        </div>
      )}

      {/* ═══ מאושרים — התצוגה המדויקת ═══ */}
      {tab === 'approved' && (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="חיפוש בשם או בשם האב…"
              className="w-full rounded-xl border border-slate-200 py-2 pr-9 pl-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>
          <p className="text-[11px] text-slate-500">
            {filteredApproved.length.toLocaleString('he-IL')} צמתים מאושרים
            {q && ` (מתוך ${approved.length.toLocaleString('he-IL')})`}
          </p>

          {/* ── מקובץ לפי דור, בהזחה ──
              🔴 רשימה שטוחה של 357 שמות אינה נקראת. הקיבוץ לפי דור והזחה
              לפי עומק הופכים אותה לתמונה: כמה אושרו בכל דור, ומי הם. */}
          <div className="flex flex-col gap-2">
            {approvedByGen.map(([gen, rows]) => (
              <div key={gen} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5">
                  <span className="text-[11px] font-bold text-slate-600">דור {gen}</span>
                  <span className="text-[11px] tabular-nums text-slate-400">{rows.length} מאושרים</span>
                </div>
                {rows.map(a => (
                  <div key={a.id} className="flex items-center gap-2.5 border-b border-slate-100 px-3 py-2 last:border-0"
                    style={{ paddingRight: 12 + Math.min(gen - 1, 8) * 12 }}>
                    <span className="h-7 w-1 flex-shrink-0 rounded-full bg-green-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">
                        {a.name}
                        {/* ⚠️ הסימון שחושף "ירוק שאינו באמת מאושר" */}
                        {!a.parentApproved && (
                          <span className="mr-2 rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                            האב אינו מאושר
                          </span>
                        )}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-slate-500">
                        {a.parentName && <span>תחת {a.parentName}</span>}
                        {a.childCount > 0 && <span>· {a.childCount} ילדים</span>}
                        {a.families > 0 && <CardLinks links={a.familyLinks} count={a.families} onQuick={setQuickId} />}
                      </span>
                    </span>
                    <span className="flex-shrink-0 text-left">
                      <span className="block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                        {SOURCE_LABEL[a.approvalSource] ?? a.approvalSource}
                      </span>
                      {a.approvedAt && (
                        <span className="mt-0.5 block text-[10px] text-slate-400">
                          {new Date(a.approvedAt).toLocaleDateString('he-IL')}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            {!filteredApproved.length && (
              <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">
                לא נמצאו צמתים מאושרים.
              </p>
            )}
          </div>
          {filteredApproved.length > 300 && (
            <p className="text-center text-[11px] text-slate-400">
              מוצגים 300 הראשונים — השתמשו בחיפוש לצמצום.
            </p>
          )}
        </div>
      )}

      {/* צפייה מהירה בסדר הדורות + מחיקה מכל המחלקות */}
      {quickId && (
        <QuickChainModal
          beneficiaryId={quickId}
          onClose={() => setQuickId(null)}
          // ⚠️ אחרי מחיקה טוענים מחדש: המונים והרשימות מתייחסים למשפחה שכבר אינה קיימת.
          onDeleted={() => { void load(focus?.parent.id) }}
        />
      )}
    </div>
  )
}

/**
 * קישורי כרטסת למשפחות התלויות בצומת.
 *
 * ⚠️ נפתח בכרטיסייה חדשה: המנהל באמצע רשימת אישור, וניווט באותו חלון היה
 * מאבד את הסימונים שכבר עשה.
 */
function CardLinks({ links, count, onQuick }: { links: FamilyLink[]; count: number; onQuick?: (id: string) => void }) {
  if (!links.length) {
    return <span className="font-medium text-amber-700">{count} משפחות</span>
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      {links.map(l => (
        <span key={l.id} className="inline-flex overflow-hidden rounded border border-amber-200 bg-amber-50">
          {/* צפייה מהירה — שרשרת הדורות + מחיקה, בלי לעזוב את המסך */}
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onQuick?.(l.id) }}
            title={`צפייה מהירה בסדר הדורות — ${l.name}`}
            className="px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-100">
            {l.name || 'כרטסת'}
          </button>
          <a href={`/admin/beneficiaries/${l.id}`} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            title="פתיחת הכרטסת המלאה בכרטיסייה חדשה"
            className="flex items-center border-r border-amber-200 px-1 text-amber-700 hover:bg-amber-100">
            <ExternalLink size={9} />
          </a>
        </span>
      ))}
      {count > links.length && (
        <span className="text-slate-400">ועוד {count - links.length}</span>
      )}
    </span>
  )
}

function Stat({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="text-xl font-bold tabular-nums" style={{ color }}>{value.toLocaleString('he-IL')}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  )
}
