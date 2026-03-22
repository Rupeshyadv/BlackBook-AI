import { inngest } from '../client'
import { db } from '@/lib/db'

export const generateBlackbook = inngest.createFunction(
  {
    id: 'generate-blackbook',
    retries: 3,
    timeouts: {
      finish: '30m',  // writing chapters takes time
    },
  },
  { event: 'blackbook/generate' },

  async ({ event, step }) => {
    const { orderId } = event.data

    // mark as processing
    await step.run('update-status-processing', async () => {
      await db.order.update({
        where: { id: orderId },
        data: { status: 'PROCESSING' }
      })
    })

    // agent 1 — extract style from reference PDF (or use BCom defaults)
    const styleProfile = await step.run('parse-pdf', async () => {
      const { parsePdf } = await import('@/lib/agents/pdfParser')
      return parsePdf(orderId)
    })

    // agent 2 — plan chapter outline + chart spec
    const outline = await step.run('plan-outline', async () => {
      const { planOutline } = await import('@/lib/agents/planner')
      return planOutline(orderId, styleProfile)
    })

    // agent 3 — write all chapters + chart data in parallel
    const writerOutput = await step.run('write-chapters', async () => {
      const { writeChapters } = await import('@/lib/agents/writer')
      return writeChapters(orderId, outline)
    })

    // agent 4 — assemble DOCX + convert to PDF
    const result = await step.run('assemble-document', async () => {
      const { assembleDocument } = await import('@/lib/agents/assembler')
      return assembleDocument(orderId, styleProfile, outline, writerOutput)
    })

    // mark as completed
    await step.run('update-status-completed', async () => {
      await db.order.update({
        where: { id: orderId },
        data: { status: 'COMPLETED' }
      })
    })

    return { success: true, orderId, ...result }
  }
)