import { db } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'
import { StyleProfile } from './pdfParser'

const client = new Anthropic()

export interface Chapter {
  id: number
  title: string
  targetWordCount: number
  type: 'intro' | 'methodology' | 'literature' | 'analysis' | 'findings'
  sectionHeadings: string[]
}

export interface ChartSpec {
  chapterId: number
  type: 'bar' | 'pie' | 'line'
  title: string
  description: string
  unit: string
}

export interface Outline {
  topic: string
  totalPages: number
  chapters: Chapter[]
  chart: ChartSpec
}

export async function planOutline(
  orderId: string,
  styleProfile: StyleProfile
): Promise<Outline> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  const contentPages = order.pageCount - 9
  const contentWords = contentPages * 250

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: `
        You are an expert at creating Mumbai University BCom/BAF project report outlines.

        Create a chapter outline for this blackbook:
        Topic: ${order.topic}
        Course: ${order.course}
        Total pages: ${order.pageCount}
        Content word budget: ${contentWords} words (after 9 pages of front matter template)

        Return ONLY valid JSON, no explanation, no markdown:
        {
          "projectTitle": "proper full title for the project",
          "topic": "${order.topic}",
          "totalPages": ${order.pageCount},
          "chapters": [
            {
              "id": 1,
              "title": "Introduction",
              "targetWordCount": 2000,
              "type": "intro",
              "sectionHeadings": [
                "1.1 Background of the Study",
                "1.2 Statement of the Problem",
                "1.3 Objectives of the Study",
                "1.4 Scope of the Study",
                "1.5 Significance of the Study",
                "1.6 Limitations of the Study",
                "1.7 Conclusion"
              ]
            },
            {
              "id": 2,
              "title": "Research Methodology",
              "targetWordCount": 1800,
              "type": "methodology",
              "sectionHeadings": [
                "2.1 Introduction",
                "2.2 Research Design",
                "2.3 Sources of Data",
                "2.4 Data Collection Methods",
                "2.5 Sampling Method",
                "2.6 Tools and Techniques Used for Analysis",
                "2.7 Limitations of the Methodology",
                "2.8 Conclusion"
              ]
            },
            {
              "id": 3,
              "title": "Review of Literature",
              "targetWordCount": 2000,
              "type": "literature",
              "sectionHeadings": [
                "3.1 Introduction",
                "3.2 Review of Literature",
                "3.3 Conclusion"
              ]
            },
            {
              "id": 4,
              "title": "Data Analysis and Interpretation",
              "targetWordCount": 2500,
              "type": "analysis",
              "sectionHeadings": [
                "4.1 Introduction",
                "4.2 Analysis and Interpretation",
                "4.3 Conclusion"
              ]
            },
            {
              "id": 5,
              "title": "Findings and Conclusion",
              "targetWordCount": 1500,
              "type": "findings",
              "sectionHeadings": [
                "5.1 Findings",
                "5.2 Suggestions",
                "5.3 Conclusion"
              ]
            }
          ],
          "chart": {
            "chapterId": 4,
            "type": "bar",
            "title": "relevant chart title for ${order.topic}",
            "description": "what real-world data this chart shows",
            "unit": "%"
          }
        }

        Rules:
        - projectTitle must be a proper academic title specific to: ${order.topic}
        - sectionHeadings must be specific to the topic, not generic
        - totalWordCount across all chapters must equal exactly ${contentWords}
        - chart type (bar/pie/line) must be whichever makes most sense for the data
        - chart must show realistic, relevant data for: ${order.topic}`
    }]
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/```json|```/g, '').trim()

  try {
    const outline = JSON.parse(cleaned) as Outline
    await db.document.update({
      where: { orderId },
      data: { outline: outline as any }
    })
    return outline
  } catch (err) {
    throw new Error(`Planner failed to parse outline: ${err}`)
  }
}