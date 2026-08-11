'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, Check, X, Pencil, GitBranch, CheckCircle2, AlertTriangle, List, Network, UserPlus } from 'lucide-react'
import LineageTreeSvg from './LineageTreeSvg'

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
import ManualGenerationForm, { ManualAddGate } from '@/components/lineage/ManualGenerationForm'

const NON_HEBREW = /[^֐-׿ ׳״'"-]/g

export default function LineageReviewClient({ token }: { token: string }) {
  const [nodes, setNodes] = useState<Node[]>([])
  const [rootId, setRootId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'tree'>('list')
  const [selectedTreeId, setSelectedTreeId] = useState<string | null>(null)
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
  // כל העץ — לבחירת אב אחר בעת תיקון הסדר
  const [fullTree, setFullTree] = useState<Node[]>([])
  // הדור שנפתח לתיקון + חיפוש בבורר
  const [fixGen, setFixGen] = useState<{ node: Node; action: 'replace' | 'insert' } | null>(null)
  const [pickQuery, setPickQuery] = useState('')
  const [sentGens, setSentGens] = useState<Set<string>>(new Set())
  // ⚠️ אותה חלונית חוסמת של הרישום, לפני שהטופס נפתח בכלל. הוספה ידנית של דור
  // שכבר קיים בעץ היא המקור המרכזי לכפילויות, ובדף התיקון היא לא הייתה קיימת
  // כלל — כאן דווקא, כשמתקנים שרשרת שגויה, הפיתוי להוסיף במקום לחפש גדול יותר.
  const [addGate, setAddGate] = useState<Node | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/lineage-review?token=${encodeURIComponent(token)}`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'שגיאה'); setLoading(false); return }
      setNodes(data.nodes ?? [])
      setRootId(data.rootNodeId ?? null)
      setRecipient(data.recipient ?? null)
      setChain(data.chain ?? [])
      setSelfNodeId(data.selfNodeId ?? null)
      setMode(data.mode === 'order' ? 'order' : 'full')
      setFullTree(data.fullTree ?? [])
    } catch { setError('שגיאת רשת') }
    finally { setLoading(false) }
  }, [token])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // ── תוצאות החיפוש בבורר האב ──
  // ⚠️ מחייב 2 תווים ומוגבל ל-40 תוצאות: העץ מכיל אלפי צמתים, ורשימה מלאה
  // הייתה גם חסרת תועלת וגם כבדה לרינדור במכשיר נייד.
  // ⚠️ רק האחים בדור הזה — כלומר ילדיו של הדור שלפניו בשרשרת.
  //
  // קודם הבורר הציג את *כל* העץ בחיפוש חופשי, ואפשר היה לבחור אב מדור אחר
  // לגמרי — מה שיוצר שרשרת בלתי אפשרית (קפיצת דורות או לולאה). התיקון האמיתי
  // תמיד נמצא בין הילדים של אותו אב: "אינני צאצא של הבן הזה אלא של אחיו".
  // כשמתקנים את הדור הראשון שאחרי השורש, האפשרויות הן ילדי השורש.
  //
  // 🔴 בשורה של הנמען עצמו מתקנים את *האב* שאליו הוא מחובר, ולכן הדור שמוחלף
  // הוא הדור שלפניו והמועמדים הם אחיו של האב (ילדי הסבא). בלי ההיסט הזה
  // הבורר הציע את אחיו של הנמען, ובחירה בהם הייתה תולה אותו תחת אחיו שלו.
  const anchorIdx = useMemo(() => {
    if (!fixGen) return -1
    const idx = chain.findIndex(c => c.id === fixGen.node.id)
    if (idx < 0) return -1
    return fixGen.node.id === selfNodeId ? idx - 1 : idx
  }, [fixGen, chain, selfNodeId])

  const pickOptions = useMemo(() => {
    if (anchorIdx < 0) return []
    const anchor = chain[anchorIdx]
    if (!anchor) return []
    // ההורה בשרשרת: הדור שלפני הדור שמוחלף. בדור הראשון — שורש העץ עצמו.
    const parentId = anchorIdx > 0 ? chain[anchorIdx - 1].id : (fullTree.find(n => !n.parent_id)?.id ?? null)
    if (!parentId) return []
    const siblings = fullTree.filter(n => n.parent_id === parentId && n.id !== anchor.id)
    const q = pickQuery.trim()
    return siblings
      .filter(n => !q || n.name.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }, [pickQuery, fullTree, anchorIdx, chain])

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
      setSuggestSent(true)
      setTimeout(() => setSuggestSent(false), 4000)
      return true
    } catch { setError('שגיאת רשת'); return false }
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
          <h1 className="text-xl font-bold" style={{ color: '#1B3256' }}>הקישור אינו זמין</h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{error}</p>
        </div>
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 px-4 py-8">
      <div className={`mx-auto ${viewMode === 'tree' ? 'max-w-4xl' : 'max-w-2xl'}`}>
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

        {/* שרשרת הדורות — מהחתם סופר זי"ע ועד אליכם */}
        {chain.length > 0 && (
          <div className="mb-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-400 mb-2.5">סדר הדורות הרשום</div>
            <div className="flex flex-col gap-1.5">
              {chain.map((g, i) => (
                <div key={g.id} className="rounded-xl bg-white border border-indigo-100 overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 py-2 flex-wrap">
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
                    {sentGens.has(g.id) ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700"><CheckCircle2 size={11} /> נשלח לאישור</span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {/* ⚠️ החלפת דור אפשרית מדור 2 ומעלה: דור 1 הוא מרן
                            החתם סופר זי"ע — שורש העץ, ואין לו אב להחליף. */}
                        {g.generation > 1 && (
                          <button onClick={() => { setFixGen({ node: g, action: 'replace' }); setPickQuery('') }}
                            className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-700 hover:bg-indigo-100">
                            החלף דור
                          </button>
                        )}
                        <button onClick={() => { setAddGate(g); setPickQuery('') }}
                          title="חסר דור בין זה לדור שאחריו"
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100">
                          + דור חסר
                        </button>
                      </div>
                    )}
                  </div>

                  {/* בורר האב החדש / הוספת דור חסר */}
                  {fixGen?.node.id === g.id && (
                    <div className="border-t border-indigo-100 bg-slate-50 px-3 py-3">
                      {fixGen.action === 'replace' ? (
                        <>
                          {/* ⚠️ נוסח נפרד לשורה של הנמען עצמו: "במקום <שמך>"
                              נקרא כאילו מבקשים ממנו להחליף את עצמו. מה שמתקנים
                              שם הוא האב שאליו הוא מחובר. */}
                          <p className="mb-1 text-[11px] font-bold text-slate-600">
                            {g.id === selfNodeId ? (
                              <>אינכם בנו של <span className="text-rose-600">{chain[i - 1]?.name ?? 'הדור שמעליכם'}</span>? בחרו את האב הנכון מבין ילדיו של{' '}
                                <span className="text-indigo-700">{chain[i - 2]?.name ?? 'הדור שלפניו'}</span>:</>
                            ) : (
                              <>במקום <span className="text-rose-600">{g.name}</span> — בחרו מבין
                                {i > 0 ? <> ילדיו של <span className="text-indigo-700">{chain[i - 1].name}</span></> : <> צאצאי מרן החתם סופר זי&quot;ע</>}:</>
                            )}
                          </p>
                          <p className="mb-2 text-[10px] text-slate-400">
                            מוצגים רק דורות <strong>מאושרים</strong> ששייכים לדור זה — כך השרשרת נשארת תקינה.
                          </p>
                          {/* תיבת החיפוש רק כשיש הרבה אפשרויות; ברשימה קצרה היא מיותרת */}
                          {pickOptions.length > 8 && (
                            <input value={pickQuery} onChange={e => setPickQuery(e.target.value)} autoFocus
                              placeholder="סינון לפי שם…"
                              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                          )}
                          <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                            {pickOptions.length === 0 && (
                              <p className="py-3 text-center text-[11px] text-slate-400">
                                {pickQuery.trim()
                                  ? 'לא נמצאו תוצאות לסינון זה'
                                  : 'אין דורות אחרים לבחירה בשלב זה — ניתן לפנות למשרד'}
                              </p>
                            )}
                            {pickOptions.map(o => (
                              <button key={o.id} disabled={busy === g.id}
                                onClick={async () => {
                                  // ⚠️ ההצעה היא לשנות את האב של *הדור הבא* אחרי
                                  // הדור שמוחלף: "במקום X יבוא Y" פירושו שהבן
                                  // של X צריך להיות תלוי ב-Y.
                                  //
                                  // anchorIdx כבר מביא בחשבון את השורה של הנמען
                                  // עצמו, שבה הדור שמוחלף הוא אביו — ולכן מי
                                  // שעובר אב הוא הנמען.
                                  const target = chain[anchorIdx + 1] ?? g
                                  setBusy(g.id)
                                  const ok = await suggest({ kind: 'reparent', nodeId: target.id, parentId: o.id })
                                  setBusy(null)
                                  if (ok) { setSentGens(s => new Set(s).add(g.id)); setFixGen(null) }
                                }}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50">
                                <span className="font-bold text-slate-800">{o.name}</span>
                                <span className="mr-2 text-[10px] text-slate-400">דור {o.generation}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mb-2 text-[11px] font-bold text-slate-600">
                            הוספת דור חסר אחרי <span className="text-indigo-600">{g.name}</span>:
                          </p>
                          {/* 🔴 אותו טופס בדיוק של הרישום, ולא שדה חופשי.
                              קודם היה כאן שדה שם אחד, בלי אזהרת התארים, בלי
                              החלונית על השם המלא, ובלי התצוגה "ייכנס לעץ כך".
                              התוצאה: מי שמתקן דרך הקישור הזה הזין "רבי משה
                              שליט\"א" כשם — בדיוק מה שהרישום חוסם — והשם נכנס
                              לעץ בניסוח שאינו ניתן להצלבה. */}
                          <ManualGenerationForm
                            generation={g.generation + 1}
                            submitLabel="שליחה לאישור"
                            busy={busy === g.id}
                            onCancel={() => setFixGen(null)}
                            onSubmit={async v => {
                              setBusy(g.id)
                              const ok = await suggest({ kind: 'add_child', parentId: g.id, name: v.name, relation: v.relation })
                              setBusy(null)
                              if (ok) { setSentGens(s => new Set(s).add(g.id)); setFixGen(null) }
                            }}
                          />
                        </>
                      )}
                      {fixGen.action === 'replace' && (
                        <button onClick={() => setFixGen(null)} className="mt-2 text-[11px] text-slate-400 underline">ביטול</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {/* ⚠️ אותה חלונית של הרישום, ובאותם שני נוסחים: כשיש דורות ברשימה
                האזהרה אדומה ומדברת על דחיית הרישום, וכשאין מול מה לבדוק היא
                ניטרלית. הבחנה זו היא מה שמונע ממנה להפוך לרעש שסוגרים בלי לקרוא. */}
            {addGate && (
              <ManualAddGate
                hasOptions={fullTree.some(n => n.parent_id === addGate.id)}
                generation={addGate.generation + 1}
                onCancel={() => setAddGate(null)}
                onConfirm={() => { setFixGen({ node: addGate, action: 'insert' }); setAddGate(null) }}
              />
            )}

            <p className="mt-2.5 text-[11px] leading-relaxed text-indigo-500">
              נפלה טעות בסדר? לחצו על <strong>החלף דור</strong> ובחרו את השם הנכון מהעץ, או על <strong>+ דור חסר</strong> אם חסר דור באמצע. לאחר התיקון יועבר לאישור המזכירות.
            </p>
          </div>
        )}

        {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-600">{error}</div>}
        {suggestSent && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-sm text-emerald-700 flex items-center gap-2"><CheckCircle2 size={15} /> ההצעה נשלחה — היא תיבדק ותאושר על ידי הצוות. תודה!</div>}

        {/* מתג תצוגה: רשימה / עץ */}
        <div className="mb-3 flex justify-center">
          <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 gap-1 shadow-sm">
            {([['list', 'רשימה', List], ['tree', 'עץ', Network]] as const).map(([k, label, Ic]) => (
              <button key={k} onClick={() => setViewMode(k)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-semibold transition-colors ${viewMode === k ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                <Ic size={15} /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* פעולות משותפות לכל צומת (רשימה + עץ) */}
        {(() => {
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
                {/* ⚠️ במצב 'order' (קישור אישי מהכרטסת) מוצגות רק פעולות התיקון.
                    אישור/דחייה של צמתים *כותבים ישירות לעץ* — פעולה שמתאימה
                    לבעל ענף שהוזמן לאמת אותו, לא לצאצא שהתבקש לבדוק את סדר
                    הדורות שלו. תיקון שם והוספת דור נכנסים לתור אישור ממילא. */}
                {mode !== 'order' && (
                  <>
                    <button onClick={() => act(node.id, 'verify')} title="אישור"
                      className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 px-2.5 py-1.5 text-xs font-semibold"><Check size={13} /> אישור</button>
                    <button onClick={() => act(node.id, 'reject')} title="דחייה"
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 px-2.5 py-1.5 text-xs font-semibold"><X size={13} /> דחייה</button>
                  </>
                )}
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

          if (viewMode === 'tree') {
            // תצוגת עץ ויזואלי (SVG) — כמו עץ הדורות. לחיצה על צומת בוחרת אותו,
            // ומתחת לעץ מופיע פאנל הפעולות שלו (אישור/דחייה/תיקון) — עריכה חיה.
            const selectedNode = selectedTreeId ? nodes.find(n => n.id === selectedTreeId) ?? null : null
            return (
              <div className="flex flex-col gap-3">
                <LineageTreeSvg nodes={nodes} rootId={rootId} selectedId={selectedTreeId} onSelect={setSelectedTreeId} />
                {/* מקרא צבעים */}
                <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500" /> מאושר</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-orange-500" /> ממתין</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-red-500" /> נדחה</span>
                </div>
                {/* פאנל פעולות לצומת הנבחר */}
                {selectedNode ? (
                  <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 shadow-sm px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    {editing === selectedNode.id
                      ? <NodeActions node={selectedNode} />
                      : <><NodeLabel node={selectedNode} /><NodeActions node={selectedNode} /></>}
                  </div>
                ) : (
                  <p className="text-center text-xs text-slate-400 py-2">לחצו על שם בעץ כדי לאשר, לדחות או לתקן</p>
                )}
              </div>
            )
          }

          // תצוגת רשימה (ברירת מחדל) — הזחה לפי דור
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

        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} /> כל שינוי נשמר מיד ומתעדכן אצלנו במערכת. תודה על העזרה!
        </div>
      </div>
    </main>
  )
}
