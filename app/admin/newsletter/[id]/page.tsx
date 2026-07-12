import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import CampaignWizard, { type Campaign } from './CampaignWizard'
import CampaignStats from './CampaignStats'

export const dynamic = 'force-dynamic'

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle()
  if (error || !data) notFound()

  const campaign = data as Campaign

  // קמפיין שכבר נשלח (או בשליחה) — מציגים סטטיסטיקות במקום עורך
  const isLive = ['sending', 'paused', 'sent'].includes(campaign.status)

  return isLive
    ? <CampaignStats campaign={campaign} />
    : <CampaignWizard campaign={campaign} />
}
