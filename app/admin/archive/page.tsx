import { guardPage } from '@/lib/pageGuard'
import { getServiceClient } from '@/lib/apiAuth'
import { roleAllows } from '@/lib/permissions'
import { driveReady } from '@/lib/googleDrive'
import type { ArchiveEvent } from '@/lib/archive'
import type { UserPermissions } from '@/types'
import ArchiveClient from './ArchiveClient'

// מחלקת הארכיון — תמונות וסרטונים של מעמדים ואירועים. הקבצים ב-Drive, המוקטנים בדיסק השרת, הכול מוגש מהדומיין שלנו (נטפרי).
// לוגיקה: lib/archive.ts · API: app/api/admin/archive · מיגרציה: 20261101_archive.sql
export const dynamic = 'force-dynamic'
export const metadata = { title: 'ארכיון' }

export default async function Page() {
  const staff = await guardPage('archive')
  const db = getServiceClient()
  const perms = staff.permissions as UserPermissions
  const can = (a: 'add' | 'edit') => staff.role === 'admin' || roleAllows(staff.role, perms, 'archive', a)
  let events: ArchiveEvent[] = []
  let error: string | null = null
  if (!db) error = 'השרת אינו מוגדר'
  else {
    const { data, error: e } = await db.from('archive_events')
      .select('id,name,event_date,hebrew_date,hebrew_year,event_type,place,description,photo_count,video_count,cover_file_ids,drive_folder_id')
      .order('event_date', { ascending: false }).limit(2000)
    if (e) error = 'טעינת הארכיון נכשלה (ייתכן שהמיגרציה עוד לא רצה)'
    events = (data ?? []) as ArchiveEvent[]
  }
  const drive = await driveReady().catch(() => false)
  return <ArchiveClient initialEvents={events} canAdd={can('add')} canEdit={can('edit')} driveConnected={drive} loadError={error} />
}
