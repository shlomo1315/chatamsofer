import Script from 'next/script'
import { loadPublicTexts } from '@/lib/publicTextsStore'
import PublicPortalPage from './PublicPortalPage'

// ─────────────────────────────────────────────────────────────────────────────
// עטיפת שרת דקה לממשק הציבורי.
//
// קיימת רק כדי לטעון את נוסחי ה-CMS ולהזרים אותם לקומפוננטת הלקוח.
// הטעינה מגיעה ממטמון בזיכרון (publicTextsStore), ולכן אינה מוסיפה
// שאילתה בכל טעינת עמוד — חשוב כאן, אחרי תיקון האיטיות במסך הזה.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic'

// מזהה המדידה של Google Analytics 4 עבור הדף הציבורי.
const GA_MEASUREMENT_ID = 'G-87874818HK'

export default async function Page() {
  const texts = await loadPublicTexts()
  return (
    <>
      {/* Google tag (gtag.js) — נטען דרך next/script ולא כתגית <script> גולמית,
          כדי ש-Next ידחה אותו ל-afterInteractive: הסקריפט לא חוסם את הרינדור
          הראשוני של הדף. ממוקם כאן ולא ב-layout בכוונה — כך המדידה מכסה את
          הממשק הציבורי בלבד, ומסכי הניהול והפורטל לא מזהמים את הנתונים. */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());

          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
      <PublicPortalPage texts={texts} />
    </>
  )
}
