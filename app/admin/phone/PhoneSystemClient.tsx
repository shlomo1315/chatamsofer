'use client'
import { useState } from 'react'
import {
  Phone, PhoneOutgoing, ChevronLeft, Hash, ListTree, PlayCircle,
  KeyRound, Copy, Check, MessageSquare, Settings2, History,
} from 'lucide-react'
import { IVR_EXTENSIONS, type IvrNode, type IvrExtension } from '@/lib/ivrMap'
import { mainPathTitles } from '@/lib/ivrSteps'
import YemotMaternitySettings from '@/app/admin/settings/YemotMaternitySettings'
import YemotHolidaySettings from '@/app/admin/settings/YemotHolidaySettings'
import YemotMainMenuSettings from '@/app/admin/settings/YemotMainMenuSettings'
import YemotCallLog from '@/app/admin/settings/YemotCallLog'
import RegistrationCallSettings from '@/app/admin/settings/RegistrationCallSettings'

// ─────────────────────────────────────────────────────────────────────────────
// עץ השלוחות ומסך השלוחה.
//
// ⚠️ הכל נבנה מ-lib/ivrMap ולא מוקלד כאן: תיאור שיושב בתוך JSX מתיישן
// בשקט ואי אפשר לבדוק אותו. המפה נעולה בטסטים (lib/ivrMap.test.ts).
//
// 🔴 שיחות יוצאות מופרדות מהתפריט. אלה מסלולים שבהם *אנחנו* מחייגים אל
// המשפחה — קוד אימות והודעת אישור — ולא היא אלינו. הצגתן בעץ התפריט
// הייתה מתארת מסלול שאיש אינו עובר.
// ─────────────────────────────────────────────────────────────────────────────

const KIND_LABEL: Record<string, string> = {
  menu: 'תפריט', input: 'קליטת הקשה', action: 'פעולה', readout: 'הקראה',
}
const KIND_STYLE: Record<string, string> = {
  menu: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  input: 'bg-amber-50 text-amber-700 border-amber-200',
  action: 'bg-slate-100 text-slate-600 border-slate-200',
  readout: 'bg-teal-50 text-teal-700 border-teal-200',
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://chasamsofer.co.il'

/** צומת בעץ — נפרש רקורסיבית. */
function TreeNode({ node, depth = 0 }: { node: IvrNode; depth?: number }) {
  return (
    <li className={depth ? 'border-r border-slate-200 pr-3' : ''}>
      <div className="flex flex-wrap items-center gap-1.5 py-1">
        <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${KIND_STYLE[node.kind]}`}>
          {KIND_LABEL[node.kind]}
        </span>
        <span className="text-[13px] font-bold text-slate-800">{node.title}</span>
        {node.input && (
          <span className="inline-flex items-center gap-0.5 rounded-md bg-slate-900 px-1.5 py-0.5 font-mono text-[10px] text-white">
            <Hash size={9} />{node.input}
          </span>
        )}
      </div>
      <p className="pb-1.5 text-[11.5px] leading-relaxed text-slate-500">{node.what}</p>
      {node.children?.length ? (
        <ul className="flex flex-col gap-0.5">
          {node.children.map(c => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
        </ul>
      ) : null}
    </li>
  )
}

/** כפתור העתקת הכתובת — ⚠️ הכתובת המלאה, כדי שאפשר יהיה להדביק בימות כמו שהיא. */
function CopyUrl({ path }: { path: string }) {
  const [done, setDone] = useState(false)
  if (path === '—') return null
  const full = `${SITE}${path}`
  return (
    <button type="button"
      onClick={() => {
        navigator.clipboard?.writeText(full).then(() => {
          setDone(true); setTimeout(() => setDone(false), 1500)
        }).catch(() => {})
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-[11px] text-slate-600 hover:bg-slate-50">
      {done ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
      <span dir="ltr">{full}</span>
    </button>
  )
}

/** כרטיס שלוחה ברשימה. */
function ExtCard({ ext, onOpen }: { ext: IvrExtension; onOpen: () => void }) {
  const Icon = ext.outbound ? PhoneOutgoing : Phone
  const steps = mainPathTitles(ext.tree)
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-right transition-colors hover:border-teal-300 hover:bg-teal-50/30">
      {/* 🔴 מספר ההקשה במקום האייקון — זו השאלה הראשונה שנשאלת על שלוחה
          ("איך מגיעים לשם"), והיא הייתה חסרה לגמרי מהמסך. */}
      {ext.digit ? (
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-900 font-mono text-sm font-extrabold text-white">
          {ext.digit}
        </div>
      ) : (
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
          ext.outbound ? 'bg-violet-50' : 'bg-teal-50'}`}>
          <Icon size={16} className={ext.outbound ? 'text-violet-600' : 'text-teal-600'} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-extrabold text-slate-900">{ext.title}</h3>
          {ext.messagesKey && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
              הודעות לעריכה
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{ext.purpose}</p>

        {/* 🔴 שרשרת השלבים — כדי לראות את המבנה בלי להיכנס לשלוחה.
            ⚠️ רק המסלול הראשי (הילד הראשון בכל רמה): הצגת כל הענפים
            הופכת את הכרטיס לקיר טקסט, ואת הרשימה לבלתי-קריאה. */}
        {steps.length > 1 && (
          <p className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-slate-400">
            {steps.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                {i > 0 && <ChevronLeft size={10} className="text-slate-300" />}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{s}</span>
              </span>
            ))}
          </p>
        )}
      </div>
      <ChevronLeft size={16} className="mt-1 flex-shrink-0 text-slate-300" />
    </button>
  )
}

