'use client'
import { useState, useCallback, useEffect } from 'react'
import { Loader2, RefreshCw, X, Check, Undo2, AlertTriangle, Users, MapPin } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import MergePlanModal, { type PlanResp, type PlanStep } from './MergePlanModal'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז המיזוגים — סריקת כפילויות והכרעה עליהן.
//
// ⚠️ העיקרון: המערכת *מציעה*, המשתמש *מכריע*. מיזוג של שני אנשים שאינם אותו
// אדם הוא הרסני, ולכן רק התאמה ודאית (שם זהה אחרי הסרת תארים) ניתנת לאישור
// מרוכז. כל השאר מוצג ככרטיס השוואה עם הנימוק כתוב, ודורש לחיצה פרטנית.
//
// ⚠️ כל מיזוג מפעיל את המפל: הוא גורר גם את הדורות שמתחת ומעל, ולכן מספר
// המיזוגים בפועל גדול ממספר הקבוצות שסומנו — וזה כתוב למשתמש בתוצאה.
// ─────────────────────────────────────────────────────────────────────────────

type Level = 'exact' | 'strong' | 'possible'
interface DupNode {
  id: string; name: string; status: string | null; relation: string | null
  children: number; families: number
}
interface DupGroup {
  level: Level; reason: string; parentId: string; parentName: string
  generation: number; nodes: DupNode[]
}
interface UndoBatch { batchId: string; at: string; count: number; names: string[] }

// PlanStep/PlanResp מיובאים מ-MergePlanModal (מקור אחד לתצוגת התצוגה המקדימה).

const LEVEL_UI: Record<Level, { label: string; hint: string; bg: string; fg: string; border: string }> = {
  exact:    { label: 'זהים', hint: 'שם זהה אחרי הסרת תארים — בטוח למיזוג מרוכז', bg: '#F0FDF4', fg: '#166534', border: '#BBF7D0' },
  strong:   { label: 'קרובים מאוד', hint: 'דורש הכרעה שלך — עברו אחד-אחד', bg: '#FFFBEB', fg: '#92400E', border: '#FDE68A' },
  possible: { label: 'אפשריים', hint: 'חפיפה חלקית בלבד — לעיון', bg: '#F8FAFC', fg: '#475569', border: '#E2E8F0' },
}

const statusTxt = (s: string | null) => s === 'rejected' ? 'נדחה' : s === 'pending' ? 'ממתין' : 'מאושר'
const relTxt = (r: string | null) => r === 'son' ? 'בן' : r === 'son_in_law' ? 'חתן' : 'לא צוין'

