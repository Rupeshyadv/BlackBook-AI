import crypto from 'crypto'
import { db } from '@/lib/db'
import { inngest } from '@/inngest/client'

export async function POST(req: Request) {
    let body: string

    try {
        body = await req.text()
    } catch (err) {
        console.error('Failed to read body', err)
        return Response.json({ error: 'Invalid body' }, { status: 400 })
    }

    const signature = req.headers.get('x-razorpay-signature')
    if (!signature) {
        console.error('Missing signature header')
        return Response.json({ error: 'Missing signature' }, { status: 400 })
    }

    // Verify signature
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!)
        .update(body)
        .digest('hex')

    if (expected !== signature) {
        console.error('Invalid signature')
        return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }

    let event
    try {
        event = JSON.parse(body)
    } catch (err) {
        console.error('Invalid JSON', err)
        return Response.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    try {
        switch (event.event) {
            case 'payment.captured': {
                const payment = event?.payload?.payment?.entity
                if (!payment) throw new Error('Missing payment entity')

                const razorpayOrderId = payment.order_id
                const paymentId = payment.id
                const orderId = payment.notes?.orderId

                if (!orderId) throw new Error('Missing orderId in notes')

                // Idempotency check
                const existingPayment = await db.payment.findUnique({
                    where: { razorpayOrderId }
                })

                if (!existingPayment) {
                    throw new Error('Payment record not found')
                }

                if (existingPayment.status === 'CAPTURED') {
                    console.log('Duplicate webhook ignored')
                    break
                }

                await db.$transaction([
                    db.payment.update({
                        where: { razorpayOrderId },
                        data: {
                            razorpayPaymentId: paymentId,
                            status: 'CAPTURED',
                            paidAt: new Date(),
                        }
                    }),
                    db.order.update({
                        where: { id: orderId },
                        data: { status: 'PAID' }
                    })
                ])

                // Fire and forget (don’t block webhook)
                inngest.send({
                    name: 'blackbook/generate',
                    data: { orderId }
                }).catch(err => {
                    console.error('Inngest failed', err)
                })

                break
            }

            case 'payment.failed': {
                const payment = event?.payload?.payment?.entity
                if (!payment) throw new Error('Missing payment entity')

                const razorpayOrderId = payment.order_id
                const orderId = payment.notes?.orderId

                if (!orderId) throw new Error('Missing orderId in notes')

                await db.$transaction([
                    db.payment.update({
                        where: { razorpayOrderId },
                        data: { status: 'FAILED' }
                    }),
                    db.order.update({
                        where: { id: orderId },
                        data: { status: 'FAILED' }
                    })
                ])

                break
            }

            default:
                console.log('Unhandled event:', event.event)
        }

        return Response.json({ ok: true })

    } catch (err) {
        console.error('Webhook processing failed:', err)
        return Response.json({ ok: true })
    }
}