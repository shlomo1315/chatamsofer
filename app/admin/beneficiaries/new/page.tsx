import BeneficiaryForm from '../BeneficiaryForm'

export default function NewBeneficiaryPage() {
  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-slate-900">רישום צאצא חדש</h1>
        <p className="text-sm text-slate-500 mt-0.5">מלא את הפרטים הנדרשים</p>
      </div>
      <BeneficiaryForm />
    </div>
  )
}
