'use client'

// ─────────────────────────────────────────────────────────────────────────────
// צמתי רפאים — מסך אבחון לצמתים שנוצרו משדה הילדים של כרטסת.
//
// שלוש הקבוצות מסודרות לפי כמה יש מה להציל, מהקל לחמור:
//   · אין כרטסת בכלל   — הצומת הוא הד של שורה בטופס.
//   · כרטסת בלי צומת   — יש אדם אמיתי שרק לא שויך; הצומת הזה הוא מקומו.
//   · כרטסת בצומת אחר  — האדם כבר בעץ, וזה עותק כפול שלו.
//
// 🔴 ההסרה מוגבלת לעותקים מוכחים, וזו כל ההבחנה שהמסך הזה עומד עליה:
//
//   · צומת עם תאום, או שכרטסתו יושבת על צומת אחר — האדם *נמצא* במקום אחר
//     בעץ. הצומת כפול, והסרתו אינה מוחקת אף אחד.
//   · צומת בלי כרטסת ובלי תאום — אין שום ראיה שהאדם קיים במקום אחר. הוא נוצר
//     בכוונה כדי שהילד ימצא את עצמו כשיירשם, והסרתו תגרום בדיוק לכפילות
//     שהמנגנון נועד למנוע. אלה הרוב, ואינם ניתנים לסימון.
//
// הכלל נאכף בשרת (isProvenDuplicate) ומשוכפל כאן רק כדי שהמסך לא יציע סימון
// שיידחה. השרת סורק מחדש ברגע ההסרה ואינו סומך על הסימון במסך.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import {
  Ghost, Loader2, Search, ChevronLeft, ExternalLink, ShieldQuestion,
  UserRoundX, UserRoundSearch, CopyX, Info, Copy, ShieldCheck, Trash2,
} from 'lucide-react'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/components/ui/Toast'

type GhostGroup = 'no_card' | 'card_unlinked' | 'card_elsewhere'

interface Row {
  nodeId: string
  nodeName: string
  generation: number
  status: string | null
  idNumber: string
  group: GhostGroup
  parentNodeId: string
  parentNodeName: string
  parentBenId: string
  parentBenName: string
  childNameInCard: string
  cardBenId: string | null
  cardBenName: string | null
  cardNodeId: string | null
  twinNodeId: string | null
  twinName: string | null
  nameLooksLikeChildRow: boolean
}

/** צומת שעמד בכלל הת"ז אך מוגן — מוצג עם הסיבה, ולא רק נספר. */
interface ProtectedRow {
  nodeId: string
  nodeName: string
  generation: number
  status: string | null
  idNumber: string
  parentNodeId: string
  parentNodeName: string
  guard: string
}

interface ScanData {
  rows: Row[]
  counts: Record<GhostGroup, number>
  total: number
  skipped: { withChildren: number; withCard: number }
  protectedRows: ProtectedRow[]
  protectedTotal: number
  removableTotal: number
  scannedNodes: number
  scannedBeneficiaries: number
  truncated: boolean
  maxRowsPerGroup: number
  restricted: boolean
}

const he = (n: number) => n.toLocaleString('he-IL')

const GROUPS: { key: GhostGroup; title: string; hint: string; icon: React.ReactNode; tone: 'rose' | 'amber' | 'orange' }[] = [
  {
    key: 'no_card',
    title: 'אין כרטסת בכלל',
    hint: 'אין במערכת שום כרטסת עם הת״ז הזו. הצומת נוצר מהשורה שההורה הקליד בשדה הילדים, והילד עצמו מעולם לא נרשם.',
    icon: <UserRoundX size={15} />,
    tone: 'rose',
  },
  {
    key: 'card_unlinked',
    title: 'יש כרטסת — בלי שיוך לעץ',
    hint: 'קיימת כרטסת עם הת״ז הזו והיא אינה משויכת לשום צומת. כלומר יש כאן אדם אמיתי, והצומת הזה הוא ככל הנראה מקומו בעץ.',
    icon: <UserRoundSearch size={15} />,
    tone: 'amber',
  },
  {
    key: 'card_elsewhere',
    title: 'הכרטסת משויכת לצומת אחר',
    hint: 'קיימת כרטסת עם הת״ז הזו והיא כבר יושבת על צומת אחר. האדם מופיע בעץ פעמיים, והצומת הזה הוא העותק המיותר.',
    icon: <CopyX size={15} />,
    tone: 'orange',
  },
]

