import {
  Document, Packer, Paragraph, TextRun,
  AlignmentType, LineRuleType, PageNumber, Footer,
  PageBreak, ImageRun, Table, TableRow, TableCell,
  WidthType, SectionType, ShadingType, BorderStyle
} from 'docx'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { db } from '@/lib/db'
import { StyleProfile } from './pdfParser'
import { Outline, SurveyQuestion } from './planner'
import { ChapterContent, WriterOutput } from './writer'

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

export async function assembleDocument(
  orderId: string,
  style: StyleProfile,
  outline: Outline,
  writerOutput: WriterOutput,
): Promise<{ docxKey: string | null; pdfKey: string | null }> {
  const order = await db.order.findUnique({ where: { id: orderId } })
  if (!order) throw new Error('Order not found')

  // render chart to PNG
  const { renderAllSurveyCharts } = await import('@/lib/charts/chartRenderer')
  const chartPngs = await renderAllSurveyCharts(outline.surveyQuestions ?? [])

  // build document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: style.font,
            size: style.bodyFontSize,
          },
          paragraph: {
            spacing: {
              line: style.lineSpacing,
              lineRule: LineRuleType.AUTO,
              after: style.paragraphSpacingAfter,
            },
            alignment: AlignmentType.JUSTIFIED,
          }
        }
      }
    },
    sections: [
      buildChapterSection(outline, writerOutput, chartPngs, style),
    ]
  })

  const docxBuffer = await Packer.toBuffer(doc)

  // upload DOCX
  const docxKey = `outputs/${orderId}/blackbook.docx`
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: docxKey,
    Body: docxBuffer,
    ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }))

  // convert to PDF via Gotenberg
  let pdfKey: string | null = null
  try {
    const pdfBuffer = await convertToPdf(docxBuffer)
    pdfKey = `outputs/${orderId}/blackbook.pdf`

    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: pdfKey,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }))
    console.log('PDF converted and uploaded:', pdfKey)
  } catch (err) {
    console.error('PDF conversion failed:', err)
  }

  // update document record
  await db.document.update({
    where: { orderId },
    data: { docxKey, pdfKey, generatedAt: new Date(), finalPageCount: order.pageCount }
  })

  return { docxKey, pdfKey }
}

// CHAPTERS
function buildChapterSection(
  outline: Outline,
  writerOutput: WriterOutput,
  chartPngs: Map<number, Buffer>,
  style: StyleProfile,
) {
  const children: (Paragraph | Table)[] = []

  const writtenChapters = new Map(
    writerOutput.chapters.map(ch => [ch.type, ch] as [string, ChapterContent])
  )

  outline.chapters.forEach((chapter, idx) => {
    const chapterNum = idx + 1

    if (idx > 0) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }

    if (chapter.type === 'analysis') {
      // Chapter 4 — built from survey questions
      const chapter4Children = buildChapter4(
        outline.surveyQuestions,
        style,
        chartPngs
      )
      children.push(...chapter4Children)
      return
    }

    // all other chapters — use written content
    const writtenChapter = writtenChapters.get(chapter.type)
    if (!writtenChapter) return

    // chapter heading
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({
          text: `CHAPTER NO. ${chapterNum}`,
          font: style.font,
          size: style.headingFontSize,
          bold: true,
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 280 },
        children: [new TextRun({
          text: chapter.title.toUpperCase(),
          font: style.font,
          size: style.headingFontSize,
          bold: true,
        })]
      }),
    )

    // sections
    writtenChapter.sections.forEach(section => {
      children.push(
        new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 240, after: 120 },
          children: [new TextRun({
            text: section.heading,
            font: style.font,
            size: style.headingFontSize,
            bold: true,
          })]
        })
      )

      const paras = section.content
        .split('\n\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)

      paras.forEach(para => {
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: {
              line: style.lineSpacing,
              lineRule: LineRuleType.AUTO,
              after: style.paragraphSpacingAfter,
            },
            children: [new TextRun({
              text: para,
              font: style.font,
              size: style.bodyFontSize,
            })]
          })
        )
      })
    })

    // references at end of each chapter
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { before: 240, after: 120 },
        children: [new TextRun({
          text: 'REFERENCES',
          font: style.font,
          size: style.headingFontSize,
          bold: true,
        })]
      }),
      bp(`[1] Reference for ${chapter.title}.`, style),
      bp(`[2] Reference for ${chapter.title}.`, style),
      bp(`[3] Reference for ${chapter.title}.`, style),
    )
  })

  // bibliography
  children.push(
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      children: [new TextRun({
        text: 'BIBLIOGRAPHY',
        font: style.font,
        size: style.headingFontSize,
        bold: true,
      })]
    }),
    bp('1. Books and publications related to the topic.', style),
    bp('2. Research papers and academic journals consulted.', style),
    bp('3. Online resources and websites.', style),
  )  

  return {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { width: 11906, height: 16838 },
        margin: style.margins,
        pageNumbers: { start: 1, formatType: 'decimal' }
      }
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            children: [PageNumber.CURRENT],
            font: style.font,
            size: style.bodyFontSize,
          })]
        })]
      })
    },
    children,
  }
}

