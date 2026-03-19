'use client'

import { useAppSelector } from '@/store/hooks'
import StepIndicator from '@/components/order/StepIndicator'
import StepDetails from '@/components/order/StepDetails'
import StepPages from '@/components/order/StepPages'
import StepAddons from '@/components/order/StepAddons'
import StepUpload from '@/components/order/StepUpload'

export default function OrderPage() {
    const step = useAppSelector(state => state.order.step)

    return (
        <div className="min-h-screen bg-gray-50 py-10 px-4">
            <div className="max-w-xl mx-auto">
                <h1 className="text-2xl font-bold text-center mb-2">Create your blackbook</h1>
                <p className="text-center text-gray-500 text-sm mb-8">
                    Fill in the details and we'll generate it for you
                </p>

                <StepIndicator currentStep={step} />

                <div className="mt-8">
                    {step === 1 && <StepDetails />}
                    {step === 2 && <StepPages />}
                    {step === 3 && <StepAddons />}
                    {step === 4 && <StepUpload />}
                </div>
            </div>
        </div>
    )
}