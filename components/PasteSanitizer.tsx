'use client'

import { useEffect } from 'react'
import { INVISIBLE_CHARS, stripInvisible } from '@/lib/searchText'

// 🔴 מנקה תווים בלתי נראים מכל הדבקה לשדה טקסט חד-שורתי, בכל המערכת.
//
// ת"ז, טלפון ומייל שמועתקים מוואטסאפ/Gmail/אקסל מגיעים לא פעם עם סימן
// כיווניות (U+200E/U+200F) מסביבם. העין לא רואה אותו, אבל:
//  • חיפוש מחזיר "לא נמצא" על תיק קיים (יולדות, 22.11.2026);
//  • מייל נשמר שבור (29 כתובות נוקו ידנית בעבר).
// יש עשרות שדות חיפוש וטפסים בנפרד, ולכן מנקים בנקודה אחת — באירוע ההדבקה.
//
// ⚠️ שדות חד-שורתיים בלבד (input). textarea ועורכי טקסט עשיר נשארים כמו
// שהם — שם סימן כיווניות יכול להיות מכוון בטקסט מעורב עברית/אנגלית.
const SKIP_TYPES = new Set(['password', 'file', 'checkbox', 'radio', 'range', 'color', 'hidden'])

export default function PasteSanitizer() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement) || SKIP_TYPES.has(el.type)) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      INVISIBLE_CHARS.lastIndex = 0
      if (!INVISIBLE_CHARS.test(text) && !text.includes(' ')) return
      const clean = stripInvisible(text)
      e.preventDefault()
      // execCommand מפעיל input event אמיתי ⇒ onChange של React רץ, וגם "בטל" עובד.
      if (document.execCommand('insertText', false, clean)) return
      // גיבוי: הכנסה ידנית + אירוע input שגם React קולט.
      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? el.value.length
      const next = el.value.slice(0, start) + clean + el.value.slice(end)
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(el, next)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    document.addEventListener('paste', onPaste, true)
    return () => document.removeEventListener('paste', onPaste, true)
  }, [])
  return null
}
