'use client'
import { useState } from 'react'
import { Loader2, Mail, Send, AlertTriangle } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { voucherLabel, voucherPromptText, type VoucherPromptPlan } from '@/lib/maternityVoucherPrompt'

// דיאלוג "לשלוח ליולדת שובר מעודכן?" — נפתח אחרי שינוי שמשפיע על השוברים.
//
// ⚠️ השליחה אינה אוטומטית בכוונה: המזכיר יודע אם המשפחה כבר קיבלה,
// אם מדובר בתיקון טכני, או אם עדיף להתקשר. השאלה היא ההחלטה.

interface Props {
  open: boolean
  aidId: string
  plan: VoucherPromptPlan
  /** נקרא תמיד בסיום — גם בדילוג, גם אחרי שליחה */
  onDone: () => void
}

export default function SendVouchersDialog({ open, aidId, plan, onDone }: Props) {
  const toast = useToast()
  const [sending, setSending] = useState(false)

  const send = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/admin/maternity/send-vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aidId, kinds: plan.kinds }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'השליחה נכשלה')
      toast.success('השוברים נשלחו ליולדת')
      onDone()
    } catch (e) {
      // ⚠️ נשאר פתוח בכישלון — סגירה הייתה נראית כמו הצלחה.
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onDone}
      title="השינויים נשמרו"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onDone}
            disabled={sending}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            לא לשלוח
          </button>
          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sending ? 'שולח…' : 'שלח ליולדת'}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <Mail size={17} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{voucherPromptText(plan.kinds)}</p>

          {plan.changes.length > 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1.5 text-xs font-semibold text-slate-500">מה השתנה</p>
              <ul className="flex flex-col gap-1">
                {plan.changes.map((ch, i) => (
                  <li key={i} className="text-sm text-slate-700">· {ch}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            יישלחו: {plan.kinds.map(voucherLabel).join(' · ')}
          </p>

          {/* ⚠️ ביטול הטבה אינו מייצר שובר, אבל חשוב שייראה — אחרת נראה
              כאילו המערכת התעלמה מהשינוי. */}
          {plan.removals.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
              <p className="text-xs text-amber-900">
                {plan.removals.join(' · ')} — לא נשלח שובר על הטבה שבוטלה.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
