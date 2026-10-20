// ─────────────────────────────────────────────────────────────────────────────
// ניקוי גוף המייל מהעורך של הגיליונות, בשרת, לפני שמירה ולפני כל שליחה.
// רשימת היתרים קשיחה: תגיות טקסט, קישורים, כפתורים, תמונות ומפריד, ו-style
// רק לתכונות עיצוב מוכרות. בלי סקריפטים, בלי אירועים ובלי data:/javascript:.
// בנוסף מוסיף סגנון inline ברירת מחדל, כי תוכנות מייל מתעלמות מ-CSS חיצוני.
// ─────────────────────────────────────────────────────────────────────────────

import sanitizeHtml from 'sanitize-html'

export const MAX_BODY_HTML = 100_000

const COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)$/i, /^transparent$/i]
const LEN = /^-?\d+(\.\d+)?(px|em|rem|%)?$/
const BOX = /^(-?\d+(\.\d+)?(px|em|%)?|auto)(\s+(-?\d+(\.\d+)?(px|em|%)?|auto)){0,3}$/
const BORDER = /^(none|0|\d+px\s+(solid|dashed|dotted)\s+(#[0-9a-f]{3,8}|rgba?\([\d\s.,]+\)))$/i

const allowedStyles: Record<string, RegExp[]> = {
  'color': COLOR,
  'background-color': COLOR,
  'text-align': [/^(left|right|center|justify|start|end)$/],
  'direction': [/^(rtl|ltr)$/],
  'font-size': [LEN, /^(xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large)$/],
  'font-weight': [/^(normal|bold|[1-9]00)$/],
  'font-style': [/^(normal|italic)$/],
  'font-family': [/^[\w\s,'"\-֐-׿]{1,80}$/],
  'text-decoration': [/^(none|underline|line-through)(\s+(underline|line-through))?$/],
  'text-decoration-line': [/^(none|underline|line-through)(\s+(underline|line-through))?$/],
  'line-height': [LEN, /^normal$/],
  'margin': [BOX], 'margin-top': [LEN], 'margin-bottom': [LEN],
  'padding': [BOX],
  'border': [BORDER], 'border-top': [BORDER], 'border-bottom': [BORDER],
  'border-radius': [LEN],
  'display': [/^(block|inline-block|inline)$/],
  'width': [LEN, /^auto$/], 'max-width': [LEN], 'height': [LEN, /^auto$/],
}

const DEFAULT_STYLE: Record<string, string> = {
  p: 'margin:0 0 14px;color:#334155;font-size:16px;line-height:1.8;',
  div: 'color:#334155;font-size:16px;line-height:1.8;',
  h1: 'margin:0 0 12px;color:#0f172a;font-size:24px;line-height:1.4;',
  h2: 'margin:0 0 12px;color:#0f172a;font-size:20px;line-height:1.4;',
  h3: 'margin:0 0 10px;color:#0f172a;font-size:18px;line-height:1.4;',
  h4: 'margin:0 0 10px;color:#0f172a;font-size:16px;line-height:1.4;',
  ul: 'margin:0 0 14px;padding:0 22px 0 0;color:#334155;font-size:16px;line-height:1.8;',
  ol: 'margin:0 0 14px;padding:0 22px 0 0;color:#334155;font-size:16px;line-height:1.8;',
  blockquote: 'margin:0 0 14px;padding:4px 14px 4px 0;border-right:3px solid #cbd5e1;color:#475569;',
  a: 'color:#2563eb;',
  hr: 'border:0;border-top:1px solid #e2e8f0;margin:20px 0;',
  img: 'display:block;max-width:100%;height:auto;border:0;margin:0 auto 14px;',
}

// משלים לכל תגית רק את התכונות שהמשתמש לא קבע. ניקוי חוזר של אותו HTML לא משנה אותו.
export function mergeStyle(defaults: string, style: string | undefined): string {
  const decl = new Map<string, string>()
  for (const part of `${defaults};${style ?? ''}`.split(';')) {
    const i = part.indexOf(':')
    if (i > 0) decl.set(part.slice(0, i).trim().toLowerCase(), part.slice(i + 1).trim())
  }
  return [...decl].map(([k, v]) => `${k}:${v}`).join(';')
}

const withDefault = (tag: string): sanitizeHtml.Transformer => (tagName, attribs) => ({
  tagName,
  attribs: { ...attribs, style: mergeStyle(DEFAULT_STYLE[tag], attribs.style) },
})

const transformTags: Record<string, string | sanitizeHtml.Transformer> = Object.fromEntries(
  Object.keys(DEFAULT_STYLE).filter(t => t !== 'a').map(t => [t, withDefault(t)]),
)
transformTags.a = (tagName, attribs) => ({
  tagName,
  attribs: { ...attribs, style: mergeStyle(DEFAULT_STYLE.a, attribs.style), target: '_blank', rel: 'noopener' },
})
transformTags.b = 'strong'
transformTags.strike = 's'

export function sanitizeMailHtml(html: unknown): string {
  if (typeof html !== 'string') return ''
  const clean = sanitizeHtml(html.slice(0, MAX_BODY_HTML), {
    allowedTags: ['p', 'br', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'h1', 'h2', 'h3', 'h4',
      'ul', 'ol', 'li', 'a', 'img', 'hr', 'blockquote', 'table', 'tbody', 'tr', 'td'],
    allowedAttributes: {
      '*': ['style', 'dir', 'align'],
      a: ['href', 'target', 'rel', 'data-btn'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['colspan', 'width'],
      table: ['width', 'cellpadding', 'cellspacing', 'role'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['https', 'http'] },
    allowProtocolRelative: false,
    allowedStyles: { '*': allowedStyles },
    transformTags,
  })
  // עורך ריק משאיר לרוב <p><br></p> בלבד: זה לא תוכן.
  return clean.replace(/<[^>]+>|&nbsp;|\s/g, '') === '' && !/<(img|hr)\b/.test(clean) ? '' : clean
}
