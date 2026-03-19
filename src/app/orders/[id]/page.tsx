export default function OrderStatusPage({ params }: { params: { id: string } }) {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
                <h1 className="text-2xl font-bold">Payment successful!</h1>
                <p className="text-gray-500 mt-2">Your blackbook is being generated...</p>
                <p className="text-gray-400 text-sm mt-1">Order ID: {params.id}</p>
            </div>
        </div>
    )
}