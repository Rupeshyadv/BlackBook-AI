import crypto from 'crypto'
import { db } from '@/lib/db'

export async function POST(req: Request) {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature')!

    // verify signature
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(body)
        .digest('hex')

    if (expected !== signature) {
        return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const event = JSON.parse(body)

    if (event.event === 'payment.captured') {
        const { order_id, id: paymentId } = event.payload.payment.entity
        const orderId = event.payload.payment.entity.notes.orderId

        // update payment record
        await db.payment.update({
            where: { razorpayOrderId: order_id },
            data: {
                razorpayPaymentId: paymentId,
                status: 'CAPTURED',
                paidAt: new Date(),
            }
        })

        // update order status
        await db.order.update({
            where: { id: orderId },
            data: { status: 'PAID' }
        })

        // TODO: trigger Inngest job here in next step
        console.log('Payment captured for order:', orderId)
    }

    return Response.json({ ok: true })
}