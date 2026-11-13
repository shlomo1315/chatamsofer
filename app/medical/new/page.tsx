import type { Metadata } from 'next'
import AidWizard from '../AidWizard'
import { isDepartmentAccessible, closedMessageFor } from '@/lib/departmentGates'

export const metadata: Metadata = {
  title: 'בקשת סיוע | איגוד צאצאי החתם סופר',
  description: 'טופס בקשת סיוע ממחלקת הסיוע, בלי הרשמה ובלי סיסמה: פרטים אישיים, משפחה, הכנסות, סיבת הבקשה ומסמכים.',
}

export const dynamic = 'force-dynamic'

// קישור משותף להגשה, בלי כניסה. השמירה: /api/medical/submit.
// כשהמחלקה סגורה מציגים הודעה במקום הטופס, כדי שלא ימלאו הכול לחינם.
export default async function Page({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  if (!(await isDepartmentAccessible('financial_aid', preview))) {
    return (
      <main dir="rtl" style={{ maxWidth: 560, margin: '80px auto', padding: '0 20px', textAlign: 'center', lineHeight: 1.8 }}>
        <p role="alert" style={{ color: '#9a3b2a', fontWeight: 600 }}>{await closedMessageFor('financial_aid')}</p>
      </main>
    )
  }
  return <AidWizard />
}
