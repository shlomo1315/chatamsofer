import { describe, expect, it } from 'vitest'
import { syncAutoSubject } from './gilyonotMail'

describe('syncAutoSubject', () => {
  it('מיישר נושא אוטומטי ישן לשם החדש', () => {
    expect(syncAutoSubject('גיליון החתם סופר · פרשת ויצא תשפ״ז', 'פרשת ויצא')).toBe('גיליון היכל החתם סופר · פרשת ויצא תשפ״ז')
    expect(syncAutoSubject('היכל החתם סופר · פרשת ויצא תשפ״ז', 'פרשת ויצא')).toBe('גיליון היכל החתם סופר · פרשת ויצא תשפ״ז')
    expect(syncAutoSubject('גיליון היכל החתם סופר · פרשת ויצא תשפ״ז', 'פרשת ויצא')).toBe('גיליון היכל החתם סופר · פרשת ויצא תשפ״ז')
  })
  it('משאיר נושא ידני', () => {
    expect(syncAutoSubject('שלום לכולם', 'פרשת ויצא')).toBe('שלום לכולם')
    expect(syncAutoSubject('גיליון החתם סופר · נושא מיוחד', 'פרשת ויצא')).toBe('גיליון החתם סופר · נושא מיוחד')
    expect(syncAutoSubject(null, 'פרשת ויצא')).toBeNull()
  })
})