type Tab = 'messages' | 'tree' | 'settings'

export default function PhoneSystemClient() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('messages')
  const [showLog, setShowLog] = useState(false)

  const ext = IVR_EXTENSIONS.find(e => e.id === openId) ?? null

  // ── רשימת השלוחות ──
  if (!ext) {
    const inbound = IVR_EXTENSIONS.filter(e => !e.outbound)
    const outbound = IVR_EXTENSIONS.filter(e => e.outbound)
    return (
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-700">
            <Phone size={14} className="text-teal-600" /> שלוחות — מה שומע מי שמחייג
          </h2>
          {inbound.map(e => (
            <ExtCard key={e.id} ext={e} onOpen={() => { setOpenId(e.id); setTab('messages') }} />
          ))}
        </section>

        {/* 🔴 מופרד במכוון — ראו ההערה בראש הקובץ. */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-700">
            <PhoneOutgoing size={14} className="text-violet-600" /> שיחות יוצאות — מה שאנחנו מחייגים
          </h2>
          <p className="-mt-1 mb-1 text-[11.5px] leading-relaxed text-slate-500">
            אלה אינם חלק מהתפריט: המשפחה אינה מחייגת אלינו אלא מקבלת מאיתנו שיחה.
          </p>
          {outbound.map(e => (
            <ExtCard key={e.id} ext={e}
              onOpen={() => {
                setOpenId(e.id)
                // ⚠️ להודעת האישור יש הקלטה לעריכה — נפתחת עליה. לקוד
                // האימות אין (הוא מקריא קוד שנוצר בזמן אמת), ולכן שם
                // המבנה הוא מה שיש להראות.
                setTab(e.id === 'announce' ? 'messages' : 'tree')
              }} />
          ))}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <button type="button" onClick={() => setShowLog(v => !v)}
            className="flex w-full items-center gap-2 px-4 py-3 text-right text-[13px] font-extrabold text-slate-700 hover:bg-slate-50">
            <History size={14} className="text-slate-400" /> יומן שיחות
            <ChevronLeft size={15} className={`mr-auto text-slate-300 transition-transform ${showLog ? '-rotate-90' : ''}`} />
          </button>
          {showLog && <div className="border-t border-slate-200 p-4"><YemotCallLog /></div>}
        </section>
      </div>
    )
  }

  // ── מסך שלוחה ──
  // ⚠️ ההודעות לעריכה קיימות רק לחלק מהשלוחות; ללא כאלה הלשונית אינה מוצגת
  // כלל, במקום להציג לשונית ריקה שנראית כתקלה.
  // ⚠️ 'announce' נכלל אף שאין לו messagesKey: ההקלטה שלו נערכת
  // ב-RegistrationCallSettings, וזו הודעה לכל דבר מבחינת המנהל.
  const hasMessages = ext.id === 'menu' || ext.id === 'announce' || !!ext.messagesKey
  const tabs: { key: Tab; label: string; icon: typeof MessageSquare }[] = [
    ...(hasMessages ? [{ key: 'messages' as Tab, label: 'הודעות', icon: MessageSquare }] : []),
    { key: 'tree', label: 'מבנה השיחה', icon: ListTree },
    { key: 'settings', label: 'הגדרות', icon: Settings2 },
  ]
  const active = tabs.some(t => t.key === tab) ? tab : tabs[0].key

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setOpenId(null)}
        className="inline-flex w-fit items-center gap-1 text-[13px] font-bold text-slate-500 hover:text-slate-700">
        <ChevronLeft size={15} className="rotate-180" /> חזרה לכל השלוחות
      </button>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          {ext.outbound
            ? <PhoneOutgoing size={17} className="text-violet-600" />
            : <Phone size={17} className="text-teal-600" />}
          <h2 className="text-base font-extrabold text-slate-900">{ext.title}</h2>
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{ext.purpose}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${
              active === t.key
                ? 'border-teal-300 bg-teal-50 text-teal-800'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      {active === 'messages' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {ext.id === 'menu' && <YemotMainMenuSettings />}
          {ext.id === 'announce' && <RegistrationCallSettings />}
          {ext.messagesKey === 'holiday' && <YemotHolidaySettings />}
          {ext.messagesKey === 'maternity' && <YemotMaternitySettings />}
        </div>
      )}

      {active === 'tree' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <ul className="flex flex-col gap-1">
            {ext.tree.map(n => <TreeNode key={n.id} node={n} />)}
          </ul>
        </div>
      )}

      {active === 'settings' && (
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-extrabold text-slate-700">
              <PlayCircle size={14} className="text-slate-400" /> הגדרה בימות
            </h3>
            <p className="mb-2 text-[12px] text-slate-600">{ext.yemotType}</p>
            <CopyUrl path={ext.webhook} />
            {ext.webhook === '—' && (
              <p className="text-[11.5px] text-slate-500">
                אין כתובת — ימות מנגנת קובץ שהועלה מראש, ואינה פונה לשרת באמצע השיחה.
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[13px] font-extrabold text-slate-700">
              <KeyRound size={14} className="text-slate-400" /> משתני סביבה
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {ext.env.map(v => (
                <span key={v} className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-700" dir="ltr">
                  {v}
                </span>
              ))}
            </div>
          </div>

          {ext.notes.length > 0 && (
            <ul className="flex flex-col gap-1.5 rounded-xl bg-slate-50 p-3">
              {ext.notes.map((n, i) => (
                <li key={i} className="text-[11.5px] leading-relaxed text-slate-600">· {n}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
