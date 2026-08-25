'use client'
import { useState } from 'react'
import IvrBuilder from './IvrBuilder'
import {
  Phone, ChevronLeft, CornerDownLeft, Hash, ListTree, PlayCircle,
  KeyRound, FileAudio, Info,
} from 'lucide-react'
import { IVR_EXTENSIONS, type IvrNode, type IvrExtension } from '@/lib/ivrMap'
import YemotMaternitySettings from './YemotMaternitySettings'
import YemotHolidaySettings from './YemotHolidaySettings'
import YemotMainMenuSettings from './YemotMainMenuSettings'

// ─────────────────────────────────────────────────────────────────────────────
// מרכז המערכת הטלפונית.
//
// 🔴 עד כה המידע היה מפוזר: ההודעות במסך נפרד לכל שלוחה, כתובת ה-webhook
// בהערה בקוד, ומה השלוחה *עושה* — רק בקוד. מי שנכנס להגדרות לא יכול היה
// לדעת אילו שלוחות קיימות בכלל.
//
// ⚠️ העץ נבנה מ-lib/ivrMap ולא מוקלד כאן: תיאור שיושב בתוך JSX מתיישן
// בשקט, ואי אפשר לבדוק אותו.
// ─────────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  menu: 'תפריט',
  input: 'קליטת הקשה',
  action: 'פעולה',
  readout: 'הקראה',
}

const KIND_STYLE: Record<string, string> = {
  menu: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  input: 'bg-amber-50 text-amber-700 ring-amber-100',
  action: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  readout: 'bg-sky-50 text-sky-700 ring-sky-100',
}

/** צומת בעץ — מוזח לפי העומק, עם קו מקשר להורה. */
function TreeNode({ node, depth }: { node: IvrNode; depth: number }) {
  return (
    <div className={depth > 0 ? 'border-r border-slate-200 pr-4' : ''}>
      <div className="flex flex-col gap-1 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {depth > 0 && <CornerDownLeft size={13} className="shrink-0 text-slate-300" />}
          <span className="text-sm font-bold text-slate-800">{node.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${KIND_STYLE[node.kind]}`}>
            {KIND_LABEL[node.kind]}
          </span>
          {node.input && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              <Hash size={10} /> {node.input}
            </span>
          )}
        </div>
        <p className="pr-1 text-xs leading-relaxed text-slate-500">{node.what}</p>
      </div>
      {node.children?.map(c => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  )
}

function ExtensionCard({ ext }: { ext: IvrExtension }) {
  const [open, setOpen] = useState(false)
  const [showMsgs, setShowMsgs] = useState(false)

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-right hover:bg-slate-50"
      >
        <ChevronLeft
          size={17}
          className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${open ? '-rotate-90' : ''}`}
        />
        <span className="flex-1">
          <span className="block text-sm font-black text-slate-900">{ext.title}</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{ext.purpose}</span>
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-slate-100 px-4 py-4">
          {/* נתוני החיבור */}
          <div className="flex flex-col gap-1.5 rounded-xl bg-slate-50 px-3.5 py-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold text-slate-600">כתובת השלוחה:</span>
              <code dir="ltr" className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-700">{ext.webhook}</code>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-bold text-slate-600">סוג בימות:</span>
              <span className="text-slate-600">{ext.yemotType}</span>
            </div>
            {ext.env.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <KeyRound size={12} className="text-slate-400" />
                <span className="font-bold text-slate-600">משתני סביבה:</span>
                {ext.env.map(e => (
                  <code key={e} dir="ltr" className="rounded bg-white px-1.5 py-0.5 text-[11px] text-slate-600">{e}</code>
                ))}
              </div>
            )}
          </div>

          {/* עץ הזרימה */}
          <div>
            <h4 className="mb-1 flex items-center gap-1.5 text-xs font-black text-slate-700">
              <ListTree size={14} className="text-slate-400" /> זרימת השיחה
            </h4>
            <div className="rounded-xl border border-slate-100 px-3 py-1">
              {ext.tree.map(n => <TreeNode key={n.id} node={n} depth={0} />)}
            </div>
          </div>

          {/* הערות תפעול */}
          {ext.notes.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-xl bg-amber-50/60 px-3.5 py-3">
              {ext.notes.map((n, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-900">
                  <Info size={12} className="mt-0.5 shrink-0" /> {n}
                </li>
              ))}
            </ul>
          )}

          {/* ההודעות והקבצים — במקום, לא במסך אחר */}
          {ext.messagesKey && (
            <div>
              <button
                onClick={() => setShowMsgs(s => !s)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
              >
                <FileAudio size={14} />
                {showMsgs ? 'סגירת ההודעות' : 'הודעות והקלטות'}
              </button>
              {showMsgs && (
                <div className="mt-3 rounded-xl border border-slate-100 p-3">
                  {ext.messagesKey === 'holiday' && <YemotHolidaySettings />}
                  {ext.messagesKey === 'maternity' && <YemotMaternitySettings />}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function PhoneSystemPanel() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="flex items-center gap-2 text-base font-black text-slate-900">
          <Phone size={17} className="text-teal-500" /> המערכת הטלפונית
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          כל השלוחות בימות המשיח — מה כל אחת עושה, זרימת השיחה, ההודעות שהמתקשר שומע
          וקבצי ההקלטה. לחצו על שלוחה לפתיחה.
        </p>
      </div>

      {/* התפריט הראשי — נקודת הכניסה, ולכן ראשון ובולט */}
      <div className="rounded-2xl border-2 border-teal-200 bg-teal-50/40 p-4">
        <h4 className="flex items-center gap-1.5 text-sm font-black text-teal-900">
          <PlayCircle size={15} /> תפריט ראשי
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-teal-800">
          נקודת הכניסה: המתקשר שומע ברכה ותפריט, ומועבר לשלוחה המתאימה.
          {' '}<strong>1</strong> חלוקות חגים · <strong>2</strong> יולדות · <strong>9</strong> הודעה כללית.
        </p>
        <div className="mt-3">
          <YemotMainMenuSettings />
        </div>
      </div>

      {/* 🔴 בונה השלוחות — כאן המנהל בונה בעצמו.
          ⚠️ מוצג לפני מפת השלוחות הקיימות: הוא הכלי הפעיל, והמפה
          שמתחתיו היא תיעוד של מה שקבוע בקוד. */}
      <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50/30 p-4">
        <h4 className="flex items-center gap-1.5 text-sm font-black text-indigo-900">
          <ListTree size={15} /> בונה השלוחות
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-indigo-800">
          כאן בונים את מבנה המערכת: שלוחות, מקשים, הודעות וקול.
          כל שינוי נכנס לתוקף מיד אחרי שמירה.
        </p>
        <div className="mt-3">
          <IvrBuilder />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* ⚠️ התפריט הראשי מוצג בכרטיס התכלת שלמעלה — סינון מונע הצגה כפולה. */}
        {IVR_EXTENSIONS.filter(e => e.id !== 'menu').map(ext => <ExtensionCard key={ext.id} ext={ext} />)}
      </div>
    </div>
  )
}
