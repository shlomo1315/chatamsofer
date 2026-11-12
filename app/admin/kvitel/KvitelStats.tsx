'use client'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Clock, Send, Mail } from 'lucide-react'
import StatStrip from '@/components/admin/system/StatStrip'

type Key = 'review' | 'pending' | 'done' | 'mail'
const HREF: Record<Key, string> = {
  review: '/admin/kvitel?tab=requests&status=review',
  pending: '/admin/kvitel?tab=requests&status=pending',
  done: '/admin/kvitel?tab=requests&status=done',
  mail: '/admin/kvitel?tab=mail',
}

// מונים בראש הסקירה: אותו רכיב StatStrip של שאר מסכי הניהול. לחיצה פותחת את הלשונית המתאימה.
export default function KvitelStats({ review, pending, done, unreadMail }: { review: number; pending: number; done: number; unreadMail: number }) {
  const router = useRouter()
  return (
    <StatStrip<Key>
      active={'' as Key}
      onSelect={k => router.push(HREF[k])}
      items={[
        { key: 'review', label: 'דורש בדיקה', count: review, icon: AlertTriangle },
        { key: 'pending', label: 'ממתין לשליחה', count: pending, icon: Clock },
        { key: 'done', label: 'נשלח לציון', count: done, icon: Send },
        { key: 'mail', label: 'מיילים שלא נקראו', count: unreadMail, icon: Mail },
      ]}
    />
  )
}
