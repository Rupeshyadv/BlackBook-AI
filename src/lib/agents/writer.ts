import Anthropic from '@anthropic-ai/sdk'
import { Outline, Chapter, ChartSpec } from './planner'

const client = new Anthropic()

export interface SectionContent {
  heading: string
  content: string
}

export interface ChapterContent {
  id: number
  title: string
  type: string
  sections: SectionContent[]
}

export interface ChartData {
  type: 'bar' | 'pie' | 'line'
  title: string
  labels: string[]
  values: number[]
  unit: string
}

export interface WriterOutput {
  chapters: ChapterContent[]
  chartData: ChartData
}

export async function writeChapters(
  orderId: string,
  outline: Outline
): Promise<WriterOutput> {
  const contentChapters = outline.chapters.filter(ch =>
    ['intro', 'methodology', 'literature', 'analysis', 'findings'].includes(ch.type)
  )

  // write all chapters + chart data in parallel
  const [chapters, chartData] = await Promise.all([
    Promise.all(contentChapters.map(ch => writeChapter(ch, outline))),
    generateChartData(outline.chart, outline.topic, outline.topic)
  ])

  return { chapters, chartData }
}

async function writeChapter(
  chapter: Chapter,
  outline: Outline
): Promise<ChapterContent> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: `
        You are a Mumbai University BCom student writing your project report blackbook.
        Write Chapter ${chapter.id} — ${chapter.title} for your project titled: ${outline.topic}

        SECTIONS TO COVER:
        ${chapter.sectionHeadings.map((h, i) => `${i + 1}. ${h}`).join('\n')}

        TARGET: approximately ${chapter.targetWordCount} words total

        WRITING STYLE — follow these rules strictly:
        - Write like a real student, not an AI. Use natural academic English.
        - Mix short and long sentences. Not every sentence should be the same length.
        - Use varied paragraph lengths — some short (2-3 lines), some longer (5-6 lines).
        - Avoid overused AI phrases like "Furthermore", "Moreover", "It is worth noting", "In conclusion", "It is important to note", "Delve into", "In today's world", "It goes without saying".
        - Use real-world Indian examples, company names, RBI data, SEBI guidelines where relevant.
        - Occasionally use direct statements like "This study focuses on..." or "The data shows..." instead of always passive voice.
        - Write transitions naturally — "This leads to...", "Looking at...", "The data here shows..." rather than "Furthermore it can be observed that..."
        - Include occasional hedging language like "suggests", "indicates", "appears to" rather than always being definitive.
        - Vary vocabulary — do not repeat the same adjective or verb more than twice in a section.
        - Some paragraphs can start with a fact or statistic, some with a question framing, some with a direct statement.

        CONTENT RULES:
        - Be specific to: ${outline.topic}
        - Include relevant Indian market data, statistics, examples
        - Each section minimum 4 paragraphs, maximum 7
        - Plain text only — no markdown, no bullet points, no asterisks
        - Proper paragraphs only

        FORMAT — use exactly this separator:

        SECTION: ${chapter.sectionHeadings[0]}
        [paragraphs]

        SECTION: ${chapter.sectionHeadings[1]}
        [paragraphs]

        Continue for all ${chapter.sectionHeadings.length} sections.`
    }]
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const sections = parseSections(text, chapter.sectionHeadings)

  return {
    id: chapter.id,
    title: chapter.title,
    type: chapter.type,
    sections,
  }
}

async function generateChartData(
  spec: ChartSpec,
  projectTitle: string,
  topic: string,
): Promise<ChartData> {
  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `
        Generate realistic survey/research data for a Mumbai University BCom project.

        Project: ${projectTitle}
        Topic: ${topic}
        Chart: ${spec.title}
        Type: ${spec.type}
        Description: ${spec.description}
        Unit: ${spec.unit}

        Return ONLY valid JSON:
        {
          "type": "${spec.type}",
          "title": "${spec.title}",
          "labels": ["label1", "label2", "label3", "label4", "label5"],
          "values": [35, 25, 20, 12, 8],
          "unit": "${spec.unit}"
        }

        Rules:
        - 5 to 7 data points
        - Labels 2-4 words max
        - Values realistic — not round numbers like 20/20/20/20/20, use varied numbers like 34/27/19/13/7
        - If unit % then values sum to 100
        - Data must look like real primary research, not perfectly symmetric`
    }]
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const cleaned = text.replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(cleaned) as ChartData
  } catch {
    return {
      type: spec.type,
      title: spec.title,
      labels: ['Category A', 'Category B', 'Category C', 'Category D', 'Category E'],
      values: [34, 27, 19, 13, 7],
      unit: spec.unit || '%',
    }
  }
}

function parseSections(text: string, headings: string[]): SectionContent[] {
  const parts = text.split(/^SECTION:/m).filter(p => p.trim())

  if (parts.length === 0) {
    return [{ heading: headings[0] || 'Section', content: removeAIPhrases(text.trim()) }]
  }

  return parts.map((part, i) => {
    const lines = part.trim().split('\n')
    const heading = lines[0].trim()
    const content = removeAIPhrases(lines.slice(1).join('\n').trim())
    return {
      heading: heading || headings[i] || `Section ${i + 1}`,
      content,
    }
  })
}

function removeAIPhrases(text: string): string {
  const replacements: [RegExp, string][] = [
    [/\bFurthermore,?\b/g, 'Also,'],
    [/\bMoreover,?\b/g, 'In addition,'],
    [/\bIt is important to note that\b/gi, 'Notably,'],
    [/\bIt is worth noting that\b/gi, 'Notably,'],
    [/\bIn today's (fast-paced |digital |modern )?world\b/gi, 'In recent years,'],
    [/\bIt goes without saying\b/gi, 'Clearly,'],
    [/\bDelve into\b/gi, 'Examine'],
    [/\bIn conclusion,\b/gi, 'To summarise,'],
    [/\bTo summarize,\b/gi, 'To summarise,'],
    [/\bIt can be (clearly |)observed that\b/gi, 'The data shows that'],
    [/\bIt is evident that\b/gi, 'Clearly,'],
    [/\bSignificantly,\b/g, 'Notably,'],
    [/\bUndoubtedly,\b/g, 'Clearly,'],
  ]

  let result = text
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement)
  }
  return result
}