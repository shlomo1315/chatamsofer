import DOMPurify from 'dompurify'

// סניטציה של HTML שמגיע ממיילים נכנסים — מונעת הרצת סקריפטים זדוניים (XSS) בדפדפן של הצוות.
// לשימוש בקומפוננטות client בלבד.
export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['form', 'input', 'button'],
  })
}
