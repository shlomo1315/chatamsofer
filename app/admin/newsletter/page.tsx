import { createClient } from '@/lib/supabase/server'
import { Send } from 'lucide-react'
import NewCampaignButton from './NewCampaignButton'
import CampaignsTable, { type CampaignRow } from './CampaignsTable'

export const dynamic = 'force-dynamic'

export default async function NewsletterPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('campaigns')
    .select('id, name, subject, status, total_count, sent_count, failed_count, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const campaigns = (error ? [] : (data ?? [])) as CampaignRow[]

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">ניוזלטר</h1>
          <p className="text-sm text-slate-500">דיוור לקהלים נבחרים, עם מעקב פתיחות וקליקים</p>
        </div>
        <NewCampaignButton />
      </div>

      {error && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          הטבלאות טרם נוצרו. יש להריץ את המיגרציה{' '}
          <code className="font-mono text-xs bg-amber-100 px-1.5 py-0.5 rounded">
            20260725_newsletter.sql
          </code>
        </div>
      )}

      {!campaigns.length ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-14 text-center">
          <Send size={26} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-semibold mb-1">אין עדיין קמפיינים</p>
          <p className="text-slate-400 text-sm mb-5">צור קמפיין ראשון כדי לשלוח דיוור</p>
          <NewCampaignButton />
        </div>
      ) : (
        <CampaignsTable campaigns={campaigns} />
      )}
    </div>
  )
}
