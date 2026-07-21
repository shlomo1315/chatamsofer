'use client'

import { createContext, useContext, useCallback, useState, useRef, useEffect } from 'react'
import { textOf, type PublicTexts } from '@/lib/publicTexts'

// ─────────────────────────────────────────────────────────────────────────────
// עריכה חיה של נוסחי הממשק הציבורי.
//
// אותו עמוד ציבורי בדיוק — כשהוא נטען דרך /edit ע"י מנהל, כל טקסט עטוף
// הופך לניתן ללחיצה ולעריכה במקום. במצב רגיל (כל הגולשים) הקומפוננטה
// מרנדרת טקסט פשוט, בלי שום תוספת DOM ובלי עלות.
// ─────────────────────────────────────────────────────────────────────────────

interface EditCtx {
  editing: boolean
  texts: PublicTexts
  setKey: (key: string, value: string) => void
}

const Ctx = createContext<EditCtx>({ editing: false, texts: {}, setKey: () => {} })

export function EditProvider({
  editing, texts, setKey, children,
}: EditCtx & { children: React.ReactNode }) {
  return <Ctx.Provider value={{ editing, texts, setKey }}>{children}</Ctx.Provider>
}

/** t(key) — הנוסח האפקטיבי. לשימוש היכן שנדרשת מחרוזת ולא JSX (placeholder וכו'). */
export function useText() {
  const { texts } = useContext(Ctx)
  return useCallback((key: string) => textOf(texts, key), [texts])
}

export function useEditMode() {
  return useContext(Ctx).editing
}

/**
 * טקסט שניתן לעריכה במקום.
 *
 * ⚠️ contentEditable אינו נשלט ע"י React: אם נזרים לתוכו value בכל הקלדה,
 * הסמן יקפוץ לתחילת השורה אחרי כל תו. לכן הטקסט ההתחלתי נכתב פעם אחת,
 * והשינויים נקראים מה-DOM ב-onInput בלבד.
 */
export default function EditableText({ k, as = 'span', className = '' }: {
  k: string
  as?: 'span' | 'h2' | 'h3' | 'p' | 'div'
  className?: string
}) {
  const { editing, texts, setKey } = useContext(Ctx)
  const value = textOf(texts, k)
  const ref = useRef<HTMLElement | null>(null)
  const [focused, setFocused] = useState(false)

  // מסנכרן מה-DOM רק כשהעריכה לא פעילה — כדי לא להזיז את הסמן תוך כדי הקלדה.
  useEffect(() => {
    if (!editing || focused) return
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value
    }
  }, [editing, focused, value])

  const Tag = as as React.ElementType

  if (!editing) return <Tag className={className}>{value}</Tag>

  return (
    <Tag
      ref={ref}
      className={`${className} outline-none rounded transition-colors cursor-text ring-1 ring-indigo-300 hover:ring-indigo-500 hover:bg-indigo-50/40 focus:ring-2 focus:ring-indigo-500 focus:bg-white`}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      title="לחץ לעריכה"
      onFocus={() => setFocused(true)}
      onBlur={(e: React.FocusEvent<HTMLElement>) => { setFocused(false); setKey(k, e.currentTarget.textContent ?? '') }}
      onInput={(e: React.FormEvent<HTMLElement>) => setKey(k, e.currentTarget.textContent ?? '')}
      // Enter מסיים עריכה במקום להוסיף שורה — הנוסחים כאן הם חד-שורתיים.
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
    >
      {value}
    </Tag>
  )
}