export default function DuplicatesPanel({
  onDone, onCandidates, onLocate,
}: {
  onDone: () => void
  /** כל המועמדים שנמצאו — מסומנים על העץ כדי שיהיו נראים על המפה */
  onCandidates: (ids: string[]) => void
  /** מיקוד בקבוצה אחת — העץ גולל אליה ומדגיש אותה */
  onLocate: (ids: string[]) => void
}) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<DupGroup[]>([])
  const [counts, setCounts] = useState({ exact: 0, strong: 0, possible: 0 })
  const [tab, setTab] = useState<Level>('exact')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [undoList, setUndoList] = useState<UndoBatch[]>([])
  // תצוגה מקדימה של המפל + בחירת שם לכל דור שבו הניסוחים שונים
  const [plan, setPlan] = useState<{ group: DupGroup; data: PlanResp; names: Record<string, string> } | null>(null)
  // ⚠️ מיזוג אחורנית גם כשהניסוח שונה. השרשרת שהתפצלה נרשמה בכל ענף אחרת
  // ("שמואל בנימין שישא" מול "רבי שמואל בנימין והרבנית חיה ליבא שישא"), ולכן
  // מיזוג הבן לבדו השאיר את האב כפול. חל רק על *הורים של צמתים שמוזגו* —
  // המבנה מוכיח שהם אותו אדם — ורק במיזוג המודרך, לא בהרצה מרוכזת.
  const [upApprox, setUpApprox] = useState(true)
  const [planning, setPlanning] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/lineage/duplicates?level=possible', { cache: 'no-store' })
      const d = await r.json()
      const gs: DupGroup[] = Array.isArray(d.groups) ? d.groups : []
      setGroups(gs)
      setCounts(d.counts ?? { exact: 0, strong: 0, possible: 0 })
      setSel(new Set())
      // כל המועמדים מסומנים על העץ — כך רואים על המפה איפה הכפילויות יושבות
      onCandidates(gs.flatMap(g => g.nodes.map(n => n.id)))
    } catch { toast.error('שגיאה בסריקת הכפילויות') }
    setLoading(false)
  }, [toast, onCandidates])

  const loadUndo = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/lineage/merge/undo', { cache: 'no-store' })
      const d = await r.json()
      setUndoList(Array.isArray(d.batches) ? d.batches.slice(0, 5) : [])
    } catch { /* לא קריטי */ }
  }, [])

  useEffect(() => { const t = setTimeout(() => { void scan(); void loadUndo() }, 0); return () => clearTimeout(t) }, [scan, loadUndo])

  const groupKey = (g: DupGroup) => g.nodes.map(n => n.id).sort().join(',')

  // ⚠️ אותו כלל בחירה בדיוק כמו pickKeepId בשרת (מאומת → הכי הרבה ילדים →
  // מזהה), כדי שמי שנשאר יהיה מי שהמשתמש רואה בכרטיס ולא הפתעה.
  const chooseKeep = (nodes: DupNode[]) => [...nodes].sort((a, b) => {
    const av = a.status === 'verified' ? 1 : 0, bv = b.status === 'verified' ? 1 : 0
    if (av !== bv) return bv - av
    if (a.children !== b.children) return b.children - a.children
    return a.id.localeCompare(b.id)
  })[0]

  // ⚠️ ברירת המחדל לשם היא הניסוח *המלא ביותר* ולא זה של הצומת שנשאר: מי
  // שנשאר נבחר לפי ילדים ואימות, ואין קשר בין זה לבין איכות ניסוח השם.
  // "רבי ישראל ומרת רחל לבל" עדיף על "ישראל ורחל לבל" — ואת ההכרעה הסופית
  // עושה המשתמש בחלונית.
  const fullestName = (nodes: DupNode[]) =>
    [...nodes].sort((a, b) => {
      const aw = a.name.trim().split(/\s+/).length, bw = b.name.trim().split(/\s+/).length
      if (aw !== bw) return bw - aw
      return b.name.trim().length - a.name.trim().length
    })[0].name

  type MergeOutcome = 'ok' | 'gone' | 'error'

  // פתיחת תצוגה מקדימה: מחשבת את כל המפל ואוספת הכרעת שם לכל דור שנדרש
  const openPlan = async (g: DupGroup, approx = upApprox) => {
    const key = groupKey(g)
    setPlanning(key)
    try {
      const keep = chooseKeep(g.nodes)
      const r = await fetch('/api/admin/lineage/merge/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: keep.id, mergeIds: g.nodes.filter(n => n.id !== keep.id).map(n => n.id), cascadeUpApprox: approx }),
      })
      const d: PlanResp = await r.json()
      if (!r.ok) { toast.error((d as unknown as { error?: string }).error || 'שגיאה בחישוב המיזוג'); setPlanning(null); return }
      // ⚠️ ברירת מחדל *לכל* דור, גם כשהשם זהה בכולם: גם אז המשתמש רוצה לעיתים
      // לתקן ניסוח או להוסיף תואר, ולכן השדה נפתח תמיד ולא רק כשיש מחלוקת.
      const names: Record<string, string> = {}
      for (const s of d.steps) {
        names[s.keepId] = [...s.names].sort((a, b) => {
          const aw = a.trim().split(/\s+/).length, bw = b.trim().split(/\s+/).length
          return aw !== bw ? bw - aw : b.trim().length - a.trim().length
        })[0]
      }
      setPlan({ group: g, data: d, names })
    } catch { toast.error('שגיאת רשת') }
    setPlanning(null)
  }

  const mergeGroup = async (g: DupGroup, quiet = false, names?: Record<string, string>, approx = false): Promise<MergeOutcome> => {
    try {
      const keep = chooseKeep(g.nodes)
      const r = await fetch('/api/admin/lineage/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepId: keep.id,
          mergeIds: g.nodes.filter(n => n.id !== keep.id).map(n => n.id),
          names: names ?? { [keep.id]: fullestName(g.nodes) },
          // ⚠️ הרצה מרוכזת נשארת על התאמה מדויקת בלבד: מיזוג מקורב של עשרות
          // קבוצות בבת אחת הוא בדיוק מה שאי אפשר לבדוק בדיעבד.
          cascadeUpApprox: approx,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        // ⚠️ הקבוצה כבר נבלעה במפל של מיזוג קודם באותה ריצה — זו התנהגות
        // תקינה ולא כשל. בלי ההבחנה הזו מיזוג מרוכז היה מציג שגיאות אדומות
        // על קבוצות שדווקא טופלו כמו שצריך.
        if (r.status === 404) return 'gone'
        if (!quiet) toast.error(d.error || 'שגיאה במיזוג')
        return 'error'
      }
      if (!quiet) {
        toast.success(
          d.cascadedCount
            ? `מוזגו ${d.mergedCount} צמתים (מהם ${d.cascadedCount} נגררו במפל) · ${d.reassignedChildren} ילדים`
            : `מוזגו ${d.mergedCount} צמתים · ${d.reassignedChildren} ילדים`,
        )
      }
      return 'ok'
    } catch {
      if (!quiet) toast.error('שגיאת רשת')
      return 'error'
    }
  }

  const mergeSelected = async () => {
    const chosen = groups.filter(g => sel.has(groupKey(g)))
    if (!chosen.length) return
    setBusy('bulk')
    let ok = 0, gone = 0, failed = 0
    for (const g of chosen) {
      const out = await mergeGroup(g, true)
      if (out === 'ok') ok++
      else if (out === 'gone') gone++
      else failed++
    }
    setBusy(null)
    const parts = [`מוזגו ${ok} קבוצות`]
    if (gone) parts.push(`${gone} כבר נכללו במפל`)
    if (failed) parts.push(`${failed} נכשלו`)
    if (failed) toast.error(parts.join(' · '))
    else toast.success(parts.join(' · '))
    await scan(); await loadUndo(); onDone()
  }

  const notDuplicate = async (g: DupGroup) => {
    const key = groupKey(g)
    setBusy(key)
    try {
      await fetch('/api/admin/lineage/duplicates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: g.nodes.map(n => n.id) }),
      })
      setGroups(prev => prev.filter(x => groupKey(x) !== key))
      toast.success('סומן — הזוג לא יוצע שוב')
    } catch { toast.error('שגיאה בשמירה') }
    setBusy(null)
  }

  const undo = async (batchId: string) => {
    setBusy(batchId)
    try {
      const r = await fetch('/api/admin/lineage/merge/undo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId }),
      })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error || 'שגיאה בביטול'); setBusy(null); return }
      toast.success(`המיזוג בוטל · ${d.restored} צמתים הוחזרו`)
      await scan(); await loadUndo(); onDone()
    } catch { toast.error('שגיאת רשת') }
    setBusy(null)
  }

  const shown = groups.filter(g => g.level === tab)

  return (
    <div style={{ background: '#fff', border: '2px solid #E9D5FF', borderRadius: 18, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <Users size={18} color="#7C3AED" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#5B21B6' }}>מרכז המיזוגים</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED' }}>
            כל מיזוג גורר אוטומטית את הדורות שמעליו ומתחתיו
          </div>
        </div>
        <button onClick={() => { void scan(); void loadUndo() }} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#5B21B6', border: '1.5px solid #DDD6FE', borderRadius: 10, padding: '7px 13px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> סרוק מחדש
        </button>
      </div>

      {/* ביטול מיזוגים אחרונים */}
      {undoList.length > 0 && (
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: '9px 12px', marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#475569', marginBottom: 6 }}>מיזוגים אחרונים — ניתן לבטל</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {undoList.map(b => (
              <button key={b.batchId} onClick={() => void undo(b.batchId)} disabled={busy === b.batchId}
                title={b.names.join(' · ')}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', border: '1px solid #CBD5E1', borderRadius: 9, padding: '5px 10px', fontSize: 11.5, fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}>
                {busy === b.batchId ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Undo2 size={11} />}
                {b.names[0]} {b.count > 1 ? `+${b.count - 1}` : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* לשוניות לפי רמת ודאות */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['exact', 'strong', 'possible'] as Level[]).map(l => (
          <button key={l} onClick={() => { setTab(l); setSel(new Set()) }}
            style={{ background: tab === l ? LEVEL_UI[l].fg : LEVEL_UI[l].bg, color: tab === l ? '#fff' : LEVEL_UI[l].fg, border: `1.5px solid ${tab === l ? LEVEL_UI[l].fg : LEVEL_UI[l].border}`, borderRadius: 10, padding: '6px 13px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {LEVEL_UI[l].label} · {counts[l]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: '#64748B', marginBottom: 10 }}>{LEVEL_UI[tab].hint}</div>

      {/* אישור מרוכז — רק לרמת "זהים" */}
      {tab === 'exact' && shown.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <button onClick={() => setSel(s => s.size === shown.length ? new Set() : new Set(shown.map(groupKey)))}
            style={{ background: '#fff', border: '1.5px solid #CBD5E1', borderRadius: 9, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: 'inherit' }}>
            {sel.size === shown.length ? 'בטל בחירה' : 'סמן הכל'}
          </button>
          <button onClick={() => void mergeSelected()} disabled={!sel.size || busy === 'bulk'}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: sel.size ? '#16A34A' : '#CBD5E1', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 14px', fontSize: 12.5, fontWeight: 800, cursor: sel.size ? 'pointer' : 'default', fontFamily: 'inherit' }}>
            {busy === 'bulk' ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
            מזג {sel.size} קבוצות
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 30, color: '#7C3AED' }}>
          <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> סורק את העץ…
        </div>
      ) : !shown.length ? (
        <div style={{ textAlign: 'center', padding: 26, color: '#94A3B8', fontSize: 13 }}>
          אין כפילויות ברמה זו 🎉
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, maxHeight: 460, overflowY: 'auto' }}>
          {shown.map(g => {
            const key = groupKey(g)
            const on = sel.has(key)
            return (
              <div key={key}
                style={{ border: `1.5px solid ${on ? '#7C3AED' : LEVEL_UI[g.level].border}`, background: on ? '#FAF5FF' : '#fff', borderRadius: 13, padding: '11px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  {g.level === 'exact' && (
                    <input type="checkbox" checked={on}
                      onChange={() => setSel(s => {
                        const x = new Set(s)
                        if (x.has(key)) x.delete(key); else x.add(key)
                        return x
                      })}
                      style={{ width: 16, height: 16, accentColor: '#7C3AED', cursor: 'pointer' }} />
                  )}
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#7C3AED', background: '#F5F3FF', border: '1px solid #DDD6FE', borderRadius: 20, padding: '1px 7px' }}>
                    דור {g.generation}
                  </span>
                  <span style={{ fontSize: 11.5, color: '#64748B' }}>תחת: {g.parentName}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: LEVEL_UI[g.level].fg }}>{g.reason}</span>
                </div>

                {/* כרטיס השוואה — כל מה שנדרש להכרעה, זה מול זה */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
                  {g.nodes.map(n => (
                    <div key={n.id} style={{ flex: '1 1 190px', border: '1px solid #E2E8F0', borderRadius: 10, padding: '8px 10px', background: '#F8FAFC' }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0F172A', marginBottom: 3 }}>{n.name}</div>
                      <div style={{ fontSize: 10.5, color: '#64748B', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>{relTxt(n.relation)}</span>
                        <span>· {statusTxt(n.status)}</span>
                        <span>· {n.children} ילדים</span>
                        {n.families > 0 && <span style={{ color: '#7C3AED', fontWeight: 700 }}>· {n.families} משפחות רשומות</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  <button onClick={() => void openPlan(g)}
                    disabled={busy === key || planning === key}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {busy === key ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={12} />}
                    מזג — אותו אדם
                  </button>
                  {/* ⚠️ "הצג בעץ" לפני ההכרעה ולא אחריה: ההקשר במפה — מי האב,
                      מה יש מסביב — הוא לעיתים מה שמכריע אם אלה אותו אדם. */}
                  <button onClick={() => onLocate(g.nodes.map(n => n.id))} disabled={busy === key}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', color: '#5B21B6', border: '1.5px solid #DDD6FE', borderRadius: 9, padding: '6px 13px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <MapPin size={12} /> הצג בעץ
                  </button>
                  <button onClick={() => void notDuplicate(g)} disabled={busy === key}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#fff', color: '#475569', border: '1.5px solid #CBD5E1', borderRadius: 9, padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                    <X size={12} /> אינם אותו אדם
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── תצוגה מקדימה של המפל + בחירת שם לכל דור — קומפוננטה משותפת ──
          אותו מודאל משמש גם את המיזוג הידני בעץ (MergePlanModal), כדי שתהיה
          חוויה אחת בלבד ולא שני עיצובים שמסתעפים. */}
      {plan && (
        <MergePlanModal
          data={plan.data}
          names={plan.names}
          upApprox={upApprox}
          busy={busy === 'plan'}
          planning={!!planning}
          onNameChange={(keepId, name) => setPlan(p => p && ({ ...p, names: { ...p.names, [keepId]: name } }))}
          onToggleApprox={(checked) => { setUpApprox(checked); void openPlan(plan.group, checked) }}
          onConfirm={async () => {
            const g = plan.group; const names = plan.names
            setBusy('plan')
            const out = await mergeGroup(g, false, names, upApprox)
            setBusy(null); setPlan(null)
            if (out !== 'error') { await scan(); await loadUndo(); onDone() }
          }}
          onClose={() => setPlan(null)}
        />
      )}

      {tab !== 'exact' && shown.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginTop: 11, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '8px 11px' }}>
          <AlertTriangle size={14} color="#D97706" style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11.5, color: '#92400E', lineHeight: 1.5 }}>
            ברמה זו אין אישור מרוכז — כל קבוצה דורשת הכרעה שלך. אם טעית, ניתן לבטל מהרשימה שלמעלה.
          </span>
        </div>
      )}
    </div>
  )
}
