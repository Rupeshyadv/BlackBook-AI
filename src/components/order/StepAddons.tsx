'use client'

import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateForm, setStep } from '@/store/slices/orderSlice'
import { Button } from '@/components/ui/button'

const ADDONS = [
    { key: 'hasPPT', label: 'Presentation slides', desc: '10 PowerPoint slides on your topic', price: 299 },
    { key: 'hasWordFile', label: 'Editable Word file', desc: 'Get the DOCX to edit yourself', price: 149 },
    { key: 'isRush', label: 'Rush delivery', desc: 'Done in 6 hours instead of 24', price: 399 },
]

export default function StepAddons() {
    const dispatch = useAppDispatch()
    const state = useAppSelector(s => s.order)

    function toggle(key: string, price: number) {
        const current = state[key as keyof typeof state] as boolean
        const newAmount = current
            ? state.totalAmount - price
            : state.totalAmount + price
        dispatch(updateForm({ [key]: !current, totalAmount: newAmount }))
    }

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <div>
                <h2 className="font-semibold text-lg">Add extras</h2>
                <p className="text-sm text-gray-500 mt-1">Optional — you can skip this</p>
            </div>

            <div className="space-y-3">
                {ADDONS.map(addon => {
                    const isOn = state[addon.key as keyof typeof state] as boolean
                    return (
                        <button
                            key={addon.key}
                            onClick={() => toggle(addon.key, addon.price)}
                            className={`w-full p-4 rounded-xl border-2 text-left transition-all flex justify-between items-center
                ${isOn ? 'border-black bg-black text-white' : 'border-gray-200 hover:border-gray-400'}`}
                        >
                            <div>
                                <div className="font-medium">{addon.label}</div>
                                <div className={`text-sm ${isOn ? 'text-gray-300' : 'text-gray-500'}`}>
                                    {addon.desc}
                                </div>
                            </div>
                            <div className="text-lg font-semibold ml-4">+₹{addon.price}</div>
                        </button>
                    )
                })}
            </div>

            <div className="border-t pt-4 flex justify-between items-center">
                <span className="text-gray-500 text-sm">Total</span>
                <span className="text-xl font-bold">₹{state.totalAmount}</span>
            </div>

            <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => dispatch(setStep(2))}>
                    ← Back
                </Button>
                <Button className="flex-1" onClick={() => dispatch(setStep(4))}>
                    Continue →
                </Button>
            </div>
        </div>
    )
}