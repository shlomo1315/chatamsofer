import { Mail } from 'lucide-react'
import MailClient from './MailClient'

export default function MailPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
          <Mail size={20} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">מייל</h1>
          <p className="text-sm text-slate-500">office@chasamsofer.info</p>
        </div>
      </div>
      <MailClient />
    </div>
  )
}
