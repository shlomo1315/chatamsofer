import { describe, it, expect } from 'vitest'
import {
  hebrewFromIso, filterEvents, groupByYear, latestEvent, safeFileName, detectKind,
  formatBytes, formatDuration, isEventType, type ArchiveEvent,
} from './archive'

const ev = (o: Partial<ArchiveEvent>): ArchiveEvent => ({
  id: 'x', name: 'אירוע', event_date: '2026-10-16', hebrew_date: 'ד׳ חשוון', hebrew_year: 'תשפ״ז',
  event_type: 'כינוס', place: null, description: null, photo_count: 0, video_count: 0,
  cover_file_ids: [], drive_folder_id: null, ...o,
})

describe('hebrewFromIso', () => {
  it('מחשב תאריך ושנה עבריים', () => {
    const h = hebrewFromIso('2026-10-16')!
    expect(h.year).toBe('תשפ״ז')
    expect(h.date).toContain('חשון')
    expect(h.date).toContain('תשפ״ז')
  })
  it('דוחה תאריך לא תקין', () => {
    expect(hebrewFromIso('2026-13-40')).toBeNull()
    expect(hebrewFromIso('abc')).toBeNull()
  })
})

describe('סינון וקיבוץ', () => {
  const list = [
    ev({ id: '1', name: 'הילולת מרן', event_type: 'הילולא', event_date: '2026-10-16' }),
    ev({ id: '2', name: 'סיום הש״ס', event_type: 'סיום', event_date: '2025-09-01', hebrew_year: 'תשפ״ה', place: 'היכל' }),
    ev({ id: '3', name: 'כינוס צאצאים', event_date: '2026-05-01', hebrew_year: 'תשפ״ו' }),
  ]
  it('לפי שנה', () => expect(filterEvents(list, { year: 'תשפ״ה', type: null, q: '' }).map(e => e.id)).toEqual(['2']))
  it('לפי סוג', () => expect(filterEvents(list, { year: null, type: 'הילולא', q: '' }).map(e => e.id)).toEqual(['1']))
  it('חיפוש חופשי כולל מקום', () => expect(filterEvents(list, { year: null, type: null, q: 'היכל' }).map(e => e.id)).toEqual(['2']))
  it('קיבוץ מהחדש לישן', () => {
    expect(groupByYear(list).map(g => g.year)).toEqual(['תשפ״ז', 'תשפ״ו', 'תשפ״ה'])
  })
  it('האירוע האחרון', () => {
    expect(latestEvent(list)!.id).toBe('1')
    expect(latestEvent([])).toBeNull()
  })
})

describe('קבצים', () => {
  it('שם בטוח', () => {
    expect(safeFileName('../a/b\\c".jpg')).toBe('.._a_b_c_.jpg')
    expect(safeFileName('   ')).toBe('file')
  })
  it('זיהוי סוג', () => {
    expect(detectKind('a.JPG', '')).toBe('image')
    expect(detectKind('a.mov', null)).toBe('video')
    expect(detectKind('a.bin', 'video/mp4')).toBe('video')
    expect(detectKind('a.pdf', 'application/pdf')).toBeNull()
  })
  it('עיצוב גודל ומשך', () => {
    expect(formatBytes(1932735283)).toBe('1.8GB')
    expect(formatDuration(134)).toBe('2:14')
    expect(formatDuration(null)).toBe('')
  })
  it('סוג אירוע', () => {
    expect(isEventType('סיום')).toBe(true)
    expect(isEventType('אחר-לגמרי')).toBe(false)
  })
})
