'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, Check, X, Pencil, GitBranch, CheckCircle2, AlertTriangle, UserPlus } from 'lucide-react'

interface Node {
  id: string
  name: string
  parent_id: string | null
  generation: number
  status: string
  relation?: string | null
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  verified: { label: 'מאושר', cls: 'bg-green-100 text-green-700 border-green-200' },
  pending: { label: 'ממתין', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  rejected: { label: 'נדחה', cls: 'bg-red-100 text-red-700 border-red-200' },
}
import { LineageBuilder, type LineageResult } from '@/components/lineage/LineageBuilder'

const NON_HEBREW = /[^֐-׿ ׳״'"-]/g

export default function LineageReviewClient({ token }: { token: string }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [rootId, setRootId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  // ── הזמנה אישית (נשלחה מכרטסת הצאצא) ──
  // mode='order': הדף ממוקד בתיקון סדר הדורות, ומציג לנמען את פרטיו ואת
  // שרשרת האבות שלו — במקום ענף צאצאים שאינו קשור לשאלה שנשאל.
  const [recipient, setRecipient] = useState<{ name: string; idMasked: string | null; phone: string | null; address: string | null } | null>(null)
  const [chain, setChain] = useState<Node[]>([])
  // 🔴 הצומת של הנמען עצמו בשרשרת, אם הוא שם.
  //
  // עד ההשלמה למפרע הנרשם לא היה צומת בעץ, והאיבר האחרון בשרשרת היה תמיד
  // אביו. מאז כל נרשם מקבל צומת משלו — והתגית "האב שלכם" נדבקה לנרשם עצמו,
  // כלומר הנמען ראה את שמו שלו מוצג כאביו. null בקישורים ישנים, ואז נשמרת
  // ההתנהגות הקודמת.
  const [selfNodeId, setSelfNodeId] = useState<string | null>(null)
  const [mode, setMode] = useState<'full' | 'order'>('full')
  // ── עורך סדר הדורות (קישור order) — הבורר של הרישום ──
  const [orderEditing, setOrderEditing] = useState(false)
  const [orderResult, setOrderResult] = useState<LineageResult | null>(null)
  const [applyResult, setApplyResult] = useState<{ applied: boolean; reason?: string } | null>(null)
  // ── קישור שפג תוקפו ──
  // 🔴 המצב הנפוץ ביותר בתלונות "לא עובד לי". מסך השגיאה היה מבוי סתום,
  // ולכן יש כאן מסלול לבקשת קישור חדש ישירות מהדף.
  const [expired, setExpired] = useState(false)
  const [renewState, setRenewState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  const requestNew = useCallback(async () => {
    setRenewState('sending')
    try {
      const r = await fetch('/api/public/lineage-review/renew', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      setRenewState(r.ok ? 'sent' : 'failed')
    } catch { setRenewState('failed') }
  }, [token])

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/lineage-review?token=${encodeURIComponent(token)}`)
      const data = await res.json()
      if (!res.ok) {
        // ⚠️ מבדילים "פג תוקף" משאר הכשלים: זה המצב הנפוץ ביותר (5 מתוך 10
        // הקישורים שנשלחו כבר פגו), והוא היחיד שהמשפחה יכולה לפתור לבד.
        if (data.expired) setExpired(true)
        setError(data.error || 'שגיאה'); setLoading(false); return
      }
      setNodes(data.nodes ?? [])
      setRootId(data.rootNodeId ?? null)
      setRecipient(data.recipient ?? null)
      setChain(data.chain ?? [])
      setSelfNodeId(data.selfNodeId ?? null)
      setMode(data.mode === 'order' ? 'order' : 'full')
    } catch { setError('שגיאת רשת') }
    finally { setLoading(false) }
  }, [token])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // מיון היררכי — שורש, ואז ילדים בהזחה לפי דור
  const ordered = useMemo(() => {
    if (!rootId) return []
    const childrenOf = new Map<string, Node[]>()
    for (const n of nodes) {
      if (!n.parent_id) continue
      const l = childrenOf.get(n.parent_id); if (l) l.push(n); else childrenOf.set(n.parent_id, [n])
    }
    const out: { node: Node; depth: number }[] = []
    const walk = (id: string, depth: number) => {
      const n = nodes.find(x => x.id === id); if (!n) return
      out.push({ node: n, depth })
      for (const c of (childrenOf.get(id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'he'))) walk(c.id, depth + 1)
    }
    walk(rootId, 0)
    return out
  }, [nodes, rootId])

  // הצעת תיקון-מבנה — נשמרת כ"ממתינה לאישור" אצל המנהל, לא נכנסת לעץ מיד.
  const [addUnder, setAddUnder] = useState<string | null>(null)   // צומת שמוסיפים תחתיו
  const [addName, setAddName] = useState('')
  const [addRelation, setAddRelation] = useState<'son' | 'son_in_law'>('son')
  const [suggestSent, setSuggestSent] = useState(false)

  const suggest = async (payload: Record<string, unknown>) => {
    setBusy('suggest'); setError('')
    try {
      const res = await fetch('/api/public/lineage-review/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...payload }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setError(data.error || 'ההצעה נכשלה'); return false }
      // ⚠️ ההודעה נשארת, ולא נעלמת אחרי 4 שניות: ההצעה *אינה* משנה את העץ
      // מיד, ומי שפספס את ההודעה ראה שדבר לא קרה ושלח שוב — משפחה אחת שלחה
      // 47 פעמים את אותה הוספה (23.09).
      setSuggestSent(true)
      return true
    } catch { setError('שגיאת רשת'); return false }
    finally { setBusy(null) }
  }

  // שמירת הסדר המתוקן — נכנס מיד, או לתור הצוות (השרת מכריע ומחזיר למה).
  const submitOrder = async () => {
    const r = orderResult
    if (!r?.valid || !r.nodeId) return
    setBusy('apply'); setError('')
    try {
      const anc = r.ancestors
      const res = await fetch('/api/public/lineage-review/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          lineage_node_id: r.nodeId,
          self_is_existing: r.selfIsExisting,
          lineage_new_nodes: [
            ...anc.filter(a => a.isNew).map(a => ({ name: a.name, relation: a.relation })),
            ...(r.selfIsExisting ? [] : [{ name: recipient?.name ?? '', relation: r.selfRelation }]),
          ],
        }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setError(data.error || 'השמירה נכשלה'); return }
      setApplyResult({ applied: !!data.applied, reason: data.reason })
      setOrderEditing(false)
      if (data.applied) await load()
    } catch { setError('שגיאת רשת') }
    finally { setBusy(null) }
  }

  const act = async (nodeId: string, action: 'verify' | 'reject' | 'rename', name?: string) => {
    setBusy(nodeId); setError('')
    try {
      const res = await fetch('/api/public/lineage-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, nodeId, action, name }),
      })
      const data = await res.json()
      if (!res.ok || data.ok === false) { setError(data.error || 'הפעולה נכשלה'); return }
      // 🔴 בקישור משפחתי שינוי שם נכנס לתור אישור (data.queued) — השם בעץ
      // לא משתנה, ולכן גם לא בתצוגה. ראו api/public/lineage-review.
      if (data.queued) { setSuggestSent(true); setEditing(null); return }
      // עדכון אופטימי. בדחייה — כל צאצאיו נדחו במפל (data.cascaded), מסמנים את כולם.
      const cascaded: string[] = Array.isArray(data.cascaded) ? data.cascaded : []
      setNodes(ns => ns.map(n => {
        if (action === 'reject' && (n.id === nodeId || cascaded.includes(n.id))) return { ...n, status: 'rejected' }
        if (n.id === nodeId) return { ...n, ...(action === 'verify' ? { status: 'verified' } : { name: name ?? n.name }) }
        return n
      }))
      setEditing(null)
    } catch { setError('שגיאת רשת') }
    finally { setBusy(null) }
  }

  if (loading) {
    return <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-indigo-500" /></main>
  }
  if (error && !nodes.length) {
    return (
      <main dir="rtl" className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-50">
            <AlertTriangle size={28} className="text-rose-500" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>
            {expired ? 'תוקף הקישור פג' : 'הקישור אינו זמין'}
          </h1>
          {/* 🔴 מסך זה היה קצה מבוי סתום: המשפחה קיבלה "הקישור אינו תקין, בוטל,
              או פג תוקפו" בלי לדעת מה קרה ובלי דרך להמשיך — וזה מקור התלונות
              "לא עובד לי". עכשיו מוסבר מה קרה, ויש דרך לבקש קישור חדש. */}
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {expired
              ? 'הקישור האישי שנשלח אליכם היה בתוקף לזמן מוגבל, והוא פג. אין צורך לעשות דבר — ניתן לבקש קישור חדש ולהמשיך בדיוק מאותו מקום.'
              : error}
          </p>
          <button
            type="button"
            onClick={requestNew}
            disabled={renewState !== 'idle'}
            className="mt-5 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {renewState === 'sending' ? 'שולח…' : renewState === 'sent' ? '✓ הבקשה נשלחה' : 'שלחו לי קישור חדש'}
          </button>
          {renewState === 'sent' && (
            <p className="mt-2 text-xs leading-relaxed text-green-700">
              הבקשה התקבלה. הקישור החדש יישלח למייל הרשום אצלנו בהקדם.
            </p>
          )}
          {renewState === 'failed' && (
            <p className="mt-2 text-xs leading-relaxed text-rose-600">
              שליחת הבקשה נכשלה. ניתן לפנות למשרד ולבקש קישור חדש.
            </p>
          )}
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100">
            <GitBranch size={28} className="text-indigo-600" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>{mode === 'order' ? 'תיקון סדר הדורות' : 'אישור סדר היוחסין'}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {mode === 'order'
              ? 'לפניכם סדר הדורות הרשום אצלנו במאגר. עברו עליו וּודאו שהוא מדויק — אם נפלה טעות, ניתן לתקן.'
              : 'עברו על סדר היוחסין של ענף המשפחה. לכל שם ניתן לאשר, לדחות, או לתקן. הגישה מוגבלת לענף זה בלבד.'}
          </p>
        </div>

        {/* כרטיס הפרטים של הנמען — כדי שיזהה מיד שזו אכן הכרטסת שלו */}
        {recipient && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">הפרטים שלכם במאגר</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
              <div><span className="text-slate-400">שם: </span><span className="font-bold text-slate-800">{recipient.name}</span></div>
              {recipient.idMasked && <div><span className="text-slate-400">ת.ז.: </span><span className="font-semibold text-slate-700 ltr-num">{recipient.idMasked}</span></div>}
              {recipient.phone && <div><span className="text-slate-400">טלפון: </span><span className="font-semibold text-slate-700 ltr-num">{recipient.phone}</span></div>}
              {recipient.address && <div><span className="text-slate-400">כתובת: </span><span className="font-semibold text-slate-700">{recipient.address}</span></div>}
            </div>
            <p className="mt-2.5 text-[11px] text-slate-400">אם אחד הפרטים אינו נכון — נא ליצור קשר עם המשרד. בדף זה ניתן לתקן את סדר הדורות בלבד.</p>
          </div>
        )}

        {/* ── סדר הדורות — מהחתם סופר זי"ע ועד אליכם ──
            🔴 בקישור תיקון הסדר (order) התיקון נעשה באותו בורר של הרישום, טעון
            מראש בסדר הקיים: בוחרים דור, השורה מודגשת והבורר מתקדם מיד לדור הבא
            (11.10, לבקשת המשתמש). כפתורי "החלף דור / דור חסר" לכל שורה הוסרו —
            הם יצרו בקשות חלקיות שלא תמיד ניתן היה להחיל.
            התיקון נכנס מיד (api/public/lineage-review/apply) והכרטסת חוזרת
            ל"ממתין לאישור ראשוני" — אם 5 הדורות הראשונים תקינים. אחרת לתור הצוות. */}
        {chain.length > 0 && !orderEditing && (
          <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 mb-2.5">סדר הדורות הרשום</div>
            <div className="flex flex-col gap-1.5">
              {chain.map((g, i) => (
                <div key={g.id} className="rounded-xl bg-white border border-indigo-100 flex items-center gap-2.5 px-3 py-2 flex-wrap">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-extrabold text-indigo-700">{g.generation}</span>
                  <span className="flex-1 min-w-[120px] text-sm font-bold text-slate-800">{g.name}</span>
                  {g.relation && <span className="text-[10px] font-bold text-slate-400">{g.relation === 'son_in_law' ? 'חתן' : 'בן'}</span>}
                  {/* ⚠️ "האב שלכם" יושב על הדור שלפני הנמען, לא על האחרון.
                      כשהנרשם עצמו נמצא בשרשרת (selfNodeId), האחרון הוא הוא —
                      ותיוגו כאב הציג לנמען את שמו שלו כאביו. בקישורים ישנים
                      אין selfNodeId, ואז האחרון הוא באמת האב. */}
                  {g.id === selfNodeId
                    ? <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">זה אתם</span>
                    : i === chain.length - (selfNodeId ? 2 : 1) &&
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">האב שלכם</span>}
                </div>
              ))}
            </div>
            {mode === 'order' && !applyResult && (
              <>
                <button type="button" onClick={() => { setOrderEditing(true); setError('') }}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">
                  <Pencil size={15} /> תיקון סדר הדורות
                </button>
                <p className="mt-2 text-[11px] leading-relaxed text-indigo-500">
                  נפלה טעות בסדר? לחצו על <strong>תיקון סדר הדורות</strong>, ובנו את הסדר הנכון דור אחר דור — בדיוק כמו ברישום.
                  התיקון נכנס מיד, והכרטסת שלכם חוזרת לבדיקה ראשונית אצל הצוות.
                </p>
              </>
            )}
          </div>
        )}

        {/* תוצאת התיקון — נכנס מיד, או הועבר לצוות (ונאמר למה) */}
        {applyResult && (
          <div className={`mb-4 rounded-2xl border px-4 py-3 text-sm flex items-start gap-2 ${applyResult.applied ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>
              {applyResult.applied
                ? <>סדר הדורות החדש התקבל במערכת והועבר לטיפול במזכירות</>
                // ⚠️ אותו נוסח בשני המצבים (בקשת המשתמש 12.10). הנוסח הקודם ("נשלחה
                // לאישור הצוות" + סיבה טכנית) נקרא כ"התיקון לא נקלט", והמשפחה ניסתה שוב
                // ושוב. הסיבה נשמרת בבקשה שבתור — היא עניין למזכירות, לא למשפחה.
                : <>סדר הדורות החדש התקבל במערכת והועבר לטיפול במזכירות</>}
            </span>
          </div>
        )}

        {/* העורך — הבורר של הרישום, טעון מראש בסדר הקיים */}
        {orderEditing && (
          <div className="mb-4 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 mb-2.5">תיקון סדר הדורות</div>
            <LineageBuilder
              selfName={recipient?.name ?? ''}
              onChange={setOrderResult}
              // ⚠️ בלי הנמען עצמו: הבורר מוסיף אותו בסוף ("הוסיפו אותי").
              prefillChain={chain.filter(c => c.id !== selfNodeId).map(c => ({ generation: c.generation, name: c.name, relation: (c.relation === 'son' || c.relation === 'son_in_law') ? c.relation : null }))}
            />
            {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</div>}
            <div className="mt-4 flex gap-2">
              <button type="button" disabled={!orderResult?.valid || busy === 'apply'} onClick={() => { void submitOrder() }}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">
                {busy === 'apply' ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} שמירת הסדר המתוקן
              </button>
              <button type="button" onClick={() => { setOrderEditing(false); setError('') }}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">ביטול</button>
            </div>
            {!orderResult?.valid && (
              <p className="mt-2 text-[11px] text-slate-500">יש להשלים את הסדר עד אליכם — כולל «הוסיפו אותי» וסימון בן/חתן (או «זה אני»).</p>
            )}
          </div>
        )}

        {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}
        {/* ⚠️ sticky — נשאר גלוי גם אחרי גלילה, כי הבקשה נשלחת מתוך העץ למטה */}
        {suggestSent && (
          <div className="sticky top-2 z-20 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 flex items-start gap-2 shadow-sm">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span className="flex-1">
              הבקשה התקבלה וממתינה לאישור הצוות. <span className="font-bold">אין צורך לשלוח אותה שוב</span> — השינוי יופיע בעץ אחרי האישור.
            </span>
            <button onClick={() => setSuggestSent(false)} className="text-emerald-700/70 hover:text-emerald-900 text-xs font-bold shrink-0">סגירה</button>
          </div>
        )}

        {/* 🔴 בקישור תיקון סדר הדורות (order) — רק השרשרת שלמעלה, שורה אחרי שורה.
            מתג "רשימה / עץ" והענף שמתחתיו הוסרו לבקשת המשתמש (11.10): הם הציגו
            את אותם דורות פעם שנייה, ובלבלו את מי שבא לתקן את הסדר שלו.
            ⚠️ בקישור "אישור ענף" (full) הרשימה היא התוכן היחיד — נשארת, בלי עץ. */}
        {mode !== 'order' && (() => {
          const NodeActions = ({ node }: { node: Node }) => {
            const isBusy = busy === node.id
            if (editing === node.id) {
              return (
                <div className="flex items-center gap-2">
                  <input value={editName} autoFocus
                    onChange={e => setEditName(e.target.value.replace(NON_HEBREW, ''))}
                    onKeyDown={e => e.key === 'Enter' && editName.trim() && act(node.id, 'rename', editName.trim())}
                    className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <button onClick={() => act(node.id, 'rename', editName.trim())} disabled={isBusy || !editName.trim()}
                    className="rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-2.5 py-1.5 text-white"><Check size={14} /></button>
                  <button onClick={() => setEditing(null)} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-500"><X size={14} /></button>
                </div>
              )
            }
            // טופס הוספת דור חסר תחת הצומת — הצעה שממתינה לאישור המנהל
            if (addUnder === node.id) {
              return (
                <div className="flex items-center gap-2 flex-wrap">
                  <input value={addName} autoFocus placeholder="שם הבן/הבת החסר…"
                    onChange={e => setAddName(e.target.value.replace(NON_HEBREW, ''))}
                    className="flex-1 min-w-[140px] rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                    {(['son', 'son_in_law'] as const).map(r => (
                      <button key={r} onClick={() => setAddRelation(r)}
                        className={`px-2.5 py-1.5 text-xs font-semibold ${addRelation === r ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>{r === 'son' ? 'בן' : 'חתן'}</button>
                    ))}
                  </div>
                  <button disabled={isBusy || !addName.trim()}
                    onClick={async () => { if (await suggest({ kind: 'add_child', parentId: node.id, name: addName.trim(), relation: addRelation })) { setAddUnder(null); setAddName('') } }}
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-2.5 py-1.5 text-white"><Check size={14} /></button>
                  <button onClick={() => { setAddUnder(null); setAddName('') }} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-slate-500"><X size={14} /></button>
                </div>
              )
            }
            return isBusy ? <Loader2 size={16} className="animate-spin text-slate-400" /> : (
              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                {/* ⚠️ הרשימה הזו מוצגת רק בקישור "אישור ענף" (full) — בקישור
                    תיקון הסדר (order) היא הוסרה כולה, ולכן אישור/דחייה, שכותבים
                    ישירות לעץ, לעולם אינם מגיעים לצאצא שהתבקש לבדוק את סדר דורותיו. */}
                <button onClick={() => act(node.id, 'verify')} title="אישור"
                  className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 px-2.5 py-1.5 text-xs font-semibold"><Check size={13} /> אישור</button>
                <button onClick={() => act(node.id, 'reject')} title="דחייה"
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 px-2.5 py-1.5 text-xs font-semibold"><X size={13} /> דחייה</button>
                <button onClick={() => { setEditing(node.id); setEditName(node.name) }} title="תיקון שם"
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 px-2.5 py-1.5 text-xs font-semibold"><Pencil size={13} /> תיקון שם</button>
                {/* הצעת הוספת דור חסר — ממתינה לאישור המנהל */}
                <button onClick={() => { setAddUnder(node.id); setAddName('') }} title="הצע דור חסר"
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold"><UserPlus size={13} /> הוסף דור</button>
              </div>
            )
          }

          const NodeLabel = ({ node }: { node: Node }) => {
            const meta = STATUS_META[node.status] ?? STATUS_META.pending
            return (
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] text-slate-400 flex-shrink-0">דור {node.generation}</span>
                <span className="font-semibold text-slate-800 truncate">{node.name}</span>
                {(node.relation === 'son' || node.relation === 'son_in_law') && (
                  <span className="text-[10px] text-slate-400">({node.relation === 'son' ? 'בן' : 'חתן'})</span>
                )}
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.cls}`}>{meta.label}</span>
              </div>
            )
          }

          // תצוגת רשימה — הזחה לפי דור
          return (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
              {ordered.map(({ node, depth }) => (
                <div key={node.id} className="px-4 py-3" style={{ paddingRight: `${16 + depth * 20}px` }}>
                  {editing === node.id
                    ? <NodeActions node={node} />
                    : <div className="flex items-center justify-between gap-3 flex-wrap"><NodeLabel node={node} /><NodeActions node={node} /></div>}
                </div>
              ))}
            </div>
          )
        })()}

        {/* ⚠️ רק ב"אישור ענף": בקישור תיקון הסדר התיקון נכנס לתור, ו"נשמר מיד" היה סותר את ההודעה שמעליו. */}
        {mode !== 'order' && (
          <div className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <CheckCircle2 size={16} /> כל שינוי נשמר מיד ומתעדכן אצלנו במערכת. תודה על העזרה!
          </div>
        )}
      </div>
    </main>
  )
}
