import { db } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const client = new Anthropic()

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
})

export interface StyleProfile {
  font: string
  bodyFontSize: number        // in half-points for docx
  headingFontSize: number
  coverTitleFontSize: number
  lineSpacing: number         // in twips (360 = 1.5x)
  margins: {
    top: number               // in twips (1440 = 1 inch)
    bottom: number
    left: number
    right: number
  }
  hasTableOfContents: boolean
  hasPageNumbers: boolean
  pageNumberPosition: 'footer-center' | 'footer-right'
  paragraphSpacingAfter: number
}

// exact values extracted from your friend's blackbook
export const BCOM_DEFAULT: StyleProfile = {
  font: 'Times New Roman',
  bodyFontSize: 24,           // 12pt = 24 half-points
  headingFontSize: 28,        // 14pt = 28 half-points
  coverTitleFontSize: 32,     // 16pt = 32 half-points
  lineSpacing: 360,           // 1.5x (240=single, 480=double)
  margins: {
    top: 2138,                // 1.49 inch = 2138 twips
    bottom: 720,              // 0.5 inch = 720 twips
    left: 2138,               // 1.49 inch (binding side)
    right: 1382,              // 0.96 inch
  },
  hasTableOfContents: true,
  hasPageNumbers: true,
  pageNumberPosition: 'footer-center',
  paragraphSpacingAfter: 120, // 6pt after each paragraph
}

export async function parsePdf(orderId: string): Promise<StyleProfile> {
  const document = await db.document.findUnique({
    where: { orderId }
  })

  // no reference file — use BCom defaults
  if (!document?.referenceFileKey) {
    console.log('No reference PDF — using BCom Mumbai University defaults')
    await db.document.update({
      where: { orderId },
      data: { styleProfile: BCOM_DEFAULT as any }
    })
    return BCOM_DEFAULT
  }

  try {
    // download reference from R2
    const response = await r2.send(new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: document.referenceFileKey,
    }))

    const fileBuffer = Buffer.from(
      await response.Body!.transformToByteArray()
    )
    const base64 = fileBuffer.toString('base64')

    // send to Claude to extract style
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            }
          },
          {
            type: 'text',
            text: `Analyze this Indian college project report/blackbook PDF and extract formatting.
Return ONLY valid JSON, no explanation:
{
  "font": "Times New Roman",
  "bodyFontSize": 24,
  "headingFontSize": 28,
  "coverTitleFontSize": 32,
  "lineSpacing": 360,
  "margins": { "top": 2138, "bottom": 720, "left": 2138, "right": 1382 },
  "hasTableOfContents": true,
  "hasPageNumbers": true,
  "pageNumberPosition": "footer-center",
  "paragraphSpacingAfter": 120
}
All values in docx units (half-points for font sizes, twips for margins).
If unsure about any value, use the defaults shown above.`
          }
        ]
      }]
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/```json|```/g, '').trim()
    const profile = JSON.parse(cleaned) as StyleProfile

    await db.document.update({
      where: { orderId },
      data: { styleProfile: profile as any }
    })

    return profile
  } catch (err) {
    console.error('PDF parse failed, using defaults:', err)
    return BCOM_DEFAULT
  }
}