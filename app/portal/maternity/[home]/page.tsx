import PortalApp from './PortalApp'

export default async function RecoveryHomePortal({
  params,
}: {
  params: Promise<{ home: string }>
}) {
  const { home: homeEncoded } = await params
  const homeName = decodeURIComponent(homeEncoded)
  return <PortalApp home={homeName} />
}
