import BeneficiaryForm from '../BeneficiaryForm'

// ?special=1 — פותח את הטופס במצב "אדם חריג" (מהדף אישורים חריגים):
// is_special מסומן מראש ושדות הדורות מוסתרים.
export default async function NewBeneficiaryPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const isSpecial = sp.special === '1'
  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">{isSpecial ? 'רישום אדם חריג חדש' : 'רישום צאצא חדש'}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{isSpecial ? 'אדם שאושר ידנית להגיש בקשות (אינו צאצא) — ללא סדר דורות' : 'מלא את הפרטים הנדרשים'}</p>
      </div>
      <BeneficiaryForm defaultValues={isSpecial ? { is_special: true } : undefined} />
    </div>
  )
}
