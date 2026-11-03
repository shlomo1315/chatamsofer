// אימות כל תשובה לפני שליחה לטכנוליין.
// ⚠️ JSON שאינו תואם לתיעוד לא מחזיר שגיאה — המרכזיה מחזירה את המתקשר בשקט
// לתפריט הקודם. לכן תשובה שנכשלה באימות מוחלפת בהודעה וניתוק.
import { z } from 'zod'

const file = z.union([
  z.object({ text: z.string().min(1), voice: z.string().optional() }).strict(),
  z.object({ digits: z.string().regex(/^\d+$/) }).strict(),
  z.object({ number: z.string().regex(/^\d+$/) }).strict(),
  z.object({ fileName: z.string().min(1) }).strict(),
  z.object({ fileId: z.string().min(1), extensionId: z.string().optional() }).strict(),
  z.object({ fileLink: z.string().url(), fileName: z.string().min(1) }).strict(),
])
const files = z.array(file)

const common = {
  post: z.boolean().optional(),
  addParams: z.record(z.string(), z.string()).optional(),
  removeParams: z.array(z.string().min(1)).optional(),
}
const varName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/)

const response = z.discriminatedUnion('type', [
  z.object({ type: z.literal('simpleMessage'), files: files.min(1), ...common }).strict(),
  z.object({
    type: z.literal('simpleMenu'), name: varName, enabledKeys: z.string().regex(/^[0-9*#](,[0-9*#])*$/),
    times: z.number().int().positive().optional(), timeout: z.number().int().positive().optional(),
    errorReturn: z.string().optional(), files: files.min(1).optional(), ...common,
  }).strict(),
  z.object({
    type: z.literal('getDTMF'), name: varName, max: z.number().int().positive(),
    min: z.number().int().positive().optional(), timeout: z.number().int().positive().optional(),
    skipKey: z.string().optional(), skipValue: z.string().optional(),
    confirmType: z.enum(['number', 'digits', 'no']).optional(), maskLog: z.boolean().optional(),
    files: files.min(1).optional(), ...common,
  }).strict().refine((r) => r.min === undefined || r.min <= r.max, 'min > max'),
  z.object({ type: z.literal('goTo'), goTo: z.string().min(1), ...common }).strict(),
  z.object({ type: z.literal('hangup'), ...common }).strict(),
])

export const tlResultSchema = z.union([response, z.array(response).min(1)])

export function validateResult(body: unknown): { ok: true } | { ok: false; error: string } {
  const r = tlResultSchema.safeParse(body)
  return r.success ? { ok: true } : { ok: false, error: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
}
