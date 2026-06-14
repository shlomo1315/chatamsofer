'use client'
import { useState, useEffect, useCallback } from 'react'
import { DEFAULT_DOC_TYPES, type DocTypeOption } from './docTypes'

// הוק לקריאת סוגי המסמכים בצד הלקוח, עם נפילה לברירת המחדל בזמן טעינה.
export function useDocTypes() {
  const [docTypes, setDocTypes] = useState<DocTypeOption[]>(DEFAULT_DOC_TYPES)

  const reload = useCallback(() => {
    fetch('/api/doc-types')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.docTypes) && d.docTypes.length) setDocTypes(d.docTypes) })
      .catch(() => {})
  }, [])

  useEffect(() => { reload() }, [reload])

  const label = useCallback(
    (v: string) => docTypes.find(t => t.value === v)?.label ?? v,
    [docTypes],
  )

  return { docTypes, label, reload, setDocTypes }
}
