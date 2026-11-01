import { describe, it, expect } from 'vitest'
import { parseDriveFolderId } from './driveLink'

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_-0123'

describe('parseDriveFolderId', () => {
  it('קישורי תיקייה רגילים', () => {
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}`)).toBe(ID)
    expect(parseDriveFolderId(`https://drive.google.com/drive/folders/${ID}?usp=sharing`)).toBe(ID)
    expect(parseDriveFolderId(`https://drive.google.com/drive/u/0/folders/${ID}`)).toBe(ID)
    expect(parseDriveFolderId(`  drive.google.com/drive/folders/${ID}  `)).toBe(ID)
  })
  it('קישור open?id ומזהה חשוף', () => {
    expect(parseDriveFolderId(`https://drive.google.com/open?id=${ID}`)).toBe(ID)
    expect(parseDriveFolderId(ID)).toBe(ID)
  })
  it('דוחה קישורים זרים וריקים', () => {
    expect(parseDriveFolderId('')).toBeNull()
    expect(parseDriveFolderId('https://evil.com/drive/folders/' + ID)).toBeNull()
    expect(parseDriveFolderId('https://drive.google.com/')).toBeNull()
    expect(parseDriveFolderId('לא קישור')).toBeNull()
  })
})