const STATUS: Record<string, { txt: string; cls: string }> = {
  verified: { txt: 'מאושר', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  pending: { txt: 'ממתין', cls: 'text-amber-700 bg-amber-50 border-amber-200' },
  rejected: { txt: 'נדחה', cls: 'text-red-700 bg-red-50 border-red-200' },
}

/**
 * 🔴 מה מותר להסיר — אותו כלל בדיוק שהשרת אוכף (isProvenDuplicate).
 *
 * רק צומת שהוכח שהאדם שלו כבר קיים בעץ: יש לו תאום, או שכרטסתו יושבת על
 * צומת אחר. צומת בלי כרטסת ובלי תאום נשאר — הוא נוצר כדי שהילד ימצא את עצמו
 * כשיירשם, והסרתו תיצור בדיוק את הכפילות שהמנגנון מונע. השרת בודק זאת שוב,
 * והתנאי כאן קיים רק כדי שהמסך לא יציע סימון שיידחה.
 */
const isRemovable = (r: Row) => r.group === 'card_elsewhere' || r.twinNodeId != null

export default function GhostChildrenPanel({ onLocate, onFixed }: {
  onLocate: (id: string) => void
  onFixed: () => void
}) {
  const toast = useToast()
  const [data, setData] = useState<ScanData | null>(null)
  const [loading, setLoading] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState('')
  // הקבוצה הפתוחה. אחת בלבד — שלוש רשימות פתוחות יחד הופכות את המסך לגלילה
  // אינסופית שאי אפשר להתמצא בה.
  const [open, setOpen] = useState<GhostGroup | null>(null)
  // הצמתים המוגנים — קטע נפרד, כי הם *לא* פריטי טיפול אלא ההסבר למספר.
  const [openProtected, setOpenProtected] = useState(false)

  const scan = useCallback(async () => {
    setLoading(true); setErr(''); setPicked(new Set())
    try {
      const res = await fetch('/api/admin/lineage/ghost-children', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'שגיאה בסריקה'); setData(null) }
      else { setData(d); setOpen(null); setOpenProtected(false) }
    } catch { setErr('שגיאת רשת') }
    setLoading(false)
  }, [])

  const runRemove = useCallback(async () => {
    setConfirm(false)
    if (!picked.size) return
    setRemoving(true)
    try {
      const res = await fetch('/api/admin/lineage/ghost-children', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeIds: [...picked] }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error ?? 'ההסרה נכשלה'); setRemoving(false); return }
      const bits = [`הוסרו ${he(d.removed)} עותקים`]
      if (d.rejected) bits.push(`${he(d.rejected)} דולגו — כבר אינם עומדים בתנאים`)
      if (d.failures?.length) toast.error(`${bits.join(' · ')} · כשלים: ${d.failures.length}`)
      else toast.success(bits.join(' · '))
      onFixed()
      await scan()
    } catch { toast.error('שגיאת רשת') }
    setRemoving(false)
  }, [picked, toast, onFixed, scan])

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-slate-50/60 p-4 mb-4" dir="rtl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Ghost size={18} className="text-slate-600" />
          <h2 className="text-sm font-bold text-slate-800">צמתי רפאים — נוצרו משדה הילדים</h2>
          {data && (
            <span className="text-xs text-slate-400">
              סרקנו {he(data.scannedNodes)} צמתים · {he(data.scannedBeneficiaries)} כרטסות
            </span>
          )}
        </div>
        <button onClick={scan} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-sm text-white transition-colors hover:bg-slate-800 disabled:bg-slate-300">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
          {data ? 'סרוק שוב' : 'סרוק את העץ'}
        </button>
      </div>

      <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
        כשמשפחה מאושרת, כל ילד שהוזן בשדה הילדים של הכרטסת מקבל צומת בעץ עם הת״ז שלו. הצומת מייצג
        <strong> שורה בטופס</strong> ולא אדם שנבדק — השם הוא מה שההורה הקליד. כאן מוצגים בדיוק אותם צמתים:
        יש להם ת״ז, אין להם כרטסת, והת״ז שלהם מופיעה בשדה הילדים של כרטסת ההורה.
        <br />
        <strong>צומת שיש לו ילדים בעץ או כרטסת משלו אינו נכלל כאן כלל</strong> — הוא כבר ענף או אדם רשום.
      </p>

      <p className="mb-3 inline-flex items-start gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-800">
        <Info size={13} className="mt-0.5 shrink-0" />
        המסך הזה <strong>אינו משנה דבר</strong> — סריקה בלבד. לחיצה על שורה מציגה את הצומת בעץ.
      </p>

      {err && <p className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{err}</p>}

      {!data && !loading && !err && (
        <p className="text-sm text-slate-500">לחצו ״סרוק את העץ״ כדי לראות כמה צמתים כאלה יש ומי הם.</p>
      )}

      {data && data.restricted && (
        <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <ShieldQuestion size={12} className="ml-1 inline" />
          המספרים מלאים, אך ת״ז ושמות כרטסות מוצגים רק לבעלי הרשאת צפייה במשפחות.
        </p>
      )}

      {data && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card label="סך הכל" value={data.total} tone={data.total ? 'slate' : 'green'} icon={<Ghost size={15} />} />
            {GROUPS.map(g => (
              <Card key={g.key} label={g.title} value={data.counts[g.key]} icon={g.icon}
                tone={data.counts[g.key] ? g.tone : 'green'}
                onClick={data.counts[g.key] ? () => setOpen(o => (o === g.key ? null : g.key)) : undefined}
                active={open === g.key} />
            ))}
          </div>

          {/* ⚠️ הצמתים שהוחרגו מוצגים במפורש. בלי זה המספר על המסך אינו בר-הסבר:
              נראה כאילו הסריקה פספסה צמתים שברור לעין שעומדים בכלל הת"ז. */}
          {(data.skipped.withChildren > 0 || data.skipped.withCard > 0) && (
            <div>
              <button onClick={() => setOpenProtected(o => !o)}
                className="flex w-full items-start gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-[11px] leading-relaxed text-slate-500 transition-colors hover:bg-slate-50">
                <ShieldCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                <span>
                  עוד <strong>{he(data.skipped.withChildren + data.skipped.withCard)}</strong> צמתים עומדים בכלל הת״ז
                  והושארו בחוץ במכוון:{' '}
                  {data.skipped.withChildren > 0 && <>{he(data.skipped.withChildren)} כי יש להם ילדים בעץ</>}
                  {data.skipped.withChildren > 0 && data.skipped.withCard > 0 && ' · '}
                  {data.skipped.withCard > 0 && <>{he(data.skipped.withCard)} כי יש להם כרטסת משלהם</>}.
                </span>
                <ChevronLeft size={13}
                  className={`mr-auto mt-0.5 shrink-0 text-slate-300 transition-transform ${openProtected ? '-rotate-90' : ''}`} />
              </button>
              {openProtected && (
                <div className="mt-1 rounded-lg border border-slate-200 bg-white">
                  <div className="max-h-[20rem] overflow-y-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-medium">שם הצומת</th>
                          <th className="px-3 py-2 font-medium">דור</th>
                          <th className="px-3 py-2 font-medium">תחת</th>
                          <th className="px-3 py-2 font-medium">למה לא נוגעים</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.protectedRows.map(r => (
                          <tr key={r.nodeId} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <button onClick={() => onLocate(r.nodeId)}
                                className="text-right font-medium text-slate-800 hover:text-violet-700">
                                {r.nodeName || '(ללא שם)'}
                              </button>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-400">{r.generation}</td>
                            <td className="max-w-[200px] truncate px-3 py-2 text-xs text-slate-600">{r.parentNodeName}</td>
                            <td className="px-3 py-2 text-xs text-emerald-700">{r.guard}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {data.protectedTotal > data.protectedRows.length && (
                    <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
                      מוצגות {he(data.protectedRows.length)} מתוך {he(data.protectedTotal)} — הספירה למעלה מלאה.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {data.total === 0 && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              🎉 לא נמצאו צמתי רפאים.
            </p>
          )}

          {/* 🔴 סרגל ההסרה — רק לעותקים מוכחים.
              ההפרדה הזו היא כל העניין: הרוב אינם עותקים אלא מקומו היחיד של
              ילד שטרם נרשם, והסרתם תיצור בדיוק את הכפילות שהמנגנון מונע. */}
          {data.removableTotal > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-rose-200 bg-white px-3 py-2">
              <span className="text-sm font-bold text-slate-800">
                מתוכם <span className="text-rose-700">{he(data.removableTotal)}</span> עותקים מוכחים — האדם כבר בעץ
              </span>
              <button
                onClick={() => {
                  const all = data.rows.filter(isRemovable).map(r => r.nodeId)
                  setPicked(p => (p.size >= all.length ? new Set() : new Set(all)))
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:border-rose-300">
                {picked.size >= data.rows.filter(isRemovable).length ? 'נקה סימון' : 'סמן את כל המוכחים'}
              </button>
              <span className="text-[11px] text-slate-500">סומנו {he(picked.size)}</span>
              <button onClick={() => setConfirm(true)} disabled={!picked.size || removing}
                className="mr-auto inline-flex items-center gap-1.5 rounded-xl bg-rose-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-800 disabled:bg-slate-300">
                {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                הסר את המסומנים
              </button>
              <p className="w-full text-[11px] leading-relaxed text-slate-500">
                שאר <strong>{he(data.total - data.removableTotal)}</strong> אינם עותקים — אין להם כרטסת ואין להם תאום,
                כלומר אין ראיה שהאדם קיים במקום אחר. הצומת הוא מקומו היחיד, והסרתו תיצור כפילות חדשה ביום
                שבו יבוא להירשם. <strong>הם אינם ניתנים לסימון בכוונה.</strong>
              </p>
            </div>
          )}

          {GROUPS.map(g => {
            const rows = data.rows.filter(r => r.group === g.key)
            const count = data.counts[g.key]
            if (!count) return null
            return (
              <div key={g.key}>
                <button onClick={() => setOpen(o => (o === g.key ? null : g.key))}
                  className="flex w-full items-center gap-2 rounded-t-xl border border-slate-200 bg-white px-3 py-2 text-right transition-colors hover:bg-slate-50">
                  <span className="text-slate-500">{g.icon}</span>
                  <span className="text-xs font-bold text-slate-800">{g.title}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{he(count)}</span>
                  <ChevronLeft size={14}
                    className={`mr-auto text-slate-300 transition-transform ${open === g.key ? '-rotate-90' : ''}`} />
                </button>
                {open === g.key && (
                  <div className="rounded-b-xl border border-t-0 border-slate-200 bg-white">
                    <p className="border-b border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-500">{g.hint}</p>
                    <div className="max-h-[26rem] overflow-y-auto">
                      <table className="w-full text-right text-sm">
                        <thead className="sticky top-0 bg-slate-50 text-slate-600">
                          <tr>
                            <th className="w-8 px-3 py-2"></th>
                            <th className="px-3 py-2 font-medium">שם הצומת</th>
                            <th className="px-3 py-2 font-medium">דור</th>
                            <th className="px-3 py-2 font-medium">ת״ז</th>
                            <th className="px-3 py-2 font-medium">תחת</th>
                            <th className="px-3 py-2 font-medium">נכתב בכרטסת</th>
                            <th className="px-3 py-2 font-medium"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.map(r => {
                            const st = STATUS[r.status ?? 'pending'] ?? STATUS.pending
                            return (
                              <tr key={r.nodeId} className={picked.has(r.nodeId) ? 'bg-rose-50/60' : 'hover:bg-slate-50'}>
                                <td className="px-3 py-2">
                                  {/* ⚠️ תיבת סימון רק לעותק מוכח. שורה בלי ראיה
                                      אינה ניתנת לסימון — זו ההגנה, לא עיצוב. */}
                                  {isRemovable(r) ? (
                                    <input type="checkbox" checked={picked.has(r.nodeId)}
                                      onChange={() => setPicked(p => {
                                        const n = new Set(p)
                                        if (n.has(r.nodeId)) n.delete(r.nodeId); else n.add(r.nodeId)
                                        return n
                                      })}
                                      className="h-4 w-4 accent-rose-700" />
                                  ) : (
                                    <span title="אין ראיה שהאדם קיים במקום אחר — הצומת נשאר"
                                      className="block h-4 w-4 rounded border border-slate-200 bg-slate-50" />
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <button onClick={() => onLocate(r.nodeId)}
                                    className="text-right font-medium text-slate-800 hover:text-violet-700">
                                    {r.nodeName || '(ללא שם)'}
                                  </button>
                                  <span className={`mr-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${st.cls}`}>
                                    {st.txt}
                                  </span>
                                  {/* ציר התאום — אח שהשם המלא שלו מכיל את שמו.
                                      הסימן החזק ביותר לכך שזה אותו אדם פעמיים,
                                      והוא בלתי תלוי בשאלה איפה הכרטסת. */}
                                  {r.twinName && (
                                    <button onClick={() => r.twinNodeId && onLocate(r.twinNodeId)}
                                      title="אח שהשם המלא שלו מכיל את שמו של הצומת — ככל הנראה אותו אדם"
                                      className="mt-1 flex items-start gap-1 text-right text-[10px] leading-tight text-rose-600 hover:text-rose-800">
                                      <Copy size={10} className="mt-0.5 shrink-0" />
                                      <span>עותק של: {r.twinName}</span>
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-slate-400">{r.generation}</td>
                                <td className="ltr-num px-3 py-2 font-mono text-xs text-slate-500">{r.idNumber || '—'}</td>
                                <td className="max-w-[200px] truncate px-3 py-2 text-xs text-slate-600">{r.parentNodeName}</td>
                                <td className="px-3 py-2 text-xs text-slate-500">
                                  {r.childNameInCard || '—'}
                                  {/* הכרטסת של האדם עצמו — קיימת רק בשתי הקבוצות
                                      האחרונות, וזו הראיה שהוא באמת קיים במערכת. */}
                                  {r.cardBenName && (
                                    <span className="block text-[10px] text-slate-400">
                                      כרטסת: {r.cardBenName}
                                    </span>
                                  )}
                                </td>
                                <td className="whitespace-nowrap px-3 py-2">
                                  <button onClick={() => onLocate(r.nodeId)}
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-violet-700">
                                    <Search size={12} /> בעץ
                                  </button>
                                  {r.parentBenId && (
                                    <a href={`/admin/beneficiaries/${r.parentBenId}`} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-slate-800">
                                      <ExternalLink size={12} /> כרטסת ההורה
                                    </a>
                                  )}
                                  {r.cardBenId && (
                                    <a href={`/admin/beneficiaries/${r.cardBenId}`} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 hover:text-indigo-800">
                                      <ExternalLink size={12} /> הכרטסת שלו
                                    </a>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    {count > rows.length && (
                      <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
                        מוצגות {he(rows.length)} מתוך {he(count)} — הספירה למעלה מלאה.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        danger
        title="הסרת עותקים מוכחים"
        confirmLabel={`הסר ${he(picked.size)}`}
        message={
          <div className="flex flex-col gap-2 text-right text-[13px] leading-relaxed">
            <p><strong>{he(picked.size)}</strong> צמתים יימחקו מהעץ.</p>
            <p className="text-slate-600">
              כל אחד מהם הוכח כעותק — לאדם שלו יש כרטסת שיושבת על צומת אחר, או שיש לו אח שהשם המלא
              שלו מכיל אותו. אף אחד לא נעלם מהעץ.
            </p>
            <p className="text-slate-500">
              לכולם כבר הוכח שאין להם ילדים ואין להם כרטסת משלהם, ולכן אין מה להעביר. השרת בודק זאת
              מחדש ומדלג על כל מה שהשתנה מאז הסריקה.
            </p>
            <p className="font-bold text-rose-700">המחיקה אינה הפיכה.</p>
          </div>
        }
        onConfirm={() => void runRemove()}
        onCancel={() => setConfirm(false)}
      />
    </div>
  )
}

function Card({ label, value, icon, tone, onClick, active }: {
  label: string; value: number; icon: React.ReactNode
  tone: 'green' | 'slate' | 'rose' | 'amber' | 'orange'
  onClick?: () => void; active?: boolean
}) {
  const tones: Record<string, string> = {
    green: 'border-green-200 bg-green-50 text-green-700',
    slate: 'border-slate-300 bg-white text-slate-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 ${tones[tone]} ${active ? 'ring-2 ring-slate-400' : ''} ${onClick ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}>
      <div className="flex items-center gap-1.5">{icon}<span className="text-lg font-bold">{he(value)}</span></div>
      <span className="text-center text-[11px] font-medium leading-tight">{label}</span>
    </button>
  )
}
