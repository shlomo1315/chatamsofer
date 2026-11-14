import { NextRequest, NextResponse } from 'next/server'
import { mailFor, type DepartmentKey } from '@/lib/departments'

// כרטיס איש קשר (vCard) לכתובת השולחת של הניוזלטר — הכפתור
// "הוסיפו את הכתובת המייל שלנו לאנשי קשר שלכם" במייל מוביל לכאן.
// נתיב ציבורי: אין בו מידע רגיש, רק שם וכתובת השולח.
function vcardText(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, m => `\\${m}`)
}

export function GET(req: NextRequest) {
  const dept = req.nextUrl.searchParams.get('d') || 'mailing'
  const { fromName, fromEmail } = mailFor(dept as DepartmentKey)

  const body = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `FN:${vcardText(fromName)}`,
    `ORG:${vcardText(fromName)}`,
    `EMAIL;TYPE=INTERNET,WORK:${fromEmail}`,
    'END:VCARD',
    '',
  ].join('\r\n')

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/vcard; charset=utf-8',
      'Content-Disposition': 'attachment; filename="contact.vcf"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
