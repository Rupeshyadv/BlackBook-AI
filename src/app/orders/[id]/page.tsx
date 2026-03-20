export default async function OrderStatusPage({ params }: { params: { id: string } }) {
    const orderId = params?.id
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white rounded-2xl p-8 shadow-sm text-center max-w-md w-full">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-2xl">✓</span>
                </div>
                <h1 className="text-2xl font-bold mb-2">Payment successful!</h1>
                <p className="text-gray-500 mb-4">
                    Your blackbook is being generated. We'll notify you on WhatsApp when it's ready.
                </p>
                <p className="text-xs text-gray-400">Order ID: {orderId}</p>
            </div>
        </div>
    )
}