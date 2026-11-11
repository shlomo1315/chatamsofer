import type { Metadata } from 'next'
import AidWizard from '../AidWizard'

export const metadata: Metadata = {
  title: 'בקשת סיוע | איגוד צאצאי החתם סופר',
  description: 'טופס בקשת סיוע ממחלקת הסיוע, בלי הרשמה ובלי סיסמה: פרטים אישיים, משפחה, הכנסות, סיבת הבקשה ומסמכים.',
}

// קישור משותף להגשה, בלי כניסה. השמירה: /api/medical/submit.
export default function Page() {
  return <AidWizard />
}
