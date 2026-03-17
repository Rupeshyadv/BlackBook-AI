import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { WebhookEvent } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function POST(req: Request) {
    const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

    if (!WEBHOOK_SECRET) {
        return Response.json({ error: 'No webhook secret' }, { status: 500 })
    }

    // get svix headers for verification
    const headerPayload = await headers()
    const svix_id = headerPayload.get('svix-id')
    const svix_timestamp = headerPayload.get('svix-timestamp')
    const svix_signature = headerPayload.get('svix-signature')

    if (!svix_id || !svix_timestamp || !svix_signature) {
        return Response.json({ error: 'Missing svix headers' }, { status: 400 })
    }

    // verify the webhook is actually from Clerk
    const payload = await req.json()
    const body = JSON.stringify(payload)
    const wh = new Webhook(WEBHOOK_SECRET)

    let evt: WebhookEvent
    try {
        evt = wh.verify(body, {
            'svix-id': svix_id,
            'svix-timestamp': svix_timestamp,
            'svix-signature': svix_signature,
        }) as WebhookEvent
    } catch (err) {
        return Response.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // handle user created
    if (evt.type === 'user.created') {
        const { id, email_addresses, first_name, last_name } = evt.data

        await db.user.create({
            data: {
                clerkId: id,
                email: email_addresses[0].email_address,
                name: `${first_name ?? ''} ${last_name ?? ''}`.trim() || null,
            },
        })
    }

    // handle user updated
    if (evt.type === 'user.updated') {
        const { id, email_addresses, first_name, last_name } = evt.data

        await db.user.update({
            where: { clerkId: id },
            data: {
                email: email_addresses[0].email_address,
                name: `${first_name ?? ''} ${last_name ?? ''}`.trim() || null,
            },
        })
    }

    // handle user deleted
    if (evt.type === 'user.deleted') {
        await db.user.delete({
            where: { clerkId: evt.data.id },
        })
    }

    return Response.json({ ok: true })
}