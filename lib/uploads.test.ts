import { describe, it, expect } from 'vitest'
import { uploadExt, uploadFileError } from './uploads'

const MB = 1024 * 1024

describe('uploadFileError — אותה רשימה ללקוח ולשרת', () => {
  it('מקבל את מה שהפורטל מבטיח: תמונה, Word ו-PDF', () => {
    for (const name of ['a.jpg', 'a.JPEG', 'a.png', 'a.pdf', 'a.doc', 'a.docx', 'a.heic']) {
      expect(uploadFileError({ name, size: MB })).toBeNull()
    }
  })

  it('מקבל jfif — מה ש-WhatsApp Web שומר', () => {
    expect(uploadFileError({ name: 'ת״ז.jfif', size: MB })).toBeNull()
  })

  it('קובץ בלי סיומת נשען על ה-MIME', () => {
    expect(uploadExt('image', 'image/jpeg')).toBe('jpg')
    expect(uploadFileError({ name: 'image', size: MB, type: 'image/jpeg' })).toBeNull()
  })

  it('דוחה קובץ גדול מ-10MB עם הודעה ברורה', () => {
    expect(uploadFileError({ name: 'scan.pdf', size: 11 * MB })).toMatch(/גדול מ-10MB/)
  })

  it('דוחה סוג שאינו נתמך', () => {
    expect(uploadFileError({ name: 'a.exe', size: MB })).toMatch(/אינו נתמך/)
    expect(uploadFileError({ name: 'a.zip', size: MB, type: 'application/zip' })).toMatch(/אינו נתמך/)
  })
})
