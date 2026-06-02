'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { HOLIDAY_OPTIONS } from '@/types'

const schema = z.object({
  name: z.string().min(2, 'שם חלוקה חייב להכיל לפחות 2 תווים'),
  holiday: z.string().optional(),
  description: z.string().optional(),
  total_budget: z.number().optional(),
  distribution_date: z.string().optional(),
})

type FormData = z.infer<typeof schema>

export default function NewDistributionPage() {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setSaving(true)
    try {
      const { data: inserted, error } = await supabase
        .from('distributions')
        .insert({ ...data, status: 'planning' })
        .select()
        .single()
      if (error) throw error
      router.push(`/admin/distributions/${inserted.id}`)
    } catch {
      alert('שגיאה בשמירה. נסה שוב.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href="/admin/distributions" className="text-slate-400 hover:text-slate-600"><ArrowRight size={20} /></Link>
        <div>
          <h1 className="text-xl font-bold text-slate-900">חלוקה חדשה</h1>
          <p className="text-sm text-slate-500">הגדרת חלוקה לחג או לאירוע</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-4">פרטי חלוקה</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="שם החלוקה"
              placeholder='לדוגמה: חלוקת פסח תשפ"ה'
              error={errors.name?.message}
              required
              {...register('name')}
            />
            <Select
              label="חג / אירוע"
              options={HOLIDAY_OPTIONS.map((h) => ({ value: h, label: h }))}
              placeholder="בחר חג"
              {...register('holiday')}
            />
            <Input
              label="תאריך חלוקה"
              type="date"
              dir="ltr"
              {...register('distribution_date')}
            />
            <Input
              label="תקציב כולל (₪)"
              type="number"
              min="0"
              placeholder="0"
              {...register('total_budget', { valueAsNumber: true })}
            />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold text-slate-700 mb-3">תיאור</h2>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            rows={4}
            placeholder="תיאור החלוקה, קריטריונים לזכאות וכו'..."
            {...register('description')}
          />
        </Card>

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={() => router.back()}>ביטול</Button>
          <Button type="submit" loading={saving}>צור חלוקה</Button>
        </div>
      </form>
    </div>
  )
}
