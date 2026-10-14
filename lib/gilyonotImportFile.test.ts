import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { parseImportText } from './gilyonot'
import { decodeTextFile, dropHeaderRow, importFileKind, xlsxToImportText } from './gilyonotImportFile'

describe('העלאת קובץ רשימת תפוצה', () => {
  it('מזהה סוג קובץ לפי סיומת', () => {
    expect(importFileKind('רשימה.XLSX')).toBe('xlsx')
    expect(importFileKind('list.csv')).toBe('text')
    expect(importFileKind('list.xls')).toBeNull()
  })

  it('xlsx עם שורת כותרות, קישור mailto וכפילות', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('רשימה')
    ws.addRow(['שם', 'מייל'])
    ws.addRow(['משה כהן', 'Moshe@Example.com'])
    ws.addRow(['דוד לוי', { text: 'david@example.com', hyperlink: 'mailto:david@example.com' }])
    ws.addRow(['כפול', 'moshe@example.com'])
    ws.addRow(['בלי מייל', ''])
    const buf = await wb.xlsx.writeBuffer()
    const text = dropHeaderRow(await xlsxToImportText(buf as ArrayBuffer))
    const { rows, invalid } = parseImportText(text)
    expect(rows).toEqual([
      { email: 'moshe@example.com', name: 'משה כהן' },
      { email: 'david@example.com', name: 'דוד לוי' },
    ])
    expect(invalid).toBe(1)
  })

  it('CSV עם BOM ושורת כותרות', () => {
    const buf = new TextEncoder().encode('﻿שם,מייל\nיוסף,yosef@example.com\n').buffer as ArrayBuffer
    const { rows, invalid } = parseImportText(dropHeaderRow(decodeTextFile(buf)))
    expect(rows).toEqual([{ email: 'yosef@example.com', name: 'יוסף' }])
    expect(invalid).toBe(0)
  })
})
