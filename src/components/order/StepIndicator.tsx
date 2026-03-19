'use client'

const STEPS = [
    { num: 1, label: 'Details' },
    { num: 2, label: 'Pages' },
    { num: 3, label: 'Addons' },
    { num: 4, label: 'Upload' },
]

export default function StepIndicator({ currentStep }: { currentStep: number }) {
    return (
        <div className="flex items-center justify-between">
            {STEPS.map((step, i) => (
                <div key={step.num} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                        <div
                            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                ${currentStep >= step.num
                                    ? 'bg-black text-white'
                                    : 'bg-gray-200 text-gray-500'
                                }`}
                        >
                            {currentStep > step.num ? '✓' : step.num}
                        </div>
                        <span className="text-xs mt-1 text-gray-500">{step.label}</span>
                    </div>
                    {i < STEPS.length - 1 && (
                        <div
                            className={`flex-1 h-0.5 mx-2 mb-4
                ${currentStep > step.num ? 'bg-black' : 'bg-gray-200'}`}
                        />
                    )}
                </div>
            ))}
        </div>
    )
}