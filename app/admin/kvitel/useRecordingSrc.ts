'use client'
import { useEffect, useState } from 'react'
import { storagePath } from '@/lib/docUrl'
import { loadDocBlob } from '@/lib/docBlob'

// כתובת להשמעת הקלטה. הקלטה ששמורה בדלי הפרטי (צרופת מייל של שאלון טלפוני) לא נפתחת
// בכתובת הציבורית, ולכן נטענת דרך ערוץ הנתונים (/api/files/data) ומושמעת מ-blob מקומי.
// הקלטה בכתובת אחרת (http או יחסית) מושמעת ישירות.
export function useRecordingSrc(url: string | null | undefined): { src: string | null; playable: boolean; failed: boolean } {
  const stored = !!url && storagePath(url) !== url
  const playable = !!url && (stored || /^(https?:|\/)/.test(url))
  const [blob, setBlob] = useState<{ url: string; src: string | null; failed: boolean } | null>(null)
  useEffect(() => {
    if (!stored || !url) return
    let alive = true
    loadDocBlob(url)
      .then(d => { if (alive) setBlob({ url, src: d.objectUrl, failed: false }) })
      .catch(() => { if (alive) setBlob({ url, src: null, failed: true }) })
    return () => { alive = false }
  }, [stored, url])
  if (!stored) return { src: playable ? url! : null, playable, failed: false }
  const cur = blob?.url === url ? blob : null
  return { src: cur?.src ?? null, playable, failed: !!cur?.failed }
}
