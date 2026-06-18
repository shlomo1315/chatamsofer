import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/apiAuth'

// 235 nodes parsed from the approved Excel file (generations 1-5)
// _key: override map-storage key (used when two nodes share the same name)
// _parentKey: override parent-lookup key (used when the parent name is duplicated)
const LINEAGE_DATA: { name: string; generation: number; parentName: string | null; _key?: string; _parentKey?: string }[] = [
  {
    "name": "החתם סופר",
    "generation": 1,
    "parentName": null
  },
  {
    "name": "מרת הינדל אשת רבי דוד צבי ארנפלד",
    "generation": 2,
    "parentName": "החתם סופר"
  },
  {
    "name": "רבי יצחק ואסתר פליישמן",
    "generation": 3,
    "parentName": "מרת הינדל אשת רבי דוד צבי ארנפלד"
  },
  {
    "name": "רבי אליעזר דוד ואידל הירשלר",
    "generation": 4,
    "parentName": "רבי יצחק ואסתר פליישמן"
  },
  {
    "name": "מרת הינדל שיינפלד",
    "generation": 5,
    "parentName": "רבי אליעזר דוד ואידל הירשלר"
  },
  {
    "name": "רבי שאול ארנפלד (מסיקסא)",
    "generation": 3,
    "parentName": "מרת הינדל אשת רבי דוד צבי ארנפלד"
  },
  {
    "name": "רבי שמואל ארנפלד",
    "generation": 4,
    "parentName": "רבי שאול ארנפלד (מסיקסא)"
  },
  {
    "name": "רבי אפרים חיים ומלכה בירנבוים",
    "generation": 5,
    "parentName": "רבי שמואל ארנפלד"
  },
  {
    "name": "רבי ישעיהו בעל \"שבט סופר\" ובלומא ארנפלד",
    "generation": 3,
    "parentName": "מרת הינדל אשת רבי דוד צבי ארנפלד"
  },
  {
    "name": "רבי צבי ואסתר ארנפלד",
    "generation": 4,
    "parentName": "רבי ישעיהו בעל \"שבט סופר\" ובלומא ארנפלד"
  },
  {
    "name": "רבי זאב",
    "generation": 5,
    "parentName": "רבי צבי ואסתר ארנפלד"
  },
  {
    "name": "רבי שמואל בעל \"חתן סופר\" ואסתר ארנפלד",
    "generation": 3,
    "parentName": "מרת הינדל אשת רבי דוד צבי ארנפלד"
  },
  {
    "name": "רבי שמחה בונים (מענה שמחה) וגיטל ארנפלד",
    "generation": 4,
    "parentName": "רבי שמואל בעל \"חתן סופר\" ואסתר ארנפלד"
  },
  {
    "name": "רבי שמואל ארנפלד גאב\"ד מטרסדורף",
    "generation": 5,
    "parentName": "רבי שמחה בונים (מענה שמחה) וגיטל ארנפלד"
  },
  {
    "name": "רבי מנחם והינדל סופר",
    "generation": 5,
    "parentName": "רבי שמחה בונים (מענה שמחה) וגיטל ארנפלד"
  },
  {
    "name": "רבי אברהם ורייזל גלזנר",
    "generation": 3,
    "parentName": "מרת הינדל אשת רבי דוד צבי ארנפלד"
  },
  {
    "name": "רבי משה שמואל גלזנר",
    "generation": 4,
    "parentName": "רבי אברהם ורייזל גלזנר"
  },
  {
    "name": "רבי עקיבא וגיטל קליין",
    "generation": 5,
    "parentName": "רבי משה שמואל גלזנר"
  },
  {
    "name": "רבי שמואל מנחם ואסתר קליין",
    "generation": 5,
    "parentName": "רבי משה שמואל גלזנר"
  },
  {
    "name": "רבי שלום דב ושרל שטרן",
    "generation": 3,
    "parentName": "מרת הינדל אשת רבי דוד צבי ארנפלד"
  },
  {
    "name": "רבי יוסף ומרים רייזל בוימגרטן",
    "generation": 4,
    "parentName": "רבי שלום דב ושרל שטרן"
  },
  {
    "name": "רבי דוד צבי ואסתר בוימגרטן",
    "generation": 5,
    "parentName": "רבי יוסף ומרים רייזל בוימגרטן"
  },
  {
    "name": "רבי שלמה בוימגרטן",
    "generation": 5,
    "parentName": "רבי יוסף ומרים רייזל בוימגרטן"
  },
  {
    "name": "רבי יוסף ופעסל לאה שטרן",
    "generation": 4,
    "parentName": "רבי שלום דב ושרל שטרן"
  },
  {
    "name": "רבי בצלאל שטרן",
    "generation": 5,
    "parentName": "רבי יוסף ופעסל לאה שטרן"
  },
  {
    "name": "רבי מנחם והינדל שטראה",
    "generation": 5,
    "parentName": "רבי יוסף ופעסל לאה שטרן"
  },
  {
    "name": "רבי משה צבי שטרן",
    "generation": 5,
    "parentName": "רבי יוסף ופעסל לאה שטרן"
  },
  {
    "name": "רבי אברהם שמואל בנימין והענא שטרן",
    "generation": 4,
    "parentName": "רבי שלום דב ושרל שטרן"
  },
  {
    "name": "רבי שמחה בונים שטרן",
    "generation": 5,
    "parentName": "רבי אברהם שמואל בנימין והענא שטרן"
  },
  {
    "name": "מרת גיטל קורניצר / שפיצר",
    "generation": 2,
    "parentName": "החתם סופר"
  },
  {
    "name": "רבי יוסף דב בער וסרח קאהן",
    "generation": 3,
    "parentName": "מרת גיטל קורניצר / שפיצר"
  },
  {
    "name": "רבי קלונימוס קלמן וגיטל וועבר",
    "generation": 4,
    "parentName": "רבי יוסף דב בער וסרח קאהן"
  },
  {
    "name": "רבי שמעון וועבר",
    "generation": 5,
    "parentName": "רבי קלונימוס קלמן וגיטל וועבר"
  },
  {
    "name": "רבי משה ושרה קורניצר",
    "generation": 3,
    "parentName": "מרת גיטל קורניצר / שפיצר"
  },
  {
    "name": "רבי אברהם ושרה שוורץ",
    "generation": 4,
    "parentName": "רבי משה ושרה קורניצר"
  },
  {
    "name": "רבי מאיר ומירל הרמן",
    "generation": 5,
    "parentName": "רבי אברהם ושרה שוורץ"
  },
  {
    "name": "רבי יהודה וזיסל קופמן",
    "generation": 4,
    "parentName": "רבי משה ושרה קורניצר"
  },
  {
    "name": "רבי פנחס ושרל פישמן",
    "generation": 5,
    "parentName": "רבי יהודה וזיסל קופמן"
  },
  {
    "name": "רבי עמנואל מנחם ואיידל קורניצר",
    "generation": 3,
    "parentName": "מרת גיטל קורניצר / שפיצר"
  },
  {
    "name": "רבי בנימין זאב וגיטל ענגלסראטה",
    "generation": 4,
    "parentName": "רבי עמנואל מנחם ואיידל קורניצר"
  },
  {
    "name": "רבי יוסף ענגלסראטה",
    "generation": 5,
    "parentName": "רבי בנימין זאב וגיטל ענגלסראטה"
  },
  {
    "name": "רבי שמואל ורחל קורניצר",
    "generation": 3,
    "parentName": "מרת גיטל קורניצר / שפיצר"
  },
  {
    "name": "רבי יהודה לייב ואסתר לעב מבוטשאם",
    "generation": 4,
    "parentName": "רבי שמואל ורחל קורניצר"
  },
  {
    "name": "רבי יוסף לעב",
    "generation": 5,
    "parentName": "רבי יהודה לייב ואסתר לעב מבוטשאם"
  },
  {
    "name": "רבי שמעון לעב",
    "generation": 5,
    "parentName": "רבי יהודה לייב ואסתר לעב מבוטשאם"
  },
  {
    "name": "רבי יואב קורניצר",
    "generation": 4,
    "parentName": "רבי שמואל ורחל קורניצר"
  },
  {
    "name": "רבי יקותיאל זלמן קורניצר",
    "generation": 5,
    "parentName": "רבי יואב קורניצר"
  },
  {
    "name": "רבי אברהם שמואל בנימין בעל הכתב סופר",
    "generation": 2,
    "parentName": "החתם סופר"
  },
  {
    "name": "רבי אברהם יעקב הלוי והינדל הירש",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי כלב פייבל ושפרה רויזע סלמון",
    "generation": 4,
    "parentName": "רבי אברהם יעקב הלוי והינדל הירש"
  },
  {
    "name": "רבי משה סלומון",
    "generation": 5,
    "parentName": "רבי כלב פייבל ושפרה רויזע סלמון"
  },
  {
    "name": "רבי יעקב יהודה לייב ושרל שטראססער",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי ברוך ומינדל בלוי",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער"
  },
  {
    "name": "רבי מרדכי וחנה שטרסבורג",
    "generation": 5,
    "parentName": "רבי ברוך ומינדל בלוי"
  },
  {
    "name": "רבי יהודה אריה לייב ורייזל רובינשטיין",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער"
  },
  {
    "name": "רבי יהודה לייב גולדשטיין",
    "generation": 5,
    "parentName": "רבי יהודה אריה לייב ורייזל רובינשטיין"
  },
  {
    "name": "רבי יהושע ופראדל ויינברגר",
    "generation": 5,
    "parentName": "רבי יהודה אריה לייב ורייזל רובינשטיין"
  },
  {
    "name": "רבי יוסף לוינגר",
    "generation": 5,
    "parentName": "רבי יהודה אריה לייב ורייזל רובינשטיין"
  },
  {
    "name": "רבי יוסף שמואל ורחל קאהן",
    "generation": 5,
    "parentName": "רבי יהודה אריה לייב ורייזל רובינשטיין"
  },
  {
    "name": "רבי שלמה אונגר",
    "generation": 5,
    "parentName": "רבי יהודה אריה לייב ורייזל רובינשטיין"
  },
  {
    "name": "רבי יונתן ויוטה חנה שטראססער",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער"
  },
  {
    "name": "רבי נחום אלתר ורחל פינקלשטיין",
    "generation": 5,
    "parentName": "רבי יונתן ויוטה חנה שטראססער"
  },
  {
    "name": "רבי שמואל בנימין שטראססער",
    "generation": 5,
    "parentName": "רבי יונתן ויוטה חנה שטראססער"
  },
  {
    "name": "רבי משה יוסף ורחל קולמן",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער"
  },
  {
    "name": "רבי נתן קולמן",
    "generation": 5,
    "parentName": "רבי משה יוסף ורחל קולמן"
  },
  {
    "name": "רבי עקיבא וצערל שטראססער",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער"
  },
  {
    "name": "רבי יצחק שטראססער",
    "generation": 5,
    "parentName": "רבי עקיבא וצערל שטראססער"
  },
  {
    "name": "רבי נתן נטע שטראססער",
    "generation": 5,
    "parentName": "רבי עקיבא וצערל שטראססער"
  },
  {
    "name": "רבי שלמה זלמן והענא נייהוז",
    "generation": 5,
    "parentName": "רבי עקיבא וצערל שטראססער"
  },
  {
    "name": "רבי שמעון שטראססער",
    "generation": 5,
    "parentName": "רבי עקיבא וצערל שטראססער"
  },
  {
    "name": "רבי עקיבא ורויזע גינז שלזינגר",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער"
  },
  {
    "name": "מרת ראדיש חיה לעוו - בער",
    "generation": 5,
    "parentName": "רבי עקיבא ורויזע גינז שלזינגר"
  },
  {
    "name": "רבי אברהם שלזינגר",
    "generation": 5,
    "parentName": "רבי עקיבא ורויזע גינז שלזינגר"
  },
  {
    "name": "רבי יואל והנדל פולק",
    "generation": 5,
    "parentName": "רבי עקיבא ורויזע גינז שלזינגר"
  },
  {
    "name": "רבי שלום ולאה רבקה הניה קרמר",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער"
  },
  {
    "name": "רבי אהרן וזיסל שפיצר",
    "generation": 5,
    "parentName": "רבי שלום ולאה רבקה הניה קרמר"
  },
  {
    "name": "רבי יעקב וגיטל שטראוס",
    "generation": 5,
    "parentName": "רבי שלום ולאה רבקה הניה קרמר"
  },
  {
    "name": "רבי שלמה צבי ושרה יוטל שטראססער",
    "generation": 4,
    "parentName": "רבי יעקב יהודה לייב ושרל שטראססער",
    "_key": "שלמה_צבי_כתב_סופר"
  },
  {
    "name": "רבי יעקב ולאה שוורץ",
    "generation": 5,
    "parentName": "רבי שלמה צבי ושרה יוטל שטראססער",
    "_parentKey": "שלמה_צבי_כתב_סופר"
  },
  {
    "name": "רבי מרדכי ניסן שטראססער",
    "generation": 5,
    "parentName": "רבי שלמה צבי ושרה יוטל שטראססער",
    "_parentKey": "שלמה_צבי_כתב_סופר"
  },
  {
    "name": "רבי יעקב עקיבא ומלכה סופר",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי אברהם ורויזע פלזנבורג",
    "generation": 4,
    "parentName": "רבי יעקב עקיבא ומלכה סופר"
  },
  {
    "name": "רבי יהושע אהרן והינדל לאה וגשל",
    "generation": 5,
    "parentName": "רבי אברהם ורויזע פלזנבורג"
  },
  {
    "name": "רבי מנחם משה פלזנבורג",
    "generation": 5,
    "parentName": "רבי אברהם ורויזע פלזנבורג"
  },
  {
    "name": "רבי נטע ניסן פלזנבורג",
    "generation": 5,
    "parentName": "רבי אברהם ורויזע פלזנבורג"
  },
  {
    "name": "רבי אברהם שרייבר",
    "generation": 4,
    "parentName": "רבי יעקב עקיבא ומלכה סופר"
  },
  {
    "name": "רבי נתן יהודה (נטע לייב) ונענא סופר",
    "generation": 4,
    "parentName": "רבי יעקב עקיבא ומלכה סופר"
  },
  {
    "name": "רבי דוד והינדל שישא",
    "generation": 5,
    "parentName": "רבי נתן יהודה (נטע לייב) ונענא סופר"
  },
  {
    "name": "רבי שלמה וריקל סופר שרייבר",
    "generation": 4,
    "parentName": "רבי יעקב עקיבא ומלכה סופר"
  },
  {
    "name": "רבי אברהם סופר שרייבר",
    "generation": 5,
    "parentName": "רבי שלמה וריקל סופר שרייבר"
  },
  {
    "name": "רבי משה סופר שרייבר",
    "generation": 5,
    "parentName": "רבי שלמה וריקל סופר שרייבר"
  },
  {
    "name": "רבי עמרם ומלכה גשטטנר",
    "generation": 5,
    "parentName": "רבי שלמה וריקל סופר שרייבר"
  },
  {
    "name": "רבי שלמה צבי ושרה יוטל שטראססער",
    "generation": 4,
    "parentName": "רבי יעקב עקיבא ומלכה סופר",
    "_key": "שלמה_צבי_יעקב_עקיבא"
  },
  {
    "name": "רבי דוד ומלכה הוכהייזר",
    "generation": 5,
    "parentName": "רבי שלמה צבי ושרה יוטל שטראססער",
    "_parentKey": "שלמה_צבי_יעקב_עקיבא"
  },
  {
    "name": "רבי יצחק לייב סופר בעל \"סופר מהיר\"",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי אברהם ושפרה פרוידיגר",
    "generation": 4,
    "parentName": "רבי יצחק לייב סופר בעל \"סופר מהיר\""
  },
  {
    "name": "רבי פנחס יהודה ושיינדל שפרינצא בלוי",
    "generation": 5,
    "parentName": "רבי אברהם ושפרה פרוידיגר"
  },
  {
    "name": "רבי אברהם חיים דוד וצארטעל סופר",
    "generation": 4,
    "parentName": "רבי יצחק לייב סופר בעל \"סופר מהיר\""
  },
  {
    "name": "רבי משה סופר שרייבר",
    "generation": 5,
    "parentName": "רבי אברהם חיים דוד וצארטעל סופר"
  },
  {
    "name": "רבי שלמה זלמן וחיה גיטל אולמן",
    "generation": 4,
    "parentName": "רבי יצחק לייב סופר בעל \"סופר מהיר\""
  },
  {
    "name": "רבי ישראל אולמן.",
    "generation": 5,
    "parentName": "רבי שלמה זלמן וחיה גיטל אולמן"
  },
  {
    "name": "רבי יצחק צבי ורויזא פריי",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי אברהם שמואל בנימין ורחל פריי",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי ישעיהו ושרל בנדיקט",
    "generation": 5,
    "parentName": "רבי אברהם שמואל בנימין ורחל פריי"
  },
  {
    "name": "רבי מיכאל אליעזר וחיה לאה שפרינצלס",
    "generation": 5,
    "parentName": "רבי אברהם שמואל בנימין ורחל פריי"
  },
  {
    "name": "רבי יהודה והינדל רוזנבוים",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי אריה רוזנבוים",
    "generation": 5,
    "parentName": "רבי יהודה והינדל רוזנבוים"
  },
  {
    "name": "רבי משה וקיילא רוזנבוים",
    "generation": 5,
    "parentName": "רבי יהודה והינדל רוזנבוים"
  },
  {
    "name": "רבי יוסף והנעלע פירסט",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי פנחס ורויזא רובינפלד",
    "generation": 5,
    "parentName": "רבי יוסף והנעלע פירסט"
  },
  {
    "name": "רבי יוסף ושרל ברנפלד",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי רפאל יונה ברנפלד",
    "generation": 5,
    "parentName": "רבי יוסף ושרל ברנפלד"
  },
  {
    "name": "רבי שלמה זלמן והנלה ליברמן",
    "generation": 5,
    "parentName": "רבי יוסף ושרל ברנפלד"
  },
  {
    "name": "רבי שמואל יהודה בנימין ברנפלד",
    "generation": 5,
    "parentName": "רבי יוסף ושרל ברנפלד"
  },
  {
    "name": "רבי מאיר יהודה ומירל פריי",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי יצחק צבי פריי",
    "generation": 5,
    "parentName": "רבי מאיר יהודה ומירל פריי"
  },
  {
    "name": "רבי שמואל בנימין פריי",
    "generation": 5,
    "parentName": "רבי מאיר יהודה ומירל פריי"
  },
  {
    "name": "רבי משה ומלכה פריי",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי דב וחוה רבקה דויטש",
    "generation": 5,
    "parentName": "רבי משה ומלכה פריי"
  },
  {
    "name": "רבי יעקב ושמחה פינס",
    "generation": 5,
    "parentName": "רבי משה ומלכה פריי"
  },
  {
    "name": "רבי יצחק צבי פריי",
    "generation": 5,
    "parentName": "רבי משה ומלכה פריי"
  },
  {
    "name": "רבי שמואל יהודה וגיטל ברנפלד",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי יצחק צבי ברנפלד",
    "generation": 5,
    "parentName": "רבי שמואל יהודה וגיטל ברנפלד"
  },
  {
    "name": "רבי שמעון ואסתר פריי",
    "generation": 4,
    "parentName": "רבי יצחק צבי ורויזא פריי"
  },
  {
    "name": "רבי אשר ורויזא קליין",
    "generation": 5,
    "parentName": "רבי שמעון ואסתר פריי"
  },
  {
    "name": "רבי יעקב ישראל וחוה לאה קליין",
    "generation": 5,
    "parentName": "רבי שמעון ואסתר פריי"
  },
  {
    "name": "רבי נפתלי צבי וטויבא קאליש",
    "generation": 5,
    "parentName": "רבי שמעון ואסתר פריי"
  },
  {
    "name": "רבי משה ורבקה סופר",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי בנימין וסערל פרקש",
    "generation": 4,
    "parentName": "רבי משה ורבקה סופר"
  },
  {
    "name": "רבי אברהם וויקא פולק",
    "generation": 5,
    "parentName": "רבי בנימין וסערל פרקש"
  },
  {
    "name": "רבי עקיבא פרקש",
    "generation": 5,
    "parentName": "רבי בנימין וסערל פרקש"
  },
  {
    "name": "רבי יחיאל מאיר והעניא פנעט",
    "generation": 4,
    "parentName": "רבי משה ורבקה סופר"
  },
  {
    "name": "רבי אשר שמואל פנעט",
    "generation": 5,
    "parentName": "רבי יחיאל מאיר והעניא פנעט"
  },
  {
    "name": "רבי יצחק אייזיק ומינדל בניאמין",
    "generation": 4,
    "parentName": "רבי משה ורבקה סופר"
  },
  {
    "name": "מרת גיטל פישר",
    "generation": 5,
    "parentName": "רבי יצחק אייזיק ומינדל בניאמין"
  },
  {
    "name": "מרת רבקה גרוס",
    "generation": 5,
    "parentName": "רבי יצחק אייזיק ומינדל בניאמין"
  },
  {
    "name": "רבי רפאל ורחל דויטש",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי שמחה בונם ואסתר דויטש",
    "generation": 4,
    "parentName": "רבי רפאל ורחל דויטש"
  },
  {
    "name": "רבי יהושע צבי גולדגלנץ",
    "generation": 5,
    "parentName": "רבי שמחה בונם ואסתר דויטש"
  },
  {
    "name": "רבי שמעון דויטש (מאנטוורפן)",
    "generation": 4,
    "parentName": "רבי רפאל ורחל דויטש"
  },
  {
    "name": "רבי רפאל משה דויטש",
    "generation": 5,
    "parentName": "רבי שמעון דויטש (מאנטוורפן)"
  },
  {
    "name": "רבי שמחה בונם ורחל סופר \"בעל שבט סופר\"",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי עקיבא בעל \"דעת סופר\" והינדא סופר",
    "generation": 4,
    "parentName": "רבי שמחה בונם ורחל סופר \"בעל שבט סופר\""
  },
  {
    "name": "רבי אברהם שמואל בנימין בעל \"חשב סופר\"",
    "generation": 5,
    "parentName": "רבי עקיבא בעל \"דעת סופר\" והינדא סופר"
  },
  {
    "name": "רבי יצחק יהודה (לייב) וקיילא בלוי",
    "generation": 5,
    "parentName": "רבי עקיבא בעל \"דעת סופר\" והינדא סופר"
  },
  {
    "name": "רבי יצחק יהודה (לייב) סופר שרייבר",
    "generation": 5,
    "parentName": "רבי עקיבא בעל \"דעת סופר\" והינדא סופר"
  },
  {
    "name": "רבי פנחס דוד והענא ריבא פרוידיגר",
    "generation": 5,
    "parentName": "רבי עקיבא בעל \"דעת סופר\" והינדא סופר"
  },
  {
    "name": "רבי שמעון סופר בעל \"התעוררות תשובה\"",
    "generation": 3,
    "parentName": "רבי אברהם שמואל בנימין בעל הכתב סופר"
  },
  {
    "name": "רבי אברהם ושרה סופר",
    "generation": 4,
    "parentName": "רבי שמעון סופר בעל \"התעוררות תשובה\""
  },
  {
    "name": "רבי שלמה (אביעד שר שלום) סופר",
    "generation": 5,
    "parentName": "רבי אברהם ושרה סופר"
  },
  {
    "name": "רבי אליעזר יואל ורבקה פאשקעס",
    "generation": 4,
    "parentName": "רבי שמעון סופר בעל \"התעוררות תשובה\""
  },
  {
    "name": "רבי משה אריה ובונא רוזנברג",
    "generation": 5,
    "parentName": "רבי אליעזר יואל ורבקה פאשקעס"
  },
  {
    "name": "רבי משה יוסף פאשקעס",
    "generation": 5,
    "parentName": "רבי אליעזר יואל ורבקה פאשקעס"
  },
  {
    "name": "רבי זלמן וחיה סופר",
    "generation": 4,
    "parentName": "רבי שמעון סופר בעל \"התעוררות תשובה\""
  },
  {
    "name": "רבי יצחק צבי וגיטל גרינוולד",
    "generation": 5,
    "parentName": "רבי זלמן וחיה סופר"
  },
  {
    "name": "רבי משה בעל \"יד סופר\" וטושענע סופר",
    "generation": 4,
    "parentName": "רבי שמעון סופר בעל \"התעוררות תשובה\""
  },
  {
    "name": "רבי יוחנן סופר בעל \"אמרי סופר\" מערלוי",
    "generation": 5,
    "parentName": "רבי משה בעל \"יד סופר\" וטושענע סופר"
  },
  {
    "name": "רבי משה ושרה דויטש",
    "generation": 4,
    "parentName": "רבי שמעון סופר בעל \"התעוררות תשובה\""
  },
  {
    "name": "רבי נתן ופעסל לאה וייס",
    "generation": 5,
    "parentName": "רבי משה ושרה דויטש"
  },
  {
    "name": "רבי עקיבא שלמה דויטש",
    "generation": 5,
    "parentName": "רבי משה ושרה דויטש"
  },
  {
    "name": "מרת שמחה אשת רבי משה טוביה לעהמאן",
    "generation": 2,
    "parentName": "החתם סופר"
  },
  {
    "name": "רבי ברוך ושרל גרויז",
    "generation": 3,
    "parentName": "מרת שמחה אשת רבי משה טוביה לעהמאן"
  },
  {
    "name": "רבי יקותיאל פרודיגער",
    "generation": 4,
    "parentName": "רבי ברוך ושרל גרויז"
  },
  {
    "name": "רבי טוביה ליברמן",
    "generation": 5,
    "parentName": "רבי יקותיאל פרודיגער"
  },
  {
    "name": "רבי משה וחוה רבקה ליברמן",
    "generation": 4,
    "parentName": "רבי ברוך ושרל גרויז"
  },
  {
    "name": "רבי יוסף ורייזל ברנפלד",
    "generation": 5,
    "parentName": "רבי משה וחוה רבקה ליברמן"
  },
  {
    "name": "רבי שלמה זלמן ליברמן",
    "generation": 5,
    "parentName": "רבי משה וחוה רבקה ליברמן"
  },
  {
    "name": "רבי אברהם בנימין ופראדל גרויז (גרוס)",
    "generation": 4,
    "parentName": "רבי ברוך ושרל גרויז"
  },
  {
    "name": "רבי שמעון ורייזל אסתר רייכמן",
    "generation": 5,
    "parentName": "רבי אברהם בנימין ופראדל גרויז (גרוס)"
  },
  {
    "name": "רבי חיים ורייזל רוזנטל",
    "generation": 3,
    "parentName": "מרת שמחה אשת רבי משה טוביה לעהמאן"
  },
  {
    "name": "רבי ישכר דב ורחל פרייס",
    "generation": 3,
    "parentName": "מרת שמחה אשת רבי משה טוביה לעהמאן"
  },
  {
    "name": "רבי יוסף עקיבא ובילא פרייס",
    "generation": 4,
    "parentName": "רבי ישכר דב ורחל פרייס"
  },
  {
    "name": "רבי אריה לייבוש פרייס",
    "generation": 5,
    "parentName": "רבי יוסף עקיבא ובילא פרייס"
  },
  {
    "name": "רבי יששכר פרייס",
    "generation": 5,
    "parentName": "רבי יוסף עקיבא ובילא פרייס"
  },
  {
    "name": "רבי נחום וקאטל דיאמנט",
    "generation": 3,
    "parentName": "מרת שמחה אשת רבי משה טוביה לעהמאן"
  },
  {
    "name": "רבי יוסף ובלומה דיאמנט",
    "generation": 4,
    "parentName": "רבי נחום וקאטל דיאמנט"
  },
  {
    "name": "רבי משה יהודה דיאמנט",
    "generation": 5,
    "parentName": "רבי יוסף ובלומה דיאמנט"
  },
  {
    "name": "רבי עקיבא יוסף וחנה להמן",
    "generation": 3,
    "parentName": "מרת שמחה אשת רבי משה טוביה לעהמאן"
  },
  {
    "name": "רבי משה שרגא ושרל גולדשטיין",
    "generation": 4,
    "parentName": "רבי עקיבא יוסף וחנה להמן"
  },
  {
    "name": "רבי שמואל גולדשטיין",
    "generation": 5,
    "parentName": "רבי משה שרגא ושרל גולדשטיין"
  },
  {
    "name": "רבי שלמה זלמן ואסתר שפיצר",
    "generation": 3,
    "parentName": "מרת שמחה אשת רבי משה טוביה לעהמאן"
  },
  {
    "name": "רבי אליעזר וגיטל המבורגר",
    "generation": 4,
    "parentName": "רבי שלמה זלמן ואסתר שפיצר"
  },
  {
    "name": "רבי משה המבורגר",
    "generation": 5,
    "parentName": "רבי אליעזר וגיטל המבורגר"
  },
  {
    "name": "רבי צבי יהודה ורעכיל פרידמן",
    "generation": 2,
    "parentName": "החתם סופר"
  },
  {
    "name": "רבי אברהם חנוך וחנה חייטשא פרידמן",
    "generation": 3,
    "parentName": "רבי צבי יהודה ורעכיל פרידמן"
  },
  {
    "name": "רבי שמואל בנימין ודבורה פרידמן",
    "generation": 4,
    "parentName": "רבי אברהם חנוך וחנה חייטשא פרידמן"
  },
  {
    "name": "מרת רויזא גולדשטיין",
    "generation": 5,
    "parentName": "רבי שמואל בנימין ודבורה פרידמן"
  },
  {
    "name": "מרת רעכיל יונגרייז",
    "generation": 5,
    "parentName": "רבי שמואל בנימין ודבורה פרידמן"
  },
  {
    "name": "רבי אברהם יהושע וחייטשא ביילא הרבסט",
    "generation": 5,
    "parentName": "רבי שמואל בנימין ודבורה פרידמן"
  },
  {
    "name": "רבי יהודה פרידמן",
    "generation": 5,
    "parentName": "רבי שמואל בנימין ודבורה פרידמן"
  },
  {
    "name": "רבי יונה ושרל קרויס",
    "generation": 3,
    "parentName": "רבי צבי יהודה ורעכיל פרידמן"
  },
  {
    "name": "רבי משה בונים ופרומעט רחל קרויס",
    "generation": 4,
    "parentName": "רבי יונה ושרל קרויס"
  },
  {
    "name": "רבי יונה קרויס",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי יעקב קרויס",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי ישעיהו קרויס",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי משה ורעכל בולג",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי משה עקיבא ורבקה נויפלד",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי עקיבא וזלדה קרויס",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי צבי יהודה קרויס",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי שמחה קרויס",
    "generation": 5,
    "parentName": "רבי משה בונים ופרומעט רחל קרויס"
  },
  {
    "name": "רבי ישעיה ויהודית פרידמן",
    "generation": 3,
    "parentName": "רבי צבי יהודה ורעכיל פרידמן"
  },
  {
    "name": "רבי דוד וטשארנע זוסמן",
    "generation": 4,
    "parentName": "רבי ישעיה ויהודית פרידמן"
  },
  {
    "name": "מרת קילא שרה ליבוביץ",
    "generation": 5,
    "parentName": "רבי דוד וטשארנע זוסמן"
  },
  {
    "name": "רבי אברהם וגיטל פייגלשטוק",
    "generation": 4,
    "parentName": "רבי ישעיה ויהודית פרידמן"
  },
  {
    "name": "רבי משה פייגלשטוק",
    "generation": 5,
    "parentName": "רבי אברהם וגיטל פייגלשטוק"
  },
  {
    "name": "רבי משה ומלכה פרידמן",
    "generation": 4,
    "parentName": "רבי ישעיה ויהודית פרידמן"
  },
  {
    "name": "רבי צבי יהודה פרידמן",
    "generation": 5,
    "parentName": "רבי משה ומלכה פרידמן"
  },
  {
    "name": "רבי שלמה וחיה גיטל פרידמן",
    "generation": 3,
    "parentName": "רבי צבי יהודה ורעכיל פרידמן"
  },
  {
    "name": "רבי דוד ופראדל הופמן",
    "generation": 4,
    "parentName": "רבי שלמה וחיה גיטל פרידמן"
  },
  {
    "name": "רבי שמשון הופמן",
    "generation": 5,
    "parentName": "רבי דוד ופראדל הופמן"
  },
  {
    "name": "רבי שמעון סופר \"בעל מכתב סופר\"",
    "generation": 2,
    "parentName": "החתם סופר"
  },
  {
    "name": "רבי אשר ולאה מרים סופר",
    "generation": 3,
    "parentName": "רבי שמעון סופר \"בעל מכתב סופר\""
  },
  {
    "name": "רבי שמעון צבי ואסתר סופר שרייבר",
    "generation": 4,
    "parentName": "רבי אשר ולאה מרים סופר"
  },
  {
    "name": "רבי דוד אריה לייב שרייבר",
    "generation": 5,
    "parentName": "רבי שמעון צבי ואסתר סופר שרייבר"
  },
  {
    "name": "רבי יואל וחוה סופר",
    "generation": 3,
    "parentName": "רבי שמעון סופר \"בעל מכתב סופר\""
  },
  {
    "name": "רבי משה וחיה סופר שרייבר",
    "generation": 4,
    "parentName": "רבי יואל וחוה סופר"
  },
  {
    "name": "רבי אפרים אריה ודבורה וייס",
    "generation": 5,
    "parentName": "רבי משה וחיה סופר שרייבר"
  },
  {
    "name": "רבי יהודה אריה סופר שרייבר",
    "generation": 5,
    "parentName": "רבי משה וחיה סופר שרייבר"
  },
  {
    "name": "רבי חנוך העניך וציפורה וינברג",
    "generation": 4,
    "parentName": "רבי יואל וחוה סופר"
  },
  {
    "name": "רבי מנחם מנדל ושבע שיינפלד",
    "generation": 5,
    "parentName": "רבי חנוך העניך וציפורה וינברג"
  },
  {
    "name": "רבי יצחק מאיר וגיטל מורגנשטרן",
    "generation": 4,
    "parentName": "רבי יואל וחוה סופר"
  },
  {
    "name": "רבי משה דוד וחוה שטרן",
    "generation": 5,
    "parentName": "רבי יצחק מאיר וגיטל מורגנשטרן"
  },
  {
    "name": "רבי חיים והינדא פינקלשטיין",
    "generation": 4,
    "parentName": "רבי יואל וחוה סופר"
  },
  {
    "name": "רבי משה פינקלשטיין",
    "generation": 5,
    "parentName": "רבי חיים והינדא פינקלשטיין"
  },
  {
    "name": "רבי עקיבא דב סופר שרייבר",
    "generation": 4,
    "parentName": "רבי יואל וחוה סופר"
  },
  {
    "name": "רבי שמעון שמחה סופר שרייבר",
    "generation": 5,
    "parentName": "רבי עקיבא דב סופר שרייבר"
  },
  {
    "name": "רבי עקיבא ולאה סופר",
    "generation": 3,
    "parentName": "רבי שמעון סופר \"בעל מכתב סופר\""
  },
  {
    "name": "רבי חיים זאב ורבקה סופר שרייבר",
    "generation": 4,
    "parentName": "רבי עקיבא ולאה סופר"
  },
  {
    "name": "רבי אברהם שמואל בנימין והענא סופר שרייבר",
    "generation": 4,
    "parentName": "רבי עקיבא ולאה סופר"
  },
  {
    "name": "רבי שמעון שרייבר",
    "generation": 5,
    "parentName": "רבי אברהם שמואל בנימין והענא סופר שרייבר"
  },
  {
    "name": "רבי שלמה אלכסנדרי והינדא סופר",
    "generation": 3,
    "parentName": "רבי שמעון סופר \"בעל מכתב סופר\""
  },
  {
    "name": "רבי בנימין דב ורחל שיינדל שרייבר",
    "generation": 4,
    "parentName": "רבי שלמה אלכסנדרי והינדא סופר"
  },
  {
    "name": "רבי אפרים ופערל חוה גרוס",
    "generation": 5,
    "parentName": "רבי בנימין דב ורחל שיינדל שרייבר"
  },
  {
    "name": "רבי יעקב יוסף שרייבר",
    "generation": 5,
    "parentName": "רבי בנימין דב ורחל שיינדל שרייבר"
  },
  {
    "name": "רבי משה שרייבר",
    "generation": 5,
    "parentName": "רבי בנימין דב ורחל שיינדל שרייבר"
  }
]

