'use client'

// בחירת מחלקה לפני חיבור תיבת Gmail — כל תיבה משויכת למחלקה,
// וכל מייל שנקלט ממנה מסומן במחלקה הזו.
import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowRight, Link2 } from 'lucide-react'
import { DEPARTMENTS, type DepartmentKey } from '@/lib/departments'

export default function ConnectMailboxPage() {
  const [department, setDepartment] = useState<DepartmentKey | ''>('')
  const [label, setLabel] = useState('')

  const departments = Object.values(DEPARTMENTS)

  function connect() {
    if (!department) return
    const params = new URLSearchParams({ department, label: label.trim() })
    window.location.href = `/api/auth/gmail-legacy?${params}`
  }

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <Link href="/admin/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-5">
        <ArrowRight size={15} /> חזרה להגדרות
      </Link>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Mail size={20} className="text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">חיבור תיבת מייל</h1>
            <p className="text-xs text-slate-500">סנכרון ארכיון ממייל Gmail קיים</p>
          </div>
        </div>

        <p className="text-sm text-slate-600 leading-relaxed my-5">
          בחר לאיזו מחלקה שייכת התיבה שאתה עומד לחבר.
          כל המיילים שייקלטו ממנה ישויכו למחלקה הזו, ויופיעו בארכיון שלה.
        </p>

        {/* בחירת מחלקה */}
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          מחלקה <span className="text-rose-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-2 mb-5">
          {departments.map(d => (
            <button
              key={d.key}
              type="button"
              onClick={() => setDepartment(d.key)}
              className={`text-right rounded-xl border px-3.5 py-3 transition-colors ${
                department === d.key
                  ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-200'
                  : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: d.color }}
                />
                <span className="font-semibold text-sm text-slate-800">{d.label}</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5 truncate">{d.email}</div>
            </button>
          ))}
        </div>

        {/* שם תצוגה */}
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          שם לתיבה <span className="font-normal text-slate-400">(אופציונלי)</span>
        </label>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value.slice(0, 60))}
          placeholder="למשל: מייל הודעות ישן"
          className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm mb-6
                     focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        />

        <button
          type="button"
          onClick={connect}
          disabled={!department}
          className="w-full rounded-xl bg-indigo-600 text-white py-3 text-sm font-bold
                     hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed
                     transition flex items-center justify-center gap-2"
        >
          <Link2 size={16} />
          המשך לחיבור עם Google
        </button>

        <p className="text-xs text-slate-400 mt-4 leading-relaxed">
          תופנה לאישור של Google. ההרשאה היא <strong>קריאה בלבד</strong> — המערכת לא תוכל
          לשלוח או למחוק מיילים מהתיבה הזו.
        </p>
      </div>
    </div>
  )
}
