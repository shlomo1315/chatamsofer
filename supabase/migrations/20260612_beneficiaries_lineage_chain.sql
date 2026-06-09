-- שרשרת הייחוס המלאה של הנרשם: לכל דור — שם + בן/חתן של הדור הקודם.
-- נשמר כ-jsonb: [{ "generation": 1, "name": "החתם סופר", "relation": null }, ...]
alter table public.beneficiaries
  add column if not exists lineage_chain jsonb;
