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

export default async function Page() {
  const texts = await loadPublicTexts()
  return <PublicPortalPage texts={texts} />
}
