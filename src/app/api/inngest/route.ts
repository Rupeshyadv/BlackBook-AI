import { serve } from 'inngest/next'
import { inngest } from '@/inngest/client'
import { generateBlackbook } from '@/inngest/functions/generateBlackbook'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [generateBlackbook],
})