import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import Razorpay from 'razorpay'
import { z } from 'zod'

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

const schema = z.object({
    topic: z.string().min(5),
    course: z.string().min(1),
    collegeName: z.string().min(3),
    instructions: z.string().optional(),
    pageCount: z.number(),
    hasPPT: z.boolean(),
    hasWordFile: z.boolean(),
    isRush: z.boolean(),
    totalAmount: z.number(),
    referenceFileKey: z.string().nullable(),
})

export async function POST(req: Request) {
    const { userId } = await auth()
    if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // parse and validate body
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
        return Response.json({ error: 'Invalid data' }, { status: 400 })
    }

    const data = parsed.data

    // get user from DB
    const user = await db.user.findUnique({
        where: { clerkId: userId }
    })
    if (!user) {
        return Response.json({ error: 'User not found' }, { status: 404 })
    }

    // create order in DB
    const order = await db.order.create({
        data: {
            userId: user.id,
            topic: data.topic,
            course: data.course,
            collegeName: data.collegeName,
            instructions: data.instructions,
            pageCount: data.pageCount,
            hasPPT: data.hasPPT,
            hasWordFile: data.hasWordFile,
            isRush: data.isRush,
            amount: data.totalAmount * 100, // convert to paise
            status: 'PENDING',
            document: {
                create: {
                    referenceFileKey: data.referenceFileKey,
                }
            }
        }
    })

    // create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
        amount: data.totalAmount * 100, // paise
        currency: 'INR',
        notes: {
            orderId: order.id,
        }
    })

    // save Razorpay order ID to payment table
    await db.payment.create({
        data: {
            orderId: order.id,
            razorpayOrderId: razorpayOrder.id,
            amount: data.totalAmount * 100,
        }
    })

    return Response.json({
        orderId: order.id,
        razorpayOrderId: razorpayOrder.id,
        amount: data.totalAmount * 100,
    })
}