export async function POST(req: NextRequest) {
  try {
    // הרשאת מנהל בלבד — פעולה הרסנית (מחיקת כל עץ הדורות וטעינה מחדש).
    // הבדיקה הקודמת (getSession בלבד) אישרה כל משתמש מחובר, כולל מוטב פורטל.
    if (!(await requireAdmin())) return NextResponse.json({ error: 'נדרשות הרשאות מנהל' }, { status: 403 })
    const supabase = await createClient()

    const body = await req.json().catch(() => ({}))
    const reset = body.reset !== false // default true

    // 1. Reset if requested
    if (reset) {
      const { error: delErr } = await supabase.from('lineage_nodes').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (delErr) return NextResponse.json({ error: 'Reset failed: ' + delErr.message }, { status: 500 })
    }

    // 2. Insert generation by generation to ensure parents exist
    // nameToId key = node._key if present, else node.name
    // parent lookup key = node._parentKey if present, else node.parentName
    const nameToId = new Map<string, string>()
    let totalInserted = 0
    const errors: string[] = []

    for (let gen = 1; gen <= 5; gen++) {
      const genNodes = LINEAGE_DATA.filter(n => n.generation === gen)
      for (const node of genNodes) {
        const lookupKey = node._parentKey ?? node.parentName ?? null
        const parentId = lookupKey ? nameToId.get(lookupKey) ?? null : null
        const { data, error } = await supabase
          .from('lineage_nodes')
          .insert({ name: node.name, generation: gen, parent_id: parentId, status: 'verified' })
          .select('id')
          .single()
        if (error || !data) {
          errors.push(`[${gen}] ${node.name}: ${error?.message ?? 'no data'}`)
        } else {
          const storeKey = node._key ?? node.name
          nameToId.set(storeKey, data.id)
          totalInserted++
        }
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      inserted: totalInserted,
      errors,
      summary: { gen1: 1, gen2: 6, gen3: 33, gen4: 72, gen5: 123, total: 235 }
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
