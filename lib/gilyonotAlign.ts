// ─────────────────────────────────────────────────────────────────────────────
// יישור בעורך הגיליונות: חל על כל הבלוקים שהטווח המסומן נוגע בהם (פסקאות, כותרות,
// פריטי רשימה, שורות עם <br> וטקסט חשוף בשורש העורך), ולא רק על הבלוק של העוגן
// כמו execCommand. היישור נכתב כ-style="text-align" על הבלוק, ושורד את הניקוי.
// ─────────────────────────────────────────────────────────────────────────────

export type Align = 'left' | 'center' | 'right'

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'TABLE'])
const SKIP = new Set(['HR', 'TABLE'])
const isBlock = (n: Node): n is HTMLElement => n.nodeType === 1 && BLOCKS.has((n as HTMLElement).tagName)
const isLeaf = (el: HTMLElement) => ![...el.childNodes].some(isBlock)

/** האם הטווח מכסה משהו מהצומת (ולא רק נוגע בקצה שלו, כמו אחרי triple-click). */
function touches(range: Range, node: Node): boolean {
  if (!range.intersectsNode(node)) return false
  if (range.collapsed) return true
  const r = document.createRange()
  r.selectNodeContents(node)
  if (r.compareBoundaryPoints(Range.START_TO_START, range) < 0) r.setStart(range.startContainer, range.startOffset)
  if (r.compareBoundaryPoints(Range.END_TO_END, range) > 0) r.setEnd(range.endContainer, range.endOffset)
  return r.toString() !== '' || !(node.textContent ?? '').trim()
}

function setAlign(el: HTMLElement, align: Align) {
  el.style.textAlign = align
  if (el.hasAttribute('align')) el.removeAttribute('align')
}

function process(container: HTMLElement, range: Range, align: Align): number {
  let n = 0
  let line: Node[] = []
  const flush = () => {
    if (!line.length) return
    const nodes = line
    line = []
    if (!nodes.some(x => touches(range, x))) return
    const content = nodes.filter(x => x.nodeName !== 'BR')
    if (!content.length) return
    const div = document.createElement('div')
    container.insertBefore(div, nodes[0])
    for (const x of content) div.appendChild(x)
    for (const x of nodes) if (x.nodeName === 'BR') x.parentNode?.removeChild(x)
    setAlign(div, align)
    n++
  }
  for (const child of [...container.childNodes]) {
    if (!isBlock(child)) {
      line.push(child)
      if (child.nodeName === 'BR') flush()
      continue
    }
    flush()
    if (SKIP.has(child.tagName) || !touches(range, child)) continue
    if (child.tagName === 'UL' || child.tagName === 'OL') {
      for (const li of [...child.children]) {
        if (li instanceof HTMLElement && touches(range, li)) { setAlign(li, align); n++ }
      }
    } else if (isLeaf(child)) {
      setAlign(child, align)
      n++
    } else {
      n += process(child, range, align)
    }
  }
  flush()
  return n
}

/** מיישר את כל הבלוקים שהטווח נוגע בהם. מחזיר כמה בלוקים עודכנו (0 = אין מה ליישר). */
export function alignBlocks(root: HTMLElement, range: Range, align: Align): number {
  return process(root, range, align)
}
