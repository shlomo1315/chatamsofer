'use client'

// ─────────────────────────────────────────────────────────────────────────────
// צמתי רפאים — מסך אבחון לצמתים שנוצרו משדה הילדים של כרטסת.
//
// 🔴 קריאה בלבד, במכוון. אין כאן כפתור מחיקה ואין שום פעולה שמשנה נתונים:
// המסך נועד קודם כל לענות על "כמה יש ומי הם", כדי שאפשר יהיה לאשר את המספרים
// לפני שמחליטים מה לעשות. כל שורה מקושרת לעץ ולכרטסת כדי שאפשר יהיה לבדוק
// אותה בעין — זו הדרך היחידה לוודא שהסריקה צודקת.
//
// שלוש הקבוצות מסודרות לפי כמה יש מה להציל, מהקל לחמור:
//   · אין כרטסת בכלל   — הצומת הוא הד של שורה בטופס.
//   · כרטסת בלי צומת   — יש אדם אמיתי שרק לא שויך; הצומת הזה הוא מקומו.
//   · כרטסת בצומת אחר  — האדם כבר בעץ, וזה עותק כפול שלו.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useCallback } from 'react'
import {
  Ghost, Loader2, Search, ChevronLeft, ExternalLink, ShieldQuestion,
  UserRoundX, UserRoundSearch, CopyX, Info,
} from 'lucide-react'

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
}

interface ScanData {
  rows: Row[]
  counts: Record<GhostGroup, number>
  total: number
  skipped: { withChildren: number; withCard: number }
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

export default function GhostChildrenPanel({ onLocate }: { onLocate: (id: string) => void }) {
  const [data, setData] = useState<ScanData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  // הקבוצה הפתוחה. אחת בלבד — שלוש רשימות פתוחות יחד הופכות את המסך לגלילה
  // אינסופית שאי אפשר להתמצא בה.
  const [open, setOpen] = useState<GhostGroup | null>(null)

  const scan = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/ghost-children', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'שגיאה בסריקה'); setData(null) }
      else { setData(d); setOpen(null) }
    } catch { setErr('שגיאת רשת') }
    setLoading(false)
  }, [])

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
            <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              עוד <strong>{he(data.skipped.withChildren + data.skipped.withCard)}</strong> צמתים עומדים בכלל הת״ז
              והושארו בחוץ במכוון:{' '}
              {data.skipped.withChildren > 0 && <>{he(data.skipped.withChildren)} כי יש להם ילדים בעץ</>}
              {data.skipped.withChildren > 0 && data.skipped.withCard > 0 && ' · '}
              {data.skipped.withCard > 0 && <>{he(data.skipped.withCard)} כי יש להם כרטסת משלהם</>}.
            </p>
          )}

          {data.total === 0 && (
            <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              🎉 לא נמצאו צמתי רפאים.
            </p>
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
                              <tr key={r.nodeId} className="hover:bg-slate-50">
                                <td className="px-3 py-2">
                                  <button onClick={() => onLocate(r.nodeId)}
                                    className="text-right font-medium text-slate-800 hover:text-violet-700">
                                    {r.nodeName || '(ללא שם)'}
                                  </button>
                                  <span className={`mr-1.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${st.cls}`}>
                                    {st.txt}
                                  </span>
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
