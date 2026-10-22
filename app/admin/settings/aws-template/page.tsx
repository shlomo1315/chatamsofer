export const metadata = { title: 'תבנית הקמה ל-AWS' }

export default function AwsTemplatePage() {
  return (
    <div className="mx-auto max-w-xl p-6 space-y-4" dir="rtl">
      <h1 className="text-2xl font-bold">תבנית הקמה ל-AWS</h1>
      <p className="text-gray-600">
        הקובץ infrastructure.yml להקמת האתר ב-AWS דרך CloudFormation (Create stack ← Upload a template file).
        משאירים את CertificateArn ריק לבדיקה בכתובת זמנית.
      </p>
      <a
        href="/api/admin/aws-template"
        download="infrastructure.yml"
        className="inline-block rounded-lg bg-blue-700 px-5 py-3 font-medium text-white hover:bg-blue-800"
      >
        הורד infrastructure.yml
      </a>
    </div>
  )
}
