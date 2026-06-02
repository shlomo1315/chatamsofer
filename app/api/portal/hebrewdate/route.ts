import { NextResponse } from 'next/server'
import { HDate, HebrewCalendar, gematriya } from '@hebcal/core'

export const dynamic = 'force-dynamic'

// Replace maqaf (Hebrew hyphen ־) with space first, then strip all diacritics
const strip = (s: string) => s.replace(/־/g, ' ').replace(/[֑-ׇ]/g, '')

export async function GET() {
  try {
    const today = new HDate(new Date())

    const hebrewDate = today.renderGematriya()

    let parasha = ''
    let d = today
    for (let i = 0; i <= 7; i++) {
      const events = HebrewCalendar.calendar({ start: d, end: d, sedrot: true, il: true, locale: 'he' })
      const sedra = events.find(e => e.getDesc().startsWith('Parashat'))
      if (sedra) { parasha = sedra.render('he'); break }
      d = new HDate(d.abs() + 1)
    }

    const hebrewYear = gematriya(today.getFullYear())

    return NextResponse.json({
      hebrewDate: strip(hebrewDate),
      parasha: strip(parasha),
      hebrewYear: strip(hebrewYear),
    })
  } catch {
    return NextResponse.json({ hebrewDate: '', parasha: '', hebrewYear: '' })
  }
}
