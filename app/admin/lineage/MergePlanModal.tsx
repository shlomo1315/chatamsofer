'use client'
import { AlertTriangle, Check, Loader2 } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// מודאל תצוגה מקדימה של מיזוג — "כך זה ייראה". מציג את כל המפל (הדור שנבחר +
// דורות שנגררים מעל/מתחת), נותן לבחור/לערוך שם לכל דור, ומראה דורות שהמפל נעצר
// בהם. משותף לשני מסלולי המיזוג (מרכז המיזוגים והמיזוג הידני בעץ) — כדי שתהיה
// חוויה *אחת* בלבד, עם תצוגה מקדימה ובחירת שם, בכל דרך שבה מגיעים למיזוג.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanStep {
  keepId: string; generation: number; direction: 'requested' | 'up' | 'down'
  count: number; names: string[]; needsNameChoice: boolean
  candidates?: { id: string; name: string; status: string | null; relation: string | null; children: number }[]
}
export interface PlanResp {
  steps: PlanStep[]
  stopped: { generation: number; keepId: string; keepName: string; otherId: string; otherName: string }[]
  totalMerged: number
  generations: number[]
}

const DIR_LABEL: Record<PlanStep['direction'], string> = {
  requested: 'הדור שבחרת',
  up: 'דור למעלה',
  down: 'דור למטה',
}

export default function MergePlanModal({
  data, names, upApprox, busy, planning,
  onNameChange, onToggleApprox, onConfirm, onClose,
}: {
  data: PlanResp
  names: Record<string, string>
  upApprox: boolean
  busy: boolean
  planning: boolean
  onNameChange: (keepId: string, name: string) => void
  onToggleApprox: (checked: boolean) => void
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 96, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 620, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ background: '#F5F3FF', borderBottom: '2px solid #DDD6FE', padding: '14px 18px' }}>
          <div style={{ fontSize: 15.5, fontWeight: 800, color: '#5B21B6' }}>אישור מיזוג — כך זה ייראה</div>
          <div style={{ fontSize: 12, color: '#7C3AED', marginTop: 3 }}>
            {data.totalMerged} צמתים ימוזגו · {data.generations.length} דורות
            {data.generations.length > 0 && ` (${Math.min(...data.generations)}–${Math.max(...data.generations)})`}
          </div>
        </div>

        <div style={{ padding: 16, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* מיזוג הדורות שמעל גם בניסוח שונה — מונע אבות כפולים אחרי מיזוג הבן */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#FAF5FF', border: '1.5px solid #E9D5FF', borderRadius: 12, padding: '10px 13px', cursor: planning ? 'default' : 'pointer' }}>
            <input type="checkbox" checked={upApprox} disabled={planning}
              onChange={e => onToggleApprox(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: '#7C3AED', cursor: 'pointer', marginTop: 2 }} />
            <span style={{ fontSize: 12.5, color: '#4C1D95', fontWeight: 700 }}>
              למזג גם את הדורות שמעל כשהניסוח שונה
              <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#7C3AED', marginTop: 3, lineHeight: 1.5 }}>
                אם אלו אותו אדם — גם אבותיהם אותו אדם, גם אם נרשמו בניסוח אחר. הניסוח המפורט הוא שיישאר, וניתן לערוך אותו כאן.
              </span>
            </span>
          </label>
          {data.steps.map(s => (
            <div key={s.keepId}
              style={{ border: `1.5px solid ${s.direction === 'requested' ? '#7C3AED' : '#E2E8F0'}`, borderRadius: 12, padding: '11px 13px', background: s.direction === 'requested' ? '#FAF5FF' : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '1px 7px' }}>דור {s.generation}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#64748B' }}>{DIR_LABEL[s.direction]}</span>
                <span style={{ fontSize: 11.5, color: '#475569' }}>· {s.count} צמתים → 1</span>
                {!s.needsNameChoice && (
                  <span style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>· השם זהה בכולם</span>
                )}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 800, color: s.needsNameChoice ? '#92400E' : '#475569', marginBottom: 6 }}>
                {s.needsNameChoice ? 'הניסוחים שונים — איזה שם יישאר?' : 'השם שיישאר (ניתן לערוך):'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {s.names.map(nm => {
                  const on = names[s.keepId] === nm
                  return (
                    <button key={nm} type="button" onClick={() => onNameChange(s.keepId, nm)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'right', background: on ? '#FAF5FF' : '#fff', border: `2px solid ${on ? '#7C3AED' : '#E2E8F0'}`, borderRadius: 9, padding: '7px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      <span style={{ width: 13, height: 13, borderRadius: '50%', border: `2px solid ${on ? '#7C3AED' : '#CBD5E1'}`, background: on ? '#7C3AED' : '#fff', flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: '#0F172A' }}>{nm}</span>
                    </button>
                  )
                })}
                <input
                  value={s.names.includes(names[s.keepId]) ? '' : (names[s.keepId] ?? '')}
                  onChange={e => onNameChange(s.keepId, e.target.value)}
                  placeholder="או הזן שם אחר…"
                  style={{ width: '100%', padding: '7px 10px', fontSize: 12.5, borderRadius: 9, border: '2px solid #E2E8F0', outline: 'none', fontFamily: 'inherit', direction: 'rtl' }}
                />
              </div>
            </div>
          ))}

          {data.stopped.length > 0 && (
            <div style={{ background: '#FFFBEB', border: '1.5px solid #FDE68A', borderRadius: 12, padding: '11px 13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: '#92400E', marginBottom: 7 }}>
                <AlertTriangle size={14} /> המפל נעצר כאן — נדרשת הכרעה שלך
              </div>
              {data.stopped.map((st, i) => (
                <div key={i} style={{ fontSize: 11.5, color: '#78350F', lineHeight: 1.7 }}>
                  דור {st.generation}: «{st.keepName}» מול «{st.otherName}» — שמות שונים, לא מוזגו.
                </div>
              ))}
              <div style={{ fontSize: 11, color: '#92400E', marginTop: 6 }}>
                אפשר למזג אותם בנפרד אחרי שתחליט — הם יופיעו בסריקה הבאה.
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, padding: 16, borderTop: '1px solid #E2E8F0' }}>
          <button type="button" disabled={busy} onClick={onConfirm}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 11, padding: '11px 0', fontSize: 13.5, fontWeight: 800, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1, fontFamily: 'inherit' }}>
            {busy ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
            בצע מיזוג
          </button>
          <button type="button" onClick={onClose}
            style={{ background: '#fff', color: '#475569', border: '2px solid #CBD5E1', borderRadius: 11, padding: '11px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
