'use client'
import { useSearchParams } from 'next/navigation'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

// כותרת המשנה של עמוד המייל — משתנה לפי המחלקה הנבחרת ב-URL.
export default function MailHeaderSubtitle() {
  const searchParams = useSearchParams()
  const key = searchParams.get('department')
  const dep = key ? DEPARTMENTS[key as DepartmentKey] : null
  return <p className="text-sm text-slate-500">{dep ? dep.email : 'כל המחלקות'}</p>
}
