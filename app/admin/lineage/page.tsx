'use client'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { Plus, RefreshCw, Loader2, ChevronRight, ChevronLeft, ChevronDown, Pencil, Trash2, X, Users, Check, Printer, MapPin, Link2, ExternalLink, Activity, ShieldCheck, ShieldAlert, Ghost, GitMerge } from 'lucide-react'
import { genTone } from '@/lib/lineagePalette'
import ShareBranchModal from './ShareBranchModal'
import SharePermissionsPanel from './SharePermissionsPanel'
import { useRouter } from 'next/navigation'
import DuplicatesPanel from './DuplicatesPanel'
import TreeHealthPanel from './TreeHealthPanel'
import SafeMergePanel from './SafeMergePanel'
import MergeCenterPanel from './MergeCenterPanel'
import UnlinkedPanel from './UnlinkedPanel'
import MergePlanModal, { type PlanResp as MergePlanResp } from './MergePlanModal'
import SuggestionsInbox from './SuggestionsInbox'
import CleanChildrenPanel from './CleanChildrenPanel'
import GhostChildrenPanel from './GhostChildrenPanel'
import SelfDuplicatesPanel from './SelfDuplicatesPanel'
import { useToast } from '@/components/ui/Toast'
import { useCan } from '@/components/StaffPermissions'
import { buildForest } from '@/lib/lineageForest'

// ─── Types ───

interface LineageNode {
  id: string
  name: string
  generation: number
  parent_id: string | null
  status?: 'verified' | 'pending' | 'rejected'
  relation?: 'son' | 'son_in_law' | null
}

type StatusFilter = 'verified' | 'pending' | 'rejected' | null

function nextStatus(cur: LineageNode['status']): 'verified' | 'pending' | 'rejected' {
  if (cur === 'verified') return 'pending'
  if (cur === 'pending') return 'rejected'
  return 'verified'
}

function statusColor(s: LineageNode['status']) {
  if (s === 'verified') return '#22C55E'
  if (s === 'rejected') return '#EF4444'
  return '#F59E0B'
}

interface TreeNode extends LineageNode {
  children: TreeNode[]
}

interface Positioned {
  node: TreeNode
  x: number; y: number; cx: number; cy: number
}

// ─── Tree layout ───

const NW = 172, NH = 58, HGAP = 48, VGAP = 96, PAD = 72

// 🔴 עבר ל-lib/lineageForest, שמבטיח שכל צומת מופיע בעץ.
//
// הגרסה שהייתה כאן צירפה כל צומת להורה שלו והוסיפה לשורשים רק צמתים בלי הורה.
// צומת בתוך *מעגל* (או שהוא ההורה של עצמו) צורף להורה ולעולם לא הגיע לשורשים,
// ולכן הוא וכל תת-העץ שמתחתיו לא צויירו בשום מקום — כלומר צאצאים שרשומים
// במערכת ואינם מופיעים בעץ באף מקום. מעגלים נוצרים ממיזוג כפילויות, שמסיט
// הורות בהמוניה (מיזוג אב אל צאצא שלו סוגר מעגל).
function buildTree(flat: LineageNode[]): TreeNode[] {
  return buildForest(flat).roots as TreeNode[]
}

// ─────────────────────────────────────────────────────────────────────────────
// הדפסה / PDF של אילן צאצאים — בשני מצבים.
//
// 'list'  — רשימה היררכית מוזחת. נשארת קריאה בכל גודל משפחה, נשפכת יפה על כמה
//           עמודים לאורך, ויש משבצת לסמן ליד כל שם. מתאים למשפחה גדולה.
// 'tree'  — תרשים עץ מלמעלה למטה, לרוחב הדף. קליל וברור לעין למשפחה קטנה או
//           בינונית, אך רוחבו גדל עם הדור הרחב ביותר ולכן הוא מוקטן אוטומטית
//           כדי להיכנס לדף — ובמשפחה גדולה מאוד הכיתוב יהיה קטן.
//
// ההדפסה נפתחת בחלון נפרד עם HTML עצמאי, ולא דרך @media print על העמוד:
// כך אין התנגשות עם עיצוב המערכת, ומה שנראה בתצוגה המקדימה הוא מה שיצא.
// ─────────────────────────────────────────────────────────────────────────────
export type PrintMode = 'list' | 'tree'

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))

const relLabel = (r: LineageNode['relation']) => r === 'son' ? 'בן' : r === 'son_in_law' ? 'חתן' : ''

// ⚠️ סטטוס ובן/חתן מודפסים עם *סמל* ולא בצבע בלבד: הדף נשלח לצאצאים והם
// מדפיסים אותו לרוב בשחור-לבן, ואז הבחנה שמסתמכת על צבע נעלמת לגמרי.
const STATUS_BADGE: Record<string, { txt: string; cls: string }> = {
  verified: { txt: '✓ מאושר', cls: 'ok' },
  pending:  { txt: '⌛ ממתין לאישור', cls: 'pend' },
  rejected: { txt: '✗ נדחה', cls: 'rej' },
}
const statusBadge = (s: LineageNode['status']) => STATUS_BADGE[s ?? 'verified'] ?? STATUS_BADGE.verified
// קשר שלא הוגדר מוצג במפורש — כך רואים בדף עצמו איפה חסר מידע, וזו בדיוק
// המטרה: שהצאצא ישלים מה שאנחנו לא יודעים.
const relBadgeOf = (r: LineageNode['relation']) =>
  r === 'son' ? { txt: 'בן', cls: 'son' }
  : r === 'son_in_law' ? { txt: 'חתן', cls: 'law' }
  : { txt: 'קשר לא צוין', cls: 'none' }

