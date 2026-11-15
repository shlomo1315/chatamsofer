import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'פורטל שדכנים · מלגת שידוך',
  description: 'הרשמת שדכנים והגשת בקשת מלגה על שידוך',
  robots: { index: false, follow: false },
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function MatchmakersLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
