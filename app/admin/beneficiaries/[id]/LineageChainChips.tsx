'use client'
import { useState } from 'react'
import { ChevronLeft, Loader2 } from 'lucide-react'

// דור בשרשרת: שם, מספר דור, האם תואם לנתיב המאושר, ותגית בן/חתן.
export interface ChainGen {
  generation: number
  name: string
  verified: boolean          // תואם לצומת מאומת במאגר (רק רלוונטי עד דור 5)
  relation?: 'son' | 'son_in_law' | null
}

type Color = 'green' | 'red' | 'orange'

// ─────────────────────────────────────────────────────────────────────────────
// שרשרת הדורות עם צביעה אוטומטית + סימון ידני:
//   • ברירת מחדל: דור ≤5 שתואם למאושר → ירוק · דור ≤5 ששונה → אדום · דור >5 → כתום.
//   • המנהל יכול לסמן ידנית כל דור אדום/ירוק (override), והבחירה נשמרת.
//   לחיצה על דור מסובבת: אוטומטי → ירוק → אדום → אוטומטי.
// ─────────────────────────────────────────────────────────────────────────────
const AUTO_DEPTH = 5

const STYLE: Record<Color, string> = {
  green:  'bg-green-100 text-green-800 border-green-400',
  red:    'bg-red-100 text-red-800 border-red-400 font-bold',
  orange: 'bg-orange-100 text-orange-800 border-orange-300',
}
const GEN_TXT: Record<Color, string> = { green: 'text-green-600', red: 'text-red-500', orange: 'text-orange-500' }

export default function LineageChainChips({
  beneficiaryId, gens, initialMarks,
}: {
  beneficiaryId: string
  gens: ChainGen[]
  initialMarks: Record<string, 'red' | 'green'>
}) {
  const [marks, setMarks] = useState<Record<string, 'red' | 'green'>>(initialMarks)
  const [saving, setSaving] = useState(false)

  // הצבע האוטומטי לפי הכלל (לפני override ידני)
  const autoColor = (g: ChainGen): Color => {
    if (g.generation > AUTO_DEPTH) return 'orange'
    return g.verified ? 'green' : 'red'
  }
  // הצבע בפועל — override ידני גובר על האוטומטי
  const colorOf = (g: ChainGen): Color => {
    const m = marks[String(g.generation)]
    return m ?? autoColor(g)
  }

  // לחיצה: אוטומטי → ירוק → אדום → אוטומטי (מחזור)
  const cycle = async (g: ChainGen) => {
    const cur = marks[String(g.generation)]
    const next: 'red' | 'green' | null = cur == null ? 'green' : cur === 'green' ? 'red' : null
    const nextMarks = { ...marks }
    if (next) nextMarks[String(g.generation)] = next
    else delete nextMarks[String(g.generation)]
    setMarks(nextMarks)
    setSaving(true)
    try {
      await fetch('/api/admin/lineage-marks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beneficiaryId, marks: { [String(g.generation)]: next } }),
      })
    } catch { /* שמירה best-effort */ }
    setSaving(false)
  }

  const relTag = (r?: 'son' | 'son_in_law' | null) =>
    (r === 'son' || r === 'son_in_law')
      ? <span className="text-[10px] font-semibold bg-white/70 rounded px-1 mr-1">{r === 'son' ? 'בן' : 'חתן'}</span>
      : null

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {gens.map((g, i) => {
          const color = colorOf(g)
          const overridden = marks[String(g.generation)] != null
          return (
            <span key={g.generation} className="flex items-center gap-1.5">
              {i > 0 && <ChevronLeft size={12} className="text-slate-300" />}
              <button type="button" onClick={() => cycle(g)}
                title={`דור ${g.generation} — לחצו לסימון ידני (ירוק/אדום/אוטומטי)`}
                className={`text-xs px-2.5 py-1 rounded-full border transition-all hover:brightness-95 ${STYLE[color]} ${overridden ? 'ring-2 ring-offset-1 ring-slate-300' : ''}`}>
                <span className={`ml-1 ${GEN_TXT[color]}`}>דור {g.generation}</span>{g.name}{relTag(g.relation)}
                {color === 'red' && <span className="mr-1">⚠</span>}
              </button>
            </span>
          )
        })}
        {saving && <Loader2 size={13} className="animate-spin text-slate-400" />}
      </div>
      <p className="text-[11px] text-slate-400 mt-1.5">
        ירוק = תואם למאושר (עד דור 5) · אדום = שונה מהמאושר · כתום = דורות נוספים.
        לחצו על דור לסימון ידני.
      </p>
    </div>
  )
}