function buildSubtreePrintHtml(all: LineageNode[], rootId: string, mode: PrintMode = 'list'): string | null {
  const root = all.find(n => n.id === rootId)
  if (!root) return null

  const childrenBy = new Map<string, LineageNode[]>()
  all.forEach(n => {
    if (!n.parent_id) return
    const a = childrenBy.get(n.parent_id) ?? []
    a.push(n)
    childrenBy.set(n.parent_id, a)
  })
  for (const arr of childrenBy.values()) arr.sort((a, b) => a.name.localeCompare(b.name, 'he'))

  let total = 0
  // ⚠️ seen משותף לשני המצבים: נתוני עץ אמיתיים מכילים לעיתים מעגל (אב שהוא
  // גם צאצא) אחרי עריכה שגויה, ובלי ההגנה הזו הרקורסיה תולה את הדפדפן.
  const seen = new Set<string>()
  // ⚠️ הרוחב הגדול ביותר בכל עומק — קובע את הקטנת התרשים כדי שייכנס לדף.
  const perDepth: number[] = []

  const renderList = (n: LineageNode, depth: number): string => {
    if (seen.has(n.id)) return ''
    seen.add(n.id)
    total++
    perDepth[depth] = (perDepth[depth] ?? 0) + 1
    const kids = childrenBy.get(n.id) ?? []
    const rel = relLabel(n.relation)
    const st = statusBadge(n.status)
    return `<li class="d${Math.min(depth, 9)}">
      <div class="row">
        <span class="mark"></span>
        <span class="gen">דור ${n.generation}</span>
        <span class="name">${escapeHtml(n.name)}</span>
        ${rel ? `<span class="${n.relation === 'son_in_law' ? 'rel law' : 'rel'}">${rel}</span>` : ''}
        <span class="st ${st.cls}">${st.txt}</span>
      </div>
      ${kids.length ? `<ul>${kids.map(k => renderList(k, depth + 1)).join('')}</ul>` : ''}
    </li>`
  }

  const renderTree = (n: LineageNode, depth: number): string => {
    if (seen.has(n.id)) return ''
    seen.add(n.id)
    total++
    perDepth[depth] = (perDepth[depth] ?? 0) + 1
    const kids = childrenBy.get(n.id) ?? []
    const rb = relBadgeOf(n.relation)
    const st = statusBadge(n.status)
    return `<li>
      <div class="nd${depth === 0 ? ' root' : ''}${n.relation === 'son_in_law' ? ' law' : ''}">
        <div class="nm">${escapeHtml(n.name)}</div>
        <div class="mt">דור ${n.generation}</div>
        <div class="bd">
          <span class="b r-${rb.cls}">${rb.txt}</span>
          <span class="b s-${st.cls}">${st.txt}</span>
        </div>
      </div>
      ${kids.length ? `<ul>${kids.map(k => renderTree(k, depth + 1)).join('')}</ul>` : ''}
    </li>`
  }

  const body = mode === 'tree' ? renderTree(root, 0) : renderList(root, 0)
  const today = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // רוחב התרשים נקבע לפי הדור הרחב ביותר. הקטנה אוטומטית כדי שייכנס לרוחב
  // הדף לרוחב (A4 landscape פחות שוליים ≈ 1040px), עם רצפה של 35% כדי שלא
  // יגיע לגודל שאי אפשר לקרוא — אם צריך פחות מזה, עדיף מלכתחילה מצב רשימה.
  // ⚠️ NODE_W חייב להישאר מסונכרן עם ה-CSS: רוחב הצומת + 6px ריפוד מכל צד
  // קובע גם את מיקום הקו האופקי (חצי מרוחב ה-li) וגם את ההקטנה. שינוי רוחב
  // ב-CSS בלי לעדכן כאן היה מזיז את כל הקווים.
  const NODE_W = 132
  const LI_W = NODE_W + 12

  // ⚠️ הרוחב האמיתי של התרשים נמדד ב*עלים*, לא במספר הצמתים בדור הרחב ביותר.
  // זה היה הבאג: בפריסת flex מקוננת רוחב הענף הוא סכום רוחבי ילדיו, ולכן עץ
  // שבו העלים מתפרסים על כמה דורות רחב בהרבה מהדור הרחב ביותר שלו. ההקטנה
  // חושבה לפי המדד הקטן, התרשים יצא רחב מהדף — ובהדפסה זה פשוט נחתך בצד.
  const leafUnits = (id: string, guard: Set<string>): number => {
    if (guard.has(id)) return 1        // מעגל בנתונים — נספר כעלה ולא תולה
    guard.add(id)
    const kids = childrenBy.get(id) ?? []
    if (!kids.length) return 1
    return kids.reduce((s, k) => s + leafUnits(k.id, guard), 0)
  }

  // A4 לרוחב פחות שוליים ≈ 1040px; לגובה נשאר מקום אחרי כותרת, הערה וכותרת תחתונה.
  const AVAIL_W = 1040
  const AVAIL_H = 520
  const LEVEL_H = 116                  // גובה צומת + המרווח האנכי בין הדורות
  const widthUnits = mode === 'tree' ? leafUnits(root.id, new Set<string>()) : 1
  const fitW = AVAIL_W / (widthUnits * LI_W)
  const fitH = AVAIL_H / (Math.max(1, perDepth.length) * LEVEL_H)
  // הרוחב נאכף במלואו (חיתוך לרוחב הוא איבוד מידע), הגובה מקטין עד 50% בלבד —
  // עץ עמוק מאוד עדיף שימשיך לעמוד הבא מאשר שיוקטן עד שלא יהיה קריא.
  const raw = Math.min(1, fitW, Math.max(fitH, 0.5))
  const scale = mode === 'tree' ? Math.max(0.3, raw) : 1
  const tooWide = mode === 'tree' && fitW < 0.3

  const listCss = `
  ul { list-style: none; margin: 0; padding: 0 18px 0 0; }
  body > ul { padding-right: 0; }
  li { position: relative; padding-top: 3px; break-inside: avoid; }
  /* קווי חיבור — נשארים גם בהדפסה בשחור-לבן */
  li::before { content: ""; position: absolute; top: 0; bottom: 0; right: -10px; border-right: 1px solid #CBD5E1; }
  li:last-child::before { bottom: auto; height: 15px; }
  li::after { content: ""; position: absolute; top: 15px; right: -10px; width: 9px; border-top: 1px solid #CBD5E1; }
  body > ul > li::before, body > ul > li::after { display: none; }
  .row { display: flex; align-items: center; gap: 7px; padding: 3px 0; }
  .mark { width: 13px; height: 13px; border: 1.2px solid #94A3B8; border-radius: 3px; flex: 0 0 auto; }
  .gen { font-size: 9.5px; font-weight: 700; color: #7C3AED; background: #F5F3FF;
         border: 1px solid #DDD6FE; border-radius: 20px; padding: 1px 6px; white-space: nowrap; }
  .name { font-size: 13.5px; font-weight: 600; }
  .rel { font-size: 9.5px; font-weight: 700; color: #1E40AF; background: #EFF6FF;
         border: 1px solid #BFDBFE; border-radius: 20px; padding: 1px 6px; }
  .rel.law { color: #92400E; background: #FFFBEB; border-color: #FDE68A; }
  .st { font-size: 9.5px; font-weight: 700; border-radius: 20px; padding: 1px 6px; white-space: nowrap; }
  .st.ok   { color: #166534; background: #F0FDF4; border: 1px solid #BBF7D0; }
  .st.pend { color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A; }
  .st.rej  { color: #991B1B; background: #FEF2F2; border: 1px solid #FECACA; }
  .d0 > .row .name { font-size: 16px; font-weight: 800; color: #5B21B6; }`

  // ⚠️ הקו האופקי נמתח מ-66px מכל צד ולא בשיטת ::before/::after על הילד
  // הראשון/האחרון. השיטה ההיא תלויה בכך שהילד הראשון הוא הימני — נכון ב-RTL
  // אך הפוך ל-LTR — וכל טעות בהיפוך מייצרת "שפם" שחורג משני צדי התרשים.
  // כאן הגאומטריה סימטרית ולכן חסינה לכיוון: רוחב צומת קבוע 120px ועוד 6px
  // ריפוד מכל צד = 132px, כלומר מרכז הילד הקיצוני הוא בדיוק 66px מהקצה.
  // לילד יחיד המרווח מתאפס מעצמו (132−66−66=0) והקו נעלם בלי טיפול מיוחד.
  const treeCss = `
  .tree { text-align: center; }
  .tree ul { position: relative; display: flex; justify-content: center;
             margin: 0; padding: 48px 0 0; list-style: none; }
  .tree > ul { padding-top: 0; }
  .tree li { position: relative; padding: 0 6px; list-style: none; break-inside: avoid; }
  /* קו אנכי מהצומת אל הקו האופקי של ילדיו */
  .tree ul::before {
    content: ""; position: absolute; top: 0; left: 50%; height: 24px; border-left: 1.5px solid #C4B5FD;
  }
  /* הקו האופקי — ממרכז הילד הראשון עד מרכז האחרון */
  .tree ul::after {
    content: ""; position: absolute; top: 24px; left: ${LI_W / 2}px; right: ${LI_W / 2}px; border-top: 1.5px solid #C4B5FD;
  }
  .tree > ul::before, .tree > ul::after { display: none; }
  /* קו אנכי מהקו האופקי אל הצומת */
  .tree li::before {
    content: ""; position: absolute; top: -24px; left: 50%; height: 24px; border-left: 1.5px solid #C4B5FD;
  }
  .tree > ul > li::before { display: none; }
  .tree .nd { position: relative; display: inline-block; width: ${NODE_W}px; vertical-align: top;
              border: 1.5px solid #DDD6FE; border-radius: 10px; background: #FAF5FF;
              padding: 7px 5px; }
  .tree .nd.law { background: #FFFBEB; border-color: #FDE68A; }
  .tree .nd.root { background: #7C3AED; border-color: #6D28D9; }
  .tree .nd.root .nm { color: #fff; }
  .tree .nd.root .mt { color: #DDD6FE; }
  .tree .nm { font-size: 11.5px; font-weight: 700; line-height: 1.25; }
  .tree .mt { font-size: 8.5px; font-weight: 600; color: #7C3AED; margin-top: 2px; }
  .tree .nd.law .mt { color: #92400E; }
  /* תגיות בן/חתן וסטטוס */
  .tree .bd { display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; margin-top: 4px; }
  .tree .b { font-size: 7.5px; font-weight: 800; border-radius: 20px;
             padding: 1px 5px; white-space: nowrap; border: 1px solid; }
  .tree .r-son  { color: #1E40AF; background: #EFF6FF; border-color: #BFDBFE; }
  .tree .r-law  { color: #92400E; background: #FFFBEB; border-color: #FDE68A; }
  .tree .r-none { color: #64748B; background: #F8FAFC; border-color: #E2E8F0; }
  .tree .s-ok   { color: #166534; background: #F0FDF4; border-color: #BBF7D0; }
  .tree .s-pend { color: #92400E; background: #FFFBEB; border-color: #FDE68A; }
  .tree .s-rej  { color: #991B1B; background: #FEF2F2; border-color: #FECACA; }
  /* בשורש הרקע סגול כהה — התגיות חייבות רקע בהיר כדי להישאר קריאות */
  .tree .nd.root .b { background: #fff; }`

  const noteHtml = mode === 'tree'
    ? `<strong>בקשה:</strong> נא לעבור על התרשים ולסמן את מי שאינו נכון, או להוסיף בכתב יד שם שחסר.
       לאחר מכן להחזיר אלינו את הדף. תודה רבה!`
    : `<strong>בקשה:</strong> נא לעבור על הרשימה ולסמן ✗ במשבצת שליד כל שם שאינו נכון,
       או להוסיף בכתב יד שם שחסר. לאחר מכן להחזיר אלינו את הדף. תודה רבה!`

  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<title>אילן היוחסין — ${escapeHtml(root.name)}</title>
<style>
  @page { size: A4 ${mode === 'tree' ? 'landscape' : 'portrait'}; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; direction: rtl; color: #0F172A; margin: 0; }
  header { border-bottom: 3px solid #7C3AED; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 21px; margin: 0 0 4px; color: #5B21B6; }
  .sub { font-size: 12px; color: #64748B; }
  .note { background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 8px;
          padding: 9px 12px; font-size: 12px; margin-bottom: 16px; color: #78350F; }
  .warn { background: #FEE2E2; border: 1px solid #FCA5A5; border-radius: 8px;
          padding: 9px 12px; font-size: 12px; margin-bottom: 14px; color: #991B1B; }
  footer { margin-top: 18px; border-top: 1px solid #E2E8F0; padding-top: 8px;
           font-size: 10.5px; color: #94A3B8; }
  .canvas { zoom: ${scale}; }
  @media print { .noprint { display: none !important; } }
  .noprint { text-align: center; margin: 0 0 14px; }
  .noprint button { font: inherit; font-size: 14px; font-weight: 700; color: #fff; background: #7C3AED;
                    border: none; border-radius: 10px; padding: 10px 22px; cursor: pointer; }
${mode === 'tree' ? treeCss : listCss}
</style></head><body>
<div class="noprint"><button onclick="window.print()">הדפסה / שמירה כ-PDF</button></div>
<header>
  <h1>אילן היוחסין — ${escapeHtml(root.name)}</h1>
  <div class="sub">היכל החתם סופר · ${total - 1} צאצאים · הופק בתאריך ${today}</div>
</header>
${tooWide ? `<div class="warn"><strong>שימו לב:</strong> המשפחה רחבה מכדי להיכנס לדף בגודל קריא. הכיתוב הוקטן למינימום — לתוצאה קריאה יותר מומלץ להדפיס במצב <strong>רשימה</strong>.</div>` : ''}
<div class="note">${noteHtml}</div>
${mode === 'tree' ? `<div class="canvas"><div class="tree"><ul>${body}</ul></div></div>` : `<ul>${body}</ul>`}
<footer>הופק ממערכת הניהול של היכל החתם סופר · ${today}</footer>
</body></html>`
}

// ⚡ רוחב תת-העץ עם מטמון (Map לפי id): בלי המטמון subtreeW נקראה שוב ושוב על
// אותם תת-עצים (פעם לכל אב-קדמון) — O(N²), ועל צומת עם 174 ילדים זה קפא את
// הטעינה/מיזוג. חישוב פוסט-אורדר יחיד → O(N), אותה תוצאה בדיוק.
function computeSubtreeWidths(roots: TreeNode[]): Map<string, number> {
  const w = new Map<string, number>()
  const visit = (n: TreeNode): number => {
    const cached = w.get(n.id)
    if (cached !== undefined) return cached
    const width = n.children.length ? n.children.reduce((s, c) => s + visit(c), 0) : NW + HGAP
    w.set(n.id, width)
    return width
  }
  roots.forEach(visit)
  return w
}

function layoutTree(roots: TreeNode[]): Positioned[] {
  const result: Positioned[] = []
  const W = computeSubtreeWidths(roots)   // כל הרוחבים מחושבים פעם אחת
  const sw = (n: TreeNode) => W.get(n.id) ?? (NW + HGAP)
  function place(n: TreeNode, x: number, y: number) {
    const cx = x + sw(n) / 2
    result.push({ node: n, x: cx - NW / 2, y, cx, cy: y + NH / 2 })
    let cx2 = x
    n.children.forEach(c => { place(c, cx2, y + NH + VGAP); cx2 += sw(c) })
  }
  let sx = PAD
  roots.forEach(r => { place(r, sx, PAD); sx += sw(r) })
  return result
}

function canvasSize(pos: Positioned[]) {
  if (!pos.length) return { w: 800, h: 400 }
  return { w: Math.max(...pos.map(p => p.x + NW)) + PAD, h: Math.max(...pos.map(p => p.y + NH)) + PAD }
}

function collectEdges(positions: Positioned[]) {
  const byId = new Map(positions.map(p => [p.node.id, p]))
  return positions.flatMap(p =>
    p.node.children.map(c => { const cp = byId.get(c.id); return cp ? { from: p, to: cp } : null })
      .filter(Boolean) as { from: Positioned; to: Positioned }[]
  )
}

// ─── Colors ───

// ⚠️ הפלטה מגיעה מ-lib/lineagePalette ואינה מוגדרת כאן — ראה שם למה.
const pal = genTone

// ─── Modal ───

// בורר סגנון ההדפסה. ברמת המודול ולא בתוך העמוד: הוא נדרש גם במסך הרגיל וגם
// במסך המלא, ושני עותקים של אותו בורר היו מתפצלים בשינוי הראשון.
function PrintPicker({ title, count, onPick, onClose }: {
  title: string; count: number
  onPick: (m: PrintMode) => void
  onClose: () => void
}) {
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 95, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginBottom: 4 }}>איך להדפיס את האילן?</div>
        <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 16 }}>{title} · {count} צאצאים</div>
        {([
          { m: 'tree' as const, icon: '🌳', t: 'תרשים עץ מעוצב', d: 'דורות זה מתחת לזה, לרוחב הדף. קליל וברור לעין — מתאים למשפחה קטנה או בינונית.' },
          { m: 'list' as const, icon: '📋', t: 'רשימה מוזחת', d: 'שורה לכל שם עם משבצת לסימון. נשאר קריא בכל גודל משפחה ונשפך על כמה עמודים.' },
        ]).map(o => (
          <button key={o.m} onClick={() => onPick(o.m)}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', textAlign: 'right', background: '#fff', border: '2px solid #E2E8F0', borderRadius: 14, padding: '13px 15px', marginBottom: 10, cursor: 'pointer', fontFamily: 'inherit' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#A78BFA'; e.currentTarget.style.background = '#FAF5FF' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#fff' }}>
            <span style={{ fontSize: 24, lineHeight: 1 }}>{o.icon}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: '#0F172A' }}>{o.t}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: '#64748B', lineHeight: 1.5, marginTop: 2 }}>{o.d}</span>
            </span>
          </button>
        ))}
        <button onClick={onClose}
          style={{ width: '100%', background: 'none', border: 'none', color: '#64748B', fontSize: 13, fontWeight: 700, padding: '8px 0', cursor: 'pointer', fontFamily: 'inherit' }}>
          ביטול
        </button>
      </div>
    </div>
  )
}

type ModalState =
  | { type: 'edit';   node: LineageNode }
  | { type: 'add';    parentId: string | null; parentName: string }
  | { type: 'delete'; node: TreeNode }
  | null

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,5,25,0.55)', backdropFilter: 'blur(6px)', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 22, width: '100%', maxWidth: 400, boxShadow: '0 32px 72px rgba(0,0,0,0.22)', border: '1px solid rgba(255,255,255,0.8)' }} dir="rtl" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 16px', borderBottom: '1px solid #F1F5F9' }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0F172A' }}>{title}</h2>
          <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', cursor: 'pointer', color: '#64748B', width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={15} /></button>
        </div>
        <div style={{ padding: '18px 22px 22px' }}>{children}</div>
      </div>
    </div>
  )
}

function MBtn({ label, color, onClick, loading }: { label: string; color: string; onClick: () => void; loading?: boolean }) {
  return (
    <button onClick={onClick} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6, background: color, color: '#fff', border: 'none', borderRadius: 11, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.65 : 1, fontFamily: 'inherit', transition: 'opacity .15s' }}>
      {loading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
      {label}
    </button>
  )
}

// בורר קשר בן/חתן של הצומת ביחס להורה שלו (לשורש אין קשר)
function RelationPicker({ value, onChange, required }: { value: 'son' | 'son_in_law' | null; onChange: (v: 'son' | 'son_in_law' | null) => void; required?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#64748B' }}>קשר להורה (הדור הקודם){required && <span style={{ color: '#DC2626' }}> *</span>}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {([['son', 'בן', '#DBEAFE', '#1E40AF', '#93C5FD'], ['son_in_law', 'חתן', '#FEF3C7', '#92400E', '#FCD34D']] as const).map(([v, l, bg, fg, br]) => (
          <button key={v} type="button" onClick={() => onChange(value === v ? null : v)}
            style={{ flex: 1, padding: '9px 0', borderRadius: 10, border: `1.5px solid ${value === v ? br : '#E2E8F0'}`, background: value === v ? bg : '#fff', color: value === v ? fg : '#94A3B8', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            {l}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Tree view ───

function TreeView({ nodes, onRefresh, onStatusChange, onRelationChange, onClearFilters, statusFilter, generationFilter, mergeMode, mergeSel, dupIds, onToggleMerge, dupFilter, onMergeGroup, onCleanChildren, onReviewToggle, reviewExcluded, onFocusNode, focusId, anchor, scanIds, locateIds, linked, fullMode = false }: { nodes: LineageNode[]; onRefresh: () => void; onStatusChange: (id: string, status: 'verified' | 'pending' | 'rejected') => void; onRelationChange: (id: string, relation: 'son' | 'son_in_law' | null) => void; onClearFilters: () => void; statusFilter: StatusFilter; generationFilter: number | null; mergeMode: boolean; mergeSel: Set<string>; dupIds: Set<string>; onToggleMerge: (id: string) => void; dupFilter: boolean; onMergeGroup: (id: string) => void; onCleanChildren: (id: string) => void; onReviewToggle?: (id: string) => boolean; reviewExcluded?: Set<string>; onFocusNode: (id: string | null) => void; focusId: string | null; anchor: { id: string; n: number } | null; scanIds: Set<string>; locateIds: Set<string>; linked: Record<string, { id: string; name: string }[]>; fullMode?: boolean }) {
  const toast = useToast()
  const router = useRouter()
  const canAdd = useCan('lineage', 'add')
  const canEdit = useCan('lineage', 'edit')
  const canDelete = useCan('lineage', 'delete')
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  // hover עם השהיה לסגירה — מאפשר להזיז את העכבר אל החלונית בלי שהיא תיעלם
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showHover = useCallback((id: string) => {
    if (hoverTimer.current) { clearTimeout(hoverTimer.current); hoverTimer.current = null }
    setHovered(id)
  }, [])
  const scheduleHideHover = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setHovered(null), 280)
  }, [])
  const [modal, setModal] = useState<ModalState>(null)
  // הצומת שממתין לאישור דחייה (דחייה מפילה במפל צאצאים ומשפחות — נדרש אישור)
  const [rejectNode, setRejectNode] = useState<TreeNode | null>(null)
  // הצומת שתפריט "פתיחת הכרטסת" שלו פתוח כרגע
  const [openCardFor, setOpenCardFor] = useState<string | null>(null)
  // רשימת הילדים הפתוחה (מזהה הצומת) + טיימר סגירה מושהה, כדי שהמעבר עם
  // העכבר מהצ'יפ אל החלונית לא יסגור אותה באמצע הדרך.
  const [kidsFor, setKidsFor] = useState<string | null>(null)
  const kidsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [formName, setFormName] = useState('')
  const [formRelation, setFormRelation] = useState<'son' | 'son_in_law' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [zoom, setZoom] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  // ⚡ Virtualization: החלון הנראה כרגע (במרחב הלא-מוקטן). מרנדרים רק צמתים בתוכו
  // + מרווח. בלי זה כל ~5000 הצמתים מרונדרים כ-DOM (עשרות אלפי אלמנטים) והמסך קפא.
  const [viewport, setViewport] = useState<{ x: number; y: number; w: number; h: number }>({ x: 0, y: 0, w: 2000, h: 1200 })
  const vpRaf = useRef<number | null>(null)
  const didCenter = useRef(false)
  const dragRef = useRef<{ startX: number; startY: number; scrollX: number; scrollY: number } | null>(null)
  const draggedRef = useRef(false)
  const downBgRef = useRef(false)
  const zoomAnchor = useRef<{ px: number; py: number; offX: number; offY: number } | null>(null)

  // clear node-path selection whenever a top filter changes, so the filter takes over
  useEffect(() => { setSelected(null) }, [statusFilter, generationFilter])


  const positions = useMemo(() => layoutTree(buildTree(nodes)), [nodes])
  const edges = useMemo(() => collectEdges(positions), [positions])
  const { w, h } = useMemo(() => canvasSize(positions), [positions])

  // מדידת החלון הנראה מתוך ה-canvas (ממירים חזרה למרחב הלא-מוקטן ע"י חלוקה ב-zoom),
  // עם throttle ב-rAF כדי שגלילה/גרירה לא יציפו setState.
  const measureViewport = useCallback(() => {
    const el = canvasRef.current
    if (!el) return
    if (vpRaf.current) cancelAnimationFrame(vpRaf.current)
    vpRaf.current = requestAnimationFrame(() => {
      setViewport({
        x: el.scrollLeft / zoom,
        y: el.scrollTop / zoom,
        w: el.clientWidth / zoom,
        h: el.clientHeight / zoom,
      })
    })
  }, [zoom])

  // עדכון על scroll (כולל גרירת pan שמזיזה scrollLeft/Top ישירות) ועל שינוי zoom/עץ.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    el.addEventListener('scroll', measureViewport, { passive: true })
    measureViewport()
    return () => el.removeEventListener('scroll', measureViewport)
  }, [measureViewport, positions.length])

  // סינון לרינדור: רק צמתים/קווים בתוך החלון + מרווח נדיב (מסך שלם לכל צד),
  // כדי שגלילה מהירה לא תחשוף אזור ריק. במרחב הלא-מוקטן.
  const MARGIN = 1200
  const inView = useCallback((px: number, py: number) =>
    px + NW >= viewport.x - MARGIN && px <= viewport.x + viewport.w + MARGIN &&
    py + NH >= viewport.y - MARGIN && py <= viewport.y + viewport.h + MARGIN,
  [viewport])
  // ⚠️ כשצומת נבחר, המסלול המיושר (alignedById) מזיז צמתים לטור מרכזי — לכן במצב
  // 'selected' משביתים את הסינון לגמרי (מרנדרים הכל) כדי שהמסלול לא ייחתך. זה נדיר
  // וקורה רק אחרי בחירה מפורשת. במצב הרגיל (בלי בחירה) מסננים לפי החלון הנראה.
  const virtualizeOff = positions.length <= 400 || !!selected
  const visiblePositions = useMemo(
    () => virtualizeOff ? positions : positions.filter(p => inView(p.x, p.y)),
    [positions, inView, virtualizeOff],
  )
  const visibleEdges = useMemo(
    () => virtualizeOff ? edges : edges.filter(e => inView(e.from.x, e.from.y) || inView(e.to.x, e.to.y)),
    [edges, inView, virtualizeOff],
  )

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setZoom(prev => {
        const next = Math.min(2.5, Math.max(0.1, +(prev - e.deltaY * 0.0015).toFixed(3)))
        if (next === prev) return prev
        const rect = el.getBoundingClientRect()
        const offX = e.clientX - rect.left
        const offY = e.clientY - rect.top
        zoomAnchor.current = {
          px: (el.scrollLeft + offX) / prev,
          py: (el.scrollTop + offY) / prev,
          offX, offY,
        }
        return next
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [nodes.length])

  useLayoutEffect(() => {
    const el = canvasRef.current
    const a = zoomAnchor.current
    if (!el || !a) return
    el.scrollLeft = a.px * zoom - a.offX
    el.scrollTop = a.py * zoom - a.offY
    zoomAnchor.current = null
  }, [zoom])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      dragRef.current = { startX: e.clientX, startY: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop }
      draggedRef.current = false
      // did the press start on empty canvas (not on a node)?
      downBgRef.current = !(e.target as HTMLElement)?.closest?.('[data-lin-node]')
      el.style.cursor = 'grabbing'
    }
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.clientX - dragRef.current.startX
      const dy = e.clientY - dragRef.current.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        draggedRef.current = true
        e.preventDefault()
        el.scrollLeft = dragRef.current.scrollX - dx
        el.scrollTop  = dragRef.current.scrollY - dy
      }
    }
    const onUp = () => {
      const wasDown = dragRef.current !== null
      const dragged = draggedRef.current
      const onBg = downBgRef.current
      dragRef.current = null
      el.style.cursor = 'grab'
      // plain click on empty canvas → clear node selection and any active filter
      if (wasDown && !dragged && onBg) { setSelected(null); onClearFilters() }
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [nodes.length])

  useEffect(() => {
    if (!positions.length || didCenter.current) return
    const el = canvasRef.current
    if (!el) return
    didCenter.current = true
    requestAnimationFrame(() => {
      if (!canvasRef.current) return
      const c = canvasRef.current
      const scrollTo = (w * zoom - c.clientWidth) / 2
      if (scrollTo > 0) c.scrollLeft = scrollTo
    })
  }, [positions.length, w, zoom])

  // ── מרכוז המבט על צומת מבוקש (למשל הצומת שנשאר אחרי מיזוג) ──
  // ⚠️ נשמר המונה שכבר טופל: positions נמצא ב-deps כדי שהמרכוז יקרה *אחרי*
  // שהפריסה החדשה מוכנה, אך בלי המונה כל שינוי פריסה היה מקפיץ את המבט חזרה
  // לעוגן הישן — כולל גרירה של המשתמש עצמו.
  const lastAnchor = useRef(-1)
  useEffect(() => {
    if (!anchor || anchor.n === lastAnchor.current) return
    const el = canvasRef.current
    const p = positions.find(pp => pp.node.id === anchor.id)
    if (!el || !p) return
    lastAnchor.current = anchor.n
    // ⚠️ גלילה *רק אם* הצומת יצא מהמסך. מרכוז כפוי אחרי כל מיזוג הקפיץ את
    // התצוגה הצידה גם כשהצומת כבר היה מול העיניים — וזה הרס עבודה רצופה:
    // אחרי כל מיזוג המשתמש נאלץ לאתר מחדש איפה הוא נמצא. כשהצומת גלוי,
    // המקום נשאר בדיוק כפי שהוא והמיזוג פשוט קורה לנגד העיניים.
    const x = p.cx * zoom, y = p.cy * zoom
    const pad = 80
    const visX = x > el.scrollLeft + pad && x < el.scrollLeft + el.clientWidth - pad
    const visY = y > el.scrollTop + pad && y < el.scrollTop + el.clientHeight - pad
    if (visX && visY) return
    el.scrollTo({
      left: x - el.clientWidth / 2,
      top: Math.max(0, y - el.clientHeight / 2),
      behavior: 'smooth',
    })
  }, [anchor, positions, zoom])

  function close() { setModal(null); setSaveErr(''); setFormRelation(null) }

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch('/api/admin/lineage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modal.node.id, name: formName, relation: formRelation }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/admin/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: modal.parentId, relation: formRelation }) })
      }
      onRefresh(); close()
    } catch { setSaveErr('שגיאה בשמירה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/admin/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      if (selected === modal.node.id) setSelected(null)
      onRefresh(); close()
    } catch { setSaveErr('שגיאה במחיקה') }
    setSaving(false)
  }

  async function patchStatus(node: LineageNode, status: 'verified' | 'pending' | 'rejected') {
    // 🔴 אישור האבות נשאל, לא נעשה בשקט.
    //
    // אישור צומת אחד סימן "מאושר" את כל שרשרת האבות הממתינה מעליו. מי שאישר
    // אדם בדור 9 אישר איתו ארבעה אבות שאיש לא בדק — מסוכן במיוחד בזמן ניקוי
    // כפילויות, כי בדיוק האבות הכפולים שנבדקים נצבעו ירוק.
    //
    // ⚠️ הצורך אמיתי: בורר סדר הדורות ברישום מנווט דרך מאושרים בלבד, ולכן בן
    // מאושר שאביו "ממתין" לא יופיע לנרשמים הבאים. לכן שואלים ולא מבטלים.
    let verifyAncestors = false
    if (status === 'verified') {
      const byId = new Map(nodes.map(n => [n.id, n]))
      const pend: LineageNode[] = []
      const seen = new Set<string>([node.id])
      let cur = node.parent_id
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        const a = byId.get(cur)
        if (!a || (a.status ?? 'pending') === 'verified') break
        pend.push(a)
        cur = a.parent_id
      }
      if (pend.length) {
        verifyAncestors = confirm(
          `לאשר גם את ${pend.length} הדורות שמעליו?\n\n` +
          pend.map((a, i) => `${i + 1}. ${a.name}  (דור ${a.generation})`).join('\n') +
          '\n\nאישור = כל אלה יסומנו "מאושר".\n' +
          'ביטול = רק הצומת הזה יאושר. שימו לב: כל עוד אב שלו "ממתין", הוא לא יופיע לנרשמים בבורר סדר הדורות.',
        )
      }
    }
    onStatusChange(node.id, status)
    const res = await fetch('/api/admin/lineage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id: node.id, status, verifyAncestors }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      onStatusChange(node.id, node.status ?? 'pending')
      toast.error(`שגיאה בשמירה: ${res.status} — ${err.error ?? 'שגיאה לא ידועה'}`)
      return
    }
    onRefresh()
  }

  // סימון בן/חתן מהיר (מ-hover) — עדכון אופטימי + שמירה
  async function patchRelation(node: LineageNode, relation: 'son' | 'son_in_law') {
    const next = node.relation === relation ? null : relation
    onRelationChange(node.id, next)
    const res = await fetch('/api/admin/lineage', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ id: node.id, relation: next }),
    })
    if (!res.ok) { onRelationChange(node.id, node.relation ?? null); toast.error('שגיאה בשמירת בן/חתן'); return }
    onRefresh()
  }

  async function handleToggleStatus(node: LineageNode) {
    await patchStatus(node, nextStatus(node.status))
  }

  async function handleSetStatus(node: LineageNode, status: 'verified' | 'pending' | 'rejected') {
    await patchStatus(node, status)
  }

  /** כל הצאצאים של צומת בתצוגה — להצגת היקף הדחייה לפני שמאשרים אותה. */
  function descendantsOfNode(node: TreeNode): string[] {
    const out: string[] = []
    const stack = [...(node.children ?? [])]
    let guard = 0
    while (stack.length && guard++ < 20_000) {
      const cur = stack.pop() as TreeNode
      out.push(cur.id)
      for (const c of cur.children ?? []) stack.push(c)
    }
    return out
  }

  const selPos = selected ? positions.find(p => p.node.id === selected) ?? null : null

  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return []
    const q = searchQuery.trim().toLowerCase()
    return nodes.filter(n => n.name.toLowerCase().includes(q)).slice(0, 8)
  }, [searchQuery, nodes])

  function scrollToNode(nodeId: string) {
    const pos = positions.find(p => p.node.id === nodeId)
    if (!pos || !canvasRef.current) return
    const el = canvasRef.current
    const targetX = pos.cx * zoom - el.clientWidth / 2
    const targetY = pos.y * zoom - el.clientHeight / 3
    el.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: 'smooth' })
  }

  function selectAndGo(nodeId: string) {
    setSelected(nodeId)
    setSearchQuery('')
    setShowSearch(false)
    setTimeout(() => scrollToNode(nodeId), 50)
  }

  function fitToScreen() {
    if (!canvasRef.current || !positions.length) return
    const el = canvasRef.current
    const newZoom = Math.min(1.5, Math.max(0.1, Math.min(el.clientWidth / (w + PAD * 2), el.clientHeight / (h + PAD * 2))))
    setZoom(newZoom)
    didCenter.current = false
  }

  const pathBranch = useMemo(() => {
    const s = new Set<string>()
    if (!selected) return s
    const nodeMap = new Map(positions.map(p => [p.node.id, p.node]))
    let cur: TreeNode | undefined = nodeMap.get(selected)
    let guard = 0
    while (cur && guard < 60) { s.add(cur.id); cur = cur.parent_id ? nodeMap.get(cur.parent_id) : undefined; guard++ }
    return s
  }, [selected, positions])

  // יישור מסלול: כשצומת נבחר, הצמתים שבמסלולו (הוא + אבותיו) מתיישרים לטור אנכי ממורכז.
  // שאר העץ נדחף הצידה — כדי שלא יחפוף על הטור — ונשאר מעומעם ברקע. מפה מלאה: לכל
  // צומת המיקום הסופי (מיושר / נדחף). בלי selected — ריקה, והכל מוצג כעץ רגיל.
  const alignedById = useMemo(() => {
    const m = new Map<string, { x: number; y: number; cx: number }>()
    if (!selected || pathBranch.size === 0) return m
    const chain = positions
      .filter(p => pathBranch.has(p.node.id))
      .sort((a, b) => a.node.generation - b.node.generation)  // שורש → נבחר
    const colCx = Math.max(w / 2, NW / 2 + PAD)
    chain.forEach((p, i) => {
      const y = PAD + i * (NH + VGAP)
      m.set(p.node.id, { x: colCx - NW / 2, y, cx: colCx })
    })
    // שאר העץ זז כבלוק אחיד הצידה (offset קבוע לכל צד) — המבנה היחסי נשמר, בלי חפיפה.
    // כך נפתחת רצועה נקייה סביב הטור המרכזי, ושני צדי העץ נשארים מסודרים.
    const SHIFT = NW * 1.4
    positions.forEach(p => {
      if (pathBranch.has(p.node.id)) return
      const push = p.cx < colCx ? -SHIFT : SHIFT
      m.set(p.node.id, { x: p.x + push, y: p.y, cx: p.cx + push })
    })
    return m
  }, [selected, pathBranch, positions, w])

  // בבחירת צומת — גלילה חלקה לטור המיושר (הנבחר), כדי שהבחירה תיראה גם אם המסך גולל הצידה.
  useEffect(() => {
    if (!selected) return
    const al = alignedById.get(selected)
    const el = canvasRef.current
    if (!al || !el) return
    const targetX = al.cx * zoom - el.clientWidth / 2
    const targetY = al.y * zoom - el.clientHeight / 3
    el.scrollTo({ left: Math.max(0, targetX), top: Math.max(0, targetY), behavior: 'smooth' })
  }, [selected, alignedById, zoom])

  if (!nodes.length) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 320, gap: 18, color: '#94A3B8' }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg,#F5F0FF,#EFF6FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #C4B5FD' }}>
        <Users size={30} style={{ color: '#7C3AED', opacity: 0.5 }} />
      </div>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#64748B' }}>אין צמתים בעץ עדיין</p>
      {canAdd && (
        <button onClick={() => { setFormName(''); setModal({ type: 'add', parentId: null, parentName: '' }) }} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'linear-gradient(135deg,#7C3AED,#5B21B6)', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 16px rgba(124,58,237,0.4)' }}>
          <Plus size={16} /> הוסף שורש ראשון
        </button>
      )}
    </div>
  )

  return (
    <>
      {/* search + zoom controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
        {/* search box */}
        <div style={{ position: 'relative', flex: 1, maxWidth: 260 }}>
          <input
            ref={searchRef}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setShowSearch(true) }}
            onFocus={() => setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 150)}
            placeholder="🔍 חיפוש שם..."
            dir="rtl"
            style={{ width: '100%', height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 12, padding: '0 10px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          {showSearch && searchResults.length > 0 && (
            <div style={{ position: 'absolute', top: 32, right: 0, left: 0, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, maxHeight: 260, overflowY: 'auto' }}>
              {searchResults.map(n => {
                const parent = n.parent_id ? nodeById.get(n.parent_id) : null
                return (
                  <div key={n.id} onMouseDown={() => selectAndGo(n.id)}
                    style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', direction: 'rtl' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#F5F0FF')}
                    onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{n.name}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
                      דור {n.generation}{parent ? ` · ${parent.name}` : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {selected && (
            <button onClick={() => setSelected(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, height: 28, borderRadius: 8, border: '1.5px solid #7C3AED44', background: '#F5F0FF', color: '#7C3AED', fontSize: 11, fontWeight: 700, cursor: 'pointer', padding: '0 10px' }}>
              <X size={12} /> נקה בחירה
            </button>
          )}
          <button onClick={fitToScreen} style={{ height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, cursor: 'pointer', padding: '0 8px', color: '#64748B', fontWeight: 600 }}>⊡ התאם</button>
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', fontWeight: 700 }}>+</button>
          <button onClick={() => { setZoom(1); didCenter.current = false }} style={{ height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 11, cursor: 'pointer', padding: '0 8px', color: '#64748B', fontWeight: 600 }}>{Math.round(zoom * 100)}%</button>
          <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C3AED', fontWeight: 700 }}>−</button>
        </div>
      </div>

      {/* canvas */}
      <div
        ref={canvasRef}
        dir="ltr"
        style={{
          overflow: 'auto',
          overflowAnchor: 'none',
          borderRadius: 18,
          // רקע קלף עדין מאוד — נגיעת זהב + קווי סרגל דהויים, משתלב ב-slate/זהב של האתר
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(198,158,45,0.05), transparent 70%),' +
            'repeating-linear-gradient(0deg, transparent 0 39px, rgba(27,50,86,0.025) 39px 40px),' +
            'linear-gradient(170deg,#fdfbf5 0%,#f6f1e4 100%)',
          border: '1.5px solid #e6ddc8',
          boxShadow: '0 4px 32px rgba(140,110,40,0.08)',
          // ⚠️ במסך המלא הגובה נקבע ע"י המעטפת (inset), ולא ע"י ניכוי קבוע
          // מגובה החלון: הקבוע 260 מניח את סרגל הכלים והמקרא, ושם הם אינם.
          height: fullMode ? '100%' : 'calc(100vh - 260px)',
          minHeight: fullMode ? 0 : 400,
          cursor: 'grab',
        }}
      >
        <div style={{ position: 'relative', width: w * zoom, height: (h + 60) * zoom, minWidth: '100%' }}>
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} width={w * zoom} height={(h + 60) * zoom}>
            {visibleEdges.map((e, i) => {
              // כשיש מסלול מיושר — קצות הקו נלקחים מהמיקום המיושר (טור אנכי), אחרת המקורי
              const fa = alignedById.get(e.from.node.id), ta = alignedById.get(e.to.node.id)
              const fx = fa?.cx ?? e.from.cx, fy = fa?.y ?? e.from.y
              const tx = ta?.cx ?? e.to.cx, ty = ta?.y ?? e.to.y
              const x1 = fx * zoom, y1 = (fy + NH) * zoom, x2 = tx * zoom, y2 = ty * zoom
              const mid = (y1 + y2) / 2
              const col = pal(e.from.node.generation).ring
              // חיבור אורתוגונלי מסודר (כמו אילן יוחסין קלאסי): יורד מההורה לגובה האמצע,
              // אופקי לעמודת הילד, ואז יורד לילד. פינות מעוגלות עדין לרכות.
              const r = Math.min(10 * zoom, Math.abs(x2 - x1) / 2, Math.abs(mid - y1))
              const dir = x2 >= x1 ? 1 : -1
              const d = Math.abs(x2 - x1) < 1
                ? `M${x1},${y1} L${x2},${y2}`
                : `M${x1},${y1} L${x1},${mid - r} Q${x1},${mid} ${x1 + dir * r},${mid} L${x2 - dir * r},${mid} Q${x2},${mid} ${x2},${mid + r} L${x2},${y2}`
              const isPathEdge = selected && pathBranch.has(e.from.node.id) && pathBranch.has(e.to.node.id)
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke="#fff" strokeWidth={isPathEdge ? 8 : 5} strokeLinecap="round" strokeLinejoin="round" opacity={selected && !isPathEdge ? 0.1 : 0.9} />
                  <path d={d} fill="none" stroke={col} strokeWidth={isPathEdge ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" opacity={selected && !isPathEdge ? 0.08 : 0.85} />
                </g>
              )
            })}
          </svg>

          {visiblePositions.map(pos => {
            const nodeStatus = pos.node.status ?? 'verified'
            const genPal = pal(pos.node.generation)
            // הבדל בתוך צבע הדור בלי להחוויר: בן = צבע הדור המלא · חתן = אותו גוון, כהה יותר
            const relOverlay = pos.node.relation === 'son_in_law'
              ? 'linear-gradient(rgba(0,0,0,0.30),rgba(0,0,0,0.30)), '
              : ''
            const isSel = selected === pos.node.id
            // ⚠️ לא מותנה יותר ב-mergeMode: Ctrl+לחיצה מסמנת גם מחוץ למצב
            // המיזוג, והסימון חייב להיראות על הכרטיס גם אז — אחרת המשתמש מסמן
            // שבעה צמתים ולא רואה שום חיווי שמשהו נבחר.
            const inMerge = mergeSel.has(pos.node.id)
            const isDup = dupIds.has(pos.node.id)
            const inScan = scanIds.has(pos.node.id)
            const inLocate = locateIds.has(pos.node.id)
            // צומת שהוצא ידנית מהאשכול שנבדק — חייב להיראות אחרת לגמרי,
            // אחרת אין דרך לדעת מה בפנים ומה בחוץ.
            const isExcluded = !!reviewExcluded?.has(pos.node.id)
            // ⚠️ כשמאתרים קבוצה מהפאנל, כל השאר מעומעם — אחרת שני צמתים
            // מודגשים בתוך עץ של 500 פשוט נבלעים ואי אפשר למצוא אותם.
            const isDimmed = mergeMode
              ? false
              : locateIds.size > 0
                ? !inLocate
                : selected !== null
                  ? !pathBranch.has(pos.node.id)
                  : dupFilter
                    ? !isDup
                    : (statusFilter !== null && nodeStatus !== statusFilter) || (generationFilter !== null && pos.node.generation !== generationFilter)
            const p = nodeStatus === 'verified' ? genPal
              : nodeStatus === 'rejected'
                ? { bg: 'linear-gradient(135deg,#EF4444 0%,#DC2626 100%)', ring: '#DC2626', shadow: 'rgba(220,38,38,0.4)', light: '#FEF2F2', text: '#991B1B' }
                : { bg: 'linear-gradient(135deg,#FB923C 0%,#EA580C 100%)', ring: '#EA580C', shadow: 'rgba(234,88,12,0.4)', light: '#FFF7ED', text: '#9A3412' }
            // מיקום הרינדור: מיושר (טור אנכי) אם הצומת במסלול הנבחר, אחרת המקורי
            const al = alignedById.get(pos.node.id)
            const rx = al?.x ?? pos.x, ry = al?.y ?? pos.y
            return (
              <div
                key={pos.node.id}
                data-lin-node="1"
                onMouseEnter={() => showHover(pos.node.id)}
                onMouseLeave={scheduleHideHover}
                onClick={e => {
                  e.stopPropagation()
                  // 👁 מצב בדיקת אשכול — לחיצה על כרטיס בקבוצה מוציאה/מחזירה
                  // אותו מהמיזוג. זו הפעולה הראשית במצב הזה, ולכן היא קודמת.
                  if (onReviewToggle && onReviewToggle(pos.node.id)) return
                  // ⚡ Ctrl/Cmd+לחיצה = סימון מהיר למיזוג, מכל מקום ובלי להיכנס
                  // קודם למצב מיוחד. זו הדרך המהירה לסמן ידנית קבוצת כפילויות
                  // (למשל שבעה "רבי ישראל שטערן" באותו דור): לחיצה לכל צומת.
                  // ⚠️ הבחירה נשמרת ב-mergeSel ולא ב-selected — selected מכבה את
                  // הווירטואליזציה (ראו virtualizeOff), ובעץ גדול זה היה מקפיא.
                  if (e.ctrlKey || e.metaKey) { onToggleMerge(pos.node.id); return }
                  if (mergeMode) { onToggleMerge(pos.node.id); return }
                  setSelected(prev => prev === pos.node.id ? null : pos.node.id)
                }}
                style={{
                  position: 'absolute', left: rx * zoom, top: ry * zoom,
                  width: NW * zoom, height: NH * zoom, borderRadius: 16 * zoom,
                  background: relOverlay + p.bg,
                  boxShadow: inMerge
                    ? `0 0 0 3px #fff, 0 0 0 6px #16A34A, 0 12px 32px rgba(22,163,74,0.4)`
                    // הקבוצה שאותרה מהפאנל — טבעת סגולה עבה ובולטת
                    : isExcluded
                      // הוצא מהמיזוג — טבעת אפורה דקה, בלי הבלטה
                      ? `0 0 0 2px #fff, 0 0 0 4px #94A3B8, 0 4px 14px rgba(100,116,139,0.3)`
                      : inLocate
                      ? `0 0 0 3px #fff, 0 0 0 7px #7C3AED, 0 14px 36px rgba(124,58,237,0.55)`
                      : isSel
                        ? `0 0 0 3px #fff, 0 0 0 5.5px ${p.ring}, 0 12px 32px ${p.shadow}`
                        // מועמד מהסריקה — טבעת דקה, מסמנת בלי להשתלט על המסך
                        : inScan
                          ? `0 0 0 2.5px #fff, 0 0 0 4.5px #A78BFA, 0 6px 20px rgba(124,58,237,0.35)`
                          : `0 4px 18px ${p.shadow}`,
                  border: nodeStatus === 'verified' ? 'none' : `${Math.max(2, 2.5 * zoom)}px dashed #fff`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer',
                  transform: isSel ? 'scale(1.07) translateY(-2px)' : 'scale(1)',
                  // ללא אנימציה על left/top — היא גרמה לקפיצות בזום ובגלילה. המיקום משתנה מיד.
                  transition: 'box-shadow .2s, transform .2s, opacity .2s',
                  opacity: isExcluded ? 0.4 : isDimmed ? 0.25 : 1,
                  filter: isExcluded ? 'grayscale(0.85)' : undefined,
                  zIndex: (isSel || hovered === pos.node.id) ? 50 : 2, userSelect: 'none',
                }}>

                {/* generation badge */}
                <div style={{
                  position: 'absolute', top: -10 * zoom, right: 6 * zoom,
                  background: '#fff', color: p.ring,
                  fontSize: Math.max(8, 10 * zoom), fontWeight: 900,
                  width: 22 * zoom, height: 22 * zoom, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 2px 8px ${p.shadow}`,
                  border: `2px solid ${p.ring}`,
                }}>{pos.node.generation}</div>

                {/* תג "כפול" — שם המופיע ביותר מצומת אחד.
                    ⚠️ מועמד מהסריקה מקבל תג משלו ("מועמד למיזוג"), כי הוא נמצא
                    גם על התאמה מקורבת שהזיהוי המקומי (שם זהה בדיוק) לא תופס. */}
                {(isDup || inScan) && zoom >= 0.5 && (
                  <div style={{ position: 'absolute', bottom: -10 * zoom, left: '50%', transform: 'translateX(-50%)', background: inScan ? '#7C3AED' : '#9333EA', color: '#fff', fontSize: Math.max(7, 8 * zoom), fontWeight: 800, padding: `${1 * zoom}px ${7 * zoom}px`, borderRadius: 20, border: '1.5px solid #fff', whiteSpace: 'nowrap', zIndex: 26 }}>
                    {inScan ? 'מועמד למיזוג' : 'כפול'}
                  </div>
                )}

                {/* תג "לא במיזוג" — לצומת שהוצא ידנית מהאשכול שנבדק */}
                {isExcluded && zoom >= 0.4 && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 16 * zoom, background: 'rgba(100,116,139,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 25 }}>
                    <span style={{ background: '#475569', color: '#fff', fontSize: Math.max(8, 9 * zoom), fontWeight: 800, padding: `${2 * zoom}px ${8 * zoom}px`, borderRadius: 20, border: '1.5px solid #fff', whiteSpace: 'nowrap' }}>
                      ✕ לא במיזוג
                    </span>
                  </div>
                )}

                {/* כיסוי בחירה במצב מיזוג */}
                {inMerge && (
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 16 * zoom, background: 'rgba(22,163,74,0.20)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 24 }}>
                    <div style={{ background: '#16A34A', borderRadius: '50%', width: 26 * zoom, height: 26 * zoom, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}><Check size={14 * zoom} color="#fff" strokeWidth={3} /></div>
                  </div>
                )}

                {/* status indicator dot */}
                <div
                  onClick={e => { e.stopPropagation(); if (canEdit) handleToggleStatus(pos.node) }}
                  title={nodeStatus === 'verified' ? 'מאומת → לחץ לממתין' : nodeStatus === 'pending' ? 'ממתין → לחץ ללא מאושר' : 'לא מאושר → לחץ לאימות'}
                  style={{
                    position: 'absolute', top: -10 * zoom, left: 6 * zoom,
                    width: 20 * zoom, height: 20 * zoom, borderRadius: '50%',
                    background: statusColor(nodeStatus),
                    border: `2px solid #fff`,
                    boxShadow: `0 1px 5px rgba(0,0,0,0.3)`,
                    cursor: canEdit ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 25, fontSize: Math.max(8, 11 * zoom), fontWeight: 900, color: '#fff',
                  }}>
                  {zoom >= 0.5 && (nodeStatus === 'verified'
                    ? <Check size={10 * zoom} color="#fff" strokeWidth={3} />
                    : <span style={{ fontSize: Math.max(7, 9 * zoom) }}>{nodeStatus === 'rejected' ? '✗' : '⏳'}</span>
                  )}
                </div>

                {/* name — ⚠️ הטקסט מתכווץ *יחד* עם הצומת: הגודל פרופורציונלי ל-zoom
                    עם רצפה נמוכה (4px) במקום 9px. קודם הרצפה הגבוהה השאירה טקסט
                    בגודל קבוע בעוד הצומת מתכווץ, ולכן השם גלש/נחתך בזום קטן. */}
                <span style={{
                  color: '#fff', fontWeight: 700,
                  fontSize: Math.max(4, (pos.node.name.length > 14 ? 11 : pos.node.name.length > 10 ? 13 : 14) * zoom),
                  textAlign: 'center', direction: 'rtl',
                  padding: `0 ${14 * zoom}px`, lineHeight: 1.25,
                  textShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  maxWidth: (NW - 16) * zoom,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const,
                }}>{pos.node.name}</span>

                {/* children count chip — מעבר עכבר פותח את רשימת הילדים עם הסטטוס
                    של כל אחד. עד כה הצ'יפ הראה מספר בלבד, וכדי לדעת מי הילדים
                    ומה מצבם היה צריך לגלול בעץ ולבדוק אחד-אחד. */}
                {pos.node.children.length > 0 && zoom >= 0.6 && (
                  <div
                    onMouseEnter={() => { if (kidsTimer.current) clearTimeout(kidsTimer.current); setKidsFor(pos.node.id) }}
                    onMouseLeave={() => { kidsTimer.current = setTimeout(() => setKidsFor(null), 220) }}
                    onClick={e => { e.stopPropagation(); setKidsFor(cur => cur === pos.node.id ? null : pos.node.id) }}
                    style={{
                    position: 'absolute', bottom: -11 * zoom, left: 6 * zoom,
                    background: kidsFor === pos.node.id ? p.ring : '#fff',
                    border: `1.5px solid ${p.ring}44`,
                    color: kidsFor === pos.node.id ? '#fff' : p.ring,
                    fontSize: Math.max(8, 9 * zoom), fontWeight: 800,
                    padding: `${1 * zoom}px ${6 * zoom}px`, borderRadius: 20,
                    boxShadow: `0 1px 4px ${p.shadow}`, direction: 'rtl',
                    cursor: 'pointer', zIndex: kidsFor === pos.node.id ? 61 : 'auto',
                  }}>{pos.node.children.length} ילדים</div>
                )}

                {/* רשימת הילדים — נפתחת ממעבר עכבר על הצ'יפ */}
                {kidsFor === pos.node.id && (
                  <div
                    onMouseEnter={() => { if (kidsTimer.current) clearTimeout(kidsTimer.current) }}
                    onMouseLeave={() => { kidsTimer.current = setTimeout(() => setKidsFor(null), 220) }}
                    onClick={e => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: '100%', left: 0, marginTop: 8,
                      background: '#fff', borderRadius: 14, border: '1px solid #E2E8F0',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: '10px 12px',
                      // ⚠️ רוחב ותצוגה בפיקסלים קבועים, בלי כפל ב-zoom: זו חלונית
                      // מידע ולא חלק מציור העץ, וכיווץ שלה בזום קטן היה הופך אותה
                      // לבלתי קריאה בדיוק כשצריך אותה — במבט-על על עץ גדול.
                      width: 260, maxHeight: 320, overflowY: 'auto', zIndex: 60,
                      direction: 'rtl', textAlign: 'right', cursor: 'default',
                    }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', marginBottom: 8 }}>
                      {pos.node.children.length} ילדים · {pos.node.name}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {[...pos.node.children]
                        .sort((a, b) => a.name.localeCompare(b.name, 'he'))
                        .map(kid => {
                          const ks = (kid.status ?? 'verified') as 'verified' | 'pending' | 'rejected'
                          const meta = ks === 'verified'
                            ? { bg: '#DCFCE7', fg: '#166534', label: 'מאושר' }
                            : ks === 'rejected'
                              ? { bg: '#FEE2E2', fg: '#991B1B', label: 'נדחה' }
                              : { bg: '#FEF3C7', fg: '#92400E', label: 'ממתין' }
                          return (
                            <button key={kid.id}
                              onClick={() => { setKidsFor(null); onFocusNode(kid.id) }}
                              title="הצג את הענף של צאצא זה"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                                background: '#F8FAFC', border: '1px solid #F1F5F9', borderRadius: 9,
                                padding: '6px 9px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'right',
                              }}>
                              <span style={{ background: meta.bg, color: meta.fg, fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20, flexShrink: 0 }}>{meta.label}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kid.name}</span>
                              {kid.children.length > 0 && (
                                <span style={{ fontSize: 9, color: '#94A3B8', fontWeight: 700, flexShrink: 0 }}>{kid.children.length}</span>
                              )}
                            </button>
                          )
                        })}
                    </div>
                  </div>
                )}

                {/* בן/חתן badge — קשר הצומת להורה (מקור אחד: lineage_nodes.relation) */}
                {pos.node.relation && zoom >= 0.5 && (
                  <div style={{
                    position: 'absolute', bottom: -11 * zoom, right: 6 * zoom,
                    background: pos.node.relation === 'son' ? '#DBEAFE' : '#FEF3C7',
                    color: pos.node.relation === 'son' ? '#1E40AF' : '#92400E',
                    fontSize: Math.max(8, 9 * zoom), fontWeight: 800,
                    padding: `${1 * zoom}px ${8 * zoom}px`, borderRadius: 20,
                    boxShadow: `0 1px 4px rgba(0,0,0,0.12)`, direction: 'rtl',
                    border: `1.5px solid ${pos.node.relation === 'son' ? '#93C5FD' : '#FCD34D'}`,
                  }}>{pos.node.relation === 'son' ? 'בן' : 'חתן'}</div>
                )}

                {/* actions strip — מתחת לקובייה, גם בלחיצה וגם במעבר עכבר (hover).
                    ⚠️ מוצג גם במצב מיזוג. עד כה הוא הוסתר שם לגמרי, וברגע
                    שנכנסו למצב המיזוג נעלמו *כל* הפעולות על הצומת — כולל
                    "סמן למיזוג" עצמו ופתיחת הכרטסת לבדיקה מי הצומת הזה. */}
                {(isSel || hovered === pos.node.id) && (
                  <div onClick={e => e.stopPropagation()}
                    onMouseEnter={() => showHover(pos.node.id)}
                    onMouseLeave={scheduleHideHover}
                    style={{
                      // top:100% צמוד לתחתית הקוביה + padding-top שקוף כ"גשר" — כך המעבר עם העכבר לחלונית אינו מאבד את ה-hover
                      position: 'absolute', top: '100%', paddingTop: 12, left: '50%', transform: 'translateX(-50%)',
                      display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', zIndex: 40,
                    }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
                    background: '#fff', borderRadius: 16, padding: '8px 10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.16)', border: '1px solid #E2E8F0',
                  }}>
                    {/* כפתור מיזוג מהיר — לצומת כפול (שם זהה באותו גזע) *או* מועמד
                        מסריקה מקורבת. לחיצה = מיזוג מיידי בלייב, בלי תצוגה מקדימה
                        (isDup: ממזג את כל הקבוצה מיד; מועמד-מקורב בלי קבוצה מדויקת:
                        נכנס למצב מיזוג לבחירה ידנית). */}
                    {/* ⚡ סימון ידני — הפעולה הראשית. המשתמש בוחר בעצמו מי מתמזג
                        עם מי, במקום שהמערכת תחליט לפי שם זהה. מופיע על *כל*
                        צומת (לא רק על כפילויות שזוהו), כי בדיוק שם היה החסר:
                        צמתים שהזיהוי האוטומטי לא תפס לא היו ניתנים לסימון. */}
                    <button onClick={() => onToggleMerge(pos.node.id)}
                      title={inMerge ? 'הסר מהבחירה' : 'סמן צומת זה למיזוג (קיצור: Ctrl+לחיצה על הכרטיס)'}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '7px 12px', borderRadius: 10, background: inMerge ? '#16A34A' : '#F1F5F9', color: inMerge ? '#fff' : '#334155', border: `1px solid ${inMerge ? '#16A34A' : '#CBD5E1'}`, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>
                      {inMerge ? '✓ מסומן למיזוג' : '+ סמן למיזוג'}
                    </button>
                    {/* ניקוי כפילויות בין הילדים — הפתרון לצומת עם עשרות
                        "ילדים" שרובם אותו אדם בכתיבים שונים. הזיהוי בעץ תופס
                        רק שם זהה בדיוק, ולכן וריאציות נשארות בלתי נראות. */}
                    {pos.node.children.length > 3 && (
                      <button onClick={() => onCleanChildren(pos.node.id)}
                        title="איתור וניקוי כפילויות בין הילדים של הצומת"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '7px 12px', borderRadius: 10, background: '#FDF4FF', color: '#86198F', border: '1px solid #F5D0FE', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>
                        🧹 נקה כפילויות ({pos.node.children.length})
                      </button>
                    )}
                    {/* קיצור-דרך אוטומטי — נפרד ומסומן ככזה. הכיתוב מציין כמה
                        צמתים ייבלעו, כדי שלא יתבלבל עם "מזג את מה שסימנתי". */}
                    {(isDup || inScan) && (() => {
                      // ספירת הקבוצה מחושבת כאן מקומית (אותו כלל בדיוק כמו
                      // dupIds בדף האב: אותו הורה + אותו דור + שם זהה אחרי נרמול
                      // רווחים) — רק כדי להציג מספר בכיתוב, לא כדי למזג.
                      const nm = pos.node.name.trim().replace(/\s+/g, ' ')
                      const gs = nodes.filter(n =>
                        (n.parent_id ?? 'root') === (pos.node.parent_id ?? 'root') &&
                        n.generation === pos.node.generation &&
                        n.name.trim().replace(/\s+/g, ' ') === nm).length
                      return (
                        <button onClick={() => onMergeGroup(pos.node.id)} title="קיצור: מזג אוטומטית את כל הכפילויות בעלות שם זהה באותו גזע"
                          style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '7px 12px', borderRadius: 10, background: '#9333EA', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>
                          ⚯ {gs > 1 ? `מזג את כל ה-${gs} הכפולים` : 'מזג מיד'}
                        </button>
                      )
                    })()}
                    {/* ── פתיחת הכרטסת המקושרת ──
                        ⚠️ העץ ידע עד כה רק שמות, וכל מעבר לכרטסת דרש לחפש את
                        המשפחה ידנית לפי שם. הכפתור מופיע רק כשיש משפחה מקושרת,
                        וריחוף עליו פותח את בחירת הכרטיסייה — כדי שאפשר יהיה
                        להשאיר את העץ פתוח ולעבוד לצידו. */}
                    {(() => {
                      // ⚠️ רק הכרטסת של הצומת עצמו. "משפחות בענף" הוסר: כשעומדים
                      // על צומת רוצים את הכרטסת שלו, ורשימת כל הצאצאים שמתחתיו
                      // רק הסתירה את זה. צומת בלי כרטסת אומר זאת במפורש, במקום
                      // להיעלם ולהשאיר את המשתמש בספק אם הכפתור פשוט לא עובד.
                      const items = linked[pos.node.id] ?? []
                      if (!items.length) {
                        return (
                          <div style={{ width: '100%', textAlign: 'center', padding: '6px 10px', borderRadius: 10, background: '#F8FAFC', border: '1px dashed #CBD5E1', color: '#94A3B8', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            אינו רשום עדיין בצאצאים
                          </div>
                        )
                      }
                      return (
                      <div style={{ position: 'relative', width: '100%' }}
                        onMouseEnter={() => setOpenCardFor(pos.node.id)}
                        onMouseLeave={() => setOpenCardFor(null)}>
                        <button type="button"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: '100%', padding: '7px 12px', borderRadius: 10, background: '#0EA5E9', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          <ExternalLink size={12} /> פתיחת הכרטסת
                          {items.length > 1 && ` (${items.length})`}
                        </button>
                        {/* ⚠️ שורה אחת לכל משפחה, לא שני כפתורים לכל אחת: עם 14
                            משפחות בענף התפריט הפך לקיר של כפתורים שאי אפשר לסרוק
                            בעין. השם עצמו הוא הכפתור (פתיחה כאן), והאייקון בצד
                            פותח בכרטיסייה חדשה. */}
                        {openCardFor === pos.node.id && (
                          <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', paddingTop: 6, zIndex: 60 }}>
                            <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,0.18)', overflow: 'hidden', width: 232, direction: 'rtl' }}>
                              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                {items.map((b, i) => (
                                  <div key={b.id} style={{ padding: '9px 10px', borderTop: i ? '1px solid #F1F5F9' : 'none' }}>
                                    <div style={{ fontSize: 11.5, fontWeight: 800, color: '#0F172A', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {b.name}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                      <button type="button"
                                        onClick={() => router.push(`/admin/beneficiaries/${b.id}`)}
                                        style={{ width: '100%', background: '#0EA5E9', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                        פתיחה בכרטיסייה זו
                                      </button>
                                      <button type="button"
                                        onClick={() => window.open(`/admin/beneficiaries/${b.id}`, '_blank', 'noopener')}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#fff', color: '#0369A1', border: '1.5px solid #BAE6FD', borderRadius: 8, padding: '7px 9px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                        <ExternalLink size={12} /> פתיחה בכרטיסייה חדשה
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                      )
                    })()}

                    {/* מיקוד בענף — רק לצומת שיש לו צאצאים, ורק כשאינו כבר במוקד.
                        ⚠️ במסך המלא הכיתוב שונה: שם הפעולה אינה "הצג ענף" אלא
                        *החלפת* הענף שעליו עובדים, וכיתוב זהה בשני המצבים היה
                        מטעה — נראה כאילו הוא פותח משהו נוסף. */}
                    {pos.node.children.length > 0 && focusId !== pos.node.id && (
                      <button onClick={() => onFocusNode(pos.node.id)}
                        title={fullMode
                          ? 'החלף את הענף שעליו עובדים — הצומת הזה וכל צאצאיו'
                          : 'הצג רק את הענף הזה — הצומת וכל צאצאיו, למסך עבודה נקי'}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '7px 12px', borderRadius: 10, background: '#7C3AED', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        {fullMode ? '🎯 החלף את הענף לכאן' : '🌳 הצג אילן צאצאים של דור זה'}
                      </button>
                    )}
                    {/* ⚠️ לשונית חדשה ולא ניווט במקום: המנהל עובד על ענף אחד
                        לאורך זמן, ורוצה להשאיר את העץ המלא פתוח לצידו. פתיחה
                        באותה לשונית הייתה מאבדת את המיקום בעץ הראשי בכל צלילה. */}
                    {pos.node.children.length > 0 && !fullMode && (
                      <button onClick={() => window.open(`/admin/lineage?focus=${pos.node.id}&full=1`, '_blank', 'noopener')}
                        title="פתח את הענף במסך מלא, בלשונית נפרדת"
                        style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', justifyContent: 'center', padding: '7px 12px', borderRadius: 10, background: '#fff', color: '#5B21B6', border: '1.5px solid #DDD6FE', cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        <ExternalLink size={12} /> פתח במסך מלא בלשונית חדשה
                      </button>
                    )}
                    {/* ── סטטוס הדור — ניתן לעריכה ישירות מכאן ──
                        ⚠️ עד כה היו כאן רק אייקוני "אשר"/"דחה" שהופיעו לסירוגין
                        לפי הסטטוס הנוכחי, ולא היה שום מקום שאומר *מה הסטטוס
                        עכשיו* או מאפשר לחזור ל"ממתין". כאן שלושת המצבים גלויים
                        תמיד, והנוכחי מסומן.
                        הסטטוס אינו קישוט: הוא קובע גם את סטטוס הכרטסת המקושרת
                        (אישור → המשפחה מאושרת · דחייה → נדחית) וגם אם הדור יוצג
                        לנרשמים הבאים בבורר סדר הדורות (מוצגים מאומתים בלבד). */}
                    {canEdit && (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', gap: 4, width: '100%' }}>
                          {([
                            ['verified', '✓ מאושר', '#16A34A', '#DCFCE7'],
                            ['pending', '⏳ ממתין', '#B45309', '#FEF3C7'],
                            ['rejected', '✕ נדחה', '#DC2626', '#FEE2E2'],
                          ] as const).map(([v, l, fg, bg]) => {
                            const on = nodeStatus === v
                            return (
                              <button key={v} type="button" title={`סמן ${l.slice(2)}`}
                                onClick={() => {
                                  if (on) return
                                  if (v === 'rejected') { setRejectNode(pos.node); return }
                                  handleSetStatus(pos.node, v)
                                }}
                                style={{ flex: 1, padding: '5px 0', borderRadius: 9, background: on ? fg : bg, color: on ? '#fff' : fg, border: `1.5px solid ${on ? fg : fg + '33'}`, cursor: on ? 'default' : 'pointer', fontSize: 10.5, fontWeight: 800, fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                {l}
                              </button>
                            )
                          })}
                        </div>
                        <div style={{ fontSize: 9.5, color: '#94A3B8', textAlign: 'center', fontWeight: 600, lineHeight: 1.4 }}>
                          משפיע על הכרטסת המקושרת ועל הצגת הדור לנרשמים
                        </div>
                      </div>
                    )}
                    {/* שורת אייקונים */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[
                        ...(canEdit ? [{ icon: <Pencil size={13} />, color: p.ring, bg: p.light, fn: () => { setFormName(pos.node.name); setFormRelation(pos.node.relation ?? null); setModal({ type: 'edit', node: pos.node }) }, title: 'ערוך' }] : []),
                        ...(canAdd ? [{ icon: <Plus size={14} />, color: '#059669', bg: '#ECFDF5', fn: () => { setFormName(''); setFormRelation(null); setModal({ type: 'add', parentId: pos.node.id, parentName: pos.node.name }) }, title: 'הוסף ילד' }] : []),
                        ...(canDelete ? [{ icon: <Trash2 size={13} />, color: '#64748B', bg: '#F1F5F9', fn: () => setModal({ type: 'delete', node: pos.node }), title: 'מחק' }] : []),
                      ].map((b, i) => (
                        <button key={i} onClick={b.fn} title={b.title} style={{ width: 32, height: 32, borderRadius: '50%', background: b.bg, color: b.color, border: `1.5px solid ${b.color}33`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b.icon}</button>
                      ))}
                    </div>
                    {/* שורת בן/חתן — מתחת לכל האייקונים (רק לצומת שאינו השורש) */}
                    {pos.node.parent_id && (
                      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
                        {([['son', 'בן', '#1E40AF', '#BFDBFE', '#EFF6FF'], ['son_in_law', 'חתן', '#92400E', '#FDE68A', '#FFFBEB']] as const).map(([v, l, fg, selBg, bg]) => (
                          <button key={v} onClick={() => patchRelation(pos.node, v)} title={`סמן ${l}`}
                            style={{ flex: 1, padding: '5px 0', borderRadius: 9, background: pos.node.relation === v ? selBg : bg, color: fg, border: `1.5px solid ${pos.node.relation === v ? fg : fg + '33'}`, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit' }}>{l}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* selected info panel */}
      {selPos && (
        <div style={{ marginTop: 16, background: '#fff', borderRadius: 16, border: `2px solid ${pal(selPos.node.generation).ring}22`, padding: '16px 20px', boxShadow: `0 4px 24px ${pal(selPos.node.generation).shadow}`, direction: 'rtl', borderTop: `4px solid ${pal(selPos.node.generation).ring}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginBottom: 4, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>צומת נבחר</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.01em' }}>{selPos.node.name}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ background: pal(selPos.node.generation).light, color: pal(selPos.node.generation).text, padding: '2px 10px', borderRadius: 20, fontWeight: 700 }}>דור {selPos.node.generation}</span>
                <span>{selPos.node.children.length} ילדים</span>
                <span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700,
                  background: (selPos.node.status ?? 'verified') === 'verified' ? '#DCFCE7' : (selPos.node.status === 'rejected' ? '#FEE2E2' : '#FEF3C7'),
                  color: (selPos.node.status ?? 'verified') === 'verified' ? '#166534' : (selPos.node.status === 'rejected' ? '#991B1B' : '#92400E') }}>
                  {(selPos.node.status ?? 'verified') === 'verified' ? '✓ מאומת' : (selPos.node.status === 'rejected' ? '✗ לא מאושר' : '⏳ ממתין')}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                ...(canEdit ? [{ label: 'עריכה', fn: () => { setFormName(selPos.node.name); setFormRelation(selPos.node.relation ?? null); setModal({ type: 'edit', node: selPos.node }) }, color: pal(selPos.node.generation).ring, bg: pal(selPos.node.generation).light }] : []),
                ...(canAdd ? [{ label: 'הוסף ילד', fn: () => { setFormName(''); setModal({ type: 'add', parentId: selPos.node.id, parentName: selPos.node.name }) }, color: '#059669', bg: '#ECFDF5' }] : []),
                ...(canEdit && (selPos.node.status ?? 'verified') !== 'verified' ? [{ label: '✓ אמת', fn: () => handleSetStatus(selPos.node, 'verified' as const), color: '#16A34A', bg: '#F0FDF4' }] : []),
                ...(canEdit && (selPos.node.status ?? 'verified') !== 'rejected' ? [{ label: '✗ דחה', fn: () => handleSetStatus(selPos.node, 'rejected' as const), color: '#DC2626', bg: '#FEF2F2' }] : []),
                ...(canDelete ? [{ label: 'מחיקה', fn: () => setModal({ type: 'delete', node: selPos.node }), color: '#64748B', bg: '#F1F5F9' }] : []),
              ].map(b => (
                <button key={b.label} onClick={b.fn} style={{ background: b.bg, color: b.color, border: `1.5px solid ${b.color}22`, borderRadius: 10, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'opacity .15s' }}>{b.label}</button>
              ))}
            </div>
          </div>
          {selPos.node.children.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 700, marginBottom: 7, letterSpacing: '0.05em' }}>ילדים:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {selPos.node.children.map(c => (
                  <button key={c.id} onClick={() => setSelected(c.id)} style={{ padding: '5px 14px', borderRadius: 20, border: 'none', background: pal(c.generation).bg, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', direction: 'rtl', boxShadow: `0 2px 8px ${pal(c.generation).shadow}`, transition: 'opacity .15s' }}>{c.name}</button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* modals */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {modal.node.parent_id && <RelationPicker value={formRelation} onChange={setFormRelation} />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              {canEdit && <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף שורש חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {modal.parentId && <RelationPicker value={formRelation} onChange={setFormRelation} />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              {canAdd && <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>האם למחוק את <strong style={{ color: '#0F172A' }}>{modal.node.name}</strong>?</p>
            {(modal.node.children?.length ?? 0) > 0 && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 11, padding: '11px 14px', fontSize: 12, color: '#92400E', lineHeight: 1.5 }}>
                שים לב: {modal.node.children.length} ילדים יאבדו את הקישור להורה זה.
              </div>
            )}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              {canDelete && <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}

      {/* ── אישור דחייה ──
          ⚠️ דחייה אינה פעולה מקומית: היא מפילה במפל את כל הצאצאים בעץ, ודוחה
          גם את המשפחות המקושרות בכרטסת. את ההיקף הזה חייבים לראות *לפני*
          הלחיצה, ולא לגלות אותו אחריה. */}
      {rejectNode && (() => {
        const kids = descendantsOfNode(rejectNode)
        const affected = [rejectNode.id, ...kids].reduce((sum, id) => sum + (linked[id]?.length ?? 0), 0)
        return (
          <Modal title="דחיית דור" onClose={() => setRejectNode(null)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
                לסמן את <strong style={{ color: '#0F172A' }}>{rejectNode.name}</strong> כ<strong style={{ color: '#DC2626' }}>נדחה</strong>?
              </p>
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 11, padding: '11px 14px', fontSize: 12.5, color: '#991B1B', lineHeight: 1.7 }}>
                {kids.length > 0 && <>· {kids.length} דורות שמתחתיו יידחו גם הם<br /></>}
                {affected > 0 && <>· {affected} כרטסות משפחה מקושרות יעברו לסטטוס &quot;נדחה&quot;<br /></>}
                · הדור לא יוצג יותר לנרשמים בבורר סדר הדורות
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <MBtn label="דחה" color="#DC2626" onClick={() => { const n = rejectNode; setRejectNode(null); handleSetStatus(n, 'rejected') }} />
                <MBtn label="ביטול" color="#94A3B8" onClick={() => setRejectNode(null)} />
              </div>
            </div>
          </Modal>
        )
      })()}
    </>
  )
}

// ─── Table view ───

function TableView({ nodes, onRefresh, onAdd, onEdit, onDelete, statusFilter, generationFilter, mergeMode, mergeSel, dupIds, onToggleMerge, dupFilter, onMergeGroup }: {
  nodes: LineageNode[]
  onRefresh: () => void
  onAdd: (parentId: string | null, parentName: string) => void
  onEdit: (node: LineageNode) => void
  onDelete: (node: LineageNode) => void
  statusFilter: StatusFilter
  generationFilter: number | null
  mergeMode: boolean
  mergeSel: Set<string>
  dupIds: Set<string>
  onToggleMerge: (id: string) => void
  dupFilter: boolean
  onMergeGroup: (id: string) => void
}) {
  const canAdd = useCan('lineage', 'add')
  const canEdit = useCan('lineage', 'edit')
  const canDelete = useCan('lineage', 'delete')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const roots = useMemo(() => buildTree(nodes), [nodes])
  const childCount = useMemo(() => {
    const map = new Map<string, number>()
    nodes.forEach(n => { if (n.parent_id) map.set(n.parent_id, (map.get(n.parent_id) ?? 0) + 1) })
    return map
  }, [nodes])

  async function handleToggleStatus(node: LineageNode) {
    const newStatus = nextStatus(node.status)
    await fetch('/api/admin/lineage', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: node.id, status: newStatus }),
    })
    onRefresh()
  }

  function toggle(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function renderRows(node: TreeNode, depth: number): React.ReactNode {
    const nodeStatus = node.status ?? 'verified'
    const isDup = dupIds.has(node.id)
    const isDimmed = (statusFilter !== null && nodeStatus !== statusFilter)
      || (generationFilter !== null && node.generation !== generationFilter)
      || (dupFilter && !isDup)
    const p = pal(node.generation)
    const hasChildren = node.children.length > 0
    const isExpanded = expanded.has(node.id)
    return (
      <div key={node.id}>
        <div
          style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', borderBottom: '1px solid #F1F5F9', direction: 'rtl', gap: 8, background: '#fff', transition: 'background .12s, opacity .2s', minWidth: 0, opacity: isDimmed ? 0.25 : 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = '#FAFAFE')}
          onMouseLeave={e => (e.currentTarget.style.background = '#fff')}>
          {mergeMode && (
            <input type="checkbox" checked={mergeSel.has(node.id)} onChange={() => onToggleMerge(node.id)}
              style={{ width: 16, height: 16, accentColor: '#9333EA', cursor: 'pointer', flexShrink: 0 }} />
          )}
          <div style={{ width: depth * 22, flexShrink: 0 }} />
          <button onClick={() => toggle(node.id)} style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: hasChildren ? p.light : 'none', border: 'none', cursor: hasChildren ? 'pointer' : 'default', color: p.ring, flexShrink: 0, borderRadius: 6 }}>
            {hasChildren ? (isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13 }} />}
          </button>
          {/* status dot */}
          <button
            onClick={() => { if (canEdit) handleToggleStatus(node) }}
            title={nodeStatus === 'verified' ? 'מאומת → ממתין' : nodeStatus === 'pending' ? 'ממתין → לא מאושר' : 'לא מאושר → אמת'}
            style={{ width: 14, height: 14, borderRadius: '50%', background: statusColor(nodeStatus), border: 'none', cursor: canEdit ? 'pointer' : 'default', flexShrink: 0,
              boxShadow: nodeStatus === 'verified' ? '0 0 0 3px #DCFCE7' : nodeStatus === 'rejected' ? '0 0 0 3px #FEE2E2' : '0 0 0 3px #FEF3C7' }}
          />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
            {node.name}
            {dupIds.has(node.id) && <span style={{ marginRight: 6, background: '#F3E8FF', color: '#7C2D92', fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 20, border: '1px solid #E9D5FF' }}>כפול</span>}
          </span>
          <div style={{ padding: '3px 10px', borderRadius: 20, background: p.light, color: p.text, fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>דור {node.generation}</div>
          <div style={{ minWidth: 56, textAlign: 'center', fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>
            {childCount.get(node.id) ? `${childCount.get(node.id)}` : '—'}
          </div>
          <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
            {isDup && !mergeMode && (
              <button onClick={() => onMergeGroup(node.id)} title="מזג כפילים (אותו גזע)" style={{ width: 28, height: 28, borderRadius: 7, background: '#F3E8FF', border: '1.5px solid #E9D5FF', color: '#9333EA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>⚯</button>
            )}
            {canAdd && <button onClick={() => onAdd(node.id, node.name)} title="הוסף ילד" style={{ width: 28, height: 28, borderRadius: 7, background: '#ECFDF5', border: '1.5px solid #BBF7D0', color: '#059669', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>}
            {canEdit && <button onClick={() => onEdit(node)} title="עריכה" style={{ width: 28, height: 28, borderRadius: 7, background: p.light, border: `1.5px solid ${p.ring}33`, color: p.ring, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Pencil size={11} /></button>}
            {canDelete && <button onClick={() => onDelete(node)} title="מחיקה" style={{ width: 28, height: 28, borderRadius: 7, background: '#FEF2F2', border: '1.5px solid #FECACA', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trash2 size={11} /></button>}
          </div>
        </div>
        {isExpanded && node.children.map(c => renderRows(c, depth + 1))}
      </div>
    )
  }

  return (
    <div style={{ borderRadius: 18, border: '1.5px solid #E8E0F5', overflow: 'hidden', background: '#fff', boxShadow: '0 4px 24px rgba(109,40,217,0.06)', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 18px', background: 'linear-gradient(135deg,#F8F6FF,#F0EDFF)', borderBottom: '1px solid #E8E0F5', direction: 'rtl', gap: 8 }}>
        <div style={{ width: 22, flexShrink: 0 }} />
        <div style={{ width: 14, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: '#7C3AED', letterSpacing: '0.04em', minWidth: 0 }}>שם</span>
        <span style={{ width: 80, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#7C3AED', flexShrink: 0 }}>דור</span>
        <span style={{ minWidth: 56, textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#7C3AED', flexShrink: 0 }}>ילדים</span>
        <span style={{ width: 96, flexShrink: 0 }} />
      </div>
      {roots.length === 0
        ? <div style={{ padding: 48, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>אין נתונים</div>
        : roots.map(r => renderRows(r, 0))
      }
    </div>
  )
}

// ─── Main page ───

type View = 'tree' | 'table'

export default function LineagePage() {
  const canAdd = useCan('lineage', 'add')
  const canEdit = useCan('lineage', 'edit')
  const canDelete = useCan('lineage', 'delete')
  const [nodes, setNodes] = useState<LineageNode[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('tree')
  const [modal, setModal] = useState<ModalState>(null)
  const [formName, setFormName] = useState('')
  const [formRelation, setFormRelation] = useState<'son' | 'son_in_law' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState('')
  const [formParentId, setFormParentId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null)
  const [generationFilter, setGenerationFilter] = useState<number | null>(null)
  // ── מצב מיזוג כפולים ──
  const [mergeMode, setMergeMode] = useState(false)
  const [mergeSel, setMergeSel] = useState<Set<string>>(new Set())
  const [keepId, setKeepId] = useState<string | null>(null)
  const [mergeConfirm, setMergeConfirm] = useState(false)
  const [merging, setMerging] = useState(false)
  // תצוגה מקדימה של המיזוג הידני — אותו מודאל של מרכז המיזוגים (חוויה אחת).
  const [manualPlan, setManualPlan] = useState<MergePlanResp | null>(null)
  const [manualNames, setManualNames] = useState<Record<string, string>>({})
  const [manualPlanning, setManualPlanning] = useState(false)
  // ⚠️ מיזוג אחורנית גם כשהניסוח שונה — דלוק כברירת מחדל. השרשרת שהתפצלה
  // נרשמה בכל ענף בניסוח אחר ("רבי שמואל בנימין והרבנית חיה ליבא שישא" מול
  // "שמואל בנימין שישא"), ובלי זה מיזוג הבן השאיר את האב כפול — וכל מיזוג
  // הותיר זנב ידני לתקן.
  const [mergeUpApprox, setMergeUpApprox] = useState(true)
  // השם הסופי בבר המיזוג המהיר. ריק = השתמש בברירת המחדל (fullestSelName).
  const [quickName, setQuickName] = useState('')
  // חיווי צדי קבוע לתוצאת המיזוג האחרון (הצלחה או כשל). n = מונה שמאלץ
  // הצגה מחדש גם כשהטקסט זהה, כדי שמיזוגים רצופים ייראו כל אחד בנפרד.
  const [mergeFlash, setMergeFlash] = useState<{ ok: boolean; text: string; n: number } | null>(null)
  const flashSeq = useRef(0)
  // מונה רענונים — מבטיח שרק תשובת הרענון האחרון נכתבת (ראו softRefresh)
  const refreshSeq = useRef(0)
  // הצומת שפאנל ניקוי הכפילויות פתוח עליו
  const [cleanParentId, setCleanParentId] = useState<string | null>(null)
  // הצומת שנשאר במיזוג שרץ כרגע מתוך פאנל הניקוי — לחיווי טעינה על הכפתור
  const [busyMergeKeep, setBusyMergeKeep] = useState<string | null>(null)

  // ─── בדיקת אשכול על העץ לפני מיזוג ───────────────────────────────────────
  // ⚠️ הדרישה: לראות *על העץ הוויזואלי* מה עומד להתמזג, ולהוציא ידנית צמתים
  // שאינם שייכים — לא רק רשימת טקסט בפאנל צדדי. האשכולות מזוהים אוטומטית
  // ולעולם אינם מושלמים (שני אנשים באותו שם), ולכן ההכרעה חייבת להיות
  // ויזואלית: הכרטיסים נצבעים בעץ, לחיצה מוציאה מהקבוצה, ורק אז ממזגים.
  const [review, setReview] = useState<{
    ids: string[]            // הצמתים שנשארו בקבוצה (הניתנים למיזוג)
    excluded: Set<string>    // מה שהמשתמש הוציא ידנית
    keepId: string
    finalName: string
    gen: number
    index: number            // מיקום ברשימת האשכולות של הדור
    total: number
  } | null>(null)
  // תוצאת המיזוג האחרון — נשארת על המסך עם כפתור מעבר לקבוצה הבאה
  const [reviewDone, setReviewDone] = useState<{ text: string; gen: number; index: number; total: number } | null>(null)
  // סינון "הצג רק כפולים" (לחיצה על תג השמות הכפולים)
  const [dupFilter, setDupFilter] = useState(false)
  // לאחר מיזוג — הצעה לאשר את הייחוס
  const [approvePrompt, setApprovePrompt] = useState<{ keepId: string; keepName: string } | null>(null)
  const [approveDesc, setApproveDesc] = useState(true)
  const [approving, setApproving] = useState(false)
  const toast = useToast()

  function close() { setModal(null); setSaveErr(''); setFormParentId(null); setFormRelation(null) }

  // קבוצות שמות כפולים — אותו שם מנורמל, תחת *אותו אב* (אותו parent_id) ובאותו דור.
  // כך בני דודים (אבות שונים) עם אותו שם אינם נחשבים כפילות; רק אותו אדם שנרשם פעמיים
  // תחת אותו אב (למשל ע"י שני בניו בנפרד) נחשב כפילות למיזוג.
  const dupKey = useCallback(
    (parentId: string | null, generation: number, name: string) =>
      `${parentId ?? 'root'}|${generation}|${name.trim().replace(/\s+/g, ' ')}`,
    [],
  )
  const { dupIds, dupGroups } = useMemo(() => {
    const byKey = new Map<string, string[]>()
    for (const n of nodes) {
      const name = n.name.trim().replace(/\s+/g, ' ')
      if (!name) continue
      const key = dupKey(n.parent_id, n.generation, name)
      const arr = byKey.get(key) ?? []
      arr.push(n.id)
      byKey.set(key, arr)
    }
    const ids = new Set<string>()
    const groups = new Map<string, string[]>()
    for (const [key, arr] of byKey) if (arr.length > 1) { arr.forEach(id => ids.add(id)); groups.set(key, arr) }
    return { dupIds: ids, dupGroups: groups }
  }, [nodes, dupKey])

  // מזהה → רשימת הצמתים בקבוצת הכפילות שלו (אותו אב + אותו דור + אותו שם)
  const dupGroupOf = useCallback((id: string): string[] => {
    const n = nodes.find(x => x.id === id)
    if (!n) return []
    return dupGroups.get(dupKey(n.parent_id, n.generation, n.name)) ?? []
  }, [nodes, dupGroups, dupKey])

  const dupNameCount = dupGroups.size

  // ── מצב "אילן צאצאים" — עבודה על ענף אחד בלבד ──
  // ⚠️ העץ המלא רחב מכדי לעבוד עליו: כדי לסדר משפחה אחת צריך לגלול הלוך ושוב
  // ולאבד את ההקשר בכל פעם. כאן בוחרים צומת ורואים רק אותו ואת צאצאיו —
  // התמונה כולה מול העיניים, ואפשר לתקן אחד אחרי השני.
  const [focusId, setFocusId] = useState<string | null>(null)
  // ── מסך מלא לענף אחד ──
  // 🔴 העץ נחנק בין הכלים. סרגל הכפתורים, הבאנרים והמקרא גוזלים כ-260 פיקסלים
  // מגובה המסך, והעטיפה של אזור הניהול מגבילה לרוחב 1536 וממרכזת. כשעובדים על
  // ענף עמוק זה בדיוק מה שחסר: כל דור שנחתך למטה מחייב גלילה, ובגלילה מאבדים
  // את ההקשר של מי מתחת למי.
  //
  // כאן הענף נפרש על כל השטח שבין התפריט לכותרת. התפריט והכותרת נשארים
  // בכוונה — צריך להישאר אפשר לנווט משם, וזה גם מה שהמנהל ביקש.
  const [fullScreen, setFullScreen] = useState(false)
  // צומת ששיתופו נערך כרגע (חלונית ניהול השיתוף)
  const [shareNode, setShareNode] = useState<{ id: string; name: string } | null>(null)
  // מרכז השליטה המרכזי בכל הרשאות השיתוף (טבלת כל הקישורים)
  const [showPermissions, setShowPermissions] = useState(false)
  // עוגן גלילה — { id, n }. ה-n הוא מונה: בלעדיו אותו מזהה פעמיים ברצף לא
  // היה מפעיל את המרכוז מחדש (המיזוג השני על אותו צומת לא היה מזיז את המבט).
  const [anchor, setAnchor] = useState<{ id: string; n: number } | null>(null)
  // בחירת סגנון ההדפסה — רשימה או תרשים עץ
  const [printPick, setPrintPick] = useState(false)
  const [showDups, setShowDups] = useState(false)
  const [showHealth, setShowHealth] = useState(false)
  const [showSafeMerge, setShowSafeMerge] = useState(false)
  const [showMergeCenter, setShowMergeCenter] = useState(false)
  const [showUnlinked, setShowUnlinked] = useState(false)
  // צמתי רפאים — אלה שנוצרו משדה הילדים של כרטסת ולא מאדם שנרשם
  const [showGhosts, setShowGhosts] = useState(false)
  // דור אחרון כפול — נרשם שנתלה כילד של עצמו
  const [showSelfDups, setShowSelfDups] = useState(false)
  // צומת → המשפחות המקושרות אליו, לקפיצה ישירה מהעץ לכרטסת
  const [linked, setLinked] = useState<Record<string, { id: string; name: string }[]>>({})
  // ⚠️ תוצאות הסריקה מסומנות על העץ עצמו. רשימה בפאנל אומרת *כמה* יש, אבל לא
  // *איפה* — ובעץ של 500 צמתים בלי הסימון על המפה אי אפשר להגיע אליהן.
  const [scanIds, setScanIds] = useState<Set<string>>(new Set())
  // הקבוצה שנבחרה מהפאנל — מודגשת חזק, והמבט נגלל אליה
  const [locateIds, setLocateIds] = useState<Set<string>>(new Set())

  const handleCandidates = useCallback((ids: string[]) => setScanIds(new Set(ids)), [])
  const handleLocate = useCallback((ids: string[]) => {
    setLocateIds(new Set(ids))
    setStatusFilter(null); setGenerationFilter(null); setDupFilter(false)
    if (ids[0]) setAnchor(a => ({ id: ids[0], n: (a?.n ?? 0) + 1 }))
  }, [])

  function exitMerge() { setMergeMode(false); setMergeSel(new Set()); setKeepId(null); setMergeConfirm(false); setQuickName('') }
  function enterMerge() { setStatusFilter(null); setGenerationFilter(null); setDupFilter(false); setMergeMode(true); setMergeSel(new Set()); setKeepId(null) }

  // התחלת מיזוג ממוקד מצומת כפול — מסמן אוטומטית את כל הקבוצה (אותו גזע + שם), הצומת שנלחץ נשאר
  const startGroupMerge = useCallback((id: string) => {
    const group = dupGroupOf(id)
    if (group.length < 2) return
    setStatusFilter(null); setGenerationFilter(null); setDupFilter(false)
    setMergeMode(true); setMergeSel(new Set(group)); setKeepId(id)
  }, [dupGroupOf])

  function toggleDupFilter() {
    setStatusFilter(null); setGenerationFilter(null)
    if (mergeMode) exitMerge()
    setDupFilter(f => !f)
  }
  const toggleMerge = useCallback((id: string) => {
    setMergeSel(prev => {
      const s = new Set(prev)
      if (s.has(id)) { s.delete(id); setKeepId(k => (k === id ? null : k)) }
      else { s.add(id); setKeepId(k => k ?? id) }
      return s
    })
  }, [])

  const selectedNodes = useMemo(() => nodes.filter(n => mergeSel.has(n.id)), [nodes, mergeSel])
  // ברירת מחדל ל-keep: הצומת המאומת בבחירה, אחרת הראשון
  const effectiveKeepId = keepId && mergeSel.has(keepId)
    ? keepId
    : (selectedNodes.find(n => (n.status ?? 'verified') === 'verified')?.id ?? selectedNodes[0]?.id ?? null)

  // השם המנוסח בעושר הרב ביותר מבין הנבחרים — ברירת המחדל לשם הסופי.
  // ⚠️ הכי הרבה מילים ואז הכי ארוך, ולא "השם של הצומת שנשאר": הצומת שנשאר
  // נבחר לפי אימות/ילדים, ולעיתים קרובות דווקא הוא נושא את הגרסה המקוצרת
  // ("רבי ישראל שטערן" מול "רבי ישראל וביילא שטערן").
  const fullestSelName = useMemo(() => {
    const names = selectedNodes.map(n => n.name).filter(Boolean)
    if (!names.length) return ''
    return names.slice().sort((a, b) =>
      b.trim().split(/\s+/).length - a.trim().split(/\s+/).length || b.length - a.length)[0]
  }, [selectedNodes])

  // פתיחת תצוגה מקדימה של המיזוג הידני — קוראת ל-plan ומחשבת ברירת-מחדל לשם
  // לכל דור (הניסוח העשיר ביותר), בדיוק כמו במרכז המיזוגים. אחריה המשתמש
  // רואה מה בדיוק יקרה *לפני* הביצוע ובוחר שמות.
  async function openManualPlan(approx = mergeUpApprox) {
    const ids = [...mergeSel]
    if (!effectiveKeepId || ids.length < 2) return
    const mergeIds = ids.filter(id => id !== effectiveKeepId)
    setManualPlanning(true)
    try {
      const r = await fetch('/api/admin/lineage/merge/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: effectiveKeepId, mergeIds, cascadeUpApprox: approx }),
      })
      const d: MergePlanResp = await r.json()
      if (!r.ok) { toast.error((d as unknown as { error?: string }).error || 'שגיאה בחישוב המיזוג'); setManualPlanning(false); return }
      const names: Record<string, string> = {}
      for (const s of d.steps) {
        names[s.keepId] = [...s.names].sort((a, b) => {
          const aw = a.trim().split(/\s+/).length, bw = b.trim().split(/\s+/).length
          return aw !== bw ? bw - aw : b.trim().length - a.trim().length
        })[0]
      }
      setManualNames(names)
      setManualPlan(d)
      setMergeConfirm(false)
    } catch { toast.error('שגיאת רשת') }
    setManualPlanning(false)
  }

  // ── ליבת המיזוג — אופטימית ומיידית ──
  // מקבלת keepId + mergeIds ישירות (לא דרך state), כדי שגם מיזוג-hover מיידי
  // וגם המסלול הידני (mergeSel) ישתמשו באותו נתיב "לייב מיד": הצמתים נעלמים
  // מהתצוגה כאן ועכשיו, השרת רץ ברקע, softRefresh מיישר את התמונה בלי await.
  async function mergeByIds(keepId: string, mergeIds: string[], names?: Record<string, string>, noCascade = false) {
    if (!keepId || !mergeIds.length) return
    setMerging(true)
    // ⚡ עדכון אופטימי מיידי — לפני קריאת הרשת: הצמתים הממוזגים הישירים נמחקים
    // מהתצוגה וילדיהם עוברים ל-keepId. כך הלחיצה נראית "מיד ממוזגת" בלי המתנה.
    const keepName = nodes.find(n => n.id === keepId)?.name ?? ''
    setNodes(prev => prev
      .filter(n => !mergeIds.includes(n.id))
      .map(n => mergeIds.includes(n.parent_id ?? '') ? { ...n, parent_id: keepId } : n))
    setManualPlan(null)
    exitMerge()
    // ⚠️ אין יותר setAnchor אוטומטי. הצומת שנשאר כבר נמצא מול העיניים —
    // הוא זה שנלחץ. הזזת המבט אליו רק הקפיצה את התצוגה ממקום העבודה.
    try {
      const res = await fetch('/api/admin/lineage/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepId, mergeIds, names,
          cascadeUpApprox: noCascade ? false : mergeUpApprox,
          ...(noCascade ? { cascadeUp: false } : {}),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        // ⚠️ גם באנר קבוע ולא רק toast: toast נעלם אחרי כמה שניות, ובעבודה
        // רצופה מהירה כשל נבלע בשקט והמשתמש חשב ש"המיזוג פשוט לא עובד".
        setMergeFlash({ ok: false, text: d.error || 'שגיאה במיזוג', n: flashSeq.current++ })
        toast.error(d.error || 'שגיאה במיזוג')
        // המיזוג נכשל בשרת — מחזירים את התמונה האמיתית (מבטלים את האופטימי)
        void softRefresh()
        setMerging(false); return
      }
      setMergeFlash({
        ok: true, n: flashSeq.current++,
        text: `${keepName} — מוזגו ${d.mergedCount} צמתים · ${d.reassignedChildren} ילדים · ${d.reassignedBeneficiaries} נרשמים`,
      })
      // המפל המלא (דורות שמעל/מתחת) עשוי למזג עוד צמתים — softRefresh ברקע
      // (בלי await) מיישר את התמונה המלאה תוך שנייה, בלי לחסום את המשתמש.
      void softRefresh()
      // ⚠️ אין כאן יותר חלונית "לאשר את הייחוס?". היא נפתחה אחרי *כל* מיזוג
      // ועצרה את העבודה: המיזוג עצמו כבר בוצע, והאישור הוא החלטה נפרדת
      // שנעשית בנפרד (כפתורי הסטטוס בפופאפ של הצומת, או אישור מרוכז).
      // מיזוג רצוף של עשרות כפילויות חייב להיות לחיצה אחת לכל אחד.
    } catch {
      setMergeFlash({ ok: false, text: 'שגיאת רשת — המיזוג לא נשמר', n: flashSeq.current++ })
      toast.error('שגיאת רשת')
      void softRefresh()
    }
    setMerging(false)
  }

  async function handleMerge(names?: Record<string, string>) {
    const ids = [...mergeSel]
    if (!effectiveKeepId || ids.length < 2) return
    await mergeByIds(effectiveKeepId, ids.filter(id => id !== effectiveKeepId), names)
  }

  // ── מיזוג מרוכז של כמה קבוצות ברצף ──
  // ⚠️ סדרתי ולא במקביל: כל מיזוג משנה את העץ (מעביר ילדים, מוחק צמתים),
  // ושתי בקשות שרצות יחד על אזורים חופפים דורסות זו את זו. הרענון נעשה
  // *פעם אחת* בסוף — לא אחרי כל קבוצה — אחרת התצוגה מהבהבת עשרות פעמים
  // וכל רענון מחזיר תמונה חלקית באמצע הרצף.
  async function mergeSequential(groups: { keepId: string; mergeIds: string[]; finalName: string }[]) {
    if (!groups.length) return
    setMerging(true)
    let okCount = 0, nodeCount = 0
    const failures: string[] = []
    for (const g of groups) {
      try {
        const res = await fetch('/api/admin/lineage/merge', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            keepId: g.keepId, mergeIds: g.mergeIds,
            // ⚠️ בלי מפל כלפי מעלה במיזוג המוני: המפל ממזג גם אבות שלא
            // נבחרו, ובריצה על עשרות קבוצות הוא משנה את העץ מתחת לרגליים
            // של הקבוצות הבאות ברשימה.
            cascadeUpApprox: false, cascadeUp: false,
            names: { [g.keepId]: g.finalName },
          }),
        })
        const d = await res.json().catch(() => ({}))
        if (res.ok) { okCount++; nodeCount += d.mergedCount ?? g.mergeIds.length }
        else failures.push(d.error || 'שגיאה')
      } catch { failures.push('שגיאת רשת') }
    }
    await softRefresh()
    setMerging(false)
    setMergeFlash(failures.length
      ? { ok: false, n: flashSeq.current++, text: `מוזגו ${okCount} מתוך ${groups.length} קבוצות · ${failures.length} נכשלו: ${failures[0]}` }
      : { ok: true, n: flashSeq.current++, text: `מוזגו ${okCount} קבוצות · ${nodeCount} צמתים הוסרו` })
  }

  // ── מיזוג מהיר מ-hover — לחיצה אחת = מיזוג מיידי, בלי תצוגה מקדימה ──
  // ⚠️ בקשת המנהל: על צומת כפול/מועמד-למיזוג, לחיצה על הכפתור ממזגת מיד את כל
  // קבוצת הכפילות (אותו אב+דור+שם) לתוך הצומת שנלחץ, בלייב, בלי מסך ביניים.
  // בוחר שם אוטומטית לכל צומת (המפורט ביותר בקבוצה), כמו openManualPlan.
  const quickMergeGroup = useCallback((id: string) => {
    const group = dupGroupOf(id)
    // אין קבוצת כפילות מדויקת (למשל מועמד מסריקה מקורבת בלבד) — נופלים למצב
    // המיזוג הידני, שם אפשר לבחור ידנית את הצמתים הקרובים למיזוג.
    if (group.length < 2) { startGroupMerge(id); return }
    // שם הצומת שנשאר — המפורט ביותר בקבוצה (הכי הרבה מילים / הכי ארוך)
    const chosen = group
      .map(gid => nodes.find(n => n.id === gid)?.name ?? '')
      .filter(Boolean)
      .sort((a, b) => {
        const aw = a.trim().split(/\s+/).length, bw = b.trim().split(/\s+/).length
        return aw !== bw ? bw - aw : b.trim().length - a.trim().length
      })[0]
    const names = chosen ? { [id]: chosen } : undefined
    void mergeByIds(id, group.filter(g => g !== id), names)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupGroupOf, nodes, mergeUpApprox, startGroupMerge])

  // כל הצאצאים (המשורשרים) של צומת — לפי קשרי האב במצב הנוכחי
  const descendantsOf = useCallback((rootId: string): string[] => {
    const childrenBy = new Map<string, string[]>()
    nodes.forEach(n => { if (n.parent_id) { const a = childrenBy.get(n.parent_id) ?? []; a.push(n.id); childrenBy.set(n.parent_id, a) } })
    const out: string[] = []
    const stack = [...(childrenBy.get(rootId) ?? [])]
    while (stack.length) {
      const id = stack.pop()!
      out.push(id)
      for (const c of childrenBy.get(id) ?? []) stack.push(c)
    }
    return out
  }, [nodes])

  // הצומת שבמוקד + כל צאצאיו. buildTree מזהה שורש לפי "האב אינו ברשימה",
  // ולכן די בסינון — הצומת שבמוקד הופך לשורש התצוגה מעצמו.
  const focusNode = useMemo(() => nodes.find(n => n.id === focusId) ?? null, [nodes, focusId])
  // ⚠️ הנפילה-לאחור היא על focusNode ולא על focusId: צומת המוקד עלול להיעלם
  // (נמחק, או מוזג לתוך אחר וה-id שלו כבר לא קיים). סינון לפי id שנעלם היה
  // מחזיר רשימה ריקה — מסך לבן בלי הסבר, בדיוק אחרי מיזוג. כאן זה פשוט חוזר
  // לעץ המלא, והבאנר נעלם מעצמו כי גם הוא נגזר מ-focusNode.
  const visibleNodes = useMemo(() => {
    if (!focusNode) return nodes
    const keep = new Set([focusNode.id, ...descendantsOf(focusNode.id)])
    return nodes.filter(n => keep.has(n.id))
  }, [nodes, focusNode, descendantsOf])

  // פתיחת תצוגת ההדפסה של הענף שבמוקד — לפי המצב שנבחר (רשימה / עץ מעוצב)
  const printFocus = useCallback((mode: PrintMode) => {
    if (!focusId) return
    setPrintPick(false)
    const html = buildSubtreePrintHtml(nodes, focusId, mode)
    if (!html) { toast.error('לא נמצא הענף להדפסה'); return }
    const win = window.open('', '_blank')
    if (!win) { toast.error('הדפדפן חסם את חלון ההדפסה — יש לאשר חלונות קופצים לאתר'); return }
    win.document.write(html)
    win.document.close()
  }, [nodes, focusId, toast])

  async function handleApproveLineage(includeDescendants: boolean) {
    if (!approvePrompt) return
    const ids = [approvePrompt.keepId, ...(includeDescendants ? descendantsOf(approvePrompt.keepId) : [])]
    setApproving(true)
    try {
      // עדכון אופטימי
      setNodes(prev => prev.map(n => ids.includes(n.id) ? { ...n, status: 'verified' } : n))
      await Promise.all(ids.map(id =>
        fetch('/api/admin/lineage', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, status: 'verified' }),
        })
      ))
      toast.success(includeDescendants ? `אושר הייחוס + ${ids.length - 1} משורשרים` : 'הייחוס אושר')
      await softRefresh()
    } catch { toast.error('שגיאה באישור הייחוס') }
    setApproving(false)
    setApprovePrompt(null)
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      // ⚠️ גם כאן fresh=1. הטעינה הראשונה רצה גם אחרי רענון דף/חזרה למסך,
      // ובלי הדגל היא קיבלה את ה-payload המוטמן מלפני המיזוג והחזירה את
      // הצמתים שנמחקו — אותו תסמין בדיוק של "המיזוג קפץ בחזרה", רק במסלול
      // אחר מ-softRefresh (שכבר תוקן).
      const r = await fetch('/api/admin/lineage?fresh=1', { cache: 'no-store' })
      const d = await r.json()
      const raw: LineageNode[] = d.nodes ?? []
      const minGen = raw.length ? Math.min(...raw.map(n => n.generation)) : 0
      // החתם סופר (הדור הנמוך ביותר) תמיד דור 1, וממשיך משם
      setNodes(raw.map(n => ({ ...n, generation: n.generation - minGen + 1 })))
      setLinked(d.linked ?? {})
    } catch {}
    setLoading(false)
  }, [])

  // ⚠️ fresh=1 — עוקף את מטמון ה-payload בשרת. softRefresh רץ מיד אחרי
  // כתיבה (מיזוג/מחיקה), ובלי הדגל הוא קיבל את העותק המיושן שה-SWR מגיש
  // ומחזיר את הצמתים שנמחקו למסך. זה השורש ל"המיזוג קופץ בחזרה".
  const softRefresh = useCallback(async () => {
    // ⚠️ מונה גרסאות: מיזוגים רצופים ומהירים משגרים כמה רענונים במקביל,
    // ותשובה איטית של רענון *ישן* שמגיעה אחרי חדש הייתה דורסת את התמונה
    // המעודכנת ומחזירה צמתים שכבר מוזגו. רק התשובה של הרענון האחרון נכתבת.
    const myTicket = ++refreshSeq.current
    try {
      const r = await fetch('/api/admin/lineage?fresh=1', { cache: 'no-store' })
      const d = await r.json()
      if (myTicket !== refreshSeq.current) return
      const raw: LineageNode[] = d.nodes ?? []
      const minGen = raw.length ? Math.min(...raw.map(n => n.generation)) : 0
      setNodes(raw.map(n => ({ ...n, generation: n.generation - minGen + 1 })))
      setLinked(d.linked ?? {})
    } catch {}
  }, [])

  // טעינה ראשונית — נדחית בטיק אחד כדי לא לקרוא ל-setState סינכרונית בתוך
  // אפקט (אותו דפוס שנעשה בו שימוש בשאר המסכים במערכת).
  useEffect(() => { const t = setTimeout(() => { void loadAll() }, 0); return () => clearTimeout(t) }, [loadAll])

  // ── קישור ישיר לענף: /admin/lineage?focus=<nodeId> ──
  // ⚠️ נכנסים לכאן מכרטסת הצאצא ("פתיחה במסך הייחוס"), ובעץ של מאות צמתים
  // בלי זה היה צריך לחפש את הצומת ידנית. נקרא פעם אחת, אחרי שהצמתים נטענו,
  // וישירות מ-window.location — כדי לא לחייב את העמוד ב-Suspense של useSearchParams.
  //
  // 🔴 הפרמטרים נקראים פעם אחת באתחול ה-state, ולא מ-window בתוך האפקט.
  //
  // האפקט שמסנכרן את הכתובת רץ מיד בטעינה, כש-focusId עדיין ריק — והוא מחק את
  // focus ו-full מהכתובת. הקורא כאן ממתין לטעינת הצמתים, ועד שהגיע תורו
  // הפרמטרים כבר לא היו שם: הלשונית נפתחה על העץ המלא כאילו לא ביקשו כלום.
  const [deepLink] = useState(() => {
    if (typeof window === 'undefined') return { focus: null as string | null, full: false }
    const qs = new URLSearchParams(window.location.search)
    return { focus: qs.get('focus'), full: qs.get('full') === '1' }
  })
  const didFocusParam = useRef(false)
  useEffect(() => {
    if (didFocusParam.current || !nodes.length) return
    didFocusParam.current = true
    const target = deepLink.focus
    if (!target || !nodes.some(n => n.id === target)) return
    // full=1 — נפתח מ"פתח ענף בלשונית חדשה". מוחל *יחד* עם המיקוד ולא בנפרד,
    // כדי שהמסך לא ירצד בין שני מצבים.
    const wantFull = deepLink.full
    const t = setTimeout(() => {
      setFocusId(target)
      if (wantFull) setFullScreen(true)
      setAnchor(a => ({ id: target, n: (a?.n ?? 0) + 1 }))
    }, 0)
    return () => clearTimeout(t)
  }, [nodes, deepLink])

  // ⚠️ הכתובת מתעדכנת בכל החלפת ענף — replaceState ולא push, כדי שכפתור
  // "אחורה" של הדפדפן לא יהפוך לרשימת כל הענפים שביקרו בהם. רענון נשאר
  // באותו ענף, ואפשר לשמור סימנייה או לשלוח קישור לענף מסוים.
  //
  // ⚠️ לא נוגע בכתובת לפני שהצמתים נטענו והקישור הישיר הוחל. כתיבה מוקדמת
  // מוחקת את הפרמטרים שהגיעו בכתובת — וזה בדיוק מה שקרה.
  useEffect(() => {
    if (typeof window === 'undefined' || !nodes.length || !didFocusParam.current) return
    const qs = new URLSearchParams(window.location.search)
    if (focusId) qs.set('focus', focusId); else qs.delete('focus')
    if (fullScreen) qs.set('full', '1'); else qs.delete('full')
    const next = qs.toString()
    const url = `${window.location.pathname}${next ? `?${next}` : ''}`
    if (url !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', url)
    }
  }, [focusId, fullScreen, nodes.length])

  // ⚠️ יציאה ממסך מלא ב-Esc: המסך מכסה את רוב החלון, וכפתור יציאה יחיד בפינה
  // הוא מלכודת כשגוללים רחוק לתוך הענף.
  useEffect(() => {
    if (!fullScreen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullScreen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fullScreen])

  // שרשרת האבות של הענף שבמוקד — לשביל הניווט במסך המלא.
  // בלעדיו, אחרי שלוש צלילות אין שום דרך לדעת איפה אתה בעץ.
  const focusTrail = useMemo(() => {
    if (!focusId) return [] as LineageNode[]
    const byId = new Map(nodes.map(n => [n.id, n]))
    const out: LineageNode[] = []
    const seen = new Set<string>()
    let cur = byId.get(focusId)
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id)
      out.unshift(cur)
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined
    }
    return out
  }, [nodes, focusId])

  const maxGen = nodes.length ? Math.max(...nodes.map(n => n.generation)) : 0
  const genCounts = useMemo(() => {
    const counts: Record<number, number> = {}
    nodes.forEach(n => { counts[n.generation] = (counts[n.generation] ?? 0) + 1 })
    return counts
  }, [nodes])

  const verifiedCount = useMemo(() => nodes.filter(n => (n.status ?? 'verified') === 'verified').length, [nodes])
  const pendingCount = useMemo(() => nodes.filter(n => n.status === 'pending').length, [nodes])
  const rejectedCount = useMemo(() => nodes.filter(n => n.status === 'rejected').length, [nodes])

  async function handleSave() {
    if (!formName.trim()) { setSaveErr('נא להזין שם'); return }
    const addParentId = modal?.type === 'add' ? (modal.parentId ?? formParentId) : null
    // בהוספת דור חדש (כשכבר יש עץ) — אבא ובן/חתן חובה
    if (modal?.type === 'add' && nodes.length > 0) {
      if (!addParentId) { setSaveErr('יש לבחור את האב/האם (הדור הקודם)'); return }
      if (!formRelation) { setSaveErr('יש לבחור האם הוא בן או חתן'); return }
    }
    setSaving(true); setSaveErr('')
    try {
      if (modal?.type === 'edit') {
        await fetch('/api/admin/lineage', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: modal.node.id, name: formName, relation: formRelation }) })
      } else if (modal?.type === 'add') {
        await fetch('/api/admin/lineage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: formName, parent_id: addParentId, relation: formRelation }) })
      }
      // softRefresh — כדי לא לפרק את העץ ולאבד מיקום (ראו הערה ב-handleMerge)
      await softRefresh(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  async function handleDelete() {
    if (modal?.type !== 'delete') return
    setSaving(true)
    try {
      await fetch(`/api/admin/lineage?id=${modal.node.id}`, { method: 'DELETE' })
      await softRefresh(); close()
    } catch { setSaveErr('שגיאה') }
    setSaving(false)
  }

  // ── מסך מלא לענף אחד ──
  // ⚠️ שכבה קבועה ולא שינוי של פריסת אזור הניהול: העטיפה מוסיפה ריפוד, מגבילה
  // ל-1536 וממרכזת, ואין בה שום דרך לוותר על זה לעמוד יחיד. שכבה שמתחילה מתחת
  // לכותרת (60px) ולצד התפריט (224px בדסקטופ) משיגה את אותה תוצאה בלי לגעת
  // בפריסה של אף מסך אחר — ובלי להסתיר את התפריט והכותרת, שהמנהל ביקש להשאיר.
  if (fullScreen && focusNode) {
    return (
      <div className="fixed inset-0 top-[60px] lg:right-56 z-40 flex flex-col bg-white" dir="rtl">
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

        <div className="flex items-center gap-2 flex-wrap border-b border-violet-200 bg-violet-50/70 px-4 py-2">
          <span className="text-base">🌳</span>
          {/* שביל הניווט — בלי זה, אחרי שלוש צלילות אין דרך לדעת איפה אתה
              בעץ, וצריך לצאת ולהתחיל מחדש. כל דור לחיץ וקופץ אליו. */}
          <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1 text-[11px]">
            {focusTrail.map((n, i) => (
              <span key={n.id} className="flex items-center gap-1">
                {i > 0 && <ChevronLeft size={11} className="text-violet-300 shrink-0" />}
                {i === focusTrail.length - 1 ? (
                  <strong className="text-violet-900 text-[13px]">{n.name}</strong>
                ) : (
                  <button onClick={() => { setFocusId(n.id); setAnchor(a => ({ id: n.id, n: (a?.n ?? 0) + 1 })) }}
                    title={`חזרה לענף של ${n.name}`}
                    className="max-w-[160px] truncate rounded px-1 text-violet-600 hover:bg-violet-100 hover:text-violet-900">
                    {n.name}
                  </button>
                )}
              </span>
            ))}
          </div>
          <span className="text-[11px] font-bold text-violet-700 whitespace-nowrap">
            דור {focusNode.generation} · {(visibleNodes.length - 1).toLocaleString('he-IL')} צאצאים
          </span>
          <button onClick={() => setPrintPick(true)}
            className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-bold text-violet-800 hover:bg-violet-50">
            <Printer size={13} /> הדפסה
          </button>
          {canEdit && (
            <button onClick={() => setShareNode({ id: focusNode.id, name: focusNode.name })}
              className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50">
              <Link2 size={13} /> שתף ענף
            </button>
          )}
          <button onClick={() => setFullScreen(false)} title="יציאה ממסך מלא (Esc)"
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">
            <X size={13} /> צא ממסך מלא
          </button>
        </div>

        <p className="border-b border-slate-100 bg-white px-4 py-1 text-[10px] text-slate-400">
          ריחוף על דור מציג <strong>&quot;החלף את הענף לכאן&quot;</strong> — מעבר לתת-ענף בלי לצאת מהמסך. Esc יוצא.
        </p>

        <div className="flex-1 min-h-0 p-2">
          <TreeView key={`full-${focusId}`} nodes={visibleNodes} fullMode onRefresh={softRefresh}
            onStatusChange={(id, status) => setNodes(prev => prev.map(n => n.id === id ? { ...n, status } : n))}
            onRelationChange={(id, relation) => setNodes(prev => prev.map(n => n.id === id ? { ...n, relation } : n))}
            onClearFilters={() => { setStatusFilter(null); setGenerationFilter(null); setDupFilter(false) }}
            statusFilter={statusFilter} generationFilter={generationFilter}
            mergeMode={mergeMode} mergeSel={mergeSel} dupIds={dupIds} onToggleMerge={toggleMerge}
            dupFilter={dupFilter} onMergeGroup={quickMergeGroup} onCleanChildren={setCleanParentId}
            onFocusNode={(id) => { setFocusId(id); if (id) setAnchor(a => ({ id, n: (a?.n ?? 0) + 1 })) }}
            focusId={focusId} anchor={anchor} scanIds={scanIds} locateIds={locateIds} linked={linked} />
        </div>

        {printPick && (
          <PrintPicker title={focusNode.name} count={visibleNodes.length - 1}
            onPick={printFocus} onClose={() => setPrintPick(false)} />
        )}
        {shareNode && (
          <ShareBranchModal nodeId={shareNode.id} nodeName={shareNode.name} onClose={() => setShareNode(null)} />
        )}
      </div>
    )
  }

  return (
    <div dir="rtl">
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">עץ הדורות</h1>
          {!loading && (
            <span className="text-sm text-gray-400 font-medium">{nodes.length} רשומות</span>
          )}
          {!loading && (
            <>
              <button onClick={() => { setGenerationFilter(null); setStatusFilter(f => f === 'verified' ? null : 'verified') }}
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                style={{ background: statusFilter === 'verified' ? '#166534' : '#DCFCE7', color: statusFilter === 'verified' ? '#fff' : '#166534', border: `2px solid ${statusFilter === 'verified' ? '#166534' : 'transparent'}`, cursor: 'pointer' }}>
                ✓ {verifiedCount} מאומתים
              </button>
              <button onClick={() => { setGenerationFilter(null); setStatusFilter(f => f === 'pending' ? null : 'pending') }}
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                style={{ background: statusFilter === 'pending' ? '#92400E' : '#FEF3C7', color: statusFilter === 'pending' ? '#fff' : '#92400E', border: `2px solid ${statusFilter === 'pending' ? '#92400E' : 'transparent'}`, cursor: 'pointer' }}>
                ⏳ {pendingCount} ממתינים לאימות
              </button>
              <button onClick={() => { setGenerationFilter(null); setStatusFilter(f => f === 'rejected' ? null : 'rejected') }}
                className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                style={{ background: statusFilter === 'rejected' ? '#991B1B' : '#FEE2E2', color: statusFilter === 'rejected' ? '#fff' : '#DC2626', border: `2px solid ${statusFilter === 'rejected' ? '#991B1B' : '#FECACA'}`, cursor: 'pointer' }}>
                ✗ {rejectedCount} נדחים
              </button>
              {dupNameCount > 0 && (
                <button onClick={toggleDupFilter}
                  title="הצג רק שמות כפולים (באותו גזע) · לחיצה נוספת לביטול"
                  className="text-xs px-2.5 py-1 rounded-full font-bold transition-all"
                  style={{ background: dupFilter ? '#9333EA' : '#F3E8FF', color: dupFilter ? '#fff' : '#7C2D92', border: `2px solid ${dupFilter ? '#9333EA' : '#E9D5FF'}`, cursor: 'pointer' }}>
                  ⚠ {dupNameCount} שמות כפולים
                </button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            {(['tree', 'table'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${view === v ? 'bg-white shadow-sm text-violet-700' : 'text-gray-400 hover:text-gray-600'}`}>
                {v === 'tree' ? '🌳 עץ' : '📋 טבלה'}
              </button>
            ))}
          </div>
          <button onClick={loadAll} disabled={loading} title="רענן"
            className="w-9 h-9 rounded-xl bg-white border border-gray-200 text-violet-600 flex items-center justify-center hover:bg-violet-50 transition-colors disabled:opacity-50">
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          {/* מרכז המיזוגים — סריקה של כל העץ. זה הכלי לעבודה בהיקף; המיזוג
              הידני שלצידו נשאר למקרה נקודתי שרואים בעין. */}
          <button onClick={() => { setShowDups(s => !s); if (mergeMode) exitMerge() }}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: showDups ? '#7C3AED' : '#fff', color: showDups ? '#fff' : '#5B21B6', border: '1px solid #DDD6FE' }}>
            <Users size={14} /> {showDups ? 'סגור מרכז מיזוגים' : 'מרכז מיזוגים'}
          </button>
          {/* בריאות העץ — אבחון מלא של הבלאגן: יתומים, ריבוי-ילדים חריג, ת"ז כפולות */}
          <button onClick={() => setShowHealth(s => !s)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: showHealth ? '#E11D48' : '#fff', color: showHealth ? '#fff' : '#BE123C', border: '1px solid #FECDD3' }}>
            <Activity size={14} /> {showHealth ? 'סגור בריאות העץ' : 'בריאות העץ'}
          </button>
          {/* מיזוג בטוח — שם זהה בדיוק, אותו אב, אותו דור. נפרד במסך מהמיזוג
              הרגיל בכוונה: זו הפעולה היחידה שאפשר להריץ על מאות קבוצות בלי
              לעבור עליהן, וההפרדה מונעת בלבול בין "בוודאות" לבין "מקורב". */}
          <button onClick={() => setShowSafeMerge(s => !s)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: showSafeMerge ? '#059669' : '#fff', color: showSafeMerge ? '#fff' : '#047857', border: '1px solid #A7F3D0' }}>
            <ShieldCheck size={14} /> {showSafeMerge ? 'סגור מיזוג בטוח' : 'מיזוג בטוח'}
          </button>
          {/* תור הכפילויות — אשכולות שם זהה *בלי* דרישת אב משותף, ולכן הוא
              רואה בדיוק את הכפילות שהמיזוג הבטוח מפספס: אותו סב שנרשם מחדש
              תחת כל אחד מנכדיו, ולכן יושב תחת אבות שונים.
              ⚠️ שם נפרד מ"מרכז המיזוגים" שלצידו (DuplicatesPanel) בכוונה —
              שני כפתורים באותו שם היו בלתי ניתנים להבחנה בשורת הכלים. */}
          <button onClick={() => setShowMergeCenter(true)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: '#fff', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
            <GitMerge size={14} /> תור הכפילויות
          </button>
          {/* נרשמים ללא שיוך לעץ — הקבוצה שההשלמה האוטומטית אינה יכולה לגעת בה,
              ולכן היא לא נסגרת מעצמה ודורשת מסך משלה. */}
          <button onClick={() => setShowUnlinked(s => !s)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: showUnlinked ? '#D97706' : '#fff', color: showUnlinked ? '#fff' : '#B45309', border: '1px solid #FDE68A' }}>
            <Link2 size={14} /> {showUnlinked ? 'סגור ללא שיוך' : 'ללא שיוך לעץ'}
          </button>
          {/* ⚠️ משפחות שאושרו ללא החלטה מתועדת — אישור צומת בעץ מקדם
              אוטומטית כל משפחה שהשרשרת שלה מאומתת, כולל כאלה שאיש לא בדק.
              מסך נפרד כי זו החלטת זכאות, לא תחזוקת עץ. */}
          <Link href="/admin/lineage/auto-approved"
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm bg-white text-amber-700 border border-amber-300 hover:bg-amber-50">
            <ShieldAlert size={14} /> אישורים ללא תיעוד
          </Link>
          {/* צמתי רפאים — צמתים שנוצרו משדה הילדים של כרטסת ולא מאדם שנרשם.
              מסך סריקה בלבד: קודם רואים כמה יש ומי הם, ורק אחר כך מחליטים. */}
          <button onClick={() => setShowGhosts(s => !s)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: showGhosts ? '#475569' : '#fff', color: showGhosts ? '#fff' : '#334155', border: '1px solid #CBD5E1' }}>
            <Ghost size={14} /> {showGhosts ? 'סגור צמתי רפאים' : 'צמתי רפאים'}
          </button>
          {/* דור אחרון כפול — נרשם שנתלה כילד של עצמו. שלא כמו צמתי הרפאים,
              כאן יש תיקון בפועל, ולכן הוא עובר דרך אישור שמפרט מה יקרה. */}
          <button onClick={() => setShowSelfDups(s => !s)}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: showSelfDups ? '#A21CAF' : '#fff', color: showSelfDups ? '#fff' : '#86198F', border: '1px solid #F5D0FE' }}>
            <GitMerge size={14} /> {showSelfDups ? 'סגור דור כפול' : 'דור אחרון כפול'}
          </button>
          <button onClick={() => (mergeMode ? exitMerge() : enterMerge())}
            className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
            style={{ background: mergeMode ? '#9333EA' : '#fff', color: mergeMode ? '#fff' : '#7C2D92', border: '1px solid #E9D5FF' }}>
            {mergeMode ? 'סיום מיזוג' : '⚯ מזג ידנית'}
          </button>
          {/* מרכז שליטה בכל הרשאות שיתוף העץ — כל הקישורים שנשלחו, למי/מתי, וביטול */}
          {canEdit && (
            <button onClick={() => setShowPermissions(true)}
              className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
              style={{ background: '#fff', color: '#4338CA', border: '1px solid #C7D2FE' }}>
              <Link2 size={14} /> הרשאות ענף
            </button>
          )}
          {canAdd && (
            <button
              onClick={() => { setFormName(''); setFormParentId(null); setModal({ type: 'add', parentId: null, parentName: '' }) }}
              className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-sm">
              <Plus size={14} /> הוסף דור חדש
            </button>
          )}
        </div>
      </div>

      {/* הצעות תיקון-ייחוס מצאצאים — באנר שמופיע רק כשיש ממתינות */}
      {canEdit && <SuggestionsInbox onApplied={() => { void softRefresh() }} />}

      {showSafeMerge && <SafeMergePanel onDone={() => { void softRefresh() }} />}
      {showMergeCenter && (
        <MergeCenterPanel
          onClose={() => setShowMergeCenter(false)}
          onDone={() => { void softRefresh() }}
        />
      )}

      {showUnlinked && <UnlinkedPanel onDone={() => { void softRefresh() }} />}

      {showGhosts && (
        <GhostChildrenPanel
          onLocate={(id) => {
            // כמו בבריאות העץ: לסגור את הפאנל ולעבור למצב עץ, אחרת הלחיצה
            // "לא מגיבה" — הפאנל מכסה את העץ, או שאנחנו בכלל בתצוגת טבלה.
            setShowGhosts(false)
            setView('tree')
            handleLocate([id])
          }}
          // הסרת עותקים מוחקת צמתים — העץ שעל המסך התיישן.
          onFixed={() => { void softRefresh() }}
        />
      )}

      {showSelfDups && (
        <SelfDuplicatesPanel
          onLocate={(id) => {
            setShowSelfDups(false)
            setView('tree')
            handleLocate([id])
          }}
          // התיקון מוחק צמתים ומזיז כרטסות — העץ שעל המסך התיישן.
          onFixed={() => { void softRefresh() }}
        />
      )}

      {showHealth && (
        <TreeHealthPanel
          onLocate={(id) => {
            // לחיצה על צומת מבריאות העץ: לסגור את הפאנל, לעבור למצב עץ, ולגלול
            // לצומת. בלי המעבר-לעץ + הסגירה הלחיצה "לא הגיבה" (הפאנל כיסה את העץ
            // או שהיינו במצב טבלה, וה-anchor לא נראה).
            setShowHealth(false)
            setView('tree')
            handleLocate([id])
          }}
          onOpenDuplicates={() => { setShowHealth(false); setShowDups(true) }}
        />
      )}

      {showDups && (
        <DuplicatesPanel
          onDone={() => { void softRefresh() }}
          onCandidates={handleCandidates}
          onLocate={handleLocate}
        />
      )}

      {/* ── בדיקת אשכול על העץ: מה עומד להתמזג, עם הוצאה ידנית ── */}
      {review && (() => {
        const active = review.ids.filter(id => !review.excluded.has(id))
        const canMerge = active.length >= 2 && active.includes(review.keepId)
        return (
          <div style={{ background: '#F5F3FF', border: '2px solid #C4B5FD', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ background: '#7C3AED', color: '#fff', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>
                קבוצה {review.index + 1}/{review.total}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#5B21B6', whiteSpace: 'nowrap' }}>
                {active.length} צמתים יתמזגו אל:
                {review.excluded.size > 0 && <span style={{ color: '#B45309', fontWeight: 600 }}> ({review.excluded.size} הוצאו)</span>}
              </span>
              {/* ⚠️ בורר השם הסופי — כאן, על העץ. הוא היה קיים רק בפאנל
                  הצדדי, וכשעובדים מהעץ (כפי שנדרש) הוא לא נראה כלל — כך
                  שהמיזוג התבצע בלי שנשאלה השאלה מי השם שנשאר. */}
              <select value={review.finalName}
                onChange={e => setReview(r => r ? { ...r, finalName: e.target.value } : r)}
                style={{ flex: 1, minWidth: 200, maxWidth: 420, padding: '5px 9px', borderRadius: 8, border: '1.5px solid #16A34A', background: '#F0FDF4', color: '#166534', fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
                {[...new Set(review.ids.filter(id => !review.excluded.has(id))
                  .map(id => nodes.find(n => n.id === id)?.name.trim().replace(/\s+/g, ' ') ?? '')
                  .filter(Boolean))]
                  .sort((a, b) => a.localeCompare(b, 'he'))
                  .map(nm => <option key={nm} value={nm}>{nm}</option>)}
              </select>
              <button onClick={() => { setReview(null); setLocateIds(new Set()) }}
                style={{ background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 9, padding: '6px 13px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
              <button disabled={!canMerge || merging}
                onClick={() => {
                  const ids = review.ids.filter(id => !review.excluded.has(id) && id !== review.keepId)
                  const info = { text: `${ids.length + 1} צמתים → ${review.finalName}`, gen: review.gen, index: review.index, total: review.total }
                  void mergeByIds(review.keepId, ids, { [review.keepId]: review.finalName }, true)
                    .then(() => { setReview(null); setLocateIds(new Set()); setReviewDone(info) })
                }}
                style={{ background: (!canMerge || merging) ? '#C4B5FD' : '#7C3AED', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 15px', fontSize: 12.5, fontWeight: 800, cursor: (!canMerge || merging) ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {merging ? 'ממזג…' : `⚯ מזג ${active.length} צמתים`}
              </button>
            </div>
            <p style={{ margin: '7px 0 0', fontSize: 11, color: '#7C3AED', lineHeight: 1.6 }}>
              הצמתים מסומנים בעץ. <strong>לחיצה על כרטיס מוציאה אותו מהמיזוג</strong> (ולחיצה חוזרת מחזירה) — כך אפשר להשאיר בחוץ מי שאינו אותו אדם.
            </p>
          </div>
        )
      })()}

      {/* תוצאת המיזוג האחרון + מעבר לקבוצה הבאה */}
      {reviewDone && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#ECFDF5', border: '2px solid #A7F3D0', borderRadius: 12, padding: '9px 14px', marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15 }}>✅</span>
          <span style={{ flex: 1, minWidth: 200, fontSize: 13, fontWeight: 700, color: '#166534' }}>
            המיזוג בוצע — {reviewDone.text}
          </span>
          <button onClick={() => { setReviewDone(null); setCleanParentId(`gen:${reviewDone.gen}`) }}
            style={{ background: '#16A34A', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 15px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            לקבוצה הבאה ←
          </button>
          <button onClick={() => setReviewDone(null)}
            style={{ background: 'none', color: '#64748B', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>סגור</button>
        </div>
      )}

      {/* ⚠️ באנר יציאה מהדגשת הקבוצה: ההדגשה מעמעמת את כל שאר העץ, ובלי דרך
          יציאה ברורה המשתמש נתקע עם מסך חיוור בלי להבין למה. */}
      {!review && locateIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#F5F3FF', border: '2px solid #DDD6FE', borderRadius: 12, padding: '9px 14px', marginBottom: 12, flexWrap: 'wrap' }}>
          <MapPin size={15} color="#7C3AED" />
          <span style={{ flex: 1, minWidth: 180, fontSize: 13, fontWeight: 700, color: '#5B21B6' }}>
            מוצגת קבוצת מיזוג מסומנת ({locateIds.size} צמתים) — שאר העץ מעומעם
          </span>
          <button onClick={() => setLocateIds(new Set())}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 9, padding: '6px 13px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            <X size={13} /> הצג את כל העץ
          </button>
        </div>
      )}

      {/* ── באנר מצב "אילן צאצאים" — מה במוקד, יציאה, והדפסה ── */}
      {focusNode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
          background: 'linear-gradient(90deg,#F5F3FF,#FFF)', border: '2px solid #DDD6FE',
          borderRadius: 14, padding: '11px 16px', marginBottom: 14,
        }}>
          <span style={{ fontSize: 20 }}>🌳</span>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#5B21B6' }}>
              אילן הצאצאים של {focusNode.name}
            </div>
            <div style={{ fontSize: 11.5, color: '#7C3AED' }}>
              דור {focusNode.generation} · {visibleNodes.length - 1} צאצאים · מוצג הענף הזה בלבד
            </div>
          </div>
          <button onClick={() => setPrintPick(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#5B21B6', border: '1.5px solid #DDD6FE', borderRadius: 11, padding: '8px 15px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            <Printer size={14} /> הדפסה / PDF
          </button>
          {canEdit && (
            <button onClick={() => setShareNode({ id: focusNode.id, name: focusNode.name })}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#4338CA', border: '1.5px solid #C7D2FE', borderRadius: 11, padding: '8px 15px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              <Link2 size={14} /> שתף ענף לאישור
            </button>
          )}
          <button onClick={() => setFocusId(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 11, padding: '8px 15px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            <X size={14} /> חזרה לעץ המלא
          </button>
        </div>
      )}

      {/* חלונית ניהול שיתוף ענף — יצירת הזמנות + שליטה מלאה (ביטול הרשאות) */}
      {shareNode && (
        <ShareBranchModal nodeId={shareNode.id} nodeName={shareNode.name} onClose={() => setShareNode(null)} />
      )}

      {/* מרכז שליטה מרכזי — טבלת כל הרשאות השיתוף בכל העץ */}
      {showPermissions && (
        <SharePermissionsPanel onClose={() => setShowPermissions(false)} />
      )}

      {/* ── בחירת סגנון הדפסה ── */}
      {printPick && focusNode && (
        <PrintPicker title={focusNode.name} count={visibleNodes.length - 1}
          onPick={printFocus} onClose={() => setPrintPick(false)} />
      )}

      {/* generation legend — clickable filters */}
      {nodes.length > 0 && !loading && !focusNode && (
        <div className="flex gap-2 flex-wrap mb-4">
          {Array.from({ length: maxGen }, (_, i) => i + 1).map(g => (
            <span key={g} className="inline-flex items-center rounded-full border transition-all"
              style={{
                background: generationFilter === g ? pal(g).ring : pal(g).light,
                borderColor: generationFilter === g ? pal(g).ring : `${pal(g).ring}33`,
                boxShadow: generationFilter === g ? `0 2px 8px ${pal(g).shadow}` : 'none',
              }}>
              <button onClick={() => { setStatusFilter(null); setGenerationFilter(f => f === g ? null : g) }}
                className="px-3 py-1 text-xs font-bold"
                style={{ color: generationFilter === g ? '#fff' : pal(g).text, cursor: 'pointer', background: 'none', border: 'none', fontFamily: 'inherit' }}>
                דור {g} · {genCounts[g] ?? 0}
              </button>
              {/* 🧹 ניקוי כפילויות בדור שלם — כאן הן באמת נמצאות.
                  כל משפחה שנרשמה מילאה את שרשרת האבות שלה, והמערכת יצרה
                  לכל שרשרת צמתים משלה. התוצאה: אותו סבא קיים עשרות פעמים
                  באותו דור, תחת הורים שונים. ניקוי לפי אב בודד לא נוגע בזה. */}
              <button onClick={() => setCleanParentId(`gen:${g}`)}
                title={`איתור וניקוי כפילויות בדור ${g}`}
                className="px-2 py-1 text-xs"
                style={{ color: generationFilter === g ? '#fff' : pal(g).text, cursor: 'pointer', background: 'none', border: 'none', opacity: 0.75, borderRight: `1px solid ${generationFilter === g ? 'rgba(255,255,255,0.35)' : `${pal(g).ring}33`}` }}>
                🧹
              </button>
            </span>
          ))}
        </div>
      )}

      {/* content */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 320, gap: 12, color: '#7C3AED' }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>טוען נתונים…</span>
        </div>
      ) : view === 'tree' ? (
        /* ⚠️ key מתחלף רק בכניסה/יציאה ממוקד — ואז מרצוננו הרכיב נבנה מחדש
           וממורכז על הענף. במיזוג ה-key אינו משתנה, ולכן המיקום נשמר. */
        <TreeView key={focusId ?? 'all'} nodes={visibleNodes} onRefresh={softRefresh} onStatusChange={(id, status) => setNodes(prev => prev.map(n => n.id === id ? { ...n, status } : n))} onRelationChange={(id, relation) => setNodes(prev => prev.map(n => n.id === id ? { ...n, relation } : n))} onClearFilters={() => { setStatusFilter(null); setGenerationFilter(null); setDupFilter(false) }} statusFilter={statusFilter} generationFilter={generationFilter} mergeMode={mergeMode} mergeSel={mergeSel} dupIds={dupIds} onToggleMerge={toggleMerge} dupFilter={dupFilter} onMergeGroup={quickMergeGroup} onCleanChildren={setCleanParentId}
          onReviewToggle={(id) => {
            // מחזיר true רק אם הצומת שייך לאשכול שנבדק — כך שאר הלחיצות
            // בעץ (בחירה/פופאפ) ממשיכות לעבוד כרגיל מחוץ למצב הבדיקה.
            if (!review || !review.ids.includes(id)) return false
            setReview(r => {
              if (!r) return r
              const ex = new Set(r.excluded)
              if (ex.has(id)) ex.delete(id); else ex.add(id)
              return { ...r, excluded: ex }
            })
            return true
          }}
          reviewExcluded={review?.excluded}
          onFocusNode={setFocusId} focusId={focusId} anchor={anchor} scanIds={scanIds} locateIds={locateIds} linked={linked} />
      ) : (
        <TableView
          nodes={visibleNodes}
          onRefresh={softRefresh}
          statusFilter={statusFilter}
          generationFilter={generationFilter}
          mergeMode={mergeMode}
          mergeSel={mergeSel}
          dupIds={dupIds}
          onToggleMerge={toggleMerge}
          dupFilter={dupFilter}
          onMergeGroup={quickMergeGroup}
          onAdd={(parentId, parentName) => { setFormName(''); setModal({ type: 'add', parentId, parentName }) }}
          onEdit={node => { setFormName(node.name); setFormRelation(node.relation ?? null); setModal({ type: 'edit', node }) }}
          onDelete={node => setModal({ type: 'delete', node: { ...node, children: buildTree(nodes).find(n => n.id === node.id)?.children ?? [] } })}
        />
      )}

      {/* page-level modals (table view) */}
      {modal?.type === 'edit' && (
        <Modal title={`עריכת: ${modal.node.name}`} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            {modal.node.parent_id && <RelationPicker value={formRelation} onChange={setFormRelation} />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              {canEdit && <MBtn label="שמור" color="#7C3AED" onClick={handleSave} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'add' && (
        <Modal title={modal.parentId ? `הוסף ילד ל: ${modal.parentName}` : 'הוסף דור חדש'} onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>שם <span style={{ color: '#DC2626' }}>*</span></label>
              <input autoFocus value={formName} onChange={e => setFormName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder="הכנס שם..." style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF' }} />
            </div>
            {!modal.parentId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748B' }}>מי האב/האם שלו? <span style={{ color: '#DC2626' }}>*</span></label>
                <select value={formParentId ?? ''} onChange={e => setFormParentId(e.target.value || null)}
                  style={{ border: '1.5px solid #E2E8F0', borderRadius: 11, padding: '11px 14px', fontSize: 14, direction: 'rtl', outline: 'none', fontFamily: 'inherit', background: '#FAFBFF', cursor: 'pointer' }}>
                  <option value="">— בחר אב/אם —</option>
                  {[...nodes].filter(n => (n.status ?? 'verified') === 'verified').sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name, 'he')).map(n => (
                    <option key={n.id} value={n.id}>{n.name} (דור {n.generation})</option>
                  ))}
                </select>
              </div>
            )}
            {(modal.parentId || formParentId) && <RelationPicker value={formRelation} onChange={setFormRelation} required />}
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              {canAdd && <MBtn label="הוסף" color="#059669" onClick={handleSave} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}
      {modal?.type === 'delete' && (
        <Modal title="מחיקת צומת" onClose={close}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.6 }}>האם למחוק את <strong style={{ color: '#0F172A' }}>{modal.node.name}</strong>?</p>
            {saveErr && <span style={{ color: '#DC2626', fontSize: 13 }}>{saveErr}</span>}
            <div style={{ display: 'flex', gap: 8 }}>
              {canDelete && <MBtn label="מחק" color="#DC2626" onClick={handleDelete} loading={saving} />}
              <MBtn label="ביטול" color="#94A3B8" onClick={close} />
            </div>
          </div>
        </Modal>
      )}

      {/* פאנל ניקוי כפילויות — של ילדי צומת, או של דור שלם */}
      {cleanParentId && (() => {
        // ⚠️ "gen:N" = ניקוי דור שלם ולא ילדי צומת. זה מה שנדרש בפועל:
        // הכפילויות אינן תחת אב אחד אלא פזורות בכל הדור — כל משפחה
        // שנרשמה יצרה עותק משלה לשרשרת האבות, ולכן יש 41 עותקים של אותו
        // שם בדור 6 תחת 41 הורים שונים. ניקוי לפי אב אחד לא נוגע בזה.
        const genMatch = /^gen:(\d+)$/.exec(cleanParentId)
        const kidCount = (id: string) => nodes.filter(n => n.parent_id === id).length
        const parent = genMatch ? null : nodes.find(n => n.id === cleanParentId)
        if (!genMatch && !parent) return null
        const kids = genMatch
          ? nodes.filter(n => n.generation === Number(genMatch[1]))
          : nodes.filter(n => n.parent_id === cleanParentId)
        return (
          <CleanChildrenPanel
            parentName={genMatch ? `דור ${genMatch[1]}` : parent!.name}
            nodes={kids.map(k => ({ id: k.id, name: k.name, generation: k.generation, status: k.status, childCount: kidCount(k.id) }))}
            // ⚠️ busyId הושווה ל-cleanParentId (שהוא "gen:6" בניקוי דור),
            // ולעולם לא תאם ל-keep.id — ולכן הכפתור לא הראה טעינה והלחיצה
            // נראתה כאילו "לא קרה כלום". עכשיו מועבר מזהה המיזוג הפעיל.
            busyId={busyMergeKeep}
            onMerge={(keepId, mergeIds, finalName) => {
              setBusyMergeKeep(keepId)
              // ⚠️ בלי מפל כלפי מעלה (noCascade): בניקוי דור המשתמש בוחר
              // קבוצה מפורשת, והמפל היה ממזג גם אבות שלא נבחרו — ומשנה את
              // העץ מתחת לקבוצות הבאות ברשימה. זהה למיזוג ההמוני.
              void mergeByIds(keepId, mergeIds, { [keepId]: finalName }, true)
                .finally(() => setBusyMergeKeep(null))
            }}
            onMergeAll={groups => { void mergeSequential(groups) }}
            onReview={g => {
              // סוגרים את הפאנל, מדגישים את האשכול על העץ ומעמעמים את השאר
              setCleanParentId(null)
              setReviewDone(null)
              setLocateIds(new Set(g.ids))
              setReview({
                ids: g.ids, excluded: new Set(), keepId: g.keepId, finalName: g.finalName,
                gen: genMatch ? Number(genMatch[1]) : 0, index: g.index, total: g.total,
              })
              // ממקדים את המבט על הצומת שנשאר, כדי לא לחפש אותו בעץ
              setAnchor(a => ({ id: g.keepId, n: (a?.n ?? 0) + 1 }))
            }}
            onClose={() => setCleanParentId(null)}
          />
        )
      })()}

      {/* ── חיווי צדי לתוצאת המיזוג ──
          נשאר על המסך עד שסוגרים אותו או עד המיזוג הבא, בצד ולא באמצע, כדי
          שאפשר להמשיך לעבוד באותו מקום בלי שום לחיצת אישור. */}
      {mergeFlash && (
        <div key={mergeFlash.n}
          style={{
            position: 'fixed', top: 88, left: 20, zIndex: 130, maxWidth: 340,
            background: '#fff', borderRadius: 14,
            border: `1.5px solid ${mergeFlash.ok ? '#A7F3D0' : '#FECACA'}`,
            borderRight: `5px solid ${mergeFlash.ok ? '#16A34A' : '#DC2626'}`,
            boxShadow: '0 12px 32px rgba(0,0,0,0.16)', padding: '12px 14px',
            direction: 'rtl', animation: 'pop-in .18s ease-out',
          }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span style={{ fontSize: 15, lineHeight: 1.2, flexShrink: 0 }}>{mergeFlash.ok ? '✅' : '⚠️'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: mergeFlash.ok ? '#166534' : '#991B1B' }}>
                {mergeFlash.ok ? 'המיזוג בוצע' : 'המיזוג נכשל'}
              </p>
              <p style={{ margin: '3px 0 0', fontSize: 11.5, color: '#475569', lineHeight: 1.6 }}>{mergeFlash.text}</p>
            </div>
            <button onClick={() => setMergeFlash(null)}
              style={{ background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>
        </div>
      )}

      {/* באנר הדרכה במצב מיזוג */}
      {mergeMode && mergeSel.size === 0 && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 120, background: '#FAF5FF', border: '1.5px solid #E9D5FF', color: '#7C2D92', borderRadius: 14, padding: '10px 18px', fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(124,58,237,0.18)' }}>
          מצב מיזוג: סמן 2 צמתים או יותר (אותו אדם) · קיצור: <kbd style={{ background: '#fff', border: '1px solid #E9D5FF', borderRadius: 5, padding: '1px 6px', fontFamily: 'inherit', fontWeight: 800 }}>Ctrl</kbd> + לחיצה על כרטיס · <button onClick={exitMerge} style={{ color: '#9333EA', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit' }}>סיום</button>
        </div>
      )}

      {/* בר מיזוג צף — נבחרו צמתים.
          ⚠️ לא מותנה ב-mergeMode: Ctrl+לחיצה מסמנת בלי להיכנס למצב, והבר
          חייב להופיע גם אז — אחרת אין שום דרך לראות מה נבחר או למזג. */}
      {mergeSel.size > 0 && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 120, background: '#fff', border: '1.5px solid #E2E8F0', borderRadius: 16, padding: '12px 16px', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', maxWidth: '92vw', direction: 'rtl' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748B', marginBottom: 8 }}>נבחרו {mergeSel.size} צמתים — בחר איזה <span style={{ color: '#16A34A' }}>נשאר</span>:</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', maxWidth: 720 }}>
            {selectedNodes.map(n => {
              const isKeep = effectiveKeepId === n.id
              return (
                <button key={n.id} onClick={() => setKeepId(n.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    background: isKeep ? '#DCFCE7' : '#F1F5F9', color: isKeep ? '#166534' : '#475569', border: `1.5px solid ${isKeep ? '#16A34A' : '#E2E8F0'}` }}>
                  {isKeep ? '★ נשאר' : '○'} {n.name} <span style={{ opacity: 0.6 }}>(דור {n.generation})</span>
                  <span onClick={e => { e.stopPropagation(); toggleMerge(n.id) }} style={{ color: '#94A3B8', cursor: 'pointer', marginRight: 2 }}>✕</span>
                </button>
              )
            })}
            <div style={{ flex: 1 }} /></div>
          {/* ── שורה שנייה: השם הסופי + מיזוג ──
              המיזוג מיידי (בלי חלונית אישור), אבל השם הסופי ניתן לעריכה כאן
              במקום — כי דווקא הוא מה שצריך תיקון לעיתים קרובות: הצומת שנשאר
              אינו בהכרח זה שנושא את השם המלא ביותר. ברירת המחדל היא השם הארוך
              ביותר בקבוצה, וזה בדרך כלל הנכון. */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#64748B', whiteSpace: 'nowrap' }}>השם הסופי:</span>
            <input value={quickName} onChange={e => setQuickName(e.target.value)}
              placeholder={fullestSelName}
              style={{ flex: 1, minWidth: 220, padding: '7px 12px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', color: '#0F172A' }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475569', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={mergeUpApprox} onChange={e => setMergeUpApprox(e.target.checked)} style={{ width: 15, height: 15, accentColor: '#9333EA', cursor: 'pointer' }} />
              מזג גם את האבות שמעל
            </label>
            <button onClick={() => void handleMerge(effectiveKeepId ? { [effectiveKeepId]: (quickName.trim() || fullestSelName) } : undefined)}
              disabled={mergeSel.size < 2 || merging}
              style={{ background: (mergeSel.size < 2 || merging) ? '#C4B5FD' : '#9333EA', color: '#fff', border: 'none', borderRadius: 11, padding: '9px 18px', fontSize: 13, fontWeight: 800, cursor: (mergeSel.size < 2 || merging) ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
              {merging ? 'ממזג…' : `⚯ מזג ${mergeSel.size} צמתים`}
            </button>
            <button onClick={() => setMergeConfirm(true)} disabled={mergeSel.size < 2}
              title="הצגת תצוגה מקדימה מלאה של המיזוג לפני ביצוע"
              style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0', borderRadius: 11, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: mergeSel.size < 2 ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>תצוגה מקדימה</button>
            <button onClick={exitMerge} style={{ background: '#F1F5F9', color: '#64748B', border: 'none', borderRadius: 11, padding: '9px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>ביטול</button>
          </div>
        </div>
      )}

      {/* מודאל אישור מיזוג */}
      {mergeConfirm && effectiveKeepId && (
        <Modal title="אישור מיזוג צמתים" onClose={() => setMergeConfirm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
              {mergeSel.size - 1} צמתים ימוזגו אל <strong style={{ color: '#166534' }}>{nodes.find(n => n.id === effectiveKeepId)?.name}</strong>.
              <br />כל הילדים והנרשמים המשויכים יועברו אליו, והכפילים יימחקו.
            </p>
            {/* מיזוג הדורות שמעל — מה שמונע את זנב האבות הכפולים אחרי כל מיזוג */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer', background: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: 11, padding: '10px 14px' }}>
              <input type="checkbox" checked={mergeUpApprox} onChange={e => setMergeUpApprox(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#9333EA', cursor: 'pointer', marginTop: 2 }} />
              <span>
                למזג גם את הדורות שמעל — <strong>גם כשהניסוח שונה</strong>
                <span style={{ display: 'block', fontSize: 11.5, color: '#7E22CE', marginTop: 3, lineHeight: 1.5 }}>
                  אם אלו אותו אדם, גם אבותיהם אותו אדם. כך &quot;שמואל בנימין שישא&quot; ו&quot;רבי שמואל בנימין ומרת חיה ליבא שישא&quot; ימוזגו יחד — והניסוח המפורט הוא שיישאר.
                </span>
              </span>
            </label>
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 11, padding: '10px 14px', fontSize: 12, color: '#92400E' }}>
              ⚠ פעולה זו אינה הפיכה.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {/* "מזג מיד" — מיזוג מיידי בלייב בלי תצוגה מקדימה (השרת בוחר את השם
                  המפורט לכל דור). זו הדרך המהירה שהמנהל ביקש — לחיצה אחת וזהו. */}
              <MBtn label="מזג מיד" color="#16A34A" onClick={() => handleMerge()} loading={merging} />
              {/* "תצוגה מקדימה" — למי שרוצה לראות ולבחור שם לכל דור לפני הביצוע. */}
              <MBtn label="תצוגה מקדימה" color="#9333EA" onClick={() => openManualPlan()} loading={manualPlanning} />
              <MBtn label="ביטול" color="#94A3B8" onClick={() => setMergeConfirm(false)} />
            </div>
          </div>
        </Modal>
      )}

      {/* תצוגה מקדימה של המיזוג הידני — אותו מודאל של מרכז המיזוגים */}
      {manualPlan && (
        <MergePlanModal
          data={manualPlan}
          names={manualNames}
          upApprox={mergeUpApprox}
          busy={merging}
          planning={manualPlanning}
          onNameChange={(keepId, name) => setManualNames(prev => ({ ...prev, [keepId]: name }))}
          onToggleApprox={(checked) => { setMergeUpApprox(checked); void openManualPlan(checked) }}
          onConfirm={() => handleMerge(manualNames)}
          onClose={() => setManualPlan(null)}
        />
      )}

      {/* מודאל אישור ייחוס לאחר מיזוג */}
      {approvePrompt && (
        <Modal title="אישור ייחוס" onClose={() => setApprovePrompt(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ margin: 0, fontSize: 14, color: '#334155', lineHeight: 1.7 }}>
              המיזוג הושלם. האם לאשר את הייחוס של <strong style={{ color: '#166534' }}>{approvePrompt.keepName}</strong> ולסמן אותו כ<strong>מאומת</strong>?
            </p>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#334155', cursor: 'pointer', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 11, padding: '10px 14px' }}>
              <input type="checkbox" checked={approveDesc} onChange={e => setApproveDesc(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#16A34A', cursor: 'pointer' }} />
              לאשר גם את כל המשורשרים אליו (הצאצאים)
            </label>
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', lineHeight: 1.5 }}>
              ניתן גם להשאיר בסטטוס &quot;ממתין לאימות&quot; ולאשר ידנית בהמשך.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <MBtn label="אשר ייחוס" color="#16A34A" onClick={() => handleApproveLineage(approveDesc)} loading={approving} />
              <MBtn label="השאר ממתין לאימות" color="#94A3B8" onClick={() => setApprovePrompt(null)} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
