import sanitizeHtml from 'sanitize-html'

/**
 * ניקוי תוכן קמפיין בשרת לפני שמירה.
 * ה-WAF לא חוסם XSS בגוף הבקשה בנתיב /api/admin/campaigns/ (העורך שולח HTML),
 * ולכן השרת הוא קו ההגנה: מוסר רק מה שמריץ קוד, וכל השאר (מבנה המייל, סגנונות,
 * טבלאות, משתני המיזוג {{...}}) נשאר כמו שהוא, כדי לא לשבור קמפיינים קיימים.
 */
const DANGEROUS_TAGS = new Set([
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input',
  'button', 'textarea', 'select', 'base', 'link', 'noscript', 'template', 'svg', 'math',
])
const URL_ATTRS = new Set(['href', 'src', 'action', 'background', 'poster', 'xlink:href', 'formaction'])

function badUrl(name: string, value: string): boolean {
  const v = value.replace(/[\u0000- \u007f-\u009f]/g, '').toLowerCase()
  if (/^(javascript|vbscript):/.test(v)) return true
  if (v.startsWith('data:')) return !(name === 'src' && v.startsWith('data:image/') && !v.startsWith('data:image/svg'))
  return false
}

export function sanitizeCampaignHtml(html: unknown): string {
  if (typeof html !== 'string' || !html) return ''
  const doctype = html.match(/^\s*<!doctype[^>]*>/i)?.[0].trim() ?? ''
  const clean = sanitizeHtml(html, {
    allowedTags: false,
    allowedAttributes: false,
    allowVulnerableTags: true,
    exclusiveFilter: frame => DANGEROUS_TAGS.has(frame.tag.toLowerCase()),
    transformTags: {
      '*': (tagName, attribs) => {
        const safe: Record<string, string> = {}
        for (const [k, v] of Object.entries(attribs)) {
          const name = k.toLowerCase()
          if (name.startsWith('on') || name === 'srcdoc' || name === 'formaction') continue
          if (URL_ATTRS.has(name) && badUrl(name, v)) continue
          safe[k] = v
        }
        return { tagName, attribs: safe }
      },
    },
  })
  return doctype && !/^\s*<!doctype/i.test(clean) ? `${doctype}\n${clean}` : clean
}

/** מנקה את השדות שמכילים HTML בתוך ה-patch של הקמפיין (raw_html ותוכן הבלוקים). */
export function sanitizeCampaignPatch(patch: Record<string, unknown>): Record<string, unknown> {
  if ('raw_html' in patch && typeof patch.raw_html === 'string') {
    patch.raw_html = sanitizeCampaignHtml(patch.raw_html)
  }
  const content = patch.content as { blocks?: unknown } | null | undefined
  if (content && typeof content === 'object' && Array.isArray(content.blocks)) {
    patch.content = {
      ...content,
      blocks: content.blocks.map(b => {
        if (!b || typeof b !== 'object') return b
        const block = { ...(b as Record<string, unknown>) }
        if (typeof block.content === 'string') block.content = sanitizeCampaignHtml(block.content)
        for (const k of ['src', 'href', 'url'] as const) {
          if (typeof block[k] === 'string' && badUrl(k === 'src' ? 'src' : 'href', block[k] as string)) block[k] = ''
        }
        return block
      }),
    }
  }
  return patch
}
