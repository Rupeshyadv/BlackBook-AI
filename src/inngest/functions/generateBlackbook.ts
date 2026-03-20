import { inngest } from '../client'
import { db } from '@/lib/db'

export const generateBlackbook = inngest.createFunction(
  {
    id: 'generate-blackbook',
    retries: 3,
  },
  { event: 'blackbook/generate' },

  async ({ event, step }) => {
    const { orderId } = event.data

    // update status to PROCESSING
    await step.run('update-status-processing', async () => {
      await db.order.update({
        where: { id: orderId },
        data: { status: 'PROCESSING' }
      })
    })

    // placeholder — agents coming soon
    await step.run('parse-pdf', async () => {
      console.log('TODO: parse PDF for order', orderId)
      return { font: 'Times New Roman', bodyFontSize: 12 }
    })

    await step.run('plan-outline', async () => {
      console.log('TODO: plan outline for order', orderId)
      return { chapters: [] }
    })

    await step.run('write-chapters', async () => {
      console.log('TODO: write chapters for order', orderId)
      return []
    })

    await step.run('assemble-document', async () => {
      console.log('TODO: assemble document for order', orderId)
      return { docxUrl: null, pdfUrl: null }
    })

    // update status to COMPLETED
    await step.run('update-status-completed', async () => {
      await db.order.update({
        where: { id: orderId },
        data: { status: 'COMPLETED' }
      })
    })

    return { success: true, orderId }
  }
)