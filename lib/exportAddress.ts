// עמודות כתובת אחידות לכל ייצואי האקסל: עיר, רחוב, מספר בית — כל אחד בעמודה נפרדת.
// הכתובת נשמרת במסד כשדה אחד ("הרצל 12/3"), ולכן מפצלים אותה כאן פעם אחת לכולם.
import { splitAddress } from './splitAddress'

export const ADDRESS_HEADERS = ['עיר', 'רחוב', 'מספר בית'] as const

/** שלוש עמודות הכתובת, בסדר: עיר, רחוב, מספר בית. */
export const addressColumns = (): { header: string; width: number }[] => [
  { header: 'עיר', width: 14 },
  { header: 'רחוב', width: 22 },
  // ⚠️ טקסט ולא מספר: "12א" ו-"12/3" אינם מספרים, ומספר בית לא נסכם.
  { header: 'מספר בית', width: 10 },
]

/** [עיר, רחוב, מספר בית] מתוך עיר וכתובת מאוחדת. דירה מצורפת למספר הבית ("12/3"). */
export function addressCells(city?: string | null, address?: string | null): [string, string, string] {
  const { street, houseNumber, apartment } = splitAddress(address ?? '')
  const house = apartment ? `${houseNumber}/${apartment}` : houseNumber
  return [(city ?? '').trim(), street, house]
}
