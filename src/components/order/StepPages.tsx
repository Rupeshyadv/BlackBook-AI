'use client'

import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateForm, setStep } from '@/store/slices/orderSlice'
import { Button } from '@/components/ui/button'

const TIERS = [
    { pages: 40, price: 699 },
    { pages: 60, price: 999, popular: true },
    { pages: 80, price: 1299 },
    { pages: 100, price: 1599 },
]

export default function StepPages() {
    const dispatch = useAppDispatch()
    const { pageCount, totalAmount } = useAppSelector(state => state.order)

    function selectTier(pages: number, price: number) {
        dispatch(updateForm({ pageCount: pages, totalAmount: price }))
    }

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <div>
                <h2 className="font-semibold text-lg">How many pages?</h2>
                <p className="text-sm text-gray-500 mt-1">More pages = more detailed content</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {TIERS.map(tier => (
                    <button
                        key={tier.pages}
                        onClick={() => selectTier(tier.pages, tier.price)}
                        className={`relative p-4 rounded-xl border-2 text-left transition-all
              ${pageCount === tier.pages
                                ? 'border-black bg-black text-white'
                                : 'border-gray-200 hover:border-gray-400'
                            }`}
                    >
                        {tier.popular && (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full mb-2 inline-block
                ${pageCount === tier.pages ? 'bg-white text-black' : 'bg-black text-white'}`}>
                                Popular
                            </span>
                        )}
                        <div className="text-2xl font-bold">{tier.pages}</div>
                        <div className={`text-sm ${pageCount === tier.pages ? 'text-gray-300' : 'text-gray-500'}`}>
                            pages
                        </div>
                        <div className="text-lg font-semibold mt-2">₹{tier.price}</div>
                    </button>
                ))}
            </div>

            <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => dispatch(setStep(1))}>
                    ← Back
                </Button>
                <Button className="flex-1" onClick={() => dispatch(setStep(3))}>
                    Continue →
                </Button>
            </div>
        </div>
    )
}