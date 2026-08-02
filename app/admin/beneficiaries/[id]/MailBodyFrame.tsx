'use client'
import { useMemo, useRef, useSyncExternalStore } from 'react'
import { sanitizeEmailHtml } from '@/lib/sanitizeEmailHtml'

// זיהוי "רצים בקליינט" ללא setState-ב-effect: useSyncExternalStore מחזיר false
// ב-SSR (getServerSnapshot) ו-true לאחר hydration — בדיוק מה שנחוץ כדי להריץ את
// DOMPurify (שדורש window) רק בקליינט, בלי אזהרת cascading-renders.
const emptySubscribe = () => () => {}
function useIsClient() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

// גוף המייל מוצג בתוך iframe מבודד — ולא דרך dangerouslySetInnerHTML.
// למה: HTML של מיילים מכיל לעיתים מבנה לא-תקין (טבלאות/תגיות לא סגורות) שהדפדפן
// "מתקן", כך שה-DOM בפועל שונה מזה ש-React רשם. כשמגיע עדכון (ריענון רשימת המיילים
// כל 20ש', מעבר בין הודעות, החלפת טאב) React מנסה להסיר צומת שכבר אינו במקום ונופל על
// "removeChild ... not a child of this node" — מה שהפיל את כל הכרטסת. iframe מבודד את
// תוכן המייל לחלוטין: React לעולם לא נוגע בצמתים שבפנים.
export default function MailBodyFrame({ html }: { html: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null)
  // הסניטציה (DOMPurify) רצה בקליינט בלבד; לכן מרנדרים ריק ב-SSR ובטעינה הראשונה,
  // ואת ה-iframe רק אחרי hydration — כך אין גם אי-התאמה ב-hydration.
  const isClient = useIsClient()

  const srcDoc = useMemo(() => {
    if (!isClient) return null
    const clean = html ? sanitizeEmailHtml(html) : ''
    const body = clean.trim() || '<p style="color:#94a3b8">אין תוכן להצגה</p>'
    return `<!doctype html><html dir="auto"><head><meta charset="utf-8">
      <base target="_blank">
      <style>
        html,body{margin:0;padding:0;font-family:system-ui,'Segoe UI',Arial,sans-serif;
          font-size:14px;line-height:1.6;color:#1e293b;word-break:break-word;}
        img{max-width:100%;height:auto;}
        a{color:#4f46e5;}
        table{max-width:100%;}
      </style></head><body>${body}</body></html>`
  }, [isClient, html])

  // התאמת גובה ה-iframe לתוכן, לאחר שהוא נטען
  const fit = () => {
    const f = ref.current
    if (!f?.contentWindow?.document?.body) return
    const h = f.contentWindow.document.body.scrollHeight
    if (h > 0) f.style.height = `${h + 24}px`
  }

  if (srcDoc == null) {
    return <div className="px-5 py-4 min-h-[200px]" />
  }

  return (
    <iframe
      ref={ref}
      srcDoc={srcDoc}
      onLoad={fit}
      title="תוכן המייל"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      className="w-full min-h-[200px] border-0 bg-white"
    />
  )
}
