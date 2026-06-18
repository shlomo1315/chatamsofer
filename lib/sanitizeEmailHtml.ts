import DOMPurify from 'dompurify'

// סניטציה של HTML שמגיע ממיילים נכנסים — מונעת הרצת סקריפטים זדוניים (XSS) בדפדפן של הצוות.
// לשימוש בקומפוננטות client בלבד.
let hookInstalled = false
function installHook() {
  if (hookInstalled || typeof window === 'undefined') return
  hookInstalled = true
  // כל קישור שנפתח בלשונית חדשה יקבל rel=noopener — מניעת reverse tab-nabbing
  // (קישור במייל זדוני שמשנה את הלשונית של אפליקציית הניהול לדף פישינג).
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node instanceof HTMLElement && node.tagName === 'A' && node.getAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })
}

export function sanitizeEmailHtml(html: string): string {
  if (typeof window === 'undefined') return ''
  installHook()
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['form', 'input', 'button', 'iframe', 'style', 'object', 'embed', 'base'],
    FORBID_ATTR: ['srcdoc', 'ping'],
  })
}
