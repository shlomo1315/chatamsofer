import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAttachments } from './gilyonotSender'

const fakeDb = (files: Record<string, number>) => ({
  storage: { from: () => ({ download: async (path: string) => files[path] == null
    ? { data: null, error: { message: 'x' } }
    : { data: new Blob([new Uint8Array(files[path])]), error: null } }) },
}) as unknown as SupabaseClient

const issue = { title: 'ויגש', parasha: 'ויגש', file_path: 'gilyonot/1/a.pdf', file2_path: null as string | null }

describe('loadAttachments', () => {
  it('קובץ אחד בלבד', async () => {
    const r = await loadAttachments(fakeDb({ 'gilyonot/1/a.pdf': 10 }), issue)
    expect(r.ok && r.atts.length).toBe(1)
  })
  it('שני קבצים: השני נקרא היכלות', async () => {
    const r = await loadAttachments(fakeDb({ 'gilyonot/1/a.pdf': 10, 'gilyonot/1/heichalot.docx': 5 }), { ...issue, file2_path: 'gilyonot/1/heichalot.docx' })
    expect(r.ok && r.atts.map(a => a.filename)[1]).toBe('היכלות.docx')
  })
  it('קובץ שני חסר באחסון', async () => {
    const r = await loadAttachments(fakeDb({ 'gilyonot/1/a.pdf': 10 }), { ...issue, file2_path: 'gilyonot/1/h.pdf' })
    expect(r.ok).toBe(false)
  })
  it('הגודל המצטבר חורג מהמגבלה', async () => {
    const big = 16 * 1024 * 1024
    const r = await loadAttachments(fakeDb({ 'gilyonot/1/a.pdf': big, 'gilyonot/1/h.pdf': big }), { ...issue, file2_path: 'gilyonot/1/h.pdf' })
    expect(r.ok).toBe(false)
  })
})
