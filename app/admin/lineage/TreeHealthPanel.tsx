'use client'
import { useState, useCallback, useRef, useEffect } from 'react'
import { Activity, Loader2, RefreshCw, AlertTriangle, Users, Trash2, GitMerge, IdCard, ChevronLeft, EyeOff, Link2Off, Check } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// "בריאות העץ" — פאנל אבחון שמציג את כל התקלות המבניות בעץ הדורות במקום אחד:
// צמתים יתומים (שאריות מיזוג), ריבוי-ילדים חריג (כפילות לא-ממוזגת), ת"ז כפולות
// במוטבים, וסיכום כפילויות שם. קריאה בלבד — כל תיקון מפנה לכלי הקיים (מיזוג/עץ).
// ─────────────────────────────────────────────────────────────────────────────

interface Orphan { id: string; name: string; generation: number; status: string | null; parentName: string }
interface Invisible extends Orphan { reason: string; descendants: number }
interface ManyChild { id: string; name: string; generation: number; children: number }
interface DupId { idNumber: string; owners: { benId: string; name: string; field: 'בעל' | 'אשה' }[] }
/** חוליה חסומה — צומת לא-מאומת שילדיו מאומתים, שחוסם את בורר הדורות. */
interface BlockedLink {
  id: string
  name: string
  generation: number | null
  status: string | null
  verifiedChildren: number
  subtreeSize: number
  ancestorsVerified: boolean
}

interface HealthData {
  scannedNodes: number
  scannedBeneficiaries: number
  /** 🔴 החוליות שחוסמות את בורר הדורות. */
  blockedLinks?: BlockedLink[]
  verifiedUnreachable?: { verified: number; reachable: number; unreachable: number }
  invisible: Invisible[]
  dangling: Invisible[]
  orphans: Orphan[]
  manyChildren: ManyChild[]
  duplicateIds: DupId[]
  duplicateIdsCount: number            // הספירה המלאה (גם כשהפרטים חסומים בהרשאה)
  duplicateIdsRestricted: boolean      // אין הרשאת צפייה במשפחות — הפרטים הוסתרו
  duplicateNames: { exact: number; strong: number; possible: number }
  /** פער העומק — מדוע נרשמים נתקעים. ראו הסעיף בתחתית הפאנל. */
  depth?: { generation: number; total: number; leaves: number; leafPct: number }[]
  bottleneck?: { generation: number; total: number; leaves: number; leafPct: number } | null
  familiesAtBottleneck?: number
}

