import { db } from '@/lib/db'
// import Anthropic from '@anthropic-ai/sdk'
import { StyleProfile } from './pdfParser'
import { generateText } from '../ai/client'

// const client = new Anthropic()

export interface Chapter {
  id: number
  title: string
  targetWordCount: number
  type: 'intro' | 'methodology' | 'literature' | 'analysis' | 'findings'
  sectionHeadings: string[]
}

export interface SurveyQuestion {
  number: number
  question: string
  tableTitle: string
  options: string[]           // 4 options (Particulars)
  respondents: number[]       // No. of Respondents for each option
  percentages: string[]       // Percentage for each
  chartType: 'bar' | 'pie'
  graphTitle: string
  interpretation: string
  inference: string
}

export interface Outline {
  topic: string
  totalPages: number
  chapters: Chapter[]
  surveyQuestions: SurveyQuestion[]
  projectTitle?: string
}

export async function planOutline(
  orderId: string,
  styleProfile: StyleProfile
): Promise<Outline> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  const contentPages = order.pageCount
  const contentWords = contentPages * 250

  const prompt = `
Create a Mumbai University BCom/BAF blackbook outline.

Topic: ${order.topic}
Course: ${order.course}
Total Pages: ${order.pageCount}
Content Word Budget: ${contentWords}

Return ONLY valid JSON:
{
  "projectTitle": "academic title specific to topic",
  "topic": "${order.topic}",
  "totalPages": ${order.pageCount},
  "chapters": [
    {
      "id": number,
      "title": string,
      "targetWordCount": number,
      "type": "intro|methodology|literature|analysis|findings",
      "sectionHeadings": string[]
    }
  ],
  "surveyQuestions": [
    {
      "number": 1,
      "question": "survey question relevant to ${order.topic}?",
      "tableTitle": "TABLE 4.1.1 <SHORT TITLE IN CAPS>?",
      "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
      "respondents": [17, 12, 8, 4],
      "percentages": ["41.5%", "29.3%", "19.5%", "9.8%"],
      "chartType": "bar",
      "graphTitle": "Graph No 4.1.1 Short Title",
      "interpretation": "The table shows that [highest %] of respondents...",
      "inference": "The findings indicate that..."
    }
  ]
}

Constraints:
- 5 chapters exactly: Introduction, Research Methodology, Review of Literature, Data Analysis and Interpretation, Findings and Conclusion
- Sections must be topic-specific (not generic placeholders)
- Total of all targetWordCount MUST equal ${contentWords}
- Word distribution should be realistic (analysis highest, findings lowest)
- Generate exactly 10 survey questions relevant to ${order.topic}
- Each question must have exactly 4 options
- Respondents must be realistic numbers that sum to 41 (standard sample size) and make sure the total respondents must be same for all the questions
- Percentages must match respondents (e.g. 17/41 = 41.5%)
- chartType should be "bar" for most, "pie" for demographic questions (age, gender)
- interpretation must start with "The table shows that"
- inference must start with "The findings indicate that" or "With X% of respondents"
- tableTitle must be in CAPS and describe the data
`

  const text = await generateText(prompt, 4096)
  
  try {
    const cleaned = extractAndCleanJSON(text)
    const outline = JSON.parse(cleaned) as Outline

    await db.document.update({
      where: { orderId },
      data: { outline: outline as any }
    })

    return outline
  } 
  catch (err) {
    console.error('Planner JSON parse failed, using fallback outline:', err)
    console.error('Raw response was:', text.slice(0, 500))

    // fallback — hardcoded BCom structure so pipeline continues
    const contentPages = order.pageCount
    const contentWords = contentPages * 250
    const perChapter = Math.floor(contentWords / 5)

    const fallbackOutline: Outline = {
      topic: order.topic,
      totalPages: order.pageCount,
      chapters: [
        {
          id: 1,
          title: 'Introduction',
          targetWordCount: perChapter,
          type: 'intro',
          sectionHeadings: [
            '1.1 Background of the Study',
            '1.2 Statement of the Problem',
            '1.3 Objectives of the Study',
            '1.4 Scope of the Study',
            '1.5 Significance of the Study',
            '1.6 Limitations of the Study',
            '1.7 Conclusion',
          ]
        },
        {
          id: 2,
          title: 'Research Methodology',
          targetWordCount: perChapter,
          type: 'methodology',
          sectionHeadings: [
            '2.1 Introduction',
            '2.2 Research Design',
            '2.3 Sources of Data',
            '2.4 Data Collection Methods',
            '2.5 Sampling Method',
            '2.6 Tools and Techniques Used for Analysis',
            '2.7 Limitations of the Methodology',
            '2.8 Conclusion',
          ]
        },
        {
          id: 3,
          title: 'Review of Literature',
          targetWordCount: perChapter,
          type: 'literature',
          sectionHeadings: [
            '3.1 Introduction',
            '3.2 Review of Literature',
            '3.3 Conclusion',
          ]
        },
        {
          id: 5,
          title: 'Findings and Conclusion',
          targetWordCount: perChapter,
          type: 'findings',
          sectionHeadings: [
            '5.1 Findings',
            '5.2 Suggestions',
            '5.3 Conclusion',
          ]
        },
      ],
    }

    await db.document.update({
      where: { orderId },
      data: { outline: fallbackOutline as any }
    })

    return fallbackOutline
  }
}

function extractAndCleanJSON(text: string): string {
  // step 1 — try to find JSON block between { and }
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error('No JSON object found in response')
  }
  
  let jsonStr = text.slice(firstBrace, lastBrace + 1)
  
  // step 2 — remove markdown code fences if present
  jsonStr = jsonStr.replace(/```json|```/g, '')
  
  // step 3 — remove bad control characters
  // these are characters with char codes 0-31 except tab(9), newline(10), carriage return(13)
  jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  
  // step 4 — fix unescaped newlines inside string values
  // this is the main culprit with local models
  jsonStr = jsonStr.replace(/"([^"]*?)"/g, (match, content) => {
    const escaped = content
      .replace(/\n/g, ' ')      // newlines → space
      .replace(/\r/g, ' ')      // carriage returns → space
      .replace(/\t/g, ' ')      // tabs → space
    return `"${escaped}"`
  })
  
  // step 5 — remove trailing commas before } or ] (common local model mistake)
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1')
  
  return jsonStr.trim()
}