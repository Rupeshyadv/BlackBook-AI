import crypto from 'crypto'
import { db } from '@/lib/db'
import { inngest } from '@/inngest/client'

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

        // trigger blackbook generation
        await inngest.send({
            name: 'blackbook/generate',
            data: { orderId }
        })

        console.log('Job enqueued for order:', orderId)
    }

    if (event.event === 'payment.failed') {
        const orderId = event.payload.payment.entity.notes.orderId

        await db.payment.update({
        where: { razorpayOrderId: event.payload.payment.entity.order_id },
        data: { status: 'FAILED' }
        })

        await db.order.update({
        where: { id: orderId },
        data: { status: 'FAILED' }
        })
    }

    return Response.json({ ok: true })
}