export default function TreeHealthPanel({ onLocate, onOpenDuplicates }: {
  onLocate: (id: string) => void
  onOpenDuplicates: () => void
}) {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [approving, setApproving] = useState<string | null>(null)
  const [approveErr, setApproveErr] = useState('')

  // אישור חוליה חוסמת — צומת אחד בלבד, ואז סריקה מחדש כדי שהמספרים
  // ישקפו את המצב האמיתי (אישור אחד עשוי לחשוף חסימה שהייתה מתחתיו).
  const approve = useCallback(async (b: BlockedLink) => {
    setApproving(b.id); setApproveErr('')
    try {
      const res = await fetch('/api/admin/lineage/approve-link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: b.id }),
      })
      const d = await res.json()
      if (!res.ok) { setApproveErr(d.error || 'האישור נכשל'); return }
      await scanRef.current?.()
    } catch {
      setApproveErr('שגיאת רשת — נסו שוב')
    } finally {
      setApproving(null)
    }
  }, [])

  const scan = useCallback(async () => {
    setLoading(true); setErr('')
    try {
      const res = await fetch('/api/admin/lineage/health', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'שגיאה בסריקה'); setData(null) }
      else setData(d)
    } catch { setErr('שגיאת רשת') }
    setLoading(false)
  }, [])

  // ⚠️ ref ולא תלות ישירה: approve מוגדר לפני scan, וגם כך הוא לא נבנה מחדש
  // בכל רינדור — אחרת כל סריקה הייתה מייצרת מחדש את כל כפתורי האישור.
  const scanRef = useRef<typeof scan | null>(null)
  useEffect(() => { scanRef.current = scan }, [scan])

  const dupNamesTotal = data ? data.duplicateNames.exact + data.duplicateNames.strong + data.duplicateNames.possible : 0
  // 🔴 צמתים שלא צויירו בעץ כלל לפני התיקון — מעגל הורות או הורה שנמחק.
  const invisibleList = data ? [...(data.invisible ?? []), ...(data.dangling ?? [])] : []
  const invisibleTotal = invisibleList.length

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 mb-4" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-rose-500" />
          <h2 className="text-sm font-bold text-slate-800">בריאות העץ</h2>
          {data && <span className="text-xs text-slate-400">סרקנו {data.scannedNodes.toLocaleString('he-IL')} צמתים · {data.scannedBeneficiaries.toLocaleString('he-IL')} משפחות</span>}
        </div>
        <button onClick={scan} disabled={loading}
          className="flex items-center gap-1.5 text-sm bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white px-3 py-1.5 rounded-lg transition-colors">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {data ? 'סרוק שוב' : 'סרוק את העץ'}
        </button>
      </div>

      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
      {!data && !loading && !err && (
        <p className="text-sm text-slate-500">לחץ "סרוק את העץ" כדי לזהות כפילויות, צמתים יתומים, ות"ז כפולות.</p>
      )}

      {data && (
        <div className="flex flex-col gap-4">
          {/* כרטיסי סיכום */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SummaryCard icon={<EyeOff size={15} />} label="לא הופיעו בעץ" value={invisibleTotal}
              tone={invisibleTotal ? 'red' : 'green'} />
            <SummaryCard icon={<GitMerge size={15} />} label="כפילויות שם" value={dupNamesTotal}
              tone={dupNamesTotal ? 'amber' : 'green'} onClick={dupNamesTotal ? onOpenDuplicates : undefined} />
            <SummaryCard icon={<Users size={15} />} label="ריבוי ילדים חריג" value={data.manyChildren.length}
              tone={data.manyChildren.length ? 'orange' : 'green'} />
            <SummaryCard icon={<Trash2 size={15} />} label="צמתים יתומים" value={data.orphans.length}
              tone={data.orphans.length ? 'rose' : 'green'} />
            <SummaryCard icon={<IdCard size={15} />} label="ת״ז כפולות" value={data.duplicateIdsCount}
              tone={data.duplicateIdsCount ? 'red' : 'green'} />
            <SummaryCard icon={<Link2Off size={15} />} label="חוליות חוסמות" value={data.blockedLinks?.length ?? 0}
              tone={data.blockedLinks?.length ? 'red' : 'green'} />
          </div>

          {/* 🔴 חוליות חוסמות — התקלה שמונעת ממשפחות למצוא את עצמן *עכשיו*.
              צומת לא-מאומת שילדיו מאומתים: הבורר מדלג עליו, וכל תת-העץ
              שמתחתיו בלתי נגיש. מוצג ראשון כי הוא חוסם רישום בפועל. */}
          {data.blockedLinks?.length ? (
            <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3">
              <p className="text-sm font-extrabold text-red-900 mb-1">
                חוליות שחוסמות את בורר הדורות
              </p>
              <p className="text-xs text-red-800 leading-relaxed mb-2">
                צומת שאינו מאומת אך ילדיו כן — בורר הדורות מדלג עליו, ולכן כל הצאצאים
                שמתחתיו אינם נגישים והמשפחה נעצרת באמצע.
                {data.verifiedUnreachable && data.verifiedUnreachable.unreachable > 0 && (
                  <> כרגע <strong>{data.verifiedUnreachable.unreachable}</strong> צמתים מאומתים
                  מתוך {data.verifiedUnreachable.verified} אינם נגישים מהשורש.</>
                )}
              </p>
              <div className="flex flex-col gap-1.5">
                {data.blockedLinks.map(b => (
                  <div key={b.id}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <button onClick={() => onLocate(b.id)}
                      className="font-bold text-slate-800 hover:text-indigo-700 hover:underline text-right">
                      {b.name}
                    </button>
                    <span className="text-xs text-slate-500">דור {b.generation ?? '—'}</span>
                    <span className="text-xs font-bold text-red-600">
                      חוסם {b.verifiedChildren} מאומתים
                      {b.subtreeSize > b.verifiedChildren && ` · ${b.subtreeSize} בתת-העץ`}
                    </span>
                    {/* ⚠️ שרשרת אבות שאינה מאומתת = הצוואר האמיתי גבוה יותר.
                        אישור כאן לבדו לא יפתח את המסלול. */}
                    {!b.ancestorsVerified && (
                      <span className="text-[11px] rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 font-semibold">
                        יש חסימה גם מעליו
                      </span>
                    )}
                    <button
                      onClick={() => approve(b)}
                      disabled={approving === b.id}
                      className="mr-auto inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white">
                      {approving === b.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      אישור החוליה
                    </button>
                  </div>
                ))}
              </div>
              {approveErr && <p className="mt-2 text-xs font-semibold text-red-700">{approveErr}</p>}
            </div>
          ) : null}

          {/* 🔴 פער העומק — הסיבה שנרשמים נתקעים ולא משלימים רישום.
              מוצג ראשון: זו התקלה היחידה כאן שחוסמת משתמשים *עכשיו*. */}
          {data.depth?.length ? (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-extrabold text-amber-900 mb-1">עומק העץ — היכן נרשמים נתקעים</p>
              {data.bottleneck ? (
                <p className="text-[12px] text-amber-900 leading-relaxed mb-2">
                  העץ נקטע ב<strong>דור {data.bottleneck.generation}</strong>:{' '}
                  <strong>{data.bottleneck.leaves}</strong> מתוך {data.bottleneck.total} הצמתים שם
                  ({data.bottleneck.leafPct}%) הם קצה מסלול — אין להם המשך.
                  {(data.familiesAtBottleneck ?? 0) > 0 && (
                    <> כ־<strong>{data.familiesAtBottleneck}</strong> משפחות מגיעות לשם ונאלצות
                    להוסיף את שאר הדורות ידנית.</>
                  )}
                </p>
              ) : (
                <p className="text-[12px] text-emerald-800 mb-2">אין דור שנקטע — העץ מסועף לכל עומקו. ✅</p>
              )}
              {/* ⚠️ בלי overflow-x ובלי min-w — ארבע עמודות מספריות נכנסות
                  בכל רוחב מסך. ראה docs/no-horizontal-scroll.md */}
              <div>
                <table className="text-[11px] w-full">
                  <thead>
                    <tr className="text-amber-700">
                      <th className="text-right font-bold py-0.5 px-1">דור</th>
                      <th className="text-right font-bold py-0.5 px-1">צמתים</th>
                      <th className="text-right font-bold py-0.5 px-1">קצה מסלול</th>
                      <th className="text-right font-bold py-0.5 px-1">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.depth.map(d => (
                      <tr key={d.generation}
                        className={d.generation === data.bottleneck?.generation ? 'bg-amber-200/60 font-bold' : ''}>
                        <td className="py-0.5 px-1 text-amber-900">{d.generation}</td>
                        <td className="py-0.5 px-1 text-amber-900 ltr-num">{d.total}</td>
                        <td className="py-0.5 px-1 text-amber-900 ltr-num">{d.leaves}</td>
                        <td className="py-0.5 px-1 text-amber-900 ltr-num">{d.leafPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[10px] text-amber-800 leading-relaxed">
                ⚠️ שיעור גבוה של &quot;קצה מסלול&quot; בדור נמוך פירושו שהעץ נקטע שם — לא שהמשפחות
                נגמרו. השלמת הדורות החסרים במאגר היא מה שישחרר את הנרשמים.
              </p>
            </div>
          ) : null}

          {/* 🔴 צמתים שלא הופיעו בעץ — התקלה החמורה, כי היא בלתי נראית */}
          {invisibleTotal > 0 && (
            <Section title="צמתים שלא הופיעו בעץ"
              hint="מעגל הורות או הורה שנמחק. הם מוצגים כעת כשורש נפרד בעץ — יש לחבר אותם לאב הנכון. לחץ לצפייה">
              {invisibleList.slice(0, 100).map(n => (
                <Row key={n.id} onClick={() => onLocate(n.id)}>
                  <span className="font-medium text-slate-800">{n.name}</span>
                  <span className="text-xs text-slate-400">דור {n.generation} · תחת {n.parentName}</span>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                    <EyeOff size={11} /> {n.reason}
                  </span>
                  {n.descendants > 0 && (
                    <span className="text-xs font-bold text-red-600">+{n.descendants} צאצאים</span>
                  )}
                  <ChevronLeft size={14} className="text-slate-300 mr-auto" />
                </Row>
              ))}
              {invisibleTotal > 100 && <p className="text-xs text-slate-400 px-2 py-1">מוצגים 100 מתוך {invisibleTotal}</p>}
            </Section>
          )}

          {/* ריבוי ילדים חריג */}
          {data.manyChildren.length > 0 && (
            <Section title="צמתים עם ריבוי ילדים חריג" hint="חשד לכפילויות שטרם מוזגו מתחתיהם — לחץ לצפייה בעץ">
              {data.manyChildren.map(n => (
                <Row key={n.id} onClick={() => onLocate(n.id)}>
                  <span className="font-medium text-slate-800">{n.name}</span>
                  <span className="text-xs text-slate-400">דור {n.generation}</span>
                  <span className="mr-auto inline-flex items-center gap-1 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                    <AlertTriangle size={11} /> {n.children} ילדים
                  </span>
                  <ChevronLeft size={14} className="text-slate-300" />
                </Row>
              ))}
            </Section>
          )}

          {/* צמתים יתומים */}
          {data.orphans.length > 0 && (
            <Section title="צמתים יתומים" hint="בלי ילדים ובלי משפחה מקושרת — לרוב שאריות ממיזוג. לחץ לצפייה בעץ (משם אפשר למחוק)">
              {data.orphans.slice(0, 100).map(n => (
                <Row key={n.id} onClick={() => onLocate(n.id)}>
                  <span className="font-medium text-slate-800">{n.name}</span>
                  <span className="text-xs text-slate-400">דור {n.generation} · תחת {n.parentName}</span>
                  <ChevronLeft size={14} className="text-slate-300 mr-auto" />
                </Row>
              ))}
              {data.orphans.length > 100 && <p className="text-xs text-slate-400 px-2 py-1">מוצגים 100 מתוך {data.orphans.length}</p>}
            </Section>
          )}

          {/* ת"ז כפולות — הפרטים (מספרי ת"ז ושמות) חסומים למי שאין לו הרשאת צפייה במשפחות */}
          {data.duplicateIdsRestricted && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
              נמצאו <strong>{data.duplicateIdsCount}</strong> ת״ז כפולות במשפחות. הפרטים המלאים (מספרי ת״ז ושמות) מוצגים רק לבעלי הרשאת צפייה במשפחות.
            </div>
          )}
          {data.duplicateIds.length > 0 && (
            <Section title="ת״ז כפולות במשפחות" hint="אותה תעודת זהות מופיעה ביותר ממשפחה אחת — בדוק אם מדובר בכפילות רישום">
              {data.duplicateIds.map(d => (
                <div key={d.idNumber} className="px-2 py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="ltr-num text-xs font-mono font-bold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-0.5">{d.idNumber}</span>
                    <span className="text-xs text-slate-400">{d.owners.length} רשומות</span>
                  </div>
                  <div className="flex flex-col gap-1 pr-2">
                    {d.owners.map((o, i) => (
                      <button key={i} onClick={() => window.open(`/admin/beneficiaries/${o.benId}`, '_blank')}
                        className="text-right text-xs text-slate-600 hover:text-indigo-600 flex items-center gap-1.5">
                        <span className="text-slate-400">({o.field})</span> {o.name}
                        <ChevronLeft size={12} className="text-slate-300" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
          )}

          {data.orphans.length === 0 && data.manyChildren.length === 0 && data.duplicateIdsCount === 0 && dupNamesTotal === 0 && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">🎉 העץ נקי — לא נמצאו תקלות מבניות.</p>
          )}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, tone, onClick }: {
  icon: React.ReactNode; label: string; value: number
  tone: 'green' | 'amber' | 'orange' | 'rose' | 'red'; onClick?: () => void
}) {
  const tones: Record<string, string> = {
    green: 'border-green-200 bg-green-50 text-green-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  }
  return (
    <button onClick={onClick} disabled={!onClick}
      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 ${tones[tone]} ${onClick ? 'hover:brightness-95 cursor-pointer' : 'cursor-default'}`}>
      <div className="flex items-center gap-1.5">{icon}<span className="text-lg font-bold">{value}</span></div>
      <span className="text-[11px] font-medium">{label}</span>
    </button>
  )
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1">
        <h3 className="text-xs font-bold text-slate-700">{title}</h3>
        <p className="text-[11px] text-slate-400">{hint}</p>
      </div>
      <div className="rounded-xl border border-slate-200 max-h-72 overflow-y-auto">{children}</div>
    </div>
  )
}

function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 px-2.5 py-2 border-b border-slate-100 last:border-0 hover:bg-slate-50 text-right transition-colors">
      {children}
    </button>
  )
}
