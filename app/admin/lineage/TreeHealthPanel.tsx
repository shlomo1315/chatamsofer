'use client'
import { useState, useCallback } from 'react'
import { Activity, Loader2, RefreshCw, AlertTriangle, Users, Trash2, GitMerge, IdCard, ChevronLeft } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// "בריאות העץ" — פאנל אבחון שמציג את כל התקלות המבניות בעץ הדורות במקום אחד:
// צמתים יתומים (שאריות מיזוג), ריבוי-ילדים חריג (כפילות לא-ממוזגת), ת"ז כפולות
// במוטבים, וסיכום כפילויות שם. קריאה בלבד — כל תיקון מפנה לכלי הקיים (מיזוג/עץ).
// ─────────────────────────────────────────────────────────────────────────────

interface Orphan { id: string; name: string; generation: number; status: string | null; parentName: string }
interface ManyChild { id: string; name: string; generation: number; children: number }
interface DupId { idNumber: string; owners: { benId: string; name: string; field: 'בעל' | 'אשה' }[] }
interface HealthData {
  scannedNodes: number
  scannedBeneficiaries: number
  orphans: Orphan[]
  manyChildren: ManyChild[]
  duplicateIds: DupId[]
  duplicateNames: { exact: number; strong: number; possible: number }
}

export default function TreeHealthPanel({ onLocate, onOpenDuplicates }: {
  onLocate: (id: string) => void
  onOpenDuplicates: () => void
}) {
  const [data, setData] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

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

  const dupNamesTotal = data ? data.duplicateNames.exact + data.duplicateNames.strong + data.duplicateNames.possible : 0

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
            <SummaryCard icon={<GitMerge size={15} />} label="כפילויות שם" value={dupNamesTotal}
              tone={dupNamesTotal ? 'amber' : 'green'} onClick={dupNamesTotal ? onOpenDuplicates : undefined} />
            <SummaryCard icon={<Users size={15} />} label="ריבוי ילדים חריג" value={data.manyChildren.length}
              tone={data.manyChildren.length ? 'orange' : 'green'} />
            <SummaryCard icon={<Trash2 size={15} />} label="צמתים יתומים" value={data.orphans.length}
              tone={data.orphans.length ? 'rose' : 'green'} />
            <SummaryCard icon={<IdCard size={15} />} label="ת״ז כפולות" value={data.duplicateIds.length}
              tone={data.duplicateIds.length ? 'red' : 'green'} />
          </div>

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

          {/* ת"ז כפולות */}
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

          {data.orphans.length === 0 && data.manyChildren.length === 0 && data.duplicateIds.length === 0 && dupNamesTotal === 0 && (
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