function buildChapter4(
  questions: SurveyQuestion[],
  style: StyleProfile,
  chartPngs: Map<number, Buffer>
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = []

  // Chapter heading
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'CHAPTER NO. 4', font: style.font, size: style.headingFontSize, bold: true })]
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'DATA ANALYSIS AND INTERPRETATION', font: style.font, size: style.headingFontSize, bold: true })]
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: '4.1 PERCENTAGE ANALYSIS', font: style.font, size: style.headingFontSize, bold: true })]
    }),
  )

  // each survey question block
  questions.forEach((q) => {
    // Question text
    children.push(
      new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [new TextRun({
          text: `${q.number}. ${q.question}`,
          font: style.font,
          size: style.headingFontSize,
          bold: true,
        })]
      }),
    )

    // Data table
    children.push(buildSurveyTable(q, style))

    // Table caption
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 80, after: 80 },
        children: [new TextRun({
          text: `${q.tableTitle}`,
          font: style.font,
          size: style.bodyFontSize,
          bold: true,
        })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({
          text: 'SOURCE: Primary Data and Secondary Data',
          font: style.font,
          size: style.bodyFontSize,
          italics: true,
        })]
      }),
    )

    // Chart image
    const chartPng = chartPngs.get(q.number)
    if (chartPng) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: chartPng,
              transformation: { width: 400, height: 250 },
              type: 'png',
            })
          ]
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 80, after: 200 },
          children: [new TextRun({
            text: q.graphTitle,
            font: style.font,
            size: style.bodyFontSize,
            bold: true,
          })]
        }),
      )
    }

    // Interpretation
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'INTERPRETATION: ', font: style.font, size: style.bodyFontSize, bold: true }),
          new TextRun({ text: q.interpretation, font: style.font, size: style.bodyFontSize }),
        ]
      }),
    )

    // Inference
    children.push(
      new Paragraph({
        spacing: { after: 320 },
        children: [
          new TextRun({ text: 'INFERENCE: ', font: style.font, size: style.bodyFontSize, bold: true }),
          new TextRun({ text: q.inference, font: style.font, size: style.bodyFontSize }),
        ]
      }),
    )
  })

  return children
}

function buildSurveyTable(q: SurveyQuestion, style: StyleProfile): Table {
  const col1 = 800    // Sr. No.
  const col2 = 4200   // Particulars
  const col3 = 2000   // No. of Respondents
  const col4 = 1800   // Percentage
  const total = col1 + col2 + col3 + col4

  const hCell = (text: string, width: number) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: { fill: 'D9D9D9', type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text, font: style.font, size: style.bodyFontSize, bold: true })]
    })]
  })

  const dCell = (text: string, width: number, center = true) => new TableCell({
    width: { size: width, type: WidthType.DXA },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text, font: style.font, size: style.bodyFontSize })]
    })]
  })

  const totalRespondents = q.respondents.reduce((a, b) => a + b, 0)

  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: [col1, col2, col3, col4],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4 },
      bottom: { style: BorderStyle.SINGLE, size: 4 },
      left: { style: BorderStyle.SINGLE, size: 4 },
      right: { style: BorderStyle.SINGLE, size: 4 },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4 },
      insideVertical: { style: BorderStyle.SINGLE, size: 4 },
    },
    rows: [
      // header
      new TableRow({
        children: [
          hCell('Sr. No.', col1),
          hCell('Particulars', col2),
          hCell('No. of Respondents', col3),
          hCell('Percentage (%)', col4),
        ]
      }),
      // data rows
      ...q.options.map((option: string, i: number) =>
        new TableRow({
          children: [
            dCell(String(i + 1), col1),
            dCell(option, col2, false),
            dCell(String(q.respondents[i]), col3),
            dCell(q.percentages[i], col4),
          ]
        })
      ),
      // total row
      new TableRow({
        children: [
          dCell('', col1),
          dCell('Total', col2, false),
          dCell(String(totalRespondents), col3),
          dCell('100%', col4),
        ]
      }),
    ]
  })
}

// GOTENBERG
async function convertToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const formData = new FormData()
  formData.append(
    'files',
    new Blob([docxBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }),
    'document.docx'
  )

  const res = await fetch(
    `${process.env.GOTENBERG_URL}/forms/libreoffice/convert`,
    { method: 'POST', body: formData }
  )

  if (!res.ok) throw new Error(`Gotenberg: ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

// HELPERS
function bp(text: string, style?: StyleProfile): Paragraph {
  const font = style?.font ?? 'Times New Roman'
  const size = style?.bodyFontSize ?? 24
  const spacing = style?.lineSpacing ?? 360
  const after = style?.paragraphSpacingAfter ?? 120
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: spacing, lineRule: LineRuleType.AUTO, after },
    children: [new TextRun({ text, font, size })]
  })
}

function ph(text: string, style: StyleProfile): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [new TextRun({
      text,
      font: style.font,
      size: style.headingFontSize,
      bold: true,
    })]
  })
}

function sp(space: number): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: '' })],
    spacing: { before: space }
  })
}