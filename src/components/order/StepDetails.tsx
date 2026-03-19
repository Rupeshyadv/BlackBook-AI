'use client'

import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateForm, setStep } from '@/store/slices/orderSlice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const schema = z.object({
    topic: z.string().min(5, 'Topic must be at least 5 characters'),
    course: z.string().min(1, 'Please select a course'),
    collegeName: z.string().min(3, 'Enter your college name'),
    instructions: z.string().optional(),
})

type FormData = z.infer<typeof schema>

const COURSES = ['B.Com', 'BBA', 'BMS', 'MBA', 'MMS', 'BAF', 'BFM', 'Other']

export default function StepDetails() {
    const dispatch = useAppDispatch()
    const saved = useAppSelector(state => state.order)

    const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            topic: saved.topic,
            course: saved.course,
            collegeName: saved.collegeName,
            instructions: saved.instructions,
        },
    })

    function onSubmit(data: FormData) {
        dispatch(updateForm(data))
        dispatch(setStep(2))
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <div className="space-y-1.5">
                <Label htmlFor="topic">Project topic</Label>
                <Input
                    id="topic"
                    placeholder="e.g. Working Capital Management in FMCG Companies"
                    {...register('topic')}
                />
                {errors.topic && <p className="text-red-500 text-xs">{errors.topic.message}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="course">Course</Label>
                <Select
                    defaultValue={saved.course}
                    onValueChange={val => setValue('course', val)}
                >
                    <SelectTrigger>
                        <SelectValue placeholder="Select your course" />
                    </SelectTrigger>
                    <SelectContent>
                        {COURSES.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {errors.course && <p className="text-red-500 text-xs">{errors.course.message}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="collegeName">College name</Label>
                <Input
                    id="collegeName"
                    placeholder="e.g. HR College of Commerce"
                    {...register('collegeName')}
                />
                {errors.collegeName && <p className="text-red-500 text-xs">{errors.collegeName.message}</p>}
            </div>

            <div className="space-y-1.5">
                <Label htmlFor="instructions">Special instructions <span className="text-gray-400">(optional)</span></Label>
                <Textarea
                    id="instructions"
                    placeholder="Any specific requirements, chapter names, formatting notes..."
                    rows={3}
                    {...register('instructions')}
                />
            </div>

            <Button type="submit" className="w-full">
                Continue →
            </Button>
        </form>
    )
}