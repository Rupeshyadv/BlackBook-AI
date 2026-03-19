'use client'

import { useState, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { updateForm, setStep, resetForm } from '@/store/slices/orderSlice'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

declare global {
    interface Window {
        Razorpay: any
    }
}

export default function StepUpload() {
    const dispatch = useAppDispatch()
    const state = useAppSelector(s => s.order)
    const router = useRouter()
    const [uploading, setUploading] = useState(false)
    const [paying, setPaying] = useState(false)
    const [fileName, setFileName] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    async function handleFile(file: File) {
        console.log("file type (frontend):", file.type);
        const validTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ];
        if (!validTypes.includes(file.type)) {
            setError('Only PDF or DOCX files are accepted');
            return;
        }
        if (file.size > 20 * 1024 * 1024) {
            setError('File must be under 20MB');
            return;
        }

        setError(null);
        setUploading(true);
        setFileName(file.name);

        try {
            const res = await fetch('/api/upload/url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fileType: file.type }),
            });
            const { uploadUrl, fileKey } = await res.json();

            const response = await fetch(uploadUrl, {
                method: 'PUT',
                body: file,
                headers: {
                    'Content-Type': file.type,
                },
            });

            if (!response.ok) {
                const text = await response.text();
                console.log('upload error:', text);
                throw new Error('Upload failed');
            }

            dispatch(updateForm({ referenceFileKey: fileKey }));
        } catch (err) {
            console.log("error: ", err);
            setError('Upload failed — please try again');
            setFileName(null);
        } finally {
            setUploading(false);
        }
    }

    async function handlePayment() {
        setPaying(true)
        try {
            // create order in DB + Razorpay
            const res = await fetch('/api/orders/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state),
            })
            const { orderId, razorpayOrderId, amount } = await res.json()

            // load Razorpay script
            await loadRazorpayScript()

            // open Razorpay checkout
            const rzp = new window.Razorpay({
                key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
                amount,
                currency: 'INR',
                order_id: razorpayOrderId,
                name: 'BlackbookAI',
                description: `${state.pageCount} page blackbook — ${state.topic}`,
                handler: function () {
                    // payment successful — redirect to order status page
                    dispatch(resetForm())
                    router.push(`/orders/${orderId}`)
                },
                prefill: {
                    name: '',
                    email: '',
                },
                theme: {
                    color: '#000000'
                }
            })

            rzp.open()
        } catch {
            setError('Something went wrong — please try again')
        } finally {
            setPaying(false)
        }
    }

    function loadRazorpayScript(): Promise<void> {
        return new Promise(resolve => {
            if (window.Razorpay) return resolve()
            const script = document.createElement('script')
            script.src = 'https://checkout.razorpay.com/v1/checkout.js'
            script.onload = () => resolve()
            document.body.appendChild(script)
        })
    }

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm space-y-5">
            <div>
                <h2 className="font-semibold text-lg">Upload reference blackbook</h2>
                <p className="text-sm text-gray-500 mt-1">
                    We use this to match the exact formatting style
                </p>
            </div>

            <div
                onClick={() => inputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                    e.preventDefault()
                    const file = e.dataTransfer.files[0]
                    if (file) handleFile(file)
                }}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${fileName ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-500'}`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleFile(file)
                    }}
                />
                {uploading ? (
                    <p className="text-gray-500 text-sm">Uploading...</p>
                ) : fileName ? (
                    <div>
                        <p className="font-medium text-sm">{fileName}</p>
                        <p className="text-gray-400 text-xs mt-1">Click to change</p>
                    </div>
                ) : (
                    <div>
                        <p className="font-medium text-sm">Drop your PDF or DOCX here</p>
                        <p className="text-gray-400 text-xs mt-1">or click to browse · max 20MB</p>
                    </div>
                )}
            </div>

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <p className="text-xs text-gray-400">
                Don't have a reference? Skip this — we'll use a standard format.
            </p>

            <div className="border-t pt-4 flex justify-between items-center">
                <span className="text-gray-500 text-sm">Total to pay</span>
                <span className="text-xl font-bold">₹{state.totalAmount}</span>
            </div>

            <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => dispatch(setStep(3))}>
                    ← Back
                </Button>
                <Button
                    className="flex-1"
                    disabled={uploading || paying}
                    onClick={handlePayment}
                >
                    {paying ? 'Processing...' : `Pay ₹${state.totalAmount} →`}
                </Button>
            </div>
        </div>
    )
}