import { describe, it, expect } from 'vitest'
import { cleanParams, tokensToFiles, yemotToTl } from './yemotToTl'
import { validateResult } from '../schema'

describe('מתאם תשובות הזרימה לטכנוליין', () => {
  it('טוקני השמעה הופכים לפריטי files', () => {
    expect(tokensToFiles('t-שלום.n-50.d-123.f-welcome')).toEqual([
      { text: 'שלום' }, { number: '50' }, { digits: '123' }, { fileName: 'welcome' },
    ])
    expect(tokensToFiles('t-שו.ת חתם סופר')).toEqual([{ text: 'שו.ת חתם סופר' }])
  })

  it('read מקשים הופך ל-getDTMF עם # לתפריט הראשי', () => {
    const r = yemotToTl('read=t-הקישו=bf_qty0,no,2,1,8', 5)
    expect(r).toEqual([{ type: 'getDTMF', name: 'bf_qty0_q5', max: 2, min: 1, timeout: 8, skipKey: '#', skipValue: '#', confirmType: 'no', files: [{ text: 'הקישו' }] }])
    expect(validateResult(r)).toEqual({ ok: true })
  })

  it('read הקלטה הופך ל-record עם שמירה בניתוק ותמלול', () => {
    const r = yemotToTl('id_list_message=t-שלום&read=t-אמרו=bf_inq,no,record,120', 2)
    expect(r[0]).toEqual({ type: 'simpleMessage', files: [{ text: 'שלום' }] })
    expect(r[1]).toMatchObject({ type: 'record', name: 'bf_inq_q2', max: 120, hangupSave: 'yes', sttSoft: true })
    expect(validateResult(r)).toEqual({ ok: true })
  })

  it('ניתוק ותשובה ריקה', () => {
    expect(yemotToTl('id_list_message=t-תודה&go_to_folder=hangup', 1).at(-1)).toEqual({ type: 'hangup' })
    expect(yemotToTl('', 1)).toEqual([{ type: 'hangup' }])
  })

  it('cleanParams מחזיר רק את התשובה האחרונה, ו-ERROR הופך לריק', () => {
    expect(cleanParams({ PBXphone: '05', bf_main_q1: '1', bf_omenu_q2: 'ERROR', FILEID_bf_inq_q2: 'f1' }, 2))
      .toEqual({ PBXphone: '05', bf_omenu: '', FILEID_bf_inq: 'f1' })
  })
